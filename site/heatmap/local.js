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
  // V21: Zwischenspeicher im Browser (IndexedDB) – der Verlauf wird nicht mehr bei jedem Öffnen komplett neu geladen, nur das Fehlende
  const IDB = (() => { let dbp = null; const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("hmcache", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    return { get: async (k) => { try { const db = await open(); return await new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } },
      set: async (k, v) => { try { const db = await open(); await new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} } }; })();
  // V21: Schwellen aus den Einstellungen der Seite (Mio. $), sonst wie bisher je Coin
  const setNum = (k) => { try { const v = parseFloat(localStorage.getItem(k)); return v > 0 ? v * 1e6 : null; } catch (e) { return null; } };

  // V21b: lange Historie (bis 1 Jahr, Stundenwerte) vom PC-Programm – Binance-Stundenkerzen und Open Interest von Bybit; nur Bitcoin.
  // Die Stundenzeilen kommen VOR die 30 Tage Minutenkerzen; das Open Interest wird an der Nahtstelle auf das Binance-Niveau angeglichen (es zählen nur die Änderungen).
  async function withLongHist(coin, rows) {
    if (coin !== "BTC" || !rows.length) return rows;
    try {
      statusText = "Lade lange Historie (Stundenwerte) …";
      const j = await getJson("./data/hist-BTC.json?t=" + Math.floor(Date.now() / 600000), {}, 1), H = Array.isArray(j && j.rows) ? j.rows : [];
      const first = rows[0][0], old = H.filter((r) => r[0] + 60 <= first); if (!old.length) return rows;
      const okv = (v) => v != null && isFinite(v) && v > 0, fo = rows.find((r) => okv(r[7])), lo = [...old].reverse().find((r) => okv(r[7]));
      const f = fo && lo ? fo[7] / lo[7] : 1;
      window.HM_LONGH = { from: old[0][0] * 60000, hours: old.length };
      return old.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5] || 0, r[6] || 0, okv(r[7]) ? r[7] * f : NaN]).concat(rows);
    } catch (e) { return rows; }
  }
  // ------------------------------------------------------------------ Binance Historie
  async function binanceHistory(coin, days) {
    const sym = coin + "USDT";
    const end = Math.floor(Date.now() / 60000) * 60000, start = end - days * 86400000;
    // V21: was schon im Zwischenspeicher liegt, nicht noch einmal holen
    const ck = await IDB.get("k1m:" + coin), cached = (ck && Array.isArray(ck.rows) ? ck.rows : []).filter((k) => k[0] >= start);
    const from = cached.length ? Math.max(start, cached[cached.length - 1][0] + 60000) : start;
    if (cached.length) statusText = `Lade ${coin}-Historie aus dem Zwischenspeicher …`;
    const chunks = []; for (let t = from; t < end; t += 1500 * 60000) chunks.push(t);
    const klines = cached.slice(); let done = 0;
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
    { const seenK = new Set(), uniq = klines.filter((k) => !seenK.has(k[0]) && seenK.add(k[0])); klines.length = 0; klines.push(...uniq); }
    IDB.set("k1m:" + coin, { t: Date.now(), rows: klines.filter((k) => +k[6] < end) });
    const oi = new Map();
    const oc = await IDB.get("oi5m:" + coin); if (oc && Array.isArray(oc.rows)) for (const [mm, v] of oc.rows) if (mm * 60000 >= start) oi.set(mm, v);
    const oiHave = oi.size ? Math.max(...oi.keys()) * 60000 : 0;
    let oiEnd = end; const oiStart = Math.max(start, end - 30 * 86400000 + 600000);
    statusText = `Lade ${coin}-Open-Interest …`;
    while (oiEnd > oiStart) {
      let b;
      try { b = await getJson(`${FAPI}/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=500&endTime=${oiEnd}`); } catch (e) { console.warn("OI-Historie", e); break; }
      if (!b || !b.length) break;
      for (const p of b) oi.set(Math.floor(p.timestamp / 60000), +p.sumOpenInterestValue);
      const first = +b[0].timestamp; if (first >= oiEnd || first <= oiHave) break; oiEnd = first - 1;
    }
    IDB.set("oi5m:" + coin, { t: Date.now(), rows: [...oi.entries()] });
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
    const liqMin = LIQ_BUBBLE_MIN[coin] || 20000, bubMinOf = () => setNum("hm_bub") || BUBBLE_MIN[coin] || 100000, wallMinOf = () => setNum("hm_wall") || WALL_MIN[coin] || 500000;
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
        if (done && done.usd >= bubMinOf()) {
          const b = { t: done.t, price: done.pv / done.usd, usd: done.usd, side: done.side === LONG ? "buy" : "sell", kind: "trade" };
          m.bubbles.push(b); Alerts.onBubble(coin, b); emit({ type: "bubble", coin, bubble: b });
        }
      } else if (st.includes("@depth")) {
        // V21: die tiefe Orderbuch-Abfrage (alle 15 s) hat Vorrang – die 20 nächsten Stufen allein waren fast nie groß genug für eine „Wand“
        if (Date.now() - (m.wallsRestT || 0) < 30000) return;
        const walls = [], wm = wallMinOf();
        for (const [key, side] of [["b", "bid"], ["a", "ask"]]) for (const [p, q] of d[key] || []) { const usd = +p * +q; if (usd >= wm) walls.push({ price: +p, usd, side }); }
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

  // V21: tiefes Orderbuch (1000 Stufen) alle 15 s – Stufen in Preis-Fächern (0,05 %) zusammengefasst, Wand = Fach ab der eingestellten Größe
  async function depthLoop(coin) {
    for (;;) {
      try {
        const m = model(coin), j = await getJson(`${FAPI}/fapi/v1/depth?symbol=${coin}USDT&limit=1000`, {}, 1), p0 = m.price || +j.bids?.[0]?.[0];
        if (p0) { const bin = p0 * 0.0005, wm = wallMinCoin(coin), acc = new Map();
          for (const [key, side] of [["bids", "bid"], ["asks", "ask"]]) for (const [p, q] of j[key] || []) { const b = Math.round(+p / bin) * bin, k = side + b, x = acc.get(k) || { price: b, usd: 0, side }; x.usd += +p * +q; acc.set(k, x); }
          m.walls = [...acc.values()].filter((w) => w.usd >= wm).sort((a, b) => b.usd - a.usd).slice(0, 40); m.wallsRestT = Date.now(); }
      } catch (e) {}
      await sleep(15000);
    }
  }
  const wallMinCoin = (c) => setNum("hm_wall") || WALL_MIN[c] || 500000;
  // ------------------------------------------------------------------ Open Interest mehrerer Börsen
  async function refreshOiAll(coin) {
    const m = model(coin), p = m.price; if (!p) return;
    const src = {
      Binance: async () => +(await getJson(`${FAPI}/fapi/v1/openInterest?symbol=${coin}USDT`, {}, 1)).openInterest * p,
      Bybit: async () => +(await getJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}USDT`, {}, 1)).result.list[0].openInterestValue,
      OKX: async () => { const d = (await getJson(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${coin}-USDT-SWAP`, {}, 1)).data[0]; return d.oiUsd ? +d.oiUsd : +d.oiCcy * p; },
      Hyperliquid: async () => { const [meta, ctx] = await post(HL, { type: "metaAndAssetCtxs" }); const i = meta.universe.findIndex((u) => u.name === coin); return +ctx[i].openInterest * +ctx[i].markPx; },
      // V21: weitere Börsen (nur wenn sie vom Browser aus erreichbar sind; sonst fallen sie still weg)
      "Binance COIN-M": async () => coin === "BTC" ? +(await getJson("https://dapi.binance.com/dapi/v1/openInterest?symbol=BTCUSD_PERP", {}, 1)).openInterest * 100 : null,
      "Bybit invers": async () => coin === "BTC" ? +(await getJson("https://api.bybit.com/v5/market/tickers?category=inverse&symbol=BTCUSD", {}, 1)).result.list[0].openInterest : null,
      Bitget: async () => +(await getJson(`https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${coin}USDT&productType=USDT-FUTURES`, {}, 1)).data.openInterestList[0].size * p,
      Deribit: async () => coin === "BTC" ? +(await getJson("https://www.deribit.com/api/v2/public/get_book_summary_by_instrument?instrument_name=BTC-PERPETUAL", {}, 1)).result[0].open_interest : null,
      Gate: async () => { const a = await getJson(`https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=${coin}_USDT&interval=1h&limit=1`, {}, 1); return +a[a.length - 1].open_interest_usd; },
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
        const rows = await withLongHist(coin, await binanceHistory(coin, HISTORY_DAYS));
        statusText = `Berechne ${coin}-Heatmap …`; await sleep(30);
        m.bootstrap(rows);
        binanceStream(coin); depthLoop(coin);
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
