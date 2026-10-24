// Fear & Greed Backend – holt alle Daten serverseitig (keine CORS-Probleme), speichert den Verlauf
// und liefert das Dashboard unter http://localhost:<port>. Keine Abhängigkeiten, Node >= 22.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

/* ================= Konfiguration ================= */
const CFG_PATH = path.join(ROOT, 'config.json');
const DEFAULT_CFG = {
  port: 8787,
  refreshSeconds: 60,
  coinglassApiKey: '',
  sosovalueApiKey: '',
  sosovalueUrl: 'https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart'
};
if (!fs.existsSync(CFG_PATH)) fs.writeFileSync(CFG_PATH, JSON.stringify(DEFAULT_CFG, null, 2));
function cfg() {
  try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) }; }
  catch { return DEFAULT_CFG; }
}

/* ================= Helfer ================= */
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
// Höchstens 6 Anfragen gleichzeitig, bei Netzwerkfehlern einmal wiederholen.
let active = 0;
const queue = [];
const slot = () => active < 6 ? (active++, Promise.resolve()) : new Promise(r => queue.push(r));
const release = () => { const next = queue.shift(); next ? next() : active--; };
async function fetchOnce(url, opts) {
  await slot();
  try {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { http: true });
    return await r.json();
  } finally { release(); }
}
async function get(url, opts = {}) {
  try { return await fetchOnce(url, opts); }
  catch (e) { if (e.http) throw e; await sleep(2000); return fetchOnce(url, opts); }
}
const post = (url, body, headers = {}) =>
  get(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const lin = (v, lo, hi) => clamp((v - lo) / (hi - lo) * 100);
const ok = x => x != null && Number.isFinite(x);
const mean = a => { const f = a.filter(ok); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : null; };
const DAY = 864e5;
const dkey = ts => new Date(ts).toISOString().slice(0, 10);
const de = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (n, d) => (n >= 0 ? '+' : '−') + de(Math.abs(n), d);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Quellen-Cache mit Status: jede Quelle hat einen Namen, eine Gültigkeitsdauer und meldet Fehler.
const status = {};      // name -> {ok, msg, t}
const cache = {};       // name -> {v, t}
const inflight = {};
function src(name, ttlSec, fn) {
  const c = cache[name];
  if (c && Date.now() - c.t < ttlSec * 1000) return Promise.resolve(c.v);
  if (inflight[name]) return inflight[name];
  return inflight[name] = (async () => {
    try {
      const v = await fn();
      cache[name] = { v, t: Date.now() };
      status[name] = { ok: true, t: Date.now() };
      return v;
    } catch (e) {
      status[name] = { ok: false, msg: String(e?.message || e), t: Date.now() };
      return c ? c.v : null;
    } finally { delete inflight[name]; }
  })();
}
function skip(name, msg) { status[name] = { ok: null, msg, t: Date.now() }; return null; }

/* ================= Bewertung (0 = Angst, 100 = Gier) ================= */
const SCORE = {
  // Funding in % pro 8h: negativ = Angst, 0,01 % = Normalzustand, ab 0,05 % = Euphorie
  funding: p => p <= 0 ? lin(p, -0.03, 0) * 0.35 : p <= 0.01 ? 35 + p / 0.01 * 20 : clamp(55 + (p - 0.01) / 0.04 * 45),
  oi: ch => lin(ch, -6, 6),                                    // OI-Änderung 24h in % (in BTC)
  ls: r => clamp(50 + Math.log(r / 1.3) * 80),                 // Long/Short-Kontenverhältnis
  liq: shortShare => clamp(shortShare * 100),                  // Anteil liquidierter Shorts
  rsi: (rsi, volRatio) => clamp(rsi * 0.7 + clamp(50 - (volRatio - 1) * 100) * 0.3),
  etf: mio => lin(mio, -500, 500),                             // Tages-Netto-Flow in Mio. $
  stable: ch => lin(ch, -1.5, 1.5),                            // Stablecoin-Marktkap. 7 Tage in %
  cbp: p => lin(p, -0.15, 0.15),                               // Coinbase-Premium in %
  vix: v => lin(v, 35, 12),                                    // hoher VIX = Angst
  dxy: ch => lin(ch, 2, -2)                                    // steigender Dollar (20 Tage, %) = Angst
};
const TEXT = {
  funding: v => sign(v, 4) + ' %',
  oi: v => sign(v, 1) + ' %',
  ls: v => de(v, 2),
  rsi: v => 'RSI ' + de(v),
  etf: v => sign(v, 0) + ' Mio. $',
  stable: v => sign(v, 2) + ' %',
  cbp: v => sign(v, 3) + ' %'
};
const COMPONENTS = [
  { id: 'funding', name: 'Funding', side: 'left' },
  { id: 'oi', name: 'Open-Interest-Änderung', side: 'left' },
  { id: 'ls', name: 'Long/Short', side: 'left' },
  { id: 'liq', name: 'Liquidationen', side: 'left' },
  { id: 'rsi', name: 'RSI und Volatilität', side: 'left' },
  { id: 'etf', name: 'ETF-Flows', side: 'right' },
  { id: 'stable', name: 'Stablecoin-Zufluss', side: 'right' },
  { id: 'cbp', name: 'Coinbase-Premium', side: 'right' },
  { id: 'vix', name: 'VIX', side: 'right' },
  { id: 'dxy', name: 'DXY-Trend', side: 'right' }
];

// Baut einen Indikator aus mehreren Quellen: Mittelwert der verfügbaren Werte.
function mk(id, values, extra) {
  const list = Object.entries(values).filter(([, v]) => ok(v));
  if (!list.length) return null;
  const v = mean(list.map(x => x[1]));
  return { score: Math.round(SCORE[id](v)), text: TEXT[id](v), value: v, sources: list.map(([name, value]) => ({ name, value })), ...extra };
}

/* ================= Kursreihen / technische Indikatoren ================= */
function rsiAndVol(rows) { // rows: [{d, c}] aufsteigend -> Map d -> {rsi, volRatio}
  const out = new Map(), n = 14;
  let g = 0, l = 0;
  const rets = [];
  for (let i = 1; i < rows.length; i++) {
    const diff = rows[i].c - rows[i - 1].c;
    rets.push(Math.log(rows[i].c / rows[i - 1].c));
    if (i <= n) { diff > 0 ? g += diff : l -= diff; if (i === n) { g /= n; l /= n; } }
    else { g = (g * (n - 1) + Math.max(diff, 0)) / n; l = (l * (n - 1) + Math.max(-diff, 0)) / n; }
    if (i >= n && rets.length >= 90) {
      const sd = a => { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
      const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
      out.set(rows[i].d, { rsi, volRatio: sd(rets.slice(-14)) / sd(rets.slice(-90)) });
    }
  }
  return out;
}
const toRows = (arr, tsFn, cFn) => {
  const m = new Map();
  for (const x of arr) m.set(dkey(tsFn(x)), cFn(x));
  return [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, c]) => ({ d, c }));
};

