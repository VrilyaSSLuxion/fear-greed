"use strict";
// Daten und Logik direkt im Browser (für GitHub Pages, ohne eigenen Server).
// Quellen: Binance Futures (REST + WebSocket), Hyperliquid, Bybit, OKX. Alle kostenlos, ohne Konto.
// Mit ?demo=1 in der Adresse läuft die Seite mit Zufallsdaten.

const Local = (() => {
  const COINS = ["BTC", "ETH", "SOL"];
  const HISTORY_DAYS = 30;
  const DEMO = new URLSearchParams(location.search).get("demo") === "1";
  const BUBBLE_MIN = { BTC: 250000, ETH: 150000, SOL: 75000 };
  const LIQ_BUBBLE_MIN = { BTC: 50000, ETH: 30000, SOL: 15000 };
  const WALL_MIN = { BTC: 1500000, ETH: 800000, SOL: 300000 };
  const HL_TOP = 500, HL_REFRESH_MIN = 10, HL_REQ_PER_SEC = 5;
  const FAPI = "https://fapi.binance.com", HL = "https://api.hyperliquid.xyz/info";

  const models = {}, ready = {}, loading = {};
  const listeners = [];
  let statusText = "Lade Historie …";
  const emit = (m) => listeners.forEach((fn) => { try { fn(m); } catch (e) { console.error(e); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const model = (coin) => { if (!models[coin]) models[coin] = new SymbolModel(coin); return models[coin]; };

  async function getJson(url, opts = {}, tries = 4) {
    for (let a = 0; a < tries; a++) {
      try {
        const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
        if (r.status === 418 || r.status === 429) { await sleep(10000 * (a + 1)); continue; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) { if (a === tries - 1) throw e; await sleep(1500 * (a + 1)); }
    }
  }
  const post = (url, body) => getJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 2);

  // ------------------------------------------------------------------ Binance Historie
  async function binanceHistory(coin, days) {
    const sym = coin + "USDT";
    const end = Math.floor(Date.now() / 60000) * 60000, start = end - days * 86400000;
    const chunks = []; for (let t = start; t < end; t += 1500 * 60000) chunks.push(t);
    const klines = []; let done = 0;
    const worker = async () => {
      while (chunks.length) {
        const t = chunks.shift();
        const b = await getJson(`${FAPI}/fapi/v1/klines?symbol=${sym}&interval=1m&startTime=${t}&endTime=${Math.min(end - 1, t + 1500 * 60000 - 1)}&limit=1500`);
        klines.push(...b); done++;
        statusText = `Lade ${coin}-Historie von Binance … ${Math.round(done / Math.ceil(days * 1440 / 1500) * 100)} %`;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    klines.sort((a, b) => a[0] - b[0]);
    const oi = new Map();
    let oiEnd = end; const oiStart = Math.max(start, end - 30 * 86400000 + 600000);
    statusText = `Lade ${coin}-Open-Interest …`;
    while (oiEnd > oiStart) {
      let b;
      try { b = await getJson(`${FAPI}/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=500&endTime=${oiEnd}`); } catch (e) { console.warn("OI-Historie", e); break; }
      if (!b || !b.length) break;
      for (const p of b) oi.set(Math.floor(p.timestamp / 60000), +p.sumOpenInterestValue);
      const first = +b[0].timestamp; if (first >= oiEnd) break; oiEnd = first - 1;
    }
    const rows = []; let last = -1;
    for (const k of klines) {
      if (+k[6] >= end) continue;
      const m = Math.floor(k[0] / 60000); if (m <= last) continue; last = m;
      rows.push([m, +k[1], +k[2], +k[3], +k[4], +k[7], +k[10], oi.has(m) ? oi.get(m) : NaN]);
    }
    return rows;
  }

  // ------------------------------------------------------------------ Binance live
  function binanceStream(coin) {
    const m = model(coin), s = coin.toLowerCase() + "usdt";
    let agg = null, legacy = false, fails = 0;
    const bubbleMin = BUBBLE_MIN[coin] || 100000, liqMin = LIQ_BUBBLE_MIN[coin] || 20000, wallMin = WALL_MIN[coin] || 500000;
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data), st = msg.stream || "", d = msg.data || {};
      if (st.endsWith("@kline_1m")) {
        const k = d.k, minute = Math.floor(k.t / 60000);
        const lv = { minute, o: +k.o, h: +k.h, l: +k.l, c: +k.c, vol: +k.q, tb: +k.Q };
        m.live = lv; m.price = lv.c; m.updated = Date.now();
        Alerts.onPrice(coin, lv.c); emit({ type: "price", coin, price: lv.c });
        if (k.x) closeMinute(coin, lv);
      } else if (st.endsWith("@aggTrade")) {
        const price = +d.p, usd = price * +d.q, side = d.m ? SHORT : LONG, ts = d.T;
        if (agg && agg.side === side && ts - agg.last <= 100) { agg.usd += usd; agg.pv += price * usd; agg.last = ts; return; }
        const done = agg; agg = { t: ts, last: ts, usd, pv: price * usd, side };
        if (done && done.usd >= bubbleMin) {
          const b = { t: done.t, price: done.pv / done.usd, usd: done.usd, side: done.side === LONG ? "buy" : "sell", kind: "trade" };
          m.bubbles.push(b); Alerts.onBubble(coin, b); emit({ type: "bubble", coin, bubble: b });
        }
      } else if (st.includes("@depth")) {
        const walls = [];
        for (const [key, side] of [["b", "bid"], ["a", "ask"]]) for (const [p, q] of d[key] || []) { const usd = +p * +q; if (usd >= wallMin) walls.push({ price: +p, usd, side }); }
        m.walls = walls;
      } else if (st.endsWith("@forceOrder")) {
        const o = d.o, price = +(o.ap || o.p), usd = price * +(o.z || o.q), side = o.S === "SELL" ? LONG : SHORT;
        m.liqEvents.push([o.T, side, usd, price]); Alerts.onLiquidation(coin, side, usd, price);
        if (usd >= liqMin) { const b = { t: o.T, price, usd, side: side === LONG ? "long" : "short", kind: "liq" }; m.bubbles.push(b); emit({ type: "bubble", coin, bubble: b }); }
      }
    };
    const open = (url, tag) => {
      const ws = new WebSocket(url); let opened = false;
      ws.onopen = () => { opened = true; fails = 0; };
      ws.onmessage = onMsg;
      ws.onclose = () => {
        if (!opened && ++fails >= 2 && !legacy) { legacy = true; console.warn("Binance: wechsle auf alte Stream-Adresse"); return start(); }
        setTimeout(() => (tag === "depth" ? openDepth() : openMarket()), 5000);
      };
    };
    const openMarket = () => open(legacy ? `wss://fstream.binance.com/stream?streams=${s}@kline_1m/${s}@aggTrade/${s}@forceOrder/${s}@depth20@500ms`
      : `wss://fstream.binance.com/market/stream?streams=${s}@kline_1m/${s}@aggTrade/${s}@forceOrder`, "market");
    const openDepth = () => { if (!legacy) open(`wss://fstream.binance.com/public/stream?streams=${s}@depth20@500ms`, "depth"); };
    const start = () => { openMarket(); openDepth(); };
    start();
  }
  async function closeMinute(coin, lv) {
    const m = model(coin); let oi = NaN;
    try { const d = await getJson(`${FAPI}/fapi/v1/openInterest?symbol=${coin}USDT`, {}, 2); oi = +d.openInterest * lv.c; } catch (e) {}
    m.addMinute(lv.minute, lv.o, lv.h, lv.l, lv.c, lv.vol, lv.tb, oi);
    try { m.change24 = +(await getJson(`${FAPI}/fapi/v1/ticker/24hr?symbol=${coin}USDT`, {}, 1)).priceChangePercent; } catch (e) {}
    Alerts.onMinute(coin); emit({ type: "minute", coin });
    if (m.bubbles.length > 20000) m.bubbles.splice(0, m.bubbles.length - 20000);
  }

  // ------------------------------------------------------------------ Open Interest mehrerer Börsen
  async function refreshOiAll(coin) {
    const m = model(coin), p = m.price; if (!p) return;
    const src = {
      Binance: async () => +(await getJson(`${FAPI}/fapi/v1/openInterest?symbol=${coin}USDT`, {}, 1)).openInterest * p,
      Bybit: async () => +(await getJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}USDT`, {}, 1)).result.list[0].openInterestValue,
      OKX: async () => { const d = (await getJson(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${coin}-USDT-SWAP`, {}, 1)).data[0]; return d.oiUsd ? +d.oiUsd : +d.oiCcy * p; },
      Hyperliquid: async () => { const [meta, ctx] = await post(HL, { type: "metaAndAssetCtxs" }); const i = meta.universe.findIndex((u) => u.name === coin); return +ctx[i].openInterest * +ctx[i].markPx; },
    };
    const parts = {};
    await Promise.all(Object.entries(src).map(async ([k, fn]) => { try { const v = await fn(); if (v > 0) parts[k] = v; } catch (e) {} }));
    if (Object.keys(parts).length) m.oiAll = { total: Object.values(parts).reduce((a, b) => a + b, 0), parts, source: Object.keys(parts).join(" + ") };
  }

  // ------------------------------------------------------------------ Hyperliquid echte Positionen
  async function hyperliquidLoop() {
    let wallets = [], lbTime = 0;
    for (;;) {
      try {
        if (!wallets.length || Date.now() - lbTime > 6 * 3600000) {
          const lb = await getJson("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", {}, 2);
          wallets = (lb.leaderboardRows || []).sort((a, b) => +b.accountValue - +a.accountValue).slice(0, HL_TOP).map((x) => x.ethAddress);
          lbTime = Date.now();
        }
        const pos = Object.fromEntries(COINS.map((c) => [c, []]));
        let i = 0;
        const worker = async () => {
          while (i < wallets.length) {
            const addr = wallets[i++];
            try {
              const st = await post(HL, { type: "clearinghouseState", user: addr });
              for (const ap of st.assetPositions || []) {
                const p = ap.position || {}; if (!pos[p.coin]) continue;
                const szi = +p.szi; if (!szi) continue;
                pos[p.coin].push({ side: szi > 0 ? "long" : "short", usd: Math.abs(+p.positionValue), entry: +p.entryPx, liq: p.liquidationPx ? +p.liquidationPx : null, lev: p.leverage && p.leverage.value });
              }
            } catch (e) {}
            await sleep(1000 / HL_REQ_PER_SEC);
          }
        };
        await worker();
        let oi = {};
        try { const [meta, ctx] = await post(HL, { type: "metaAndAssetCtxs" }); meta.universe.forEach((u, k) => oi[u.name] = +ctx[k].openInterest * +ctx[k].markPx); } catch (e) {}
        for (const c of COINS) {
          const ps = pos[c], total = ps.reduce((a, p) => a + p.usd, 0);
          model(c).hl = { positions: ps, count: ps.length, wallets: wallets.length, total_usd: total, market_oi_usd: oi[c],
            share_pct: oi[c] ? total / oi[c] * 100 : null, long_usd: ps.filter((p) => p.side === "long").reduce((a, p) => a + p.usd, 0),
            short_usd: ps.filter((p) => p.side === "short").reduce((a, p) => a + p.usd, 0), updated_ms: Date.now() };
        }
      } catch (e) {
        console.warn("Hyperliquid nicht erreichbar", e);
        for (const c of COINS) if (!model(c).hl.count) model(c).hl = { error: "Hyperliquid ist gerade nicht erreichbar, neuer Versuch in 10 Minuten." };
      }
      await sleep(HL_REFRESH_MIN * 60000);
    }
  }

  // ------------------------------------------------------------------ Demo
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const START = { BTC: [81000, 8.5e9], ETH: [3100, 4.2e9], SOL: [150, 1.4e9] };
  function demoHistory(coin, days) {
    const R = rng(coin.charCodeAt(0) * 99), gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
    const n = days * 1440, now = Math.floor(Date.now() / 60000), [p0, oi0] = START[coin];
    const ret = [], sig = []; let reg = 0;
    for (let i = 0; i < n; i++) { reg += gauss() * 0.006; const s = 0.0007 * Math.min(2.5, Math.max(0.5, Math.exp(reg))); sig.push(s); ret.push(gauss() * s * 0.8 + Math.sin(i / 2600) * 0.0001); }
    let lp = 0; const close = ret.map((r) => Math.exp(lp += r)); const k = p0 / close[n - 1];
    const rows = []; let oi = oi0 * 0.8;
    for (let i = 0; i < n; i++) {
      const c = close[i] * k, o = i ? close[i - 1] * k : c, s = sig[i];
      const h = Math.max(o, c) * (1 + Math.abs(gauss()) * s * 0.8), l = Math.min(o, c) * (1 - Math.abs(gauss()) * s * 0.8);
      const vol = oi0 * 0.0009 * (1 + 40 * Math.abs(ret[i])) * Math.exp(gauss() * 0.4);
      const tb = vol * Math.min(0.9, Math.max(0.1, 0.5 + ret[i] / (s * 6) + gauss() * 0.05));
      oi = Math.max(oi0 * 0.4, oi + vol * (0.012 + gauss() * 0.09) - vol * 25 * Math.max(Math.abs(ret[i]) - s * 2, 0));
      rows.push([now - n + i, o, h, l, c, vol, tb, oi]);
    }
    return rows;
  }
  function demoExtras(coin) {
    const m = model(coin), R = rng(coin.charCodeAt(1) * 7), now = Date.now();
    m.change24 = (m.c.last / m.c.a[m.n - 1441] - 1) * 100;
    m.oiAll = { total: m.oi.last * 6.1, source: "Demo-Daten" };
    const ps = [];
    for (let i = 0; i < 180; i++) { const side = R() < 0.55 ? "long" : "short", lev = [3, 5, 10, 20, 25, 40][Math.floor(R() * 6)], entry = m.price * (1 + (R() - 0.5) * 0.08);
      ps.push({ side, lev, entry, liq: side === "long" ? entry * (1 - 0.9 / lev) : entry * (1 + 0.9 / lev), usd: Math.exp(Math.log(coin === "BTC" ? 4e6 : 8e5) + (R() - 0.5) * 3) }); }
    const total = ps.reduce((a, p) => a + p.usd, 0);
    m.hl = { positions: ps, count: ps.length, wallets: 500, total_usd: total, market_oi_usd: START[coin][1] * 0.9, share_pct: total / (START[coin][1] * 0.9) * 100,
      long_usd: ps.filter((p) => p.side === "long").reduce((a, p) => a + p.usd, 0), short_usd: ps.filter((p) => p.side === "short").reduce((a, p) => a + p.usd, 0), updated_ms: now };
    for (let i = Math.max(0, m.n - 4320); i < m.n; i++) {
      if (R() < 0.02) m.bubbles.push({ t: m.t.a[i] * 60000 + 30000, price: m.c.a[i], usd: BUBBLE_MIN[coin] * Math.pow(R(), -1 / 1.6), side: R() < m.tb.a[i] / m.vol.a[i] ? "buy" : "sell", kind: "trade" });
      if (R() < 0.004) { const long = m.c.a[i] < m.o.a[i]; m.bubbles.push({ t: m.t.a[i] * 60000 + 20000, price: long ? m.l.a[i] : m.h.a[i], usd: LIQ_BUBBLE_MIN[coin] * Math.pow(R(), -1 / 1.3), side: long ? "long" : "short", kind: "liq" }); }
    }
    for (let i = 0; i < 1500; i++) m.liqEvents.push([now - Math.floor(R() * 86000000), R() < 0.8 ? LONG : SHORT, Math.pow(R(), -1 / 1.4) * 8000, m.price]);
    m.liqEvents.sort((a, b) => a[0] - b[0]);
  }
  function demoStream(coin) {
    const m = model(coin), R = rng(coin.charCodeAt(2) * 13), gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
    let lv = null;
    setInterval(() => {
      const minute = Math.floor(Date.now() / 60000);
      if (lv && minute !== lv.minute) { m.addMinute(lv.minute, lv.o, lv.h, lv.l, lv.c, lv.vol, lv.tb, m.oi.last + lv.vol * (0.04 + gauss() * 0.08)); m.oiAll.total = m.oi.last * 6.1; Alerts.onMinute(coin); emit({ type: "minute", coin }); lv = null; }
      const p = m.price * Math.exp(gauss() * 0.00025);
      if (!lv) lv = { minute, o: m.price, h: m.price, l: m.price, c: m.price, vol: 0, tb: 0 };
      const v = START[coin][1] * 0.00006 * Math.exp(gauss() * 0.5);
      lv.c = p; lv.h = Math.max(lv.h, p); lv.l = Math.min(lv.l, p); lv.vol += v; lv.tb += v * (0.5 + gauss() * 0.15);
      m.live = { ...lv }; m.price = p; m.updated = Date.now();
      Alerts.onPrice(coin, p); emit({ type: "price", coin, price: p });
      if (R() < 0.08) { const b = { t: Date.now(), price: p, usd: BUBBLE_MIN[coin] * Math.pow(R(), -1 / 1.6), side: R() < 0.5 ? "buy" : "sell", kind: "trade" }; m.bubbles.push(b); Alerts.onBubble(coin, b); emit({ type: "bubble", coin, bubble: b }); }
      if (R() < 0.1) { const side = R() < 0.5 ? LONG : SHORT, usd = Math.pow(R(), -1 / 1.4) * 8000; m.liqEvents.push([Date.now(), side, usd, p]); Alerts.onLiquidation(coin, side, usd, p); }
      m.walls = [1, 3].map((k) => ({ price: p * (1 - 0.004 * k), usd: 1.5e6 + 2e6 * R(), side: "bid" })).concat([1, 2].map((k) => ({ price: p * (1 + 0.005 * k), usd: 1.5e6 + 2e6 * R(), side: "ask" })));
    }, 2000);
  }

  // ------------------------------------------------------------------ Start je Coin
  async function ensure(coin) {
    if (ready[coin] || loading[coin]) return;
    loading[coin] = true;
    const m = model(coin);
    try {
      if (DEMO) { m.bootstrap(demoHistory(coin, HISTORY_DAYS)); demoExtras(coin); demoStream(coin); }
      else {
        const rows = await binanceHistory(coin, HISTORY_DAYS);
        statusText = `Berechne ${coin}-Heatmap …`; await sleep(30);
        m.bootstrap(rows);
        binanceStream(coin);
        refreshOiAll(coin); setInterval(() => refreshOiAll(coin), 60000);
      }
      ready[coin] = true; Alerts.onMinute(coin);
    } catch (e) {
      statusText = `Binance nicht erreichbar (${e.message}). Neuer Versuch in 30 s …`; loading[coin] = false;
      setTimeout(() => ensure(coin), 30000); return;
    }
    loading[coin] = false;
  }

  // ------------------------------------------------------------------ "API" für die Oberfläche
  const levIdx = (s) => s.split(",").map((x) => CFG.leverages.indexOf(+x.replace("x", ""))).filter((i) => i >= 0);
  function state(coin) {
    const m = model(coin), hl = { ...m.hl }; delete hl.positions;
    return { coin, ready: !!ready[coin], price: isNaN(m.price) ? null : m.price, change24: m.change24, oi_all: m.oiAll,
      oi_binance: m.oi.n ? m.oi.last : null, liq24: m.liqTotals(Date.now()), hl, updated_ms: m.updated || Date.now() };
  }
  function chart(q) {
    const coin = q.coin, m = model(coin); ensure(coin);
    if (!ready[coin] || !m.n) return { ready: false };
    const tf = Math.max(1, +q.tf || 60); const range = Math.max(tf * 20, Math.min(+q.range || 4320, tf * 3000));
    const rows = Math.min(1200, Math.max(100, +q.rows || 480));
    const levs = levIdx(q.levs || "5,10,25,50,100");
    const sides = (q.sides || "long,short").split(",").map((s) => (s === "long" ? LONG : SHORT));
    const since = +q.since || 0;
    const candles = m.candles(tf, range);
    const lo = Math.min(...candles.l), hi = Math.max(...candles.h);
    let pmin = q.pmin != null ? +q.pmin : NaN, pmax = q.pmax != null ? +q.pmax : NaN;
    if (!(pmin > 0 && pmax > pmin)) { const pad = (hi - lo) * 0.15 + m.price * 0.04; pmin = lo - pad; pmax = hi + pad; }
    pmin = Math.max(pmin, m.price * 0.2); pmax = Math.min(pmax, m.price * 5);
    const hm = m.heatmap(tf, range, pmin, pmax, rows, levs, sides, since);
    let heat = null;
    if (hm.grid && hm.cols) {
      const g = hm.grid, sample = [], step = Math.max(1, Math.floor(g.length / 200000));
      for (let i = 0; i < g.length; i += step) if (g[i] > 0) sample.push(g[i]);
      sample.sort((a, b) => a - b);
      const vmax = Math.max(1, sample.length ? sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.995))] : 1), gamma = 0.75;
      const bytes = new Uint8Array(rows * hm.cols);
      for (let r = 0; r < rows; r++) { const src = (rows - 1 - r) * hm.cols, dst = r * hm.cols; // Zeile 0 = oben
        for (let c = 0; c < hm.cols; c++) bytes[dst + c] = Math.round(Math.pow(Math.min(1, g[src + c] / vmax), gamma) * 255); }
      heat = { cols: hm.cols, rows, vmax, gamma, bytes };
    }
    // Hyperliquid
    const hlProf = { longs: new Array(rows).fill(0), shorts: new Array(rows).fill(0) }, hlLevels = [];
    const ps = (m.hl.positions || []).filter((p) => p.liq && p.liq >= pmin && p.liq < pmax);
    for (const p of ps) { const r = Math.min(rows - 1, Math.floor((p.liq - pmin) / (pmax - pmin) * rows)); (p.side === "long" ? hlProf.longs : hlProf.shorts)[r] += p.usd; }
    const w = m.price * 0.0025;
    for (const above of [true, false]) {
      const bins = new Map();
      for (const p of ps) if (above ? p.liq > m.price : p.liq < m.price) { const b = Math.floor(p.liq / w), x = bins.get(b) || [0, 0]; x[0] += p.usd; x[1] += p.usd * p.liq; bins.set(b, x); }
      const best = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
      if (best) hlLevels.push({ price: best[1] / best[0], usd: best[0], side: above ? "short" : "long" });
    }
    const t0 = candles.t.length ? candles.t[0] * 1000 : 0;
    let bubbles = m.bubbles.filter((b) => b.t >= t0);
    if (bubbles.length > 4000) bubbles = bubbles.sort((a, b) => b.usd - a.usd).slice(0, 4000);
    return { ready: true, tf, pmin, pmax, rows, candles, heat,
      profile: m.profile(pmin, pmax, rows, levs, sides, since), zones: m.zones(levs, sides, since),
      volume: m.volumeProfile(tf, range, pmin, pmax, rows), hl_profile: hlProf, hl_levels: hlLevels,
      bubbles, walls: m.walls, price: m.price };
  }

  async function api(path, opts = {}) {
    const u = new URL(path, location.href), q = Object.fromEntries(u.searchParams), p = u.pathname.replace(/^.*\/api\//, "");
    const method = (opts.method || "GET").toUpperCase();
    if (p === "meta") return { coins: COINS, leverages: CFG.leverages, demo: DEMO, ready };
    if (p === "state") { ensure(q.coin); return state(q.coin); }
    if (p === "chart") return chart(q);
    if (p === "alerts/suggest") return Alerts.suggest(q.coin, q.direction);
    if (p === "alerts" && method === "GET") return Alerts.list();
    if (p === "alerts" && method === "POST") return Alerts.create(JSON.parse(opts.body));
    if (p.startsWith("alerts/") && method === "DELETE") return Alerts.remove(p.split("/")[1]);
    throw new Error("Unbekannte Anfrage " + p);
  }

  if (!DEMO) setTimeout(hyperliquidLoop, 3000);
  else for (const c of COINS) setTimeout(() => ensure(c), 10);
  return { api, subscribe: (fn) => listeners.push(fn), emit, model, get statusText() { return statusText; }, DEMO, COINS };
})();
