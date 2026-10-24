// Smart Money Fear & Greed – Daten-Engine
// Läuft in Node (GitHub-Sammler, alle Quellen) und im Browser (Einzeldatei, nur Quellen ohne CORS-Sperre).
// Jeder Baustein wird gegen seine eigenen letzten 365 Tage gemessen (Perzentil 0–100).

const DAY = 864e5;
const IS_NODE = typeof window === 'undefined';
export const dkey = ts => new Date(ts).toISOString().slice(0, 10);
const ok = x => x != null && Number.isFinite(x);
const mean = a => { const f = a.filter(ok); return f.length ? f.reduce((s, x) => s + x, 0) / f.length : null; };
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// V19: Datumsrechnung zwischengespeichert (bei 32 Varianten sonst sehr viele gleiche Umrechnungen)
const AD = new Map();
const addDays = (d, n) => { const k = d + '|' + n; let v = AD.get(k); if (v === undefined) { v = dkey(Date.parse(d) + n * DAY); if (AD.size > 400000) AD.clear(); AD.set(k, v); } return v; };

/* ================= Bausteine ================= */
export const COMPONENTS = [
  { id: 'funding', side: 'left', dir: 1 },
  { id: 'oi', side: 'left', dir: 1 },
  { id: 'ls', side: 'left', dir: -1 },
  { id: 'liq', side: 'left', dir: 1 },
  { id: 'rsi', side: 'left', dir: 1 },
  { id: 'etf', side: 'right', dir: 1 },
  { id: 'stable', side: 'right', dir: 1 },
  { id: 'cbp', side: 'right', dir: 1 },
  { id: 'vix', side: 'right', dir: -1 },
  { id: 'dxy', side: 'right', dir: -1 }
];
export const ZONES = [[75, 'xgreed'], [55, 'greed'], [45, 'neutral'], [25, 'fear'], [0, 'xfear']];
// V19: Datenquellen × Vergleichszeiträume (Perzentil-Fenster). Schlüssel wie bisher: binance/multi = 365 Tage, sonst Quelle + Tage (z. B. binance90, bybit30)
export const SRCS = ['multi', 'binance', 'bybit', 'okx'], WINS = [7, 14, 30, 90, 100, 180, 365, 1000];
export const vkey = (src, W) => (src === 'binance' || src === 'multi') && +W === 365 ? src : src + W;
export const BASE_VARIANTS = [{ key: 'binance', src: 'binance', W: 365 }, { key: 'multi', src: 'multi', W: 365 }, { key: 'binance90', src: 'binance', W: 90 }, { key: 'multi90', src: 'multi', W: 90 }];
export const ALL_VARIANTS = [...BASE_VARIANTS, ...SRCS.flatMap(src => WINS.map(W => ({ key: vkey(src, W), src, W }))).filter(v => !BASE_VARIANTS.some(b => b.key === v.key))];
// V19: feste Wechselkurse (an den US-Dollar gekoppelt): VAE-Dirham, Saudi-Riyal
export const FX_PEG = { AED: 3.6725, SAR: 3.75 };
export const zoneOf = v => ZONES.find(([t]) => v >= t)[1];

/* ================= HTTP mit Warteschlange, Wiederholung und Status ================= */
function client() {
  let active = 0;
  const queue = [], status = {};
  const slot = () => active < 6 ? (active++, Promise.resolve()) : new Promise(r => queue.push(r));
  const release = () => { const n = queue.shift(); n ? n() : active--; };
  async function once(url, opts, type) {
    await slot();
    try {
      const r = await fetch(url, { ...opts, headers: { ...(IS_NODE ? { 'User-Agent': 'Mozilla/5.0 (SmartMoneyFearGreed)' } : {}), ...(opts.headers || {}) }, signal: AbortSignal.timeout(40000) });
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { http: true });
      return type === 'text' ? await r.text() : await r.json();
    } finally { release(); }
  }
  async function get(url, opts = {}, type) {
    try { return await once(url, opts, type); }
    catch (e) { if (e.http && !/HTTP 429|HTTP 5/.test(e.message)) throw e; await sleep(2500); return once(url, opts, type); }
  }
  const post = (url, body, headers = {}) => get(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  // src: führt eine Quelle aus, merkt sich Erfolg/Fehler und liefert bei Fehler null
  async function src(name, fn) {
    try { const v = await fn(); status[name] = { ok: true }; return v; }
    catch (e) { status[name] = { ok: false, msg: String(e?.message || e).slice(0, 120) }; return null; }
  }
  const skip = (name, msg) => { status[name] = { ok: null, msg }; return null; };
  return { get, post, src, skip, status };
}