const kBinance = () => src('Binance Kerzen', 600, async () =>
  toRows(await get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000'), x => x[0], x => +x[4]));
const kBybit = () => src('Bybit Kerzen', 600, async () =>
  toRows((await get('https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=D&limit=1000')).result.list, x => +x[0], x => +x[4]));
const kCoinbase = () => src('Coinbase Kerzen', 600, async () => {
  const all = [];
  let end = Date.now();
  for (let p = 0; p < 2; p++) {
    const start = end - 299 * DAY;
    const d = await get(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`);
    all.push(...d);
    end = start - DAY;
  }
  return toRows(all, x => x[0] * 1000, x => +x[4]);
});
const yahoo = (name, sym) => src(name, 900, async () => {
  const r = (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`)).chart.result[0];
  const rows = r.timestamp.map((t, i) => ({ d: dkey(t * 1000), c: r.indicators.quote[0].close[i] })).filter(x => ok(x.c));
  return { rows, last: r.meta.regularMarketPrice };
});

/* ================= Live-Liquidationen per WebSocket ================= */
// Minuten-Buckets der letzten 24h: key -> {bL,bS,yL,yS,oL,oS} (b=Binance, y=Bybit, o=OKX; L=Long, S=Short in USD)
const LIQ_PATH = path.join(DATA, 'liquidations.json');
let liqB = {};
try { liqB = JSON.parse(fs.readFileSync(LIQ_PATH, 'utf8')); } catch { }
let btcPrice = null;
function addLiq(ex, isLong, usd, ts) {
  if (!ok(usd) || usd <= 0) return;
  const k = Math.floor(ts / 60000);
  const b = liqB[k] ||= { bL: 0, bS: 0, yL: 0, yS: 0, oL: 0, oS: 0 };
  b[ex + (isLong ? 'L' : 'S')] += usd;
}
function liqTotals(fromMs, toMs = Infinity) {
  const t = { bL: 0, bS: 0, yL: 0, yS: 0, oL: 0, oS: 0 };
  for (const [k, b] of Object.entries(liqB)) {
    const ms = k * 60000;
    if (ms >= fromMs && ms < toMs) for (const f in t) t[f] += b[f];
  }
  return { binance: { L: t.bL, S: t.bS }, multi: { L: t.bL + t.yL + t.oL, S: t.bS + t.yS + t.oS }, byEx: t };
}
function pruneLiq() {
  const cut = Math.floor((Date.now() - DAY) / 60000);
  for (const k of Object.keys(liqB)) if (+k < cut) delete liqB[k];
  fs.writeFile(LIQ_PATH, JSON.stringify(liqB), () => { });
}
function wsLoop(name, url, onOpen, onMsg, pingMsg) {
  const connect = () => {
    let ws, ping;
    try { ws = new WebSocket(url); } catch (e) { status[name] = { ok: false, msg: e.message, t: Date.now() }; return setTimeout(connect, 10000); }
    ws.onopen = () => { status[name] = { ok: true, t: Date.now() }; onOpen?.(ws); if (pingMsg) ping = setInterval(() => ws.send(pingMsg), 20000); };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { } };
    ws.onerror = e => { status[name] = { ok: false, msg: 'WebSocket-Fehler', t: Date.now() }; };
    ws.onclose = () => { clearInterval(ping); setTimeout(connect, 5000); };
  };
  connect();
}
wsLoop('Binance Liquidationen (WS)', 'wss://fstream.binance.com/market/stream?streams=!forceOrder@arr/btcusdt@markPrice@1s', null, m => {
  if (m.stream === 'btcusdt@markPrice@1s') btcPrice = +m.data.p;
  else if (m.data?.o) { const o = m.data.o; addLiq('b', o.S === 'SELL', +o.z * +o.ap, o.T); }
});
const BYBIT_SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'SUIUSDT', 'LINKUSDT', 'AVAXUSDT'];
wsLoop('Bybit Liquidationen (WS)', 'wss://stream.bybit.com/v5/public/linear',
  ws => ws.send(JSON.stringify({ op: 'subscribe', args: BYBIT_SYMS.map(s => 'allLiquidation.' + s) })),
  m => { for (const x of m.data || []) addLiq('y', x.S === 'Buy', +x.v * +x.p, +x.T); }, JSON.stringify({ op: 'ping' }));
let okxInst = {};
async function loadOkxInstruments() {
  try {
    const d = (await get('https://www.okx.com/api/v5/public/instruments?instType=SWAP')).data;
    for (const i of d) okxInst[i.instId] = { ctVal: +i.ctVal, inverse: i.ctType === 'inverse' };
  } catch { setTimeout(loadOkxInstruments, 60000); }
}
loadOkxInstruments();
wsLoop('OKX Liquidationen (WS)', 'wss://ws.okx.com:8443/ws/v5/public',
  ws => ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'liquidation-orders', instType: 'SWAP' }] })),
  m => {
    for (const x of m.data || []) {
      const inst = okxInst[x.instId]; if (!inst) continue;
      for (const d of x.details || []) {
        const isLong = d.posSide === 'long' || (d.posSide === 'net' && d.side === 'sell');
        addLiq('o', isLong, inst.inverse ? +d.sz * inst.ctVal : +d.sz * inst.ctVal * +d.bkPx, +d.ts);
      }
    }
  }, 'ping');
setInterval(pruneLiq, 60000);

/* ================= ETF-Flows (CoinGlass / SoSoValue, je nach API-Key) ================= */
async function etfFlows() { // Map date -> {cg, soso} in Mio. $
  const c = cfg(), out = new Map();
  const put = (d, k, v) => { const o = out.get(d) || {}; o[k] = v; out.set(d, o); };
  if (c.coinglassApiKey) {
    const d = await src('CoinGlass ETF-Flows', 1800, async () => {
      const j = await get('https://open-api-v4.coinglass.com/api/etf/bitcoin/flow-history', { headers: { 'CG-API-KEY': c.coinglassApiKey } });
      if (String(j.code) !== '0') throw new Error(j.msg || 'Fehler ' + j.code);
      return j.data.map(x => [dkey(+x.timestamp), +x.flow_usd / 1e6]);
    });
    for (const [k, v] of d || []) put(k, 'cg', v);
  } else skip('CoinGlass ETF-Flows', 'kein API-Key in config.json');
  if (c.sosovalueApiKey) {
    const d = await src('SoSoValue ETF-Flows', 1800, async () => {
      const j = await post(c.sosovalueUrl, { type: 'us-btc-spot' }, { 'x-soso-api-key': c.sosovalueApiKey });
      if (j.code != null && +j.code !== 0) throw new Error(j.msg || 'Fehler ' + j.code);
      const list = Array.isArray(j.data) ? j.data : j.data?.list || [];
      return list.map(x => [String(x.date).slice(0, 10), +x.totalNetInflow / 1e6]);
    });
    for (const [k, v] of d || []) put(k, 'soso', v);
  } else skip('SoSoValue ETF-Flows', 'kein API-Key in config.json');
  return out;
}