/* ================= Hilfen für Zeitreihen ================= */
const sortRows = m => [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
function dailyMean(pairs) { // [[ts, v]] -> Map(d -> Mittel)
  const acc = new Map();
  for (const [t, v] of pairs) { const k = dkey(t); const a = acc.get(k) || [0, 0]; a[0] += v; a[1]++; acc.set(k, a); }
  return new Map([...acc].map(([k, [s, n]]) => [k, s / n]));
}
function changeOver(map, days, byIndex = false) { // %-Änderung über n Kalendertage (oder n Einträge)
  const rows = sortRows(map), out = new Map();
  if (byIndex) { for (let i = days; i < rows.length; i++) if (rows[i - days][1] > 0) out.set(rows[i][0], (rows[i][1] / rows[i - days][1] - 1) * 100); return out; }
  for (const [d, v] of rows) { const o = map.get(addDays(d, -days)); if (ok(o) && o > 0) out.set(d, (v / o - 1) * 100); }
  return out;
}
function rolling(map, n, fn) { // gleitende Funktion über die letzten n Einträge
  const rows = sortRows(map), out = new Map();
  for (let i = n - 1; i < rows.length; i++) out.set(rows[i][0], fn(rows.slice(i - n + 1, i + 1).map(r => r[1])));
  return out;
}
function meanMaps(maps) { // Tagesweiser Mittelwert mehrerer Quellen
  const out = new Map(), keys = new Set(maps.flatMap(m => m ? [...m.keys()] : []));
  for (const k of keys) { const v = mean(maps.map(m => m?.get(k))); if (ok(v)) out.set(k, v); }
  return out;
}
function rsiAtr(rows) { // rows [{d,h,l,c}] -> Map d -> {rsi, atr (% vom Kurs)}
  const out = new Map(), n = 14;
  let g = 0, l = 0, atr = 0;
  for (let i = 1; i < rows.length; i++) {
    const diff = rows[i].c - rows[i - 1].c;
    const tr = Math.max(rows[i].h - rows[i].l, Math.abs(rows[i].h - rows[i - 1].c), Math.abs(rows[i].l - rows[i - 1].c));
    if (i <= n) { diff > 0 ? g += diff : l -= diff; atr += tr; if (i === n) { g /= n; l /= n; atr /= n; } continue; }
    g = (g * (n - 1) + Math.max(diff, 0)) / n; l = (l * (n - 1) + Math.max(-diff, 0)) / n; atr = (atr * (n - 1) + tr) / n;
    out.set(rows[i].d, { rsi: l === 0 ? 100 : 100 - 100 / (1 + g / l), atr: atr / rows[i].c * 100 });
  }
  return out;
}
// Perzentil eines Werts gegen die Werte der W Tage davor (Standard 365, wie im Video)
const sorted = new WeakMap();
function percentile(map, date, value, dir, W = 365) {
  if (!ok(value) || !map) return null;
  let s = sorted.get(map);
  if (!s) { const r = sortRows(map).filter(x => ok(x[1])); s = { d: r.map(x => x[0]), v: r.map(x => x[1]) }; sorted.set(map, s); }
  const lb = x => { let lo = 0, hi = s.d.length; while (lo < hi) { const m = (lo + hi) >> 1; s.d[m] < x ? lo = m + 1 : hi = m; } return lo; };
  const a = lb(addDays(date, -W)), b = lb(date), n = b - a;
  if (n < Math.min(60, Math.round(W * 0.5))) return null;
  let below = 0, equal = 0;
  for (let i = a; i < b; i++) { const v = s.v[i]; if (v < value) below++; else if (v === value) equal++; }
  const p = (below + equal / 2) / n * 100;
  return Math.round(dir > 0 ? p : 100 - p);
}

/* ================= Rohdaten holen ================= */
async function fetchHistory(c, opt) {
  const { src, get, post, skip } = c, now = Date.now(), FROM = now - 2250 * DAY, node = opt.env === 'node';
  const H = {};
  const tasks = {
    binFunding: () => src('Binance Funding (Verlauf)', async () => {
      const out = []; let start = Date.UTC(2019, 8, 10);
      for (let i = 0; i < 12; i++) {
        const d = await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${start}&limit=1000`);
        out.push(...d.map(x => [x.fundingTime, +x.fundingRate * 100]));
        if (d.length < 1000) break; start = d.at(-1).fundingTime + 1;
      }
      return dailyMean(out);
    }),
    bybFunding: () => src('Bybit Funding (Verlauf)', async () => {
      const out = []; let end = now;
      for (let i = 0; i < 12 && end > now - 760 * DAY; i++) {
        const l = (await get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200&endTime=${end}`)).result.list;
        if (!l.length) break;
        out.push(...l.map(x => [+x.fundingRateTimestamp, +x.fundingRate * 100])); end = +l.at(-1).fundingRateTimestamp - 1;
      }
      return dailyMean(out);
    }),
    binK: () => src('Binance Kerzen', async () => {
      const out = []; let start = FROM;
      for (let i = 0; i < 4; i++) {
        const d = await get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&limit=1000`);
        out.push(...d.map(x => ({ d: dkey(x[0]), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })));
        if (d.length < 1000) break; start = d.at(-1)[0] + DAY;
      }
      return out;
    }),
    bybK: () => src('Bybit Kerzen', async () => (await get('https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=D&limit=1000')).result.list
      .map(x => ({ d: dkey(+x[0]), h: +x[2], l: +x[3], c: +x[4] })).reverse()),
    cbK: () => src('Coinbase Kerzen', async () => {
      const m = new Map(); let end = now;
      for (let i = 0; i < 8 && end > FROM; i++) {
        const start = end - 299 * DAY;
        const d = await get(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`);
        for (const x of d) m.set(dkey(x[0] * 1000), { d: dkey(x[0] * 1000), h: +x[2], l: +x[1], c: +x[4] });
        end = start - DAY;
      }
      return sortRows(m).map(r => r[1]);
    }),
    binOI: () => src('Binance Open Interest (Verlauf)', async () => new Map((await get('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=30')).map(x => [dkey(x.timestamp), +x.sumOpenInterest]))),
    bybOI: () => src('Bybit Open Interest (Verlauf)', async () => {
      const m = new Map(); let cur = '';
      for (let i = 0; i < 12; i++) {
        const r = (await get(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=200${cur ? '&cursor=' + encodeURIComponent(cur) : ''}`)).result;
        for (const x of r.list) m.set(dkey(+x.timestamp), +x.openInterest);
        if (!r.nextPageCursor || !r.list.length || +r.list.at(-1).timestamp < FROM) break; cur = r.nextPageCursor;
      }
      return m;
    }),
    okxOI: () => !node ? skip('OKX Open Interest (Verlauf)', 'in der Einzeldatei nicht abrufbar (Browser-Sperre)') : src('OKX Open Interest (Verlauf)', async () => new Map((await get('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1D&limit=100')).data.map(x => [dkey(+x[0]), +x[2]]))),
    binLS: () => src('Binance Long/Short (Verlauf)', async () => new Map((await get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=30')).map(x => [dkey(x.timestamp), +x.longShortRatio]))),
    bybLS: () => src('Bybit Long/Short (Verlauf)', async () => new Map((await get('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=500')).result.list.map(x => [dkey(+x.timestamp), +x.buyRatio / +x.sellRatio]))),
    okxLS: () => !node ? skip('OKX Long/Short (Verlauf)', 'in der Einzeldatei nicht abrufbar (Browser-Sperre)') : src('OKX Long/Short (Verlauf)', async () => new Map((await get('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1D')).data.map(x => [dkey(+x[0]), +x[1]]))),
    llama: () => src('DefiLlama Stablecoins', async () => new Map((await get('https://stablecoins.llama.fi/stablecoincharts/all')).map(x => [dkey(+x.date * 1000), +x.totalCirculatingUSD.peggedUSD]))),
    gecko: () => src('CoinGecko Stablecoins', async () => {
      const sum = new Map(), cnt = new Map();
      for (const id of ['tether', 'usd-coin']) {
        const d = await get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`);
        for (const [t, v] of d.market_caps) { const k = dkey(t); sum.set(k, (sum.get(k) || 0) + v); cnt.set(k, (cnt.get(k) || 0) + 1); }
        await sleep(1200);
      }
      return new Map([...sum].filter(([k]) => cnt.get(k) === 2));
    }),
    eur: () => src('Binance EUR/USD (Verlauf)', async () => {
      const m = new Map(); let start = FROM;
      for (let i = 0; i < 4; i++) {
        const d = await get(`https://api.binance.com/api/v3/klines?symbol=EURUSDT&interval=1d&startTime=${start}&limit=1000`);
        for (const x of d) m.set(dkey(x[0]), +x[4]);
        if (d.length < 1000) break; start = d.at(-1)[0] + DAY;
      }
      return m;
    }),
    alt: () => src('alternative.me Fear & Greed', async () => new Map((await get('https://api.alternative.me/fng/?limit=0')).data.map(x => [dkey(x.timestamp * 1000), +x.value])))
  };
  if (node) Object.assign(tasks, {
    coinalyze: () => !(opt.keys || {}).coinalyze ? skip('Coinalyze Liquidationen (Verlauf)', 'kein API-Key (optional, kostenlos)') : src('Coinalyze Liquidationen (Verlauf)', async () => {
      const to = Math.floor(now / 1000), from = to - 800 * 86400;
      const j = await get(`https://api.coinalyze.net/v1/liquidation-history?symbols=BTCUSDT_PERP.A&interval=daily&from=${from}&to=${to}&convert_to_usd=true`, { headers: { api_key: opt.keys.coinalyze } });
      const hist = (Array.isArray(j) ? j[0]?.history : null) || [];
      if (!hist.length) throw new Error('keine Daten');
      return new Map(hist.map(x => [dkey(x.t * 1000), { L: +x.l, S: +x.s }]));
    }),
    fred: () => src('FRED Dollar-Index (breit)', async () => {
      const t = await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTWEXBGS&cosd=2019-01-01', {}, 'text');
      const m = new Map();
      for (const line of t.trim().split('\n').slice(1)) { const [d, v] = line.split(','); if (v && v !== '.' && isFinite(+v)) m.set(d, +v); }
      if (!m.size) throw new Error('keine Daten');
      return m;
    }),
    yVix: () => src('Yahoo Finance VIX', async () => yahoo(get, '^VIX')),
    yDxy: () => src('Yahoo Finance DXY', async () => yahoo(get, 'DX-Y.NYB')),
    cboe: () => src('CBOE VIX', async () => {
      const t = await get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', {}, 'text');
      const m = new Map();
      for (const line of t.trim().split('\n').slice(1)) { const [d, , , , c] = line.split(','); const [mm, dd, yy] = d.split('/'); if (+yy >= 2019) m.set(`${yy}-${mm}-${dd}`, +c); }
      return m;
    }),
    ecb: () => src('EZB-Wechselkurse (DXY berechnet)', async () => {
      const r = (await get('https://api.frankfurter.app/2019-06-01..?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF,TRY')).rates, m = new Map();
      // V19: Kurse je 1 US-Dollar auch für die Anzeigewährung (Pfund, Franken, Yen, Lira)
      m.fx = { GBP: new Map(), CHF: new Map(), JPY: new Map(), TRY: new Map() };
      for (const [d, x] of Object.entries(r)) {
        m.set(d, 50.14348112 * (1 / x.EUR) ** -0.576 * x.JPY ** 0.136 * (1 / x.GBP) ** -0.119 * x.CAD ** 0.091 * x.SEK ** 0.042 * x.CHF ** 0.036);
        for (const k of Object.keys(m.fx)) if (ok(x[k])) m.fx[k].set(d, x[k]);
      }
      return m;
    }),
    cmc: () => src('CoinMarketCap Fear & Greed', async () => {
      const d = (await get(`https://api.coinmarketcap.com/data-api/v3/fear-greed/chart?start=${Math.floor(FROM / 1000)}&end=${Math.floor(now / 1000)}`)).data;
      const m = new Map(d.dataList.map(x => [dkey(x.timestamp * 1000), +x.score]));
      if (d.historicalValues?.now) m.set(dkey(now), +d.historicalValues.now.score);
      return m;
    }),
    etf: () => etfFlows(c, opt.keys || {}),
    cfgi: () => src('CFGI.io Fear & Greed', async () => {
      const html = await get('https://cfgi.io/bitcoin-fear-greed-index/', {}, 'text');
      const m = html.match(/BTC Fear and Greed value (\d{1,3}) of 100/);
      if (!m) throw new Error('Wert auf der Seite nicht gefunden');
      return +m[1];
    }),
    cgFng: () => !(opt.keys || {}).coinglass ? skip('CoinGlass Fear & Greed', 'kein API-Key (optional)') : src('CoinGlass Fear & Greed', async () => {
      const j = await get('https://open-api-v4.coinglass.com/api/index/fear-greed-history', { headers: { 'CG-API-KEY': opt.keys.coinglass } });
      if (String(j.code) !== '0') throw new Error(j.msg || 'Fehler ' + j.code);
      const d = Array.isArray(j.data) ? j.data[0] : j.data;
      const vals = d.data_list || d.values, times = d.time_list || d.dates;
      return new Map(vals.map((v, i) => [dkey(+times[i] < 1e12 ? times[i] * 1000 : +times[i]), +v]));
    })
  });
  else ['Coinalyze Liquidationen (Verlauf)', 'FRED Dollar-Index (breit)', 'Yahoo Finance VIX', 'Yahoo Finance DXY', 'CBOE VIX', 'EZB-Wechselkurse (DXY berechnet)', 'CoinMarketCap Fear & Greed', 'SoSoValue ETF-Flows', 'CoinGlass ETF-Flows', 'CFGI.io Fear & Greed', 'CoinGlass Fear & Greed']
    .forEach(n => skip(n, 'in der Einzeldatei nicht abrufbar (Browser-Sperre)'));
  const keys = Object.keys(tasks), vals = await Promise.all(keys.map(k => tasks[k]()));
  keys.forEach((k, i) => H[k] = vals[i]);
  return H;
}
async function yahoo(get, sym) {
  const r = (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d`)).chart.result[0];
  const m = new Map();
  r.timestamp.forEach((t, i) => { const c = r.indicators.quote[0].close[i]; if (ok(c) && t * 1000 > Date.UTC(2019, 0, 1)) m.set(dkey(t * 1000), c); });
  m.live = r.meta.regularMarketPrice;
  return m;
}
async function etfFlows(c, keys) {
  const { src, get, post, skip } = c, maps = [];
  if (keys.coinglass) maps.push(await src('CoinGlass ETF-Flows', async () => {
    const j = await get('https://open-api-v4.coinglass.com/api/etf/bitcoin/flow-history', { headers: { 'CG-API-KEY': keys.coinglass } });
    if (String(j.code) !== '0') throw new Error(j.msg || 'Fehler ' + j.code);
    return new Map(j.data.map(x => [dkey(+x.timestamp), +x.flow_usd / 1e6]));
  }));
  else skip('CoinGlass ETF-Flows', 'kein API-Key (optional)');
  // SoSoValue Open API v1: tägliche Netto-Zuflüsse aller US-Bitcoin-ETFs (liefert nur ca. den letzten Monat,
  // ältere Tage merkt sich das Programm selbst in state.own.etf)
  if (keys.sosovalue) maps.push(await src('SoSoValue ETF-Flows', async () => {
    const j = await get(keys.sosovalueUrl || 'https://openapi.sosovalue.com/openapi/v1/etfs/summary-history?symbol=BTC&country_code=US&limit=300', { headers: { 'x-soso-api-key': keys.sosovalue } });
    if (j && !Array.isArray(j) && j.code != null && +j.code !== 0) throw new Error(j.msg || j.message || 'Fehler ' + j.code);
    const list = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : j?.data?.list || [];
    if (!list.length) throw new Error('keine Daten');
    return new Map(list.map(x => [String(x.date).slice(0, 10), +(x.total_net_inflow ?? x.totalNetInflow) / 1e6]));
  }));
  else skip('SoSoValue ETF-Flows', 'kein API-Key hinterlegt');
  const f = maps.filter(Boolean);
  return f.length ? meanMaps(f) : null;
}

async function fetchLive(c, opt) {
  const { src, get, post } = c, now = Date.now();
  const L = {};
  const tasks = {
    fBin: () => src('Binance Funding', async () => +(await get('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT')).lastFundingRate * 100),
    fByb: () => src('Bybit Funding', async () => +(await get('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT')).result.list[0].fundingRate * 100),
    fOkx: () => src('OKX Funding', async () => +(await get('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')).data[0].fundingRate * 100),
    fBg: () => src('Bitget Funding', async () => { const d = (await get('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures')).data[0]; return +d.fundingRate * 100 * 8 / (+d.fundingRateInterval || 8); }),
    fHl: () => src('Hyperliquid Funding', async () => { const [m, x] = await post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }); return +x[m.universe.findIndex(u => u.name === 'BTC')].funding * 8 * 100; }),
    fDb: () => src('Deribit Funding', async () => +(await get(`https://www.deribit.com/api/v2/public/get_funding_rate_value?instrument_name=BTC-PERPETUAL&start_timestamp=${now - 8 * 3600e3}&end_timestamp=${now}`)).result * 100),
    oiBin: () => src('Binance Open Interest', async () => +(await get('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT')).openInterest),
    oiByb: () => src('Bybit Open Interest', async () => +(await get('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT')).result.list[0].openInterest),
    oiOkx: () => src('OKX Open Interest', async () => +(await get('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP')).data[0].oiCcy),
    lsBin: () => src('Binance Long/Short', async () => +(await get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1'))[0].longShortRatio),
    lsByb: () => src('Bybit Long/Short', async () => { const x = (await get('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=5min&limit=1')).result.list[0]; return +x.buyRatio / +x.sellRatio; }),
    lsOkx: () => opt.env !== 'node' ? c.skip('OKX Long/Short', 'in der Einzeldatei nicht abrufbar (Browser-Sperre)') : src('OKX Long/Short', async () => +(await get('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=5m')).data[0][1]),
    pCb: () => src('Coinbase Preis', async () => +(await get('https://api.exchange.coinbase.com/products/BTC-USD/ticker')).price),
    t24: () => src('Binance 24h-Ticker', async () => { const t = await get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); return { price: +t.lastPrice, ch: +t.priceChangePercent }; }),
    pOkx: () => src('OKX Preis', async () => +(await get('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT')).data[0].last),
    pByb: () => src('Bybit Preis', async () => +(await get('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT')).result.list[0].lastPrice),
    poly: () => src('Polymarket Preisleiter', () => polymarket(get)),
    kToday: () => src('Binance Tageskerze (live)', async () => (await get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=2')).map(x => ({ d: dkey(x[0]), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }))),
    vixLive: () => opt.env !== 'node' ? null : src('Yahoo VIX (live)', async () => (await get('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=5m')).chart.result[0].meta.regularMarketPrice),
    dxyLive: () => opt.env !== 'node' ? null : src('Yahoo DXY (live)', async () => (await get('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1d&interval=5m')).chart.result[0].meta.regularMarketPrice),
    cmcNow: () => opt.env !== 'node' ? null : src('CoinMarketCap Fear & Greed (live)', async () => { const t = Math.floor(Date.now() / 1000); const d = (await get(`https://api.coinmarketcap.com/data-api/v3/fear-greed/chart?start=${t - 3 * 86400}&end=${t}`)).data; return +(d.historicalValues?.now?.score ?? d.dataList.at(-1).score); }),
    hourly: () => src('Binance Stundenkerzen', async () => (await get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=200')).map(x => [x[0], +x[1], +x[2], +x[3], +x[4], +x[5]])),
    eurNow: () => src('Binance EUR-Kurs', async () => +(await get('https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT')).price)
  };
  const keys = Object.keys(tasks), vals = await Promise.all(keys.map(k => tasks[k]()));
  keys.forEach((k, i) => L[k] = vals[i]);
  return L;
}

// Polymarket: „Bitcoin above ___ on <Datum>?“ – Wahrscheinlichkeit, dass BTC über dem aktuellen Kurs schliesst
async function polymarket(get) {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  for (const off of [0, 1, 2]) {
    const d = new Date(Date.now() + off * DAY);
    const slug = `bitcoin-above-on-${months[d.getUTCMonth()]}-${d.getUTCDate()}-${d.getUTCFullYear()}`;
    const ev = (await get(`https://gamma-api.polymarket.com/events?slug=${slug}`))[0];
    if (!ev || Date.parse(ev.endDate) < Date.now() || ev.closed) continue;
    const pts = ev.markets.filter(m => !m.closed).map(m => ({ k: +String(m.groupItemTitle).replace(/[^0-9.]/g, ''), p: +JSON.parse(m.outcomePrices)[0] }))
      .filter(x => x.k > 0 && ok(x.p)).sort((a, b) => a.k - b.k);
    if (pts.length < 2) continue;
    return { pts, end: ev.endDate, title: ev.title, slug };
  }
  throw new Error('kein offener Markt gefunden');
}
const interp = (pts, x) => { // P(über x) aus der Preisleiter
  if (x <= pts[0].k) return pts[0].p;
  if (x >= pts.at(-1).k) return pts.at(-1).p;
  for (let i = 1; i < pts.length; i++) if (x <= pts[i].k) { const a = pts[i - 1], b = pts[i]; return a.p + (b.p - a.p) * (x - a.k) / (b.k - a.k); }
};

/* ================= Liquidations-Heatmap (Schätzung) ================= */
// Neue Positionen = steigendes Open Interest (stündlich, Binance BTCUSDT), aufgeteilt nach Käufer/Verkäufer-Anteil,
// verteilt auf typische Hebel. Daraus ergeben sich Liquidationspreise. Level, die der Kurs schon erreicht hat, fallen weg,
// sinkendes Open Interest verkleinert alle offenen Level anteilig. Ergebnis: geschätzte Liquiditäts-Cluster über und unter dem Kurs.
const LEVERAGE = [[5, 0.10], [10, 0.30], [25, 0.30], [50, 0.20], [100, 0.10]];
const hourOf = t => Math.floor(t / 3600e3) * 3600e3;
// V15: stündliches Open Interest von Bybit (3 Seiten à 200) und OKX (5 Seiten à 100), jeweils in BTC – alle 10 Minuten neu
const XOI = { t: 0, bybit: null, okx: null, gate: null, htx: null, kraken: null };
// V18: weitere Börsen – Gate.io, HTX und Kraken haben einen stündlichen OI-Verlauf (frei, ohne Key); Bitget, Deribit und Hyperliquid liefern nur den
// aktuellen Wert → das Programm schreibt ihn stündlich mit (state.oiRec) und nutzt die Börse, sobald 7 Tage (168 Std.) zusammen sind.
async function oiGate(get) { const j = await get('https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=BTC_USDT&interval=1h&limit=500'); return (Array.isArray(j) ? j : []).map(x => [x.time * 1000, +x.mark_price > 0 ? +x.open_interest_usd / +x.mark_price : null]).filter(x => x[1] > 0); }
async function oiHtx(get) { const j = await get('https://api.hbdm.com/linear-swap-api/v1/swap_his_open_interest?contract_code=BTC-USDT&period=60min&amount_type=2&size=200'); return (j?.data?.tick || []).map(x => [+x.ts, +x.volume]).filter(x => x[1] > 0); }
async function oiKraken(get) { const since = Math.floor(Date.now() / 1000) - 500 * 3600, j = await get(`https://futures.kraken.com/api/charts/v1/analytics/PF_XBTUSD/open-interest?interval=3600&since=${since}`), r = j?.result || {}; return (r.timestamp || []).map((ts, i) => [ts * 1000, +(r.data?.[i]?.[3] ?? NaN)]).filter(x => x[1] > 0); }
export const OI_REC = ['bitget', 'deribit', 'hyperliquid'], OI_REC_MIN = 168;
async function oiNow(get) {
  const tm = () => AbortSignal.timeout(15000);
  const [bitget, deribit, hyperliquid] = await Promise.all([
    get('https://api.bitget.com/api/v2/mix/market/open-interest?symbol=BTCUSDT&productType=USDT-FUTURES').then(j => +j?.data?.openInterestList?.[0]?.size).catch(() => null),
    get('https://www.deribit.com/api/v2/public/get_book_summary_by_instrument?instrument_name=BTC-PERPETUAL').then(j => { const r = j?.result?.[0]; return r && +r.mark_price > 0 ? +r.open_interest / +r.mark_price : null; }).catch(() => null),
    fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }), signal: tm() }).then(r => r.json()).then(([m, ctx]) => { const i = m?.universe?.findIndex(u => u.name === 'BTC'); return i >= 0 ? +ctx[i].openInterest : null; }).catch(() => null)]);
  return { bitget, deribit, hyperliquid };
}
async function oiBybit(get) {
  const out = []; let cursor = '';
  for (let p = 0; p < 3; p++) {
    const j = await get('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=200' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    out.push(...(j.result?.list || []).map(x => [+x.timestamp, +x.openInterest])); cursor = j.result?.nextPageCursor; if (!cursor) break;
  }
  return out;
}
async function oiOkx(get) {
  const out = []; let end = '';
  for (let p = 0; p < 5; p++) {
    const j = await get('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1H&limit=100' + (end ? '&end=' + end : ''));
    const d = j.data || []; if (!d.length) break;
    out.push(...d.map(x => [+x[0], +x[2]])); end = d.at(-1)[0];
  }
  return out;
}
// V20: Mitschnitt-Schwelle einstellbar (recMin Stunden), Zeiträume 12 Std. … 2 Wochen (nur Positionen, die im Zeitraum eröffnet wurden)
const HM_PER_E = { '12h': 12, '1d': 24, '3d': 72, '1w': 168, '2w': 336 };
async function liqHeatmap(get, st = null, recMin = OI_REC_MIN) {
  const [oi, taker, kl] = await Promise.all([
    get('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=500'),
    get('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=500'),
    get('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=500')
  ]);
  if (Date.now() - XOI.t > 600e3) {
    const [by, ox, gt, hx, kr, now] = await Promise.all([oiBybit(get).catch(() => null), oiOkx(get).catch(() => null), oiGate(get).catch(() => null), oiHtx(get).catch(() => null), oiKraken(get).catch(() => null), st ? oiNow(get).catch(() => null) : null]);
    XOI.t = Date.now(); if (by?.length) XOI.bybit = by; if (ox?.length) XOI.okx = ox; if (gt?.length) XOI.gate = gt; if (hx?.length) XOI.htx = hx; if (kr?.length) XOI.kraken = kr;
    // aktueller OI (Bitget, Deribit, Hyperliquid) stündlich mitschreiben – höchstens 700 Stunden
    if (st && now) { st.oiRec ||= {}; const hh = hourOf(Date.now()); for (const [ex, v] of Object.entries(now)) { if (!(v > 0)) continue; const a = (st.oiRec[ex] ||= []); if (a.length && a.at(-1)[0] === hh) a[a.length - 1][1] = v; else a.push([hh, v]); if (a.length > 700) a.splice(0, a.length - 700); } }
  }
  const tkM = new Map(taker.map(x => [hourOf(x.timestamp), +x.buyVol / ((+x.buyVol + +x.sellVol) || 1)]));
  // Kursverlauf und Käufer-Anteil von Binance gelten für alle Börsen (BTC-Kurs ist überall fast gleich), das Open Interest kommt je Börse
  const OIM = { binance: new Map(oi.map(x => [hourOf(x.timestamp), +x.sumOpenInterest])) }, rm = Math.max(1, Math.round(recMin || OI_REC_MIN));
  for (const ex of ['bybit', 'okx', 'gate', 'htx', 'kraken']) if (XOI[ex]?.length) OIM[ex] = new Map(XOI[ex].map(([t, v]) => [hourOf(t), v]));
  const exState = {};
  for (const ex of OI_REC) { const a = st?.oiRec?.[ex] || []; exState[ex] = a.length; if (a.length >= rm) OIM[ex] = new Map(a.map(([t, v]) => [hourOf(t), v])); }
  const lv = Object.fromEntries(Object.entries(OIM).map(([ex, m]) => [ex, liqLevels(m, tkM, kl)]));
  // V18: je Börse nur die Preis-Stufen (gleiches Raster) – die Seite und das Programm kombinieren beliebig (shared liqCombine)
  const out = { ...liqMap(lv.binance, kl), src: 'binance', parts: ['binance'], ex: {}, exState, recMin: rm, exP: {} };
  for (const [ex, a] of Object.entries(lv)) out.ex[ex] = liqMap(a, kl).rows;
  const hNow = hourOf(Date.now());
  for (const [per, h] of Object.entries(HM_PER_E)) { out.exP[per] = {}; for (const [ex, m] of Object.entries(OIM)) out.exP[per][ex] = liqMap(liqLevels(m, tkM, kl, hNow - h * 3600e3), kl).rows; }
  return out;
}
function liqLevels(oiM, tkM, kl, fromT = 0) {
  const hour = hourOf;
  let active = [], prevOI = null;
  for (const k of kl) {
    const t = hour(k[0]), o = +k[1], h = +k[2], l = +k[3], c = +k[4];
    // 1) vom Kurs erreichte Level sind liquidiert
    active = active.filter(a => a.side === 'L' ? l > a.p : h < a.p);
    const cur = oiM.get(t); if (!ok(cur)) continue;
    if (prevOI != null) {
      const d = cur - prevOI;
      if (d < 0) { const f = cur / prevOI; for (const a of active) a.usd *= f; }       // Positionen geschlossen
      else if (d > 0 && t >= fromT) {                                                 // neue Positionen (V20: nur ab fromT)
        const usd = d * c, lsh = tkM.get(t) ?? 0.5, entry = (h + l + c) / 3;
        for (const [lev, w] of LEVERAGE) {
          active.push({ side: 'L', p: entry * (1 - 1 / lev + 0.004), usd: usd * lsh * w });
          active.push({ side: 'S', p: entry * (1 + 1 / lev - 0.004), usd: usd * (1 - lsh) * w });
        }
      }
    }
    prevOI = cur;
  }
  return active;
}
function liqMap(active, kl) {
  const price = +kl.at(-1)[4], bin = Math.max(50, Math.round(price * 0.0025 / 50) * 50);
  const bins = new Map();
  for (const a of active) {
    if (a.usd < 1 || Math.abs(a.p / price - 1) > 0.3) continue;
    const b = Math.round(a.p / bin) * bin, x = bins.get(b) || [b, 0, 0];
    a.side === 'L' ? x[1] += a.usd : x[2] += a.usd; bins.set(b, x);
  }
  const rows = [...bins.values()].sort((a, b) => a[0] - b[0]).map(r => [r[0], Math.round(r[1]), Math.round(r[2])]);
  // Cluster: nächstes deutliches Level unter (Longs) und über (Shorts) dem Kurs, plus das jeweils stärkste
  const below = rows.filter(r => r[0] < price && r[1] > 0), above = rows.filter(r => r[0] > price && r[2] > 0);
  const maxL = Math.max(0, ...below.map(r => r[1])), maxS = Math.max(0, ...above.map(r => r[2]));
  const nearL = [...below].reverse().find(r => r[1] >= maxL * 0.5), nearS = above.find(r => r[2] >= maxS * 0.5);
  const topL = below.find(r => r[1] === maxL), topS = above.find(r => r[2] === maxS);
  const zone = (list, i, peak) => {
    if (!peak) return null;
    const k = list.indexOf(peak), th = peak[i] * 0.4; let a = k, b = k;
    while (a > 0 && list[a - 1][i] >= th && list[a][0] - list[a - 1][0] <= bin * 2) a--;
    while (b < list.length - 1 && list[b + 1][i] >= th && list[b + 1][0] - list[b][0] <= bin * 2) b++;
    return { p: peak[0], usd: peak[i], lo: list[a][0] - bin / 2, hi: list[b][0] + bin / 2, zoneUsd: list.slice(a, b + 1).reduce((s, r) => s + r[i], 0) };
  };
  // weitere starke Cluster je Seite (lokale Spitzen, stärkste zuerst, ohne Überschneidung)
  const peaks = (list, i) => {
    const mx = Math.max(0, ...list.map(r => r[i])), out = [];
    const cand = list.filter((r, k) => r[i] >= mx * 0.15 && (k === 0 || r[i] >= list[k - 1][i]) && (k === list.length - 1 || r[i] >= list[k + 1][i])).sort((x, y) => y[i] - x[i]);
    for (const r of cand) { const z = zone(list, i, r); if (out.some(o => z.p >= o.lo && z.p <= o.hi)) continue; out.push(z); if (out.length >= 8) break; }
    return out;
  };
  return { price, bin, rows, longNear: zone(below, 1, nearL), shortNear: zone(above, 2, nearS), longTop: zone(below, 1, topL), shortTop: zone(above, 2, topS), longs: peaks(below, 1), shorts: peaks(above, 2), hours: kl.length, updated: Date.now() };
}

/* ================= Liquidationen ================= */
// Node: OKX per REST (exakt, inkrementell) + Binance/Bybit als WebSocket-Stichprobe (hochgerechnet).
async function collectLiquidations(c, state, sampleMs) {
  const { get, src } = c, now = Date.now();
  state.liq ||= { buckets: [], daily: {}, okxLast: {} };
  const add = (ex, isLong, usd, t) => {
    if (!ok(usd) || usd <= 0) return;
    const k = Math.floor(t / 600000) * 600000;
    let b = state.liq.buckets.find(x => x.t === k);
    if (!b) { b = { t: k, bL: 0, bS: 0, yL: 0, yS: 0, oL: 0, oS: 0 }; state.liq.buckets.push(b); }
    b[ex + (isLong ? 'L' : 'S')] += usd;
  };
  // OKX REST
  await src('OKX Liquidationen', async () => {
    if (!state.liq.ctVal || now - (state.liq.ctAt || 0) > 7 * DAY) {
      const d = (await get('https://www.okx.com/api/v5/public/instruments?instType=SWAP')).data;
      state.liq.ctVal = Object.fromEntries(d.filter(i => /^(BTC|ETH|SOL|XRP|DOGE)-(USDT|USD)-SWAP$/.test(i.instId)).map(i => [i.instId, [+i.ctVal, i.ctType === 'inverse' ? 1 : 0]]));
      state.liq.ctAt = now;
    }
    for (const uly of ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'BTC-USD', 'ETH-USD']) {
      const d = (await get(`https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=${uly}&state=filled&limit=100`)).data;
      const last = state.liq.okxLast[uly] || now - 600000;
      let max = last;
      for (const x of d) {
        const ct = state.liq.ctVal[x.instId]; if (!ct) continue;
        for (const det of x.details || []) {
          const t = +det.ts; if (t <= last) continue; max = Math.max(max, t);
          const isLong = det.posSide === 'long' || (det.posSide === 'net' && det.side === 'sell');
          add('o', isLong, ct[1] ? +det.sz * ct[0] : +det.sz * ct[0] * +det.bkPx, t);
        }
      }
      state.liq.okxLast[uly] = max;
    }
  });
  // WebSocket-Stichprobe Binance + Bybit
  if (sampleMs > 0 && typeof WebSocket !== 'undefined') {
    const factor = clamp((now - (state.lastRun || now - 600000)) / sampleMs, 1, 30);
    const sample = { b: [], y: [] };
    const listen = (name, url, sub, onMsg) => new Promise(res => {
      let ws; try { ws = new WebSocket(url); } catch { c.status[name] = { ok: false, msg: 'Verbindung fehlgeschlagen' }; return res(); }
      const t = setTimeout(() => { try { ws.close(); } catch { } res(); }, sampleMs);
      ws.onopen = () => { c.status[name] = { ok: true }; sub && ws.send(JSON.stringify(sub)); };
      ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { } };
      ws.onerror = () => { c.status[name] = { ok: false, msg: 'WebSocket-Fehler' }; clearTimeout(t); res(); };
    });
    await Promise.all([
      listen('Binance Liquidationen (Stichprobe)', 'wss://fstream.binance.com/market/stream?streams=!forceOrder@arr', null,
        // V20: COIN-M-Kontrakte (…USD_PERP) zählen in Kontrakten zu 100 $ (BTC) bzw. 10 $, nicht in Coins
        m => { const o = m.data?.o; if (o) sample.b.push([o.S === 'SELL', /USD_(PERP|\d{6})$/.test(o.s || '') ? +o.z * (/^BTCUSD_/.test(o.s) ? 100 : 10) : +o.z * +o.ap]); }),
      listen('Bybit Liquidationen (Stichprobe)', 'wss://stream.bybit.com/v5/public/linear',
        { op: 'subscribe', args: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'SUIUSDT', 'LINKUSDT', 'AVAXUSDT'].map(s => 'allLiquidation.' + s) },
        m => { for (const x of m.data || []) sample.y.push([x.S === 'Buy', +x.v * +x.p]); })
    ]);
    for (const [isLong, usd] of sample.b) add('b', isLong, usd * factor, now);
    for (const [isLong, usd] of sample.y) add('y', isLong, usd * factor, now);
  }
  // aufräumen + Tageswerte
  state.liq.buckets = state.liq.buckets.filter(b => b.t > now - 26 * 3600e3);
  const days = {};
  for (const b of state.liq.buckets) { const d = days[dkey(b.t)] ||= { bL: 0, bS: 0, mL: 0, mS: 0 }; d.bL += b.bL; d.bS += b.bS; d.mL += b.bL + b.yL + b.oL; d.mS += b.bS + b.yS + b.oS; }
  for (const [d, v] of Object.entries(days)) if (d >= dkey(now - DAY)) state.liq.daily[d] = v;
  const cut = dkey(now - 800 * DAY);
  for (const d of Object.keys(state.liq.daily)) if (d < cut) delete state.liq.daily[d];
  const t24 = { bL: 0, bS: 0, yL: 0, yS: 0, oL: 0, oS: 0 };
  for (const b of state.liq.buckets) if (b.t > now - DAY) for (const k in t24) t24[k] += b[k];
  return { binance: { L: t24.bL, S: t24.bS }, multi: { L: t24.bL + t24.yL + t24.oL, S: t24.bS + t24.yS + t24.oS }, since: Math.min(...state.liq.buckets.map(b => b.t), now) };
}