/* ================= Stablecoins ================= */
const stableLlama = () => src('DefiLlama Stablecoins', 1800, async () => {
  const d = await get('https://stablecoins.llama.fi/stablecoincharts/all');
  return toRows(d, x => +x.date * 1000, x => +x.totalCirculatingUSD.peggedUSD);
});
const stableGecko = () => src('CoinGecko Stablecoins', 3600, async () => {
  const sum = new Map(), cnt = new Map();
  for (const id of ['tether', 'usd-coin']) {
    const d = await get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`);
    for (const [t, v] of d.market_caps) { const k = dkey(t); sum.set(k, (sum.get(k) || 0) + v); cnt.set(k, (cnt.get(k) || 0) + 1); }
    await sleep(1500);
  }
  // Nur Tage, an denen beide Coins einen Wert haben
  return [...sum.entries()].filter(([k]) => cnt.get(k) === 2).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, c]) => ({ d, c }));
});
const change7 = rows => { // Map date -> 7-Tage-Änderung in %
  const m = new Map(), idx = new Map(rows.map((r, i) => [r.d, i]));
  for (const r of rows) {
    const old = rows[idx.get(r.d) - 7];
    if (old && old.c > 0) m.set(r.d, (r.c / old.c - 1) * 100);
  }
  return m;
};

/* ================= Offizielle Fear-&-Greed-Indizes ================= */
async function officials() {
  const now = Date.now(), c = cfg();
  const [alt, cmc, cg] = await Promise.all([
    src('alternative.me F&G', 600, async () => {
      const d = (await get('https://api.alternative.me/fng/?limit=0')).data;
      return { now: +d[0].value, hist: d.map(x => [dkey(x.timestamp * 1000), +x.value]) };
    }),
    src('CoinMarketCap F&G', 600, async () => {
      const d = (await get(`https://api.coinmarketcap.com/data-api/v3/fear-greed/chart?start=${Math.floor((now - 400 * DAY) / 1000)}&end=${Math.floor(now / 1000)}`)).data;
      return { now: +(d.historicalValues?.now?.score ?? d.dataList.at(-1).score), hist: d.dataList.map(x => [dkey(x.timestamp * 1000), +x.score]) };
    }),
    c.coinglassApiKey ? src('CoinGlass F&G', 600, async () => {
      const j = await get('https://open-api-v4.coinglass.com/api/index/fear-greed-history', { headers: { 'CG-API-KEY': c.coinglassApiKey } });
      if (String(j.code) !== '0') throw new Error(j.msg || 'Fehler ' + j.code);
      const d = Array.isArray(j.data) ? j.data[0] : j.data;
      const vals = d.data_list || d.values, times = d.time_list || d.dates;
      const hist = vals.map((v, i) => [dkey(+times[i] < 1e12 ? times[i] * 1000 : +times[i]), +v]);
      return { now: hist.at(-1)[1], hist };
    }) : skip('CoinGlass F&G', 'kein API-Key in config.json')
  ]);
  return { alt, cmc, coinglass: cg };
}