/* ================= Hauptfunktion ================= */
// opt: { env: 'node'|'browser', keys, state, wsSampleMs, liqOverride }
export async function collect(opt = {}) {
  const c = client(), now = Date.now(), today = dkey(now), state = opt.state || {};
  const cache = opt.cache, fresh = cache?.H && now - cache.t < (opt.histTtlMs ?? 3600e3) && dkey(cache.t) === today;
  const ch = fresh ? null : client();
  const [H, L, heat] = await Promise.all([fresh ? cache.H : fetchHistory(ch, opt), fetchLive(c, opt), c.src('Liquidations-Heatmap (Schätzung)', () => liqHeatmap(c.get, opt.env === 'node' ? state : null, opt.oiRecMin))]);
  if (cache && !fresh) Object.assign(cache, { H, t: now, status: { ...ch.status } });
  for (const [k, v] of Object.entries(fresh ? cache.status : ch.status)) if (!c.status[k]) c.status[k] = v;
  // heutige Tageskerze live einsetzen (RSI und Kurs von heute ohne Verzögerung)
  const binK = H.binK ? H.binK.map(r => r) : null;
  if (binK && L.kToday) for (const k of L.kToday) { const i = binK.findIndex(r => r.d === k.d); i >= 0 ? binK[i] = k : binK.push(k); }
  const liq24 = opt.env === 'node' ? await collectLiquidations(c, state, opt.wsSampleMs ?? 60000)
    : (opt.liqOverride || { binance: { L: 0, S: 0 }, multi: { L: 0, S: 0 }, since: now });

  // eigene Binance-Verläufe (OI, L/S) über die 30 Tage der API hinaus fortschreiben
  state.own ||= { binOI: {}, binLS: {} };
  if (H.binOI) for (const [d, v] of H.binOI) state.own.binOI[d] = v;
  if (H.binLS) for (const [d, v] of H.binLS) state.own.binLS[d] = v;
  if (ok(L.oiBin)) state.own.binOI[today] = L.oiBin;
  if (ok(L.lsBin)) state.own.binLS[today] = L.lsBin;
  state.own.cfgi ||= {};
  if (ok(H.cfgi)) state.own.cfgi[today] = H.cfgi;
  const cfgiHist = new Map(Object.entries(state.own.cfgi));
  // V19: CryptoRank Fear & Greed – eigener (kostenloser) Key, sparsam abfragen (Standard stündlich, 1 Credit je Abfrage)
  state.own.cr ||= {}; state.own.crAlt ||= {};
  const CRN = 'CryptoRank Fear & Greed';
  if (opt.env !== 'node') c.skip(CRN, 'in der Einzeldatei nicht abrufbar');
  else if (!opt.cr?.key) c.skip(CRN, 'kein API-Key (optional, kostenlos)');
  else if (now - (state.own.crAt || 0) >= (opt.cr.every || 60) * 60e3 - 30e3) {
    state.own.crAt = now;
    const j = await c.src(CRN, () => c.get('https://api.cryptorank.io/v2/global', { headers: { 'X-Api-Key': opt.cr.key } }));
    const v = +j?.data?.fearGreed, a = +j?.data?.altcoinIndex;
    if (ok(v)) { state.own.cr[today] = v; if (ok(a)) state.own.crAlt[today] = a; state.own.crOk = { ok: true }; }
    else state.own.crOk = c.status[CRN] || { ok: false, msg: 'kein Wert' };
  } else c.status[CRN] = { ...(state.own.crOk || { ok: true }), msg: `nächste Abfrage in ${Math.max(1, Math.round(((opt.cr.every || 60) * 60e3 - (now - state.own.crAt)) / 60e3))} Min.` };
  const crHist = new Map(Object.entries(state.own.cr).sort((a, b) => a[0] < b[0] ? -1 : 1)), crAltHist = new Map(Object.entries(state.own.crAlt).sort((a, b) => a[0] < b[0] ? -1 : 1));
  const binOI = new Map(Object.entries(state.own.binOI)), binLS = new Map(Object.entries(state.own.binLS));

  const closes = rows => new Map((rows || []).map(r => [r.d, r.c]));
  const cB = closes(binK), cY = closes(H.bybK), cC = closes(H.cbK);
  const ind = rows => rows ? rsiAtr(rows) : new Map();
  const iB = ind(binK), iY = ind(H.bybK), iC = ind(H.cbK);
  const pick = (m, f) => new Map([...m].map(([d, v]) => [d, f(v)]));
  const prem = refs => { const m = new Map(); for (const [d, cb] of cC) { const r = mean(refs.map(x => x.get(d))); if (ok(r)) m.set(d, (cb / r - 1) * 100); } return m; };
  // ETF-Tageswerte selbst fortschreiben (SoSoValue liefert nur den letzten Monat)
  state.own.etf ||= {};
  if (H.etf) for (const [d, v] of H.etf) state.own.etf[d] = v;
  const etfAll = new Map(Object.entries(state.own.etf).sort((a, b) => a[0] < b[0] ? -1 : 1));
  const etf5 = etfAll.size ? rolling(etfAll, 5, a => a.reduce((s, x) => s + x, 0)) : new Map();
  const vixY = H.yVix || new Map(), dxyY = H.yDxy || new Map();
  if (ok(L.vixLive)) vixY.live = L.vixLive;
  if (ok(L.dxyLive)) dxyY.live = L.dxyLive;
  const dxyChY = changeOver(dxyY, 20, true), dxyChE = H.ecb ? changeOver(H.ecb, 20, true) : new Map();
  const liqShare = key => new Map(Object.entries(state.liq?.daily || {}).filter(([, v]) => v[key + 'L'] + v[key + 'S'] > 0).map(([d, v]) => [d, v[key + 'S'] / (v[key + 'L'] + v[key + 'S'])]));

  // Binance liefert OI und Long/Short nur 30 Tage: ältere Tage mit dem Durchschnitt von Bybit/OKX füllen
  const fillFrom = (m, proxy) => { const o = new Map(proxy || []); for (const [d, v] of m) o.set(d, v); return o; };
  const oiMulti = meanMaps([changeOver(binOI, 7), H.bybOI && changeOver(H.bybOI, 7), H.okxOI && changeOver(H.okxOI, 7)]);
  const lsMulti = meanMaps([binLS, H.bybLS, H.okxLS]);
  // Liquidations-Verlauf von Coinalyze (falls Key), sonst nur selbst gesammelte Tage
  const czShare = H.coinalyze ? new Map([...H.coinalyze].filter(([, v]) => v.L + v.S > 0).map(([d, v]) => [d, v.S / (v.L + v.S)])) : null;
  // Dollar: breiter Index von FRED (wie im Video, z. B. 121,6), sonst DXY von Yahoo
  const fredCh = H.fred ? changeOver(H.fred, 20, true) : null;

  // Tägliche Rohwerte je Modus
  const S = {
    binance: {
      funding: H.binFunding || new Map(),
      oi: fillFrom(changeOver(binOI, 7), oiMulti),
      ls: fillFrom(binLS, lsMulti),
      liq: fillFrom(liqShare('b'), czShare),
      rsi: pick(iB, x => x.rsi), atr: pick(iB, x => x.atr),
      etf: etf5,
      stable: H.llama ? changeOver(H.llama, 30) : new Map(),
      cbp: rolling(prem([cB]), 5, mean),
      vix: vixY,
      dxy: fredCh || dxyChY
    }
  };
  S.multi = {
    funding: meanMaps([H.binFunding, H.bybFunding]),
    oi: oiMulti,
    ls: lsMulti,
    liq: fillFrom(liqShare('m'), czShare),
    rsi: meanMaps([pick(iB, x => x.rsi), pick(iY, x => x.rsi), pick(iC, x => x.rsi)]),
    atr: meanMaps([pick(iB, x => x.atr), pick(iY, x => x.atr), pick(iC, x => x.atr)]),
    etf: etf5,
    stable: meanMaps([H.llama && changeOver(H.llama, 30), H.gecko && changeOver(H.gecko, 30)]),
    cbp: rolling(prem([cB, cY]), 5, mean),
    vix: meanMaps([vixY, H.cboe]),
    dxy: meanMaps([dxyChY, dxyChE, fredCh])
  };
  // V19: einzelne Börsen – nur Funding, Open Interest, Long/Short, RSI und Coinbase-Prämie hängen an der Börse; wo eine Börse keinen
  // Verlauf liefert (OKX: Funding und Kerzen, kurze OI-/L/S-Verläufe), füllt der Multi-Wert die Lücke. Der Rest ist für alle Quellen gleich.
  S.bybit = { ...S.multi, funding: fillFrom(H.bybFunding || new Map(), S.multi.funding), oi: fillFrom(H.bybOI ? changeOver(H.bybOI, 7) : new Map(), oiMulti),
    ls: fillFrom(H.bybLS || new Map(), lsMulti), rsi: fillFrom(pick(iY, x => x.rsi), S.multi.rsi), atr: fillFrom(pick(iY, x => x.atr), S.multi.atr), cbp: fillFrom(rolling(prem([cY]), 5, mean), S.multi.cbp) };
  S.okx = { ...S.multi, oi: fillFrom(H.okxOI ? changeOver(H.okxOI, 7) : new Map(), oiMulti), ls: fillFrom(H.okxLS || new Map(), lsMulti) };

  // Live-Werte für heute
  const premLive = refs => { const r = mean(refs); return ok(L.pCb) && ok(r) ? (L.pCb / r - 1) * 100 : null; };
  const prev4 = (m, d) => { const v = []; for (let i = 1; i <= 4; i++) v.push(m.get(addDays(d, -i))); return v; };
  const oiCh = (cur, m) => { const o = m?.get(addDays(today, -7)); return ok(cur) && ok(o) && o > 0 ? (cur / o - 1) * 100 : null; };
  const lastVal = m => m && m.size ? sortRows(m).at(-1)[1] : null;
  const share = t => t.L + t.S >= 2e6 ? t.S / (t.L + t.S) : null;
  const dxyLiveY = ok(dxyY.live) && dxyY.size > 20 ? (dxyY.live / sortRows(dxyY).at(-21)[1] - 1) * 100 : lastVal(dxyChY);
  const binPrice = L.t24?.price;
  const LIVE = {
    binance: {
      funding: [L.fBin], oi: [oiCh(L.oiBin, binOI)], ls: [L.lsBin], liq: [share(liq24.binance)],
      rsi: [iB.get(today)?.rsi], atr: [iB.get(today)?.atr], etf: [lastVal(etf5)], stable: [lastVal(S.binance.stable)],
      cbp: [mean([premLive([binPrice]), ...prev4(prem([cB]), today)])], vix: [vixY.live ?? lastVal(vixY)], dxy: [fredCh ? lastVal(fredCh) : dxyLiveY]
    },
    multi: {
      funding: [L.fBin, L.fByb, L.fOkx, L.fBg, L.fHl, L.fDb], oi: [oiCh(L.oiBin, binOI), oiCh(L.oiByb, H.bybOI), oiCh(L.oiOkx, H.okxOI)],
      ls: [L.lsBin, L.lsByb, L.lsOkx], liq: [share(liq24.multi)],
      rsi: [iB.get(today)?.rsi, iY.get(today)?.rsi, iC.get(today)?.rsi], atr: [iB.get(today)?.atr, iY.get(today)?.atr, iC.get(today)?.atr],
      etf: [lastVal(etf5)], stable: [lastVal(S.binance.stable), H.gecko ? lastVal(changeOver(H.gecko, 30)) : null],
      cbp: [mean([premLive([binPrice, L.pOkx, L.pByb]), ...prev4(prem([cB, cY]), today)])],
      vix: [vixY.live ?? lastVal(vixY), lastVal(H.cboe)], dxy: [dxyLiveY, lastVal(dxyChE), fredCh ? lastVal(fredCh) : null]
    }
  };
  LIVE.bybit = { ...LIVE.multi, funding: [L.fByb], oi: [oiCh(L.oiByb, H.bybOI)], ls: [L.lsByb], rsi: [iY.get(today)?.rsi], atr: [iY.get(today)?.atr],
    cbp: [mean([premLive([L.pByb]), ...prev4(prem([cY]), today)])] };
  LIVE.okx = { ...LIVE.multi, funding: [L.fOkx], oi: [oiCh(L.oiOkx, H.okxOI)], ls: [L.lsOkx], cbp: [mean([premLive([L.pOkx]), ...prev4(prem([cB, cY]), today)])] };
  const SRC_NAMES = {
    binance: { funding: ['Binance'], oi: ['Binance'], ls: ['Binance'], liq: ['Binance'], rsi: ['Binance'], etf: ['SoSoValue / CoinGlass'], stable: ['DefiLlama'], cbp: ['Coinbase vs Binance'], vix: ['Yahoo Finance'], dxy: [H.fred ? 'FRED (breiter Dollar-Index)' : 'Yahoo Finance'] },
    multi: { funding: ['Binance', 'Bybit', 'OKX', 'Bitget', 'Hyperliquid', 'Deribit'], oi: ['Binance', 'Bybit', 'OKX'], ls: ['Binance', 'Bybit', 'OKX'], liq: ['Binance, Bybit, OKX'], rsi: ['Binance', 'Bybit', 'Coinbase'], etf: ['SoSoValue / CoinGlass'], stable: ['DefiLlama', 'CoinGecko'], cbp: ['Coinbase vs Binance/OKX/Bybit'], vix: ['Yahoo Finance', 'CBOE'], dxy: ['Yahoo Finance', 'EZB-Kurse (berechnet)', 'FRED (breiter Dollar-Index)'] }
  };
  SRC_NAMES.bybit = { ...SRC_NAMES.multi, funding: ['Bybit'], oi: ['Bybit'], ls: ['Bybit'], rsi: ['Bybit'], cbp: ['Coinbase vs Bybit'] };
  SRC_NAMES.okx = { ...SRC_NAMES.multi, funding: ['OKX'], oi: ['OKX'], ls: ['OKX'], cbp: ['Coinbase vs OKX'] };

  // Punkte (Perzentile) für jeden Tag und für heute
  const btc = new Map(cB); if (ok(binPrice)) btc.set(today, binPrice);
  const out = { modes: {} };
  // V19: alle Quellen × Fenster (im Browser nur die vier bisherigen); Tageswerte vergangener Tage bleiben im Speicher, bis die Verläufe neu geholt werden
  const VARIANTS = opt.env === 'node' ? ALL_VARIANTS : BASE_VARIANTS;
  const VC = opt.cache ? (opt.cache.vc ||= {}) : {}, vstamp = (opt.cache?.t || 0) + '|' + today;
  if (VC.stamp !== vstamp) { VC.stamp = vstamp; VC.m = {}; }
  for (const V of VARIANTS) {
    const mode = V.src, s = S[mode], live = LIVE[mode];
    const scoreAt = (id, d, val) => {
      if (id === 'rsi') {
        const r = percentile(s.rsi, d, val?.rsi, 1, V.W), a = percentile(s.atr, d, val?.atr, -1, V.W);
        return ok(r) && ok(a) ? Math.round((r + a) / 2) : r ?? a;
      }
      if (id === 'liq' && ok(val) && s.liq.size < 60) return Math.round(clamp(val * 100)); // bis genug eigener Verlauf da ist
      // ETF-Flows: SoSoValue liefert nur ~1 Monat – bis genug Tage gesammelt sind, feste Skala (5-Tage-Summe -1.500 bis +1.500 Mio. $)
      if (id === 'etf' && ok(val) && s.etf.size < 45) return Math.round(clamp((val + 1500) / 3000 * 100));
      const dir = COMPONENTS.find(x => x.id === id).dir;
      return percentile(s[id], d, val, dir, V.W);
    };
    // Verlauf
    let VH = VC.m[V.key];
    if (!VH) {
      const days = [...btc.keys()].filter(d => d >= '2019-09-01' && d < today).sort();
      const daily0 = new Map(), compHist0 = {};
      for (const d of days) {
        const sc = [];
        for (const cp of COMPONENTS) {
          const v = cp.id === 'rsi' ? { rsi: s.rsi.get(d), atr: s.atr.get(d) } : s[cp.id].get(d);
          const p = scoreAt(cp.id, d, v);
          (compHist0[cp.id] ||= new Map()).set(d, p);
          if (ok(p)) sc.push(p);
        }
        if (sc.length >= 3) daily0.set(d, mean(sc));
      }
      VH = VC.m[V.key] = { daily: daily0, compHist: compHist0 };
    }
    const daily = new Map(VH.daily), compHist = VH.compHist;
    // heute
    const comps = [];
    for (const cp of COMPONENTS) {
      const vals = live[cp.id], v = mean(vals);
      const val = cp.id === 'rsi' ? { rsi: v, atr: mean(live.atr) } : v;
      const p = scoreAt(cp.id, today, val);
      const p7 = compHist[cp.id]?.get(addDays(today, -7));
      comps.push({ id: cp.id, side: cp.side, score: p, raw: v, d7: ok(p) && ok(p7) ? p - p7 : null, atr: cp.id === 'rsi' ? mean(live.atr) : undefined,
        level: cp.id === 'vix' ? v : cp.id === 'dxy' ? (H.fred && mode === 'binance' ? lastVal(H.fred) : mode === 'multi' ? mean([dxyY.live ?? lastVal(dxyY), lastVal(H.ecb)]) : dxyY.live ?? lastVal(dxyY)) : undefined,
        sources: SRC_NAMES[mode][cp.id].map((n, i) => ({ name: n, value: cp.id === 'rsi' ? vals[i] : vals.length > 1 ? vals[i] : v })).filter(x => ok(x.value)) });
    }
    const todayScores = comps.map(x => x.score).filter(ok);
    if (todayScores.length >= 3) daily.set(today, mean(todayScores));
    // Gesamtwert = Durchschnitt der Bausteine (wie im Video: 93,67,47,13,55,39,10,54,15 -> 42)
    const norm = daily;
    // 7-Tage-Mittel
    const d7 = new Map();
    for (const d of [...norm.keys()].sort()) { const w = []; for (let i = 0; i < 7; i++) { const v = norm.get(addDays(d, -i)); if (ok(v)) w.push(v); } if (w.length >= 4) d7.set(d, Math.round(mean(w))); }
    if (opt.debug) (out.debug ||= {})[V.key] = { compHist, raw: s, daily: norm };
    out.modes[V.key] = { comps, daily: norm, d7, index: d7.get(today) ?? Math.round(norm.get(today) ?? NaN), live: Math.round(norm.get(today) ?? NaN) };
  }

  // Offizieller Index (alternative.me) + 7-Tage-Mittel für den Chart
  const alt = H.alt || new Map(), alt7 = new Map();
  for (const d of [...alt.keys()].sort()) { const w = []; for (let i = 0; i < 7; i++) { const v = alt.get(addDays(d, -i)); if (ok(v)) w.push(v); } if (w.length >= 4) alt7.set(d, Math.round(mean(w))); }
  const altNow = lastVal(alt);
  const fxM = H.ecb?.fx || { GBP: new Map(), CHF: new Map(), JPY: new Map(), TRY: new Map() };

  // Backtest: 30 Tage und 24 Stunden je Zone
  const backtest = (d7, zone, horizon) => {
    let n = 0, up = 0, sum = 0, first = null;
    for (const [d, v] of d7) {
      if (zoneOf(v) !== zone) continue;
      const a = btc.get(d), b = btc.get(addDays(d, horizon)); if (!ok(a) || !ok(b)) continue;
      n++; if (b > a) up++; sum += (b / a - 1) * 100; if (!first || d < first) first = d;
    }
    return n ? { n, up: Math.round(up / n * 100), avg: sum / n, since: first } : null;
  };
  // Extreme der letzten 12 Monate
  const extremes = d7 => {
    const runs = []; let cur = null;
    for (const d of [...d7.keys()].sort()) {
      const v = d7.get(d), type = v < 25 ? 'xfear' : v >= 75 ? 'xgreed' : null;
      if (type && cur && cur.type === type && d === addDays(cur.to, 1)) { cur.to = d; cur.days++; if (type === 'xfear' ? v < cur.peak : v > cur.peak) { cur.peak = v; cur.peakDay = d; } }
      else { if (cur) runs.push(cur); cur = type ? { type, from: d, to: d, days: 1, peak: v, peakDay: d } : null; }
    }
    if (cur) runs.push(cur);
    return runs.filter(r => r.days >= 3).map(r => ({ ...r, btc: btc.get(r.peakDay) ?? null }));
  };

  const polyPct = L.poly && ok(binPrice) ? Math.round(interp(L.poly.pts, binPrice) * 100) : null;
  const result = {
    updated: new Date(now).toISOString(),
    dailyUntil: addDays(today, -1),
    env: opt.env,
    btc: { price: binPrice ?? null, ch24: L.t24?.ch ?? null },
    official: { alt: altNow, cmc: L.cmcNow ?? (H.cmc ? lastVal(H.cmc) : null), cfgi: ok(H.cfgi) ? H.cfgi : null, coinglass: H.cgFng ? lastVal(H.cgFng) : null, cr: crHist.size ? lastVal(crHist) : null },
    crAlt: crAltHist.size ? lastVal(crAltHist) : null,
    eurusd: L.eurNow ?? (H.eur ? lastVal(H.eur) : null),
    fx: { ...Object.fromEntries(Object.entries(fxM).map(([k, m]) => [k, m.size ? lastVal(m) : null])), ...FX_PEG },
    variants: VARIANTS.map(({ key, src, W }) => ({ key, src, W })),
    liq24,
    poly: L.poly ? { pct: polyPct, end: L.poly.end, title: L.poly.title } : null,
    heatmap: heat,
    modes: {},
    status: Object.entries(c.status).map(([name, s]) => ({ name, ...s })).sort((a, b) => a.name.localeCompare(b.name))
  };
  for (const { key: mode, W } of VARIANTS) {
    const m = out.modes[mode], z = ok(m.index) ? zoneOf(m.index) : null;
    const bt30 = z ? backtest(m.d7, z, 30) : null, bt1 = z ? backtest(m.d7, z, 1) : null;
    const prob = mean([polyPct, bt1?.up]);
    result.modes[mode] = {
      index: m.index, live: m.live, zone: z, window: W,
      past: { d1: m.d7.get(addDays(today, -1)) ?? null, d7: m.d7.get(addDays(today, -7)) ?? null, d30: m.d7.get(addDays(today, -30)) ?? null },
      components: m.comps,
      backtest30: bt30, backtest1: bt1,
      outlook: ok(prob) ? Math.round(prob) : null,
      extremes: extremes(m.d7)
    };
  }
  // Verlauf (kompakt): [0 Datum, 1 Index7 Binance, 2 Index7 Multi, 3 BTC, 4 alternative.me, 5 CMC, 6 CFGI, 7 CoinGlass, 8 EURUSD,
  //   9 BTC Eröffnung, 10 Hoch, 11 Tief, 12 Tageswert Binance, 13 Tageswert Multi, 14 Index7 Binance 90T, 15 Index7 Multi 90T, 16 Tageswert Binance 90T, 17 Tageswert Multi 90T,
  //   18 Volumen BTC (Binance, V18 – für VWAP)]
  const allDays = [...new Set([...out.modes.multi.d7.keys(), ...out.modes.binance.d7.keys()])].sort();
  const eurM = H.eur || new Map(); if (ok(L.eurNow)) eurM.set(today, L.eurNow);
  const r4 = x => ok(x) ? Math.round(x * 1e4) / 1e4 : null;
  const ohlc = new Map((binK || []).map(r => [r.d, r]));
  const R = x => ok(x) ? Math.round(x) : null, M = out.modes;
  //   V19: 19 CryptoRank, 20 GBP, 21 CHF, 22 JPY, 23 TRY (je 1 US-Dollar, EZB, Wochenende vom Vortag), ab 24 je weitere Variante [7-Tage-Mittel, Tageswert] (result.vcols)
  const NEWV = VARIANTS.filter(v => !BASE_VARIANTS.some(b => b.key === v.key));
  result.vcols = { binance: { d7: 1, raw: 12 }, multi: { d7: 2, raw: 13 }, binance90: { d7: 14, raw: 16 }, multi90: { d7: 15, raw: 17 } };
  NEWV.forEach((v, i) => result.vcols[v.key] = { d7: 24 + i * 2, raw: 25 + i * 2 });
  const fxLast = {}, fxAt = (k, d) => { const v = fxM[k].get(d); if (ok(v)) fxLast[k] = v; return ok(fxLast[k]) ? Math.round(fxLast[k] * 1e4) / 1e4 : null; };
  result.history = allDays.map(d => { const k = ohlc.get(d); return [d, M.binance.d7.get(d) ?? null, M.multi.d7.get(d) ?? null, ok(btc.get(d)) ? Math.round(btc.get(d)) : null,
    alt.get(d) ?? null, H.cmc?.get(d) ?? null, cfgiHist.get(d) ?? null, H.cgFng?.get(d) ?? null, r4(eurM.get(d)),
    R(k?.o), R(k?.h), R(k?.l), R(M.binance.daily.get(d)), R(M.multi.daily.get(d)),
    M.binance90.d7.get(d) ?? null, M.multi90.d7.get(d) ?? null, R(M.binance90.daily.get(d)), R(M.multi90.daily.get(d)), ok(k?.v) ? Math.round(k.v) : null,
    crHist.get(d) ?? null, fxAt('GBP', d), fxAt('CHF', d), fxAt('JPY', d), fxAt('TRY', d),
    ...NEWV.flatMap(v => [M[v.key].d7.get(d) ?? null, R(M[v.key].daily.get(d))])]; });
  result.hourly = (L.hourly || []).map(x => [x[0], Math.round(x[1]), Math.round(x[2]), Math.round(x[3]), Math.round(x[4]), Math.round(x[5] || 0)]);
  state.lastRun = now;
  if (opt.debug) result.debug = out.debug;
  return { result, state };
}