/* ================= Live-Werte aller Indikatoren ================= */
async function live() {
  const now = Date.now();
  const [bnF, byF, okF, bgF, hlF, dbF, bnOI, byOI, okOI, bnLS, byLS, okLS, kb, ky, kc,
    cbT, bnT, okT, byT, sL, sG, vix, dxy, etf] = await Promise.all([
      src('Binance Funding', 50, async () => +(await get('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT')).lastFundingRate * 100),
      src('Bybit Funding', 50, async () => +(await get('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT')).result.list[0].fundingRate * 100),
      src('OKX Funding', 50, async () => +(await get('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')).data[0].fundingRate * 100),
      src('Bitget Funding', 50, async () => {
        const d = (await get('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures')).data[0];
        return +d.fundingRate * 100 * 8 / (+d.fundingRateInterval || 8);
      }),
      src('Hyperliquid Funding', 50, async () => {
        const [meta, ctx] = await post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' });
        return +ctx[meta.universe.findIndex(u => u.name === 'BTC')].funding * 8 * 100;
      }),
      src('Deribit Funding', 50, async () => +(await get(`https://www.deribit.com/api/v2/public/get_funding_rate_value?instrument_name=BTC-PERPETUAL&start_timestamp=${now - 8 * 3600e3}&end_timestamp=${now}`)).result * 100),
      src('Binance Open Interest', 300, async () => {
        const d = await get('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=25');
        return (+d.at(-1).sumOpenInterest / +d[0].sumOpenInterest - 1) * 100;
      }),
      src('Bybit Open Interest', 300, async () => {
        const l = (await get('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=25')).result.list;
        return (+l[0].openInterest / +l.at(-1).openInterest - 1) * 100;
      }),
      src('OKX Open Interest', 300, async () => {
        const d = (await get('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1H&limit=25')).data;
        return (+d[0][2] / +d.at(-1)[2] - 1) * 100;
      }),
      src('Binance Long/Short', 300, async () => +(await get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1'))[0].longShortRatio),
      src('Bybit Long/Short', 300, async () => { const x = (await get('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1')).result.list[0]; return +x.buyRatio / +x.sellRatio; }),
      src('OKX Long/Short', 300, async () => +(await get('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1H')).data[0][1]),
      kBinance(), kBybit(), kCoinbase(),
      src('Coinbase Preis', 30, async () => +(await get('https://api.exchange.coinbase.com/products/BTC-USD/ticker')).price),
      src('Binance Preis', 30, async () => +(await get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')).price),
      src('OKX Preis', 30, async () => +(await get('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT')).data[0].last),
      src('Bybit Preis', 30, async () => +(await get('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT')).result.list[0].lastPrice),
      stableLlama(), stableGecko(),
      yahoo('Yahoo VIX', '^VIX'), yahoo('Yahoo DXY', 'DX-Y.NYB'),
      etfFlows()
    ]);

  const B = {}, M = {};
  B.funding = mk('funding', { Binance: bnF });
  M.funding = mk('funding', { Binance: bnF, Bybit: byF, OKX: okF, Bitget: bgF, Hyperliquid: hlF, Deribit: dbF });
  B.oi = mk('oi', { Binance: bnOI });
  M.oi = mk('oi', { Binance: bnOI, Bybit: byOI, OKX: okOI });
  B.ls = mk('ls', { Binance: bnLS });
  M.ls = mk('ls', { Binance: bnLS, Bybit: byLS, OKX: okLS });

  const lt = liqTotals(now - DAY);
  for (const [mode, t, srcs] of [['binance', lt.binance, 'Binance'], ['multi', lt.multi, 'Binance, Bybit (Top 10), OKX']]) {
    const tot = t.L + t.S;
    // Erst bewerten, wenn genug Volumen gesammelt wurde – sonst entscheidet eine einzelne Liquidation
    (mode === 'binance' ? B : M).liq = tot >= 2e6 ? {
      score: Math.round(SCORE.liq(t.S / tot)), text: `${de(t.L / 1e6, 1)} / ${de(t.S / 1e6, 1)} Mio. $`,
      sources: [{ name: srcs, value: tot }]
    } : null;
  }

  const rsiOf = rows => rows ? rsiAndVol(rows).get(rows.at(-1).d) : null;
  const rB = rsiOf(kb), rY = rsiOf(ky), rC = rsiOf(kc);
  const rsiMk = list => {
    const f = list.filter(([, r]) => r);
    if (!f.length) return null;
    const rsi = mean(f.map(([, r]) => r.rsi)), vr = mean(f.map(([, r]) => r.volRatio));
    return { score: Math.round(SCORE.rsi(rsi, vr)), text: TEXT.rsi(rsi), value: rsi, sources: f.map(([name, r]) => ({ name, value: r.rsi })) };
  };
  B.rsi = rsiMk([['Binance', rB]]);
  M.rsi = rsiMk([['Binance', rB], ['Bybit', rY], ['Coinbase', rC]]);

  // ETF: letzter Handelstag mit Daten
  const lastEtf = [...etf.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1)[0];
  const etfC = lastEtf ? mk('etf', { CoinGlass: lastEtf[1].cg, SoSoValue: lastEtf[1].soso }, { date: lastEtf[0] }) : null;
  if (etfC) etfC.text += ' · ' + lastEtf[0].slice(8, 10) + '.' + lastEtf[0].slice(5, 7) + '.';
  B.etf = M.etf = etfC;

  const chL = sL ? change7(sL) : new Map(), chG = sG ? change7(sG) : new Map();
  const lastOf = m => m.size ? [...m.values()].at(-1) : null;
  B.stable = mk('stable', { DefiLlama: lastOf(chL) });
  M.stable = mk('stable', { DefiLlama: lastOf(chL), CoinGecko: lastOf(chG) });

  const prem = ref => ok(cbT) && ok(ref) ? (cbT / ref - 1) * 100 : null;
  B.cbp = mk('cbp', { 'Coinbase vs Binance': prem(bnT) });
  M.cbp = mk('cbp', { 'Coinbase vs Binance': prem(bnT), 'Coinbase vs OKX': prem(okT), 'Coinbase vs Bybit': prem(byT) });

  B.vix = M.vix = vix ? { score: Math.round(SCORE.vix(vix.last)), text: de(vix.last, 1), value: vix.last, sources: [{ name: 'Yahoo Finance ^VIX', value: vix.last }] } : null;
  if (dxy && dxy.rows.length > 21) {
    const ch = (dxy.last / dxy.rows.at(-21).c - 1) * 100;
    B.dxy = M.dxy = { score: Math.round(SCORE.dxy(ch)), text: `${de(dxy.last, 1)} (${sign(ch, 1)} %)`, value: dxy.last, sources: [{ name: 'Yahoo Finance DX-Y.NYB, 20 Tage', value: ch }] };
  } else B.dxy = M.dxy = null;

  const idx = comps => { const s = Object.values(comps).filter(Boolean).map(c => c.score); return s.length ? Math.round(mean(s)) : null; };
  return {
    binance: { index: idx(B), components: B },
    multi: { index: idx(M), components: M },
    liq: lt,
    btc: btcPrice ?? bnT
  };
}

/* ================= Verlauf: rückwirkende Berechnung + gespeicherte Live-Tage ================= */
const HIST_PATH = path.join(DATA, 'history.json');
let store = { live: {} };
try { store = { live: {}, ...JSON.parse(fs.readFileSync(HIST_PATH, 'utf8')) }; } catch { }
const saveStore = () => fs.writeFile(HIST_PATH, JSON.stringify(store), () => { });
let backfillDays = new Map();   // date -> {binance, multi, nB, nM}
let backfillRunning = false;

async function pagedBinanceFunding(fromMs) {
  const out = [];
  let start = fromMs;
  for (let i = 0; i < 5; i++) {
    const d = await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${start}&limit=1000`);
    out.push(...d.map(x => [x.fundingTime, +x.fundingRate * 100]));
    if (d.length < 1000) break;
    start = d.at(-1).fundingTime + 1;
  }
  return out;
}
async function pagedBybitFunding(fromMs) {
  const out = [];
  let end = Date.now();
  for (let i = 0; i < 10 && end > fromMs; i++) {
    const l = (await get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200&endTime=${end}`)).result.list;
    if (!l.length) break;
    out.push(...l.map(x => [+x.fundingRateTimestamp, +x.fundingRate * 100]));
    end = +l.at(-1).fundingRateTimestamp - 1;
  }
  return out;
}
async function pagedBybitOI() {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 3; i++) {
    const r = (await get(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=200${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)).result;
    out.push(...r.list.map(x => ({ d: dkey(+x.timestamp), c: +x.openInterest })));
    if (!r.nextPageCursor || !r.list.length) break;
    cursor = r.nextPageCursor;
  }
  return out.sort((a, b) => a.d < b.d ? -1 : 1);
}
const dailyMean = pairs => {
  const m = new Map();
  for (const [t, v] of pairs) { const k = dkey(t); const a = m.get(k) || []; a.push(v); m.set(k, a); }
  return new Map([...m].map(([k, a]) => [k, mean(a)]));
};
const dayChange = rows => { // rows [{d,c}] -> Map d -> % Änderung zum Vortag
  const m = new Map();
  for (let i = 1; i < rows.length; i++) if (rows[i - 1].c > 0) m.set(rows[i].d, (rows[i].c / rows[i - 1].c - 1) * 100);
  return m;
};
const ffill = (rows, days) => { // Wochenend-/Feiertagslücken mit letztem Wert auffüllen
  const m = new Map(rows.map(r => [r.d, r.c])), out = new Map();
  let last = null;
  const first = rows[0]?.d;
  for (const d of days) { if (m.has(d)) last = m.get(d); if (first && d >= first && last != null) out.set(d, last); }
  return out;
};

async function backfill() {
  if (backfillRunning) return;
  backfillRunning = true;
  try {
    const N = 400, today = dkey(Date.now()), from = Date.now() - (N + 2) * DAY;
    const days = [];
    for (let i = N + 30; i >= 1; i--) days.push(dkey(Date.now() - i * DAY));
    const H = 6 * 3600;
    const [fB, fY, oiB, oiY, oiO, lsB, lsY, lsO, kb, ky, kc, sL, sG, vix, dxy, etf] = await Promise.all([
      src('Verlauf Binance Funding', H, async () => [...dailyMean(await pagedBinanceFunding(from))]),
      src('Verlauf Bybit Funding', H, async () => [...dailyMean(await pagedBybitFunding(from))]),
      src('Verlauf Binance OI', H, async () => (await get('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=30')).map(x => ({ d: dkey(x.timestamp), c: +x.sumOpenInterest }))),
      src('Verlauf Bybit OI', H, pagedBybitOI),
      src('Verlauf OKX OI', H, async () => (await get('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1D&limit=100')).data.map(x => ({ d: dkey(+x[0]), c: +x[2] })).reverse()),
      src('Verlauf Binance L/S', H, async () => (await get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=30')).map(x => [dkey(x.timestamp), +x.longShortRatio])),
      src('Verlauf Bybit L/S', H, async () => (await get('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=500')).result.list.map(x => [dkey(+x.timestamp), +x.buyRatio / +x.sellRatio])),
      src('Verlauf OKX L/S', H, async () => (await get('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1D')).data.map(x => [dkey(+x[0]), +x[1]])),
      kBinance(), kBybit(), kCoinbase(), stableLlama(), stableGecko(),
      yahoo('Yahoo VIX', '^VIX'), yahoo('Yahoo DXY', 'DX-Y.NYB'), etfFlows()
    ]);
    const M = a => new Map(a || []);
    const fundB = M(fB), fundY = M(fY);
    const oB = oiB ? dayChange(oiB) : new Map(), oY = oiY ? dayChange(oiY) : new Map(), oO = oiO ? dayChange(oiO) : new Map();
    const lB = M(lsB), lY = M(lsY), lO = M(lsO);
    const rB = kb ? rsiAndVol(kb) : new Map(), rY = ky ? rsiAndVol(ky) : new Map(), rC = kc ? rsiAndVol(kc) : new Map();
    const cB = new Map((kb || []).map(r => [r.d, r.c])), cY = new Map((ky || []).map(r => [r.d, r.c])), cC = new Map((kc || []).map(r => [r.d, r.c]));
    const chL = sL ? change7(sL) : new Map(), chG = sG ? change7(sG) : new Map();
    const vixF = vix ? ffill(vix.rows, days) : new Map();
    const dxyCh = new Map();
    if (dxy) dxy.rows.forEach((r, i) => { if (i >= 20) dxyCh.set(r.d, (r.c / dxy.rows[i - 20].c - 1) * 100); });
    const dxyF = ffill([...dxyCh].map(([d, c]) => ({ d, c })), days);
    const etfF = ffill([...etf].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, v]) => ({ d, c: mean([v.cg, v.soso]) })), days);

    const out = new Map();
    for (const d of days) {
      if (d >= today) continue;
      const sc = (id, v) => ok(v) ? SCORE[id](v) : null;
      const rsiS = list => { const f = list.filter(Boolean); return f.length ? SCORE.rsi(mean(f.map(r => r.rsi)), mean(f.map(r => r.volRatio))) : null; };
      const premOf = refs => { const r = mean(refs.map(m => m.get(d))); return ok(cC.get(d)) && ok(r) ? (cC.get(d) / r - 1) * 100 : null; };
      const lq = store.liqDaily?.[d];
      const common = [sc('etf', etfF.get(d)), sc('vix', vixF.get(d)), sc('dxy', dxyF.get(d))];
      const b = [sc('funding', fundB.get(d)), sc('oi', oB.get(d)), sc('ls', lB.get(d)), rsiS([rB.get(d)]),
        sc('stable', chL.get(d)), sc('cbp', premOf([cB])), lq && lq.bL + lq.bS > 0 ? SCORE.liq(lq.bS / (lq.bL + lq.bS)) : null, ...common].filter(ok);
      const m = [sc('funding', mean([fundB.get(d), fundY.get(d)])), sc('oi', mean([oB.get(d), oY.get(d), oO.get(d)])),
        sc('ls', mean([lB.get(d), lY.get(d), lO.get(d)])), rsiS([rB.get(d), rY.get(d), rC.get(d)]),
        sc('stable', mean([chL.get(d), chG.get(d)])), sc('cbp', premOf([cB, cY])), lq && lq.mL + lq.mS > 0 ? SCORE.liq(lq.mS / (lq.mL + lq.mS)) : null, ...common].filter(ok);
      out.set(d, {
        binance: b.length >= 4 ? Math.round(mean(b)) : null, nB: b.length,
        multi: m.length >= 4 ? Math.round(mean(m)) : null, nM: m.length,
        btc: cB.get(d) ?? cC.get(d) ?? null
      });
    }
    backfillDays = out;
    console.log(`[Verlauf] ${out.size} Tage berechnet`);
  } catch (e) {
    console.error('[Verlauf] Fehler:', e);
  } finally { backfillRunning = false; }
}

/* ================= Zustand & Aktualisierung ================= */
let state = null, off = null, lastLive = null;
async function refresh() {
  try {
    const [l, o] = await Promise.all([live(), officials()]);
    lastLive = l; off = o;
    const today = dkey(Date.now());
    // Laufender Tagesdurchschnitt der Live-Werte
    const rec = store.live[today] ||= { cnt: 0, sumB: 0, sumM: 0, cntB: 0, cntM: 0 };
    rec.cnt++;
    if (ok(l.binance.index)) { rec.sumB += l.binance.index; rec.cntB++; }
    if (ok(l.multi.index)) { rec.sumM += l.multi.index; rec.cntM++; }
    rec.btc = l.btc;
    const lt = liqTotals(Date.parse(today), Date.parse(today) + DAY);
    store.liqDaily ||= {};
    store.liqDaily[today] = { bL: lt.binance.L, bS: lt.binance.S, mL: lt.multi.L, mS: lt.multi.S };
    // Alte Live-Einträge > 2 Jahre entfernen
    const cut = dkey(Date.now() - 730 * DAY);
    for (const k of Object.keys(store.live)) if (k < cut) delete store.live[k];
    saveStore();
    state = { updated: Date.now() };
  } catch (e) { console.error('[Refresh] Fehler:', e); }
}

function buildState() {
  if (!lastLive) return { ready: false };
  const liqNow = liqTotals(Date.now() - DAY);
  const comps = mode => COMPONENTS.map(c => ({ ...c, ...(lastLive[mode].components[c.id] || { score: null, text: c.id === 'liq' ? 'sammle Daten…' : 'keine Daten' }) }));
  const offNow = Object.fromEntries(Object.entries(off || {}).map(([k, v]) => [k, v ? v.now : null]));
  return {
    ready: true, updated: state?.updated,
    btc: btcPrice ?? lastLive.btc,
    liq: { binance: liqNow.binance, multi: liqNow.multi, since: Math.min(...Object.keys(liqB).map(Number), Date.now() / 60000) * 60000 },
    modes: {
      binance: { index: lastLive.binance.index, components: comps('binance') },
      multi: { index: lastLive.multi.index, components: comps('multi') }
    },
    officials: offNow,
    status: Object.entries(status).map(([name, s]) => ({ name, ...s })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

function buildHistory() {
  const offMaps = Object.fromEntries(Object.entries(off || {}).map(([k, v]) => [k, new Map(v ? v.hist : [])]));
  const days = new Set([...backfillDays.keys(), ...Object.keys(store.live)]);
  for (const m of Object.values(offMaps)) for (const d of m.keys()) days.add(d);
  const cut = dkey(Date.now() - 400 * DAY);
  return [...days].filter(d => d >= cut).sort().map(d => {
    const bf = backfillDays.get(d), lv = store.live[d];
    const useLive = lv && (d === dkey(Date.now()) || lv.cnt >= 60);
    return {
      date: d,
      binance: useLive && lv.cntB ? Math.round(lv.sumB / lv.cntB) : bf?.binance ?? null,
      multi: useLive && lv.cntM ? Math.round(lv.sumM / lv.cntM) : bf?.multi ?? null,
      src: useLive ? 'live' : bf ? 'calc' : null,
      btc: (useLive ? lv.btc : null) ?? bf?.btc ?? null,
      alt: offMaps.alt?.get(d) ?? null,
      cmc: offMaps.cmc?.get(d) ?? null,
      coinglass: offMaps.coinglass?.get(d) ?? null
    };
  });
}

/* ================= HTTP-Server ================= */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = o => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/state') return json(buildState());
  if (u.pathname === '/api/history') return json(buildHistory());
  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404); res.end('Not found');
});
const PORT = cfg().port;
server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`Port ${PORT} ist belegt – läuft das Dashboard schon? http://localhost:${PORT}`); process.exit(0); }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Fear & Greed Dashboard läuft: http://localhost:${PORT}`);
  refresh().then(backfill);
  setInterval(refresh, Math.max(20, cfg().refreshSeconds) * 1000);
  setInterval(backfill, 6 * 3600e3);
});
