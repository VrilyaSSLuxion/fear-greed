// Fear & Greed V21 – Hintergrund-Programm
// V21: eine zentrale Website – www/ = Startseite, www/fear-greed/ = Fear & Greed (mit data/), www/heatmap/, www/tools/ … (Quelle: site/ und site/www/)
// Läuft unsichtbar, sammelt jede Minute (einstellbar) alle Daten (inkl. dauerhaftem Liquidations-Mitschnitt),
// speichert den Verlauf, liefert die Seite unter http://localhost:8797 aus und verschickt Telegram-Alarme.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, vkey, BASE_VARIANTS, SRCS, WINS, longHistData } from './collector/engine.mjs';
import { tradePlan, tradePlanText, TPLAN_DEF, liqUsd, methodSignals, phaseSignals, trig, trendInfo, applyTrend, mean7, divergences, divRows, clusterSet, heatEvents, alarmText, touchTrack, nextCluster, pivotEvents, pivotPayload, fiftySignals, F50_TYPES, candleSignals, CDL_TYPES, smaSignals, SMA_DEF, vwapSignals, liqCombine, hmParts,
  avgMap, OFF_COL, fractals, fracBreaks, fracIdxFilter, fracNear, FRAC_DEF, maCrossEvents, maLine, lineName, offExitSignals, offFracSignals, seriesCross, HM_PER, vwapCalc } from './collector/shared.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data'), WWW = path.join(ROOT, 'www'), FGW = path.join(WWW, 'fear-greed');
fs.mkdirSync(path.join(FGW, 'data'), { recursive: true });
fs.mkdirSync(DATA, { recursive: true });
const PORT = +process.env.FG_PORT || 8797; // FG_PORT/FG_NOPUBLISH nur zum Testen
// Intervalle (Minuten) – im Zahnrad einstellbar: Daten holen, online veröffentlichen (GitHub: max. ~10 Builds/Stunde), große Verläufe
const iv = () => { const c = cfg(); return { data: Math.max(1, Math.min(60, +c.intervalMin || 1)), publish: Math.max(6, Math.min(120, +c.publishMin || 7)), hist: Math.max(15, Math.min(1440, +c.histMin || 60)) }; };
const HCACHE = {};
const log = (...a) => console.log(new Date().toLocaleString('de-DE'), '·', ...a);

/* ---------- Konfiguration (API-Keys, Telegram) ---------- */
const CFG_PATH = path.join(ROOT, 'config.json');
// V19: online alle 7 Minuten (GitHub Pages: höchstens ~10 Builds je Stunde), CryptoRank stündlich (kostenloser Key: 10.000 Credits im Monat)
const FRAC_SIDE = { on: false, ...FRAC_DEF, brk: false, idxF: { on: false, lo: 30, hi: 70, look: 2 }, near: { on: false, days: 3 } };
const DEF = { sosovalueApiKey: '', coinglassApiKey: '', coinalyzeApiKey: '', cryptorankApiKey: '', crEvery: 60, intervalMin: 1, publishMin: 7, histMin: 60,
  idx: { src: 'binance', win: '90' }, off: { src: 'alt', avg: true },
  // V20: offizielle Signale mit eigenen Grenzen (Austritt aus 13 / 70), Fraktal dazu, Stufen-Signale wie bisher (aus), Kreuz mit Index-Linien; Mitschnitt-Schwelle
  offSig: { lo: 13, hi: 70, ext: true, frac: true, before: 5, after: 0, lv: false, x: [] }, oiRecMin: 168,
  // V21: Handelsplan (SL/TP aus den Clustern) an Signal-Nachrichten, optional als Webhook (JSON) für einen Bot
  tplan: { ...TPLAN_DEF },
  frac: { price: { ...FRAC_SIDE }, idx: { ...FRAC_SIDE, minMove: 0 }, al: { conf: true, brk: true } }, maAl: [],
  heat: { src: 'binance', pct: 1, approach: true, zone: true, poc: true, nearest: true, extra: 2, alarmExtra: false, cool: 720, far: true, farPct: 50, farRange: 20, reactOn: true, react: 1, brk: 1, reactH: 24 }, lines: [],
  div: { left: 5, right: 5, minGap: 5, maxGap: 60, hidden: false, zone: true, src: '7', win: 'auto', official: false }, sig: { method: 'std', trigger: 'entry', minDays: 3, tol: 0, trend: { basis: ['ema'], mode: 'mark', emaN: 200, adxMin: 25 } },
  pivot: { per: ['30', '91', '182'], lo: true, hi: true, near: false, nearPct: 1, low: 'range' },
  f50: { types: ['bounce', 'reject', 'brkUp', 'brkDn', 'retL', 'retS', 'failUp', 'failDn'], zoneL: 3, confL: 3, zoneS: 3, confS: 3, retestDays: 20 },
  cdl: { types: ['hammer', 'invHammer', 'engBull', 'piercing', 'morning', 'shooting', 'hanging', 'engBear', 'darkCloud', 'evening'], lo: 30, hi: 70, look: 3, src: 'ours', dir: 'both' },
  rep: { pivot: { iv: 120, max: 5 } }, avg: { sig: false, n: 7 }, sma: { n: 20, dir: 'both', m1: { ...SMA_DEF.m1 }, m2: { ...SMA_DEF.m2 }, m3: { ...SMA_DEF.m3 },
    lines: [{ id: 'i1', type: 'sma', n: 20, sig: true, ms: ['m1', 'm2', 'm3'] }] },
  vwap: { src: 'hlc3', combos: ['ema8_W'], conf: false, confDays: 2, dir: 'both', trend: { mode: 'hide', n: 200, tf: '1d' } },
  telegram: { token: '', chatId: '', enabled: false, events: ['p1', 'p2', 'turn', 'heat', 'lines', 'div', 'react', 'pivot', 'f50', 'cdl', 'sma', 'vwap', 'frac', 'ma'] } };
function cfg() { try { const c = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); return { ...DEF, ...c, heat: { ...DEF.heat, ...(c.heat || {}) }, div: { ...DEF.div, ...(c.div || {}) }, sig: { ...DEF.sig, ...(c.sig || {}) }, pivot: { ...DEF.pivot, ...(c.pivot || {}) }, f50: { ...DEF.f50, ...(c.f50 || {}) }, cdl: { ...DEF.cdl, ...(c.cdl || {}) }, avg: { ...DEF.avg, ...(c.avg || {}) },
  sma: { ...DEF.sma, ...(c.sma || {}), m1: { ...DEF.sma.m1, ...(c.sma?.m1 || {}) }, m2: { ...DEF.sma.m2, ...(c.sma?.m2 || {}) }, m3: { ...DEF.sma.m3, ...(c.sma?.m3 || {}) } },
  vwap: { ...DEF.vwap, ...(c.vwap || {}) }, rep: { ...DEF.rep, ...(c.rep || {}) }, telegram: { ...DEF.telegram, ...(c.telegram || {}) },
  idx: { ...DEF.idx, ...(c.idx || {}) }, off: { ...DEF.off, ...(c.off || {}) }, offSig: { ...DEF.offSig, ...(c.offSig || {}) }, frac: { price: { ...DEF.frac.price, ...(c.frac?.price || {}) }, idx: { ...DEF.frac.idx, ...(c.frac?.idx || {}) }, al: { ...DEF.frac.al, ...(c.frac?.al || {}) } } }; } catch { return structuredClone(DEF); } }
function saveCfg(c) { fs.writeFileSync(CFG_PATH, JSON.stringify(c, null, 2)); }
if (!fs.existsSync(CFG_PATH)) saveCfg(DEF);

/* ---------- Zustand (Liquidationen, eigene Verläufe) ---------- */
const STATE_PATH = path.join(DATA, 'state.json');
let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { }
const saveState = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state));

/* ---------- Liquidationen dauerhaft mitschneiden (Binance + Bybit) ---------- */
function addLiq(ex, isLong, usd, t) {
  if (!(usd > 0)) return;
  state.liq ||= { buckets: [], daily: {}, okxLast: {} };
  const k = Math.floor(t / 600000) * 600000;
  let b = state.liq.buckets.find(x => x.t === k);
  if (!b) { b = { t: k, bL: 0, bS: 0, yL: 0, yS: 0, oL: 0, oS: 0 }; state.liq.buckets.push(b); }
  b[ex + (isLong ? 'L' : 'S')] += usd;
}
function stream(name, url, sub, onMsg) {
  const connect = () => {
    let ws, ping;
    try { ws = new WebSocket(url); } catch { return setTimeout(connect, 10000); }
    ws.onopen = () => { log(name, 'verbunden'); if (sub) ws.send(JSON.stringify(sub)); if (url.includes('bybit')) ping = setInterval(() => ws.send(JSON.stringify({ op: 'ping' })), 20000); };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { } };
    ws.onclose = () => { clearInterval(ping); setTimeout(connect, 5000); };
    ws.onerror = () => { };
  };
  connect();
}
// V20: große Einzelmeldungen (ab 5 Mio. $) mit Symbol ins Protokoll – am 22.10.2026 kamen in 10 Minuten 807 Mio. $ „Long“ bei kaum Kursbewegung
stream('Binance Liquidationen', 'wss://fstream.binance.com/market/stream?streams=!forceOrder@arr', null, m => { const o = m.data?.o; if (!o) return; const usd = liqUsd(o);
  if (usd >= 5e6) log(`Große Liquidation Binance: ${o.s} ${o.S === 'SELL' ? 'Long' : 'Short'} ${o.z} × ${o.ap} = ${(usd / 1e6).toFixed(1)} Mio. $`);
  addLiq('b', o.S === 'SELL', usd, o.T); });
stream('Bybit Liquidationen', 'wss://stream.bybit.com/v5/public/linear',
  { op: 'subscribe', args: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'SUIUSDT', 'LINKUSDT', 'AVAXUSDT'].map(s => 'allLiquidation.' + s) },
  m => { for (const x of m.data || []) addLiq('y', x.S === 'Buy', +x.v * +x.p, +x.T); });

/* ---------- Alarme per Telegram (gleiche Rechnung wie die Seite, siehe collector/shared.mjs) ---------- */
async function telegram(text) {
  // V19: Testlauf (FG_NOPUBLISH) verschickt nichts – sonst kämen Alarme doppelt
  if (process.env.FG_NOPUBLISH) { log('Telegram (Test, nicht gesendet):', text.split('\n')[0].slice(0, 120)); return; }
  const t = cfg().telegram;
  if (!t.token || !t.chatId) throw new Error('Telegram nicht eingerichtet');
  const r = await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: t.chatId, text, parse_mode: 'HTML' }), signal: AbortSignal.timeout(20000) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || 'Fehler');
}
const ZNAME = v => v == null ? '' : v >= 75 ? 'Extreme Gier' : v >= 55 ? 'Gier' : v >= 45 ? 'Neutral' : v >= 25 ? 'Angst' : 'Extreme Angst';
// V21: zuletzt berechnete Cluster und Kurs – für den Handelsplan an Signal-Nachrichten
let LASTCL = null, LASTPX = null;
const PLAN_KEYS = /^(sig|sma|ilx|vwap|vwt|frac|fracb|ma|cdl|f50|pv|pivot|react|offx|offf|offc|div|bos|clsig)[:_]/;
async function send1(key, a, sent, minMs = Infinity) {
  if (sent[key] && (minMs === Infinity || Date.now() - sent[key] < minMs)) return;
  const c = cfg(), tp = c.tplan || {}; let body = a.body, plan = null;
  if (tp.on && LASTCL && LASTPX && PLAN_KEYS.test(key)) { const up = /🟢|▲|Long/.test(a.title) && !/🔴|▼|Short/.test(a.title), dn = /🔴|▼|Short/.test(a.title);
    if (up || dn) { plan = tradePlan(LASTCL, LASTPX, up, tp); body += tradePlanText(plan, 'de'); } }
  let ok = false;
  if (c.telegram?.token && c.telegram?.chatId) { try { await telegram(`<b>${a.title}</b>\n${body}`); ok = true; log('Telegram gesendet:', key); } catch (e) { log('Telegram-Fehler:', e.message); } }
  if (tp.hook && /^https:\/\//i.test(tp.hook) && !process.env.FG_NOPUBLISH) { try { await fetch(tp.hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, title: a.title, text: body.replace(/<[^>]+>/g, ''), plan, time: new Date().toISOString(), source: 'VrilyaSS Fear & Greed V21' }), signal: AbortSignal.timeout(15000) }); ok = true; log('Webhook gesendet:', key); } catch (e) { log('Webhook-Fehler:', e.message); } }
  if (ok) sent[key] = Date.now();
}
// Spalten wie auf der Seite – V19: Datenquelle und Vergleichszeitraum wie auf der Seite gewählt (Standard: Binance, 90 Tage)
const selKey = (latest, c) => { const k = vkey(c.idx.src, c.idx.win); return latest.vcols?.[k] ? k : 'binance90'; };
const colsOf = (latest, c) => { const k = selKey(latest, c), v = latest.vcols?.[k] || { d7: 14, raw: 16 }; return { key: k, idx: v.d7, raw: v.raw, other: k === 'binance' ? 2 : 1 }; };
const curIdx = latest => latest.modes[selKey(latest, cfg())]?.index ?? latest.modes.binance90?.index;
// V18: N-Tage-Mittel des Tageswerts als eigene Spalte (wie auf der Seite), für „Signale mit gewählter Mittelung“ (V19: 1 = Tageswert)
function avgColS(H, raw, N) { if (N <= 1) return raw; const c = 200; let s = 0; const q = []; for (const r of H) { const v = r[raw]; if (v != null) { q.push(v); s += v; if (q.length > N) s -= q.shift(); } r[c] = v != null && q.length >= N ? Math.round(s / N) : null; } return c; }
// V19: offizieller Index wie auf der Seite – gewählter Anbieter, „mitmitteln“ = dieselbe Mittelung wie die Signale, sonst 7-Tage-Mittel
const offMaps = (history, c) => { const N = c.off.avg && c.avg?.sig ? c.avg.n : 7, sel = OFF_COL[c.off.src] ? c.off.src : 'alt';
  return [sel, ...Object.keys(OFF_COL).filter(k => k !== sel)].map(k => avgMap(history, OFF_COL[k], N)); };
async function checkAlerts(latest, history) {
  const c = cfg(), t = c.telegram; if (!t.enabled || !t.token || !t.chatId) return;
  const lv = c.levels || { p1: { hi: 75, lo: 25 }, p2: { hi: 85, lo: 15 } }, sent = (state.alertsSent ||= {});
  const COLS = colsOf(latest, c);
  const today = new Date().toISOString().slice(0, 10), idx = curIdx(latest), S = { idx, zone: ZNAME(idx), price: latest.btc.price };
  const TI = trendInfo(history, c.sig.trend || {});
  const IC = c.avg?.sig && c.avg.n !== 7 ? avgColS(history, COLS.raw, c.avg.n) : COLS.idx;
  const OFF = offMaps(history, c);
  for (const k of ['p1', 'p2']) {
    if (c.sig.method === 'peak' && k === 'p2') continue;
    const o = { col: IC, rawCol: COLS.raw, colA: IC, colB: COLS.other, hi: lv[k].hi, lo: lv[k].lo, trigger: c.sig.trigger, minDays: c.sig.minDays, tol: c.sig.tol, trend: c.sig.trend, trendInfo: TI };
    for (const sg of methodSignals(history, c.sig.method, o)) {
      if (sg.d !== today) continue;
      if ((sg.kind === 'phase' || sg.kind === 'exit') && !t.events.includes(k)) continue;
      if ((sg.kind === 'turn' || sg.kind === 'peak') && !t.events.includes('turn')) continue;
      await send1(`${sg.d}:${k}:${sg.kind}:${sg.type}:${c.sig.method}:${c.sig.trigger}`, alarmText(sg.kind, { ...sg, ...S, hi: lv[k].hi, lo: lv[k].lo }), sent);
    }
    if (t.events.includes('off') && c.offSig.lv) for (const sg of applyTrend(trig(phaseSignals(history.filter(r => OFF[0].has(r[0])).map(r => [r[0], OFF[0].get(r[0]), r[3]]), lv[k].hi, lv[k].lo, 5, { minDays: c.sig.minDays, tol: c.sig.tol }), c.sig.trigger), TI, c.sig.trend)) {
      if (sg.d !== today) continue;
      await send1(`off:${sg.d}:${k}:${sg.kind}:${sg.type}`, alarmText(sg.kind, { ...sg, ...S, official: true, hi: lv[k].hi, lo: lv[k].lo }), sent);
    }
  }
  // V20: offizieller Index mit eigenen Grenzen – Austritt aus 13 / 70, Fraktal im Kurs dazu, Kreuz der offiziellen Linie mit einer Index-Linie
  if (t.events.includes('off')) {
    // wie auf der Seite: die offizielle Linie mit der Mittelung des Index-Charts (wenn „mitmitteln“ an), Index-Linien auf der Reihe des Index-Charts
    const O = c.offSig, yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10), NC = c.off.avg ? (c.avg?.n || 7) : 7, OC = avgMap(history, OFF_COL[OFF_COL[c.off.src] ? c.off.src : 'alt'], NC), orows = [...OC].sort((a, b) => a[0] < b[0] ? -1 : 1);
    const ICc = c.avg?.n && c.avg.n !== 7 ? avgColS(history, COLS.raw, c.avg.n) : COLS.idx;
    const ex = offExitSignals(orows, O.lo, O.hi);
    if (O.ext) for (const x of ex) if (x.d >= yd) await send1(`offx:${x.d}:${x.up ? 'L' : 'S'}`, alarmText('offx', { ...x, ...S }), sent);
    if (O.frac) {
      const pk = history.filter(r => r[0] < today && r[3] != null).map(r => ({ d: r[0], h: r[10] ?? r[3], l: r[11] ?? r[3], c: r[3] }));
      for (const x of offFracSignals(ex, pk, fractals(pk, c.frac.price), O.before, O.after)) if (x.c >= yd) await send1(`offf:${x.from}:${x.up ? 'L' : 'S'}`, alarmText('offx', { ...x, ...S }), sent);
    }
    if (O.x?.length) {
      const rows = history.filter(r => r[ICc] != null && r[0] < today).map(r => ({ d: r[0], v: r[ICc] })), V = rows.map(r => r.v), A = rows.map(r => OC.get(r.d) ?? null);
      for (const id of O.x) { const ln = (c.sma.lines || []).find(l => l.id === id); if (!ln) continue;
        for (const x of seriesCross(rows, A, maLine(V, ln.type, ln.n))) if (x.d >= yd) await send1(`offc:${id}:${x.d}:${x.up ? 'L' : 'S'}`, alarmText('offx', { ...x, type: 'cross', name: lineName(ln), ...S }), sent); }
    }
  }
  // V20: Kreuz zweier Index-Linien (z. B. EMA 8 × SMA 20) – Ereignis „SMA-Signale“
  if (t.events.includes('sma') && c.sma.cross?.length) {
    const rows = history.filter(r => r[IC] != null && r[0] < today).map(r => ({ d: r[0], v: r[IC] })), V = rows.map(r => r.v), yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    // V21: Long = die schnellere (kürzere) Linie kreuzt die langsamere nach oben (wie auf der Seite)
    for (const pr of c.sma.cross) { let a = (c.sma.lines || []).find(l => l.id === pr.slice(0, 2)), b = (c.sma.lines || []).find(l => l.id === pr.slice(2)); if (!a || !b) continue; if (a.n > b.n) [a, b] = [b, a];
      for (const x of seriesCross(rows, maLine(V, a.type, a.n), maLine(V, b.type, b.n))) if (x.d >= yd) await send1(`ilx:${pr}:${x.d}:${x.up ? 'L' : 'S'}`, alarmText('ilx', { ...x, na: lineName(a), nb: lineName(b), ...S }), sent); }
  }
  if (t.events.includes('div')) {
    const d = c.div, w = d.win === 'auto' ? null : d.win, vc = w ? (latest.vcols?.[vkey(c.idx.src, w)] || { d7: w === '90' ? 14 : 1, raw: w === '90' ? 16 : 12 }) : { d7: COLS.idx, raw: COLS.raw }, col = d.src === 'd' ? vc.raw : vc.d7;
    for (const x of divergences(divRows(history, col), d)) if (x.conf === today) await send1(`div:${x.conf}:${x.type}:u`, alarmText('div', { ...x, ...S, right: d.right }), sent);
  }
  // V16: Signale an der 50er-Linie des Index (Bounce, Ablehnung, Durchbruch, Retest, Fehlausbruch)
  if (t.events.includes('f50')) {
    const rows = history.filter(r => r[IC] != null).map(r => ({ d: r[0], v: r[IC] }));
    for (const x of fiftySignals(rows, c.f50)) if (x.d === today && c.f50.types.includes(x.type)) await send1(`f50:${x.d}:${x.type}`, alarmText('f50', { ...x, ...S }), sent);
  }
  // V18: VWAP-Signale (Tagesschluss, Volumen aus Spalte 18)
  if (t.events.includes('vwap')) {
    const rows = history.filter(r => r[0] < today && r[3] != null && r[9] != null && r[10] != null && r[11] != null).map(r => ({ d: r[0], o: r[9], h: r[10], l: r[11], c: r[3], v: r[18] || 0 })), yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    for (const x of vwapSignals(rows, c.vwap)) if (x.d >= yd) await send1(`vwap:${x.d}:${x.type}:${x.up ? 'L' : 'S'}`, alarmText('vwap', { ...x, ...S }), sent);
  }
  // V18: SMA-20-Signale im Index (abgeschlossene Tage), Reihe wie die übrigen Signale (7-Tage-Mittel oder gewählte Mittelung)
  // V19: je Index-Linie (SMA 20 und bis zu zwei weitere, SMA/EMA frei) mit den dort gewählten Methoden M1/M2/M3; M3 prüft auch den offiziellen Index
  if (t.events.includes('sma')) {
    const rows = history.filter(r => r[IC] != null && r[0] < today).map(r => ({ d: r[0], v: r[IC], raw: r[COLS.raw], offs: OFF.map(m => m.get(r[0]) ?? null) })), yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    for (const ln of (c.sma.lines || DEF.sma.lines).filter(l => l.sig)) {
      const ms = ln.ms || ['m1', 'm2', 'm3'], o = { ...c.sma, line: { type: ln.type, n: ln.n }, m1: { ...c.sma.m1, on: c.sma.m1.on && ms.includes('m1') }, m2: { ...c.sma.m2, on: c.sma.m2.on && ms.includes('m2') }, m3: { ...c.sma.m3, on: c.sma.m3.on && ms.includes('m3') } };
      for (const x of smaSignals(rows, o)) {
        if (x.d < yd || (c.sma.dir === 'long' ? !x.up : c.sma.dir === 'short' ? x.up : false)) continue;
        if (ln.id === 'i1' && sent[`sma:${x.d}:${x.type}:${x.up ? 'L' : 'S'}`]) continue;   // schon von V18 gemeldet
        await send1(`sma:${ln.id}:${x.d}:${x.type}:${x.up ? 'L' : 'S'}`, alarmText('sma', { ...x, ...S }), sent);
      }
    }
  }
  // V19: Fraktale (Kurs und/oder Index): neues Fraktal bestätigt und/oder Ausbruch über bzw. unter das letzte Fraktal
  if (t.events.includes('frac')) {
    const yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10), F = c.frac, idxMap = new Map(history.filter(r => r[IC] != null).map(r => [r[0], r[IC]]));
    const pk = history.filter(r => r[0] < today && r[3] != null).map(r => ({ d: r[0], h: r[10] ?? r[3], l: r[11] ?? r[3], c: r[3] }));
    const ir = history.filter(r => r[0] < today && r[IC] != null), ik = ir.map((r, i) => { const o = i ? ir[i - 1][IC] : r[IC], cl = r[IC], w = r[COLS.raw] ?? cl; return { d: r[0], h: Math.max(o, cl, w), l: Math.min(o, cl, w), c: cl }; });
    const iFr = F.idx.on || F.price.near?.on ? fractals(ik, { ...F.idx, pts: true }) : [];
    const sides = [];
    if (F.price.on) { let fr = fractals(pk, F.price); if (F.price.idxF?.on) fr = fracIdxFilter(fr, idxMap, F.price.idxF); if (F.price.near?.on) fr = fracNear(fr, iFr, F.price.near.days); sides.push(['price', fr, pk, F.price]); }
    if (F.idx.on) sides.push(['idx', iFr, ik, F.idx]);
    for (const [where, fr, rows, o] of sides) {
      if (F.al.conf) for (const f of fr) if (f.c >= yd) await send1(`frac:${where}:${f.d}:${f.t}`, alarmText('frac', { ...f, where, ...S }), sent);
      if (F.al.brk && o.brk) for (const x of fracBreaks(rows, fr)) if (x.d >= yd) await send1(`fracb:${where}:${x.d}:${x.up ? 'L' : 'S'}`, alarmText('frac', { ...x, where, ...S }), sent);
    }
  }
  // V19: MA-Alarme je Linie im Kurs-Chart (Tagesschluss kreuzt / Linie kreuzt Linie); „Berührung“ live in checkMaTouch
  if (t.events.includes('ma') && c.maAl?.length) {
    const yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10), rows = history.filter(r => r[0] < today && r[3] != null).map(r => ({ d: r[0], c: r[3] })), nm = new Map(c.maAl.map(m => [m.id, m.name || `${m.type.toUpperCase()} ${m.n}`]));
    for (const x of maCrossEvents(rows, c.maAl)) if (x.d >= yd) await send1(`ma:${x.id}:${x.mode}:${x.d}:${x.up ? 'U' : 'D'}`, alarmText('ma', { ...x, name: nm.get(x.id), nameX: nm.get(x.x), ...S }), sent);
  }
  // V17: Kerzenmuster (Tageskerze geschlossen), wenn der Index im Extrem ist – eigener Alarm, Trendfilter wie bei den Signalen
  if (t.events.includes('cdl')) {
    const ours = new Map(history.filter(r => r[IC] != null).map(r => [r[0], r[IC]])), off = OFF[0];
    const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    for (const x of applyTrend(candleSignals(history, { ...c.cdl, ours, off, today }), TI, c.sig.trend))
      if (x.d >= yday && c.cdl.types.includes(x.type) && (c.cdl.dir === 'long' ? x.up : c.cdl.dir === 'short' ? !x.up : true)) await send1(`cdl:${x.d}:${x.type}`, alarmText('cdl', { ...x, ...S }), sent);
  }
}
// V19: MA berührt (live): Kurs wechselt die Seite der Linie (Tageslinie mit dem aktuellen Kurs als heutigem Schluss) – je Linie höchstens einmal am Tag
// V20: Kurs berührt den VWAP (live) – Woche/Monat/Quartal/Jahr nach Wahl; heutiger VWAP mit der laufenden Tageskerze, je Anker höchstens 1× am Tag
async function checkVwTouch(latest, history) {
  const c = cfg(), t = c.telegram, price = latest.btc.price, A = c.vwap.touch || []; if (!(price > 0) || !A.length) return;
  const today = new Date().toISOString().slice(0, 10), rows = history.filter(r => r[3] != null && r[9] != null && r[10] != null && r[11] != null).map(r => ({ d: r[0], o: r[9], h: r[10], l: r[11], c: r[0] === today ? price : r[3], v: r[18] || 0 }));
  const side = (state.vwSide ||= {});
  for (const an of A) {
    const vw = vwapCalc(rows, an, c.vwap.src).w.at(-1); if (!(vw > 0)) continue;
    const now = Math.sign(price - vw), prev = side[an]; if (now) side[an] = now;
    if (!prev || !now || prev === now || !t.enabled || !t.token || !t.chatId || !t.events.includes('vwap')) continue;
    const idx = curIdx(latest);
    await send1(`vwt:${an}:${today}`, alarmText('vwap', { vt: 'touch', anchor: an, up: now > 0, vw, price, idx, zone: ZNAME(idx) }), state.alertsSent ||= {});
  }
}
async function checkMaTouch(latest, history) {
  const c = cfg(), t = c.telegram, price = latest.btc.price; if (!(price > 0)) return;
  const list = (c.maAl || []).filter(m => m.al?.mode === 'touch'); if (!list.length) return;
  const today = new Date().toISOString().slice(0, 10), C = history.filter(r => r[0] < today && r[3] != null).map(r => r[3]).concat(price), side = (state.maSide ||= {});
  for (const m of list) {
    const ma = maLine(C, m.type, m.n).at(-1); if (ma == null) continue;
    const now = Math.sign(price - ma), prev = side[m.id]; if (now) side[m.id] = now;
    if (!prev || !now || prev === now || (m.al.dir === 'up' && now < 0) || (m.al.dir === 'down' && now > 0)) continue;
    if (!t.enabled || !t.token || !t.chatId || !t.events.includes('ma')) continue;
    const idx = curIdx(latest);
    await send1(`ma:${m.id}:touch:${today}`, alarmText('ma', { mode: 'touch', id: m.id, name: m.name || `${m.type.toUpperCase()} ${m.n}`, up: now > 0, ma, d: today, idx, zone: ZNAME(idx), price }), state.alertsSent ||= {});
  }
}
// V15: Heatmap-Quelle wie auf der Seite gewählt (Binance / Bybit / OKX / kombiniert)
// V18: beliebige Börsen-Kombination aus den Stufen je Börse
const HMs = (latest, c) => liqCombine(latest.heatmap, hmParts(c.heat.src), c.heat.per);
// V21: Cluster-Größen alle 5 Minuten mitschreiben (data/clusterlog.jsonl, 30 Tage) – Grundlage, um Cluster-Signale später ehrlich auszuwerten
let clLogT = 0;
function logClusters(latest) {
  const c = cfg(), hm = HMs(latest, c), px = latest.btc?.price; if (!hm || !px) return;
  LASTCL = clusterSet(hm, { nearest: true, extra: 6, far: { pct: c.heat.farPct ?? 50, range: c.heat.farRange ?? 20 } }); LASTPX = px;
  if (Date.now() - clLogT < 295e3) return; clLogT = Date.now();
  const near = (side, pct) => (side === 'L' ? hm.longs : hm.shorts || []).filter(z => Math.abs(z.p / px - 1) * 100 <= pct).reduce((a, z) => a + z.usd, 0);
  const pick = id => { const x = LASTCL.find(q => q.id === id); return x ? [Math.round(x.z.p), Math.round(x.z.usd / 1e5) / 10] : null; };
  const row = { t: Date.now(), px: Math.round(px), L1: pick('L1'), S1: pick('S1'), L2: pick('L2'), S2: pick('S2'), LF: pick('LF'), SF: pick('SF'), nL5: Math.round(near('L', 5) / 1e5) / 10, nS5: Math.round(near('S', 5) / 1e5) / 10, nL10: Math.round(near('L', 10) / 1e5) / 10, nS10: Math.round(near('S', 10) / 1e5) / 10 };
  const f = path.join(DATA, 'clusterlog.jsonl'); fs.appendFileSync(f, JSON.stringify(row) + '\n');
  try { if (fs.statSync(f).size > 4e6) { const keep = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).filter(l => { try { return JSON.parse(l).t > Date.now() - 30 * 864e5; } catch { return false; } }); fs.writeFileSync(f, keep.join('\n') + '\n'); } } catch { }
}
async function checkHeatAlerts(latest) {
  const c = cfg(), t = c.telegram; if (!t.enabled || !t.token || !t.chatId || !t.events.includes('heat')) return;
  const sent = (state.alertsSent ||= {}), price = latest.btc.price, idx = curIdx(latest);
  for (const e of heatEvents(clusterSet(HMs(latest, c), clOptS(c.heat)), price, c.heat))
    await send1(`heat:${e.c.id}:${e.ev}:${e.c.z.p}`, alarmText('cluster', { ...e, pct: c.heat.pct, idx, zone: ZNAME(idx), price }), sent, c.heat.cool * 60e3);
}
const clOptS = h => ({ nearest: h.nearest, extra: h.extra, far: h.far ? { pct: h.farPct, range: h.farRange } : null });
// Cluster angelaufen → Reaktion / Durchbruch (Zustand in state.touch, auch ohne Telegram weitergeführt)
async function checkReactAlerts(latest) {
  const c = cfg(), t = c.telegram, h = c.heat; if (!h.reactOn) return;
  const price = latest.btc.price, CL = clusterSet(HMs(latest, c), clOptS(h)), ev = touchTrack(state.touch ||= {}, CL, price, h);
  if (!t.enabled || !t.token || !t.chatId || !t.events.includes('react')) return;
  const idx = curIdx(latest);
  for (const e of ev) {
    if (e.kind === 'touch') continue;
    const up = e.kind === 'react' ? e.x.side === 'L' : e.x.side === 'S';
    await send1(`touch:${e.kind}:${e.x.id}:${e.x.p}:${e.x.t}`, alarmText(e.kind, { x: e.x, next: nextCluster(CL, price, up, e.x.p), price, idx, zone: ZNAME(idx) }), state.alertsSent ||= {});
  }
}
// Pivot-Alarme: Tief unterschritten / Hoch überschritten / Annäherung (Stufen aus abgeschlossenen Tagen, je Stufe einmal)
async function checkPivotAlerts(latest, history) {
  const c = cfg(), t = c.telegram, pa = c.pivot;
  if (!pa?.per?.length || !t.enabled || !t.token || !t.chatId || !t.events.includes('pivot')) return;
  const price = latest.btc.price, today = new Date().toISOString().slice(0, 10), idx = curIdx(latest), sent = (state.alertsSent ||= {});
  const rep = c.rep?.pivot, R = (state.alertsRep ||= {});
  for (const e of pivotEvents(history, price, pa, today)) {
    if (sent[e.key]) {
      // V16: Erinnerung, solange die Stufe gebrochen bleibt (Abstand und Höchstzahl wie auf der Seite eingestellt)
      const x = (R[e.key] ||= { n: 1, t: sent[e.key] });
      if (rep?.iv > 0 && x.n < (rep.max || 1) && Date.now() - x.t >= rep.iv * 60e3) {
        const CL0 = latest.heatmap ? clusterSet(HMs(latest, c), clOptS(c.heat)) : [];
        const a = alarmText('pivot', { ...pivotPayload(history, e, CL0, price, pa.low), price, idx, zone: ZNAME(idx) });
        x.n++; x.t = Date.now(); a.title = `🔁 Erinnerung ${x.n}/${rep.max} · ${a.title}`;
        try { await telegram(`<b>${a.title}</b>\n${a.body}`); log('Telegram-Erinnerung:', e.key, x.n); } catch (er) { log('Telegram-Fehler:', er.message); }
      }
      continue;
    }
    const CL = latest.heatmap ? clusterSet(HMs(latest, c), clOptS(c.heat)) : [];
    await send1(e.key, alarmText('pivot', { ...pivotPayload(history, e, CL, price, pa.low), price, idx, zone: ZNAME(idx) }), sent);
  }
}
// eigene Alarmlinien: Alarm beim Kreuzen (Seite merkt sich die Seite des Kurses je Linie)
async function checkLineAlerts(latest) {
  const c = cfg(), t = c.telegram, price = latest.btc.price, side = (state.lineSide ||= {});
  for (const l of c.lines || []) {
    if (!l.on || !(l.p > 0)) continue;
    const now = Math.sign(price - l.p), key = l.id + ':' + l.p, prev = side[key]; if (now) side[key] = now;
    if (prev && now && prev !== now && t.enabled && t.token && t.chatId && t.events.includes('lines') && Date.now() - (side[key + ':t'] || 0) > 600e3) {
      side[key + ':t'] = Date.now();
      const idx = curIdx(latest);
      await send1(`line:${l.id}:${l.p}:${Date.now()}`, alarmText('line', { id: l.id, p: l.p, dir: now, idx, zone: ZNAME(idx), price }), state.alertsSent ||= {});
    }
  }
}

/* ---------- Sammeln (Intervall einstellbar) ---------- */
let running = false, lastRun = null, lastError = null;
async function run() {
  if (running) return; running = true;
  const t0 = Date.now();
  try {
    const c = cfg();
    const keys = { sosovalue: c.sosovalueApiKey, coinglass: c.coinglassApiKey, coinalyze: c.coinalyzeApiKey, sosovalueUrl: c.sosovalueUrl || '' };
    const I = iv();
    const { result, state: next } = await collect({ env: 'node', keys, state, wsSampleMs: 0, cache: HCACHE, histTtlMs: I.hist * 60e3, cr: { key: c.cryptorankApiKey, every: Math.max(30, +c.crEvery || 60) }, oiRecMin: Math.min(168, Math.max(24, +c.oiRecMin || 168)) });
    state = next; saveState();
    const { history, ...latest } = result;
    latest.server = true; latest.appVersion = 21;
    latest.intervals = { data: I.data, publish: I.publish, hist: I.hist, cr: Math.max(30, +c.crEvery || 60) };
    latest.rateLimited = latest.status.filter(x => x.ok === false && /429|rate|too many/i.test(x.msg || '')).map(x => x.name);
    // V19: Live-Index stündlich (alle Varianten) – für die 4-Stunden-Mittelung im Kreis
    recIdx(latest); latest.idxHourly = recOut();
    fs.writeFileSync(path.join(FGW, 'data', 'latest.json'), JSON.stringify(latest));
    fs.writeFileSync(path.join(FGW, 'data', 'history.json'), JSON.stringify(history));
    // Tagebuch: aktueller Stand je Lauf (für spätere Auswertung, ab wann ein Punkt verlässlich war) – V19: nur die vier bisherigen Varianten (die übrigen stehen stündlich in idxrec.json)
    fs.appendFileSync(path.join(DATA, 'journal.jsonl'), JSON.stringify({ t: Date.now(), btc: latest.btc.price, idx: Object.fromEntries(BASE_VARIANTS.map(({ key: k }) => [k, [latest.modes[k]?.index, latest.modes[k]?.live]])) }) + '\n');
    buildSite();
    try { logClusters(latest); } catch (e) { log('Cluster-Mitschnitt:', e.message); }
    await checkAlerts(latest, history); await checkHeatAlerts(latest); await checkLineAlerts(latest); await checkReactAlerts(latest); await checkPivotAlerts(latest, history); await checkMaTouch(latest, history); await checkVwTouch(latest, history); saveState();
    lastRun = Date.now(); lastError = null;
    if (!lastPublish || Date.now() - lastPublish >= I.publish * 60e3 - 5000) await publish();
    if (!HCACHE.logged || HCACHE.logged !== HCACHE.t) { HCACHE.logged = HCACHE.t; log(`Verläufe neu geholt · Index ${curIdx(latest)} (${Date.now() - t0} ms)`); }
  } catch (e) { lastError = e.message; log('Fehler beim Sammeln:', e); }
  running = false;
}
/* ---------- V19: Live-Index stündlich mitschreiben (data/idxrec.json, 60 Tage) – Start aus dem Tagebuch (seit 17.10.2026 jede Minute) ---------- */
const REC_PATH = path.join(DATA, 'idxrec.json'), REC_KEEP = 60 * 24;
let REC = null, recSaved = 0;
function recLoad() {
  try { REC = JSON.parse(fs.readFileSync(REC_PATH, 'utf8')); } catch { REC = { h: {} }; }
  if (!REC.seeded) {
    try { for (const line of fs.readFileSync(path.join(DATA, 'journal.jsonl'), 'utf8').split('\n')) { if (!line) continue; const j = JSON.parse(line), hh = Math.floor(j.t / 3600e3) * 3600e3; for (const [k, v] of Object.entries(j.idx || {})) if (v?.[1] != null) (REC.h[k] ||= {})[hh] = v[1]; } } catch { }
    REC.seeded = true;
  }
}
function recIdx(latest) {
  if (!REC) recLoad();
  const hh = Math.floor(Date.now() / 3600e3) * 3600e3, cut = hh - REC_KEEP * 3600e3;
  for (const [k, m] of Object.entries(latest.modes)) if (m.live != null && Number.isFinite(m.live)) (REC.h[k] ||= {})[hh] = m.live;
  if (Date.now() - recSaved > 600e3) { for (const o of Object.values(REC.h)) for (const t of Object.keys(o)) if (+t < cut) delete o[t]; fs.writeFileSync(REC_PATH, JSON.stringify(REC)); recSaved = Date.now(); }
}
// für die Seite: die letzten 7 Tage je Variante als Reihe ab h0 (eine Zahl je Stunde, null = keine Messung)
function recOut() {
  const hh = Math.floor(Date.now() / 3600e3) * 3600e3, h0 = hh - 167 * 3600e3, v = {};
  for (const [k, o] of Object.entries(REC.h)) v[k] = Array.from({ length: 168 }, (_, i) => o[h0 + i * 3600e3] ?? null);
  return { h0, v };
}
function buildSite() {
  // gemeinsame Rechenlogik in die Seite einsetzen (Signale, Divergenz, Cluster, Alarm-Texte)
  const shared = fs.readFileSync(path.join(ROOT, 'collector', 'shared.mjs'), 'utf8').replace(/^export /gm, '');
  const html = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8').replace('/*SHARED*/', () => shared);
  fs.writeFileSync(path.join(FGW, 'index.html'), html);
  // V21: übrige Seiten der Website (Startseite, Reiter, gemeinsame Leiste nav.js/nav.css) und die Heatmap unter /heatmap/
  try { fs.cpSync(path.join(ROOT, 'site', 'www'), WWW, { recursive: true }); } catch (e) { log('Website-Seiten nicht kopiert:', e.message); }
  try { fs.cpSync(path.join(ROOT, 'site', 'heatmap'), path.join(WWW, 'heatmap'), { recursive: true }); } catch (e) { log('Heatmap nicht kopiert:', e.message); }
  // V21b: lange Historie für die Heatmap-Seite (bis 1 Jahr Stundenwerte: Binance-Kerzen mit Volumen/Käufer-Volumen + Open Interest von Bybit in Dollar)
  try { const L = longHistData();
    if (L.kl.length && L.oi.length) { const oiM = new Map(L.oi);
      const rows = L.kl.map(k => { const t = +k[0], c = +k[4], oi = oiM.get(t); return [Math.floor(t / 60000), +(+k[1]).toFixed(1), +(+k[2]).toFixed(1), +(+k[3]).toFixed(1), +c.toFixed(1), Math.round(+k[7] || 0), Math.round(+k[10] || 0), oi ? Math.round(oi * c) : null]; });
      fs.mkdirSync(path.join(WWW, 'heatmap', 'data'), { recursive: true });
      fs.writeFileSync(path.join(WWW, 'heatmap', 'data', 'hist-BTC.json'), JSON.stringify({ updated: Date.now(), src: 'Binance 1h + Bybit OI 1h', rows })); } } catch (e) { log('Heatmap-Historie nicht geschrieben:', e.message); }
  // alte Adresse …/fear-greed/heatmap/ leitet auf …/heatmap/ weiter
  const redir = to => `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${to}"><a href="${to}">${to}</a>`;
  fs.mkdirSync(path.join(FGW, 'heatmap'), { recursive: true }); fs.writeFileSync(path.join(FGW, 'heatmap', 'index.html'), redir('../../heatmap/'));
  const engine = fs.readFileSync(path.join(ROOT, 'collector', 'engine.mjs'), 'utf8').replace(/^export /gm, '');
  // alte Einzeldatei-Links (V6–V20) leiten auf die neue Einzeldatei weiter
  for (let v = 6; v <= 20; v++) fs.writeFileSync(path.join(FGW, `fear-greed-v${v}.html`), redir('fear-greed-v21.html'));
  fs.writeFileSync(path.join(FGW, 'fear-greed-v21.html'), html.replace('<!--ENGINE-->', `<script>window.FG_STANDALONE = true;</script>\n<script type="module">\n${engine}\nwindow.FG_ENGINE = { collect };\nwindow.dispatchEvent(new Event('fg-engine'));\n</script>`));
  // V21: Test-Website – eigene Browser-Einstellungen (Präfix, damit die Live-Seite unberührt bleibt) und Hinweis „Testversion“ auf jeder Seite
  const T = cfg().siteTest;
  if (T) {
    const shim = `<script>/* Testversion: eigene Browser-Einstellungen, getrennt von der Live-Seite */window.SITE_TEST=${JSON.stringify({ label: T.label || 'TESTVERSION', live: T.live || '' })};
(() => { try { const ls = window.localStorage, S = Storage.prototype, P = ${JSON.stringify(T.ns || 'test~')}, INIT = P + '__init';
  const get = S.getItem, set = S.setItem, del = S.removeItem, key = S.key, clr = S.clear, len = Object.getOwnPropertyDescriptor(S, 'length').get;
  const raw = () => { const a = []; for (let i = 0, n = len.call(ls); i < n; i++) a.push(key.call(ls, i)); return a; };
  if (get.call(ls, INIT) == null) { for (const k of raw()) if (k && !/^[a-z0-9]+~/.test(k)) try { set.call(ls, P + k, get.call(ls, k)); } catch (e) { } set.call(ls, INIT, String(Date.now())); }
  const own = () => raw().filter(k => k && k.startsWith(P) && k !== INIT).map(k => k.slice(P.length)), mine = s => s === ls;
  S.getItem = function (k) { return get.call(this, mine(this) ? P + k : k); }; S.setItem = function (k, v) { return set.call(this, mine(this) ? P + k : k, v); };
  S.removeItem = function (k) { return del.call(this, mine(this) ? P + k : k); }; S.key = function (i) { return mine(this) ? (own()[i] ?? null) : key.call(this, i); };
  S.clear = function () { if (!mine(this)) return clr.call(this); for (const k of own()) del.call(ls, P + k); };
  Object.defineProperty(S, 'length', { configurable: true, enumerable: true, get() { return mine(this) ? own().length : len.call(this); } });
} catch (e) { } })();</script>`;
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'data') walk(p); continue; }
      if (!e.name.endsWith('.html')) continue; const s = fs.readFileSync(p, 'utf8'), i = s.search(/<head[^>]*>/i); if (i < 0 || s.includes('window.SITE_TEST=')) continue;
      const j = s.indexOf('>', i) + 1; fs.writeFileSync(p, s.slice(0, j) + shim + s.slice(j)); } };
    walk(WWW);
  }
}

/* ---------- Online veröffentlichen (GitHub Pages) ---------- */
// Nach jedem Lauf wird der Ordner www als einzelner Commit auf den Zweig gh-pages geschoben (ohne Verlauf,
// das Repository wächst also nicht). GitHub Pages zeigt diesen Zweig unter https://<name>.github.io/<repo>/.
const PUB = path.join(DATA, 'publish');
let lastPublish = null, publishError = null;
const git = (args, cwd) => new Promise((res, rej) => execFile('git', args, { cwd, timeout: 180000, windowsHide: true },
  (e, so, se) => e ? rej(new Error(String(se || e.message).trim().split('\n').pop())) : res(so)));
async function publish() {
  const c = cfg();
  if (c.publish === false || process.env.FG_NOPUBLISH) return;
  const repo = c.publishRepo || 'https://github.com/VrilyaSSLuxion/fear-greed.git';
  try {
    fs.rmSync(PUB, { recursive: true, force: true });
    fs.cpSync(WWW, PUB, { recursive: true });
    fs.writeFileSync(path.join(PUB, '.nojekyll'), '');
    await git(['init', '-q', '-b', 'gh-pages'], PUB);
    await git(['add', '-A'], PUB);
    await git(['-c', 'user.name=VrilyaSSLuxion', '-c', 'user.email=VrilyaSSLuxion@users.noreply.github.com', 'commit', '-q', '-m', 'Daten ' + new Date().toISOString()], PUB);
    await git(['push', '-q', '-f', repo, 'gh-pages'], PUB);
    lastPublish = Date.now(); publishError = null;
    log('Online veröffentlicht');
  } catch (e) { publishError = e.message; log('Veröffentlichen fehlgeschlagen:', e.message); }
}

/* ---------- Windows-Autostart ---------- */
const LNK = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Fear-Greed-V21.lnk');
const autostartOn = () => fs.existsSync(LNK);
function setAutostart(on) {
  return new Promise((res, rej) => {
    if (!on) { try { if (fs.existsSync(LNK)) fs.unlinkSync(LNK); res(false); } catch (e) { rej(e); } return; }
    const vbs = path.join(ROOT, 'start-hidden.vbs');
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${LNK.replace(/'/g, "''")}');$s.TargetPath=\"$env:WINDIR\\System32\\wscript.exe\";$s.Arguments='"${vbs.replace(/'/g, "''")}"';$s.WorkingDirectory='${ROOT.replace(/'/g, "''")}';$s.Description='Fear & Greed V20 (Hintergrund)';$s.Save()`;
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], err => err ? rej(err) : res(true));
  });
}

/* ---------- Webserver ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const body = req => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  // Einstellungen nur von diesem PC aus (Server hört nur auf 127.0.0.1) und nur von der eigenen Seite:
  // fremde Webseiten können den Kopf "X-FG" nicht ohne Erlaubnis mitschicken.
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (req.headers['x-fg'] !== '1' || (origin && !new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${PORT}$`).test(origin))) return send(res, 403, { error: 'nicht erlaubt' });
  }
  if (p === '/api/status') {
    const c = cfg();
    const I = iv();
    return send(res, 200, { server: true, version: 21, oiRecMin: c.oiRecMin, autostart: autostartOn(), lastRun, lastError, intervals: I, nextRun: lastRun ? lastRun + I.data * 60e3 : null, heat: c.heat, lines: c.lines, div: c.div, sig: c.sig, crEvery: c.crEvery,
      keys: { sosovalue: !!c.sosovalueApiKey, coinglass: !!c.coinglassApiKey, coinalyze: !!c.coinalyzeApiKey, cryptorank: !!c.cryptorankApiKey },
      telegram: { enabled: c.telegram.enabled, configured: !!(c.telegram.token && c.telegram.chatId), events: c.telegram.events },
      publish: { enabled: c.publish !== false, last: lastPublish, error: publishError, url: c.publishUrl || 'https://vrilyassluxion.github.io/fear-greed/' } });
  }
  if (p === '/api/autostart' && req.method === 'POST') { const b = await body(req); try { return send(res, 200, { autostart: await setAutostart(!!b.enabled) }); } catch (e) { return send(res, 500, { error: e.message }); } }
  if (p === '/api/config' && req.method === 'POST') {
    const b = await body(req), c = cfg();
    for (const k of ['sosovalueApiKey', 'coinglassApiKey', 'coinalyzeApiKey', 'cryptorankApiKey']) if (typeof b[k] === 'string' && b[k].trim() !== '') c[k] = b[k].trim();
    // V19: CryptoRank-Abfrage (Minuten), Datenquelle/Vergleichszeitraum, offizieller Index, Fraktale, MA-Alarme
    if (b.crEvery != null && isFinite(+b.crEvery)) c.crEvery = Math.min(1440, Math.max(30, Math.round(+b.crEvery)));
    if (b.idx && typeof b.idx === 'object') c.idx = { src: SRCS.includes(b.idx.src) ? b.idx.src : 'binance', win: WINS.map(String).includes(String(b.idx.win)) ? String(b.idx.win) : '90' };
    if (b.off && typeof b.off === 'object') c.off = { src: OFF_COL[b.off.src] ? b.off.src : 'alt', avg: b.off.avg !== false };
    if (b.frac && typeof b.frac === 'object') {
      const num = (v, d, lo, hi) => isFinite(+v) && +v >= lo && +v <= hi ? +v : d;
      const side = (q, D) => ({ on: !!q?.on, left: Math.round(num(q?.left, D.left, 1, 20)), right: Math.round(num(q?.right, D.right, 1, 20)), basis: q?.basis === 'close' ? 'close' : 'wick', filt: q?.filt === 'all' ? 'all' : 'alt',
        minGap: Math.round(num(q?.minGap, 0, 0, 100)), minMove: num(q?.minMove, 0, 0, 100), brk: !!q?.brk,
        idxF: { on: !!q?.idxF?.on, lo: num(q?.idxF?.lo, 30, 1, 50), hi: num(q?.idxF?.hi, 70, 50, 99), look: Math.round(num(q?.idxF?.look, 2, 0, 14)) }, near: { on: !!q?.near?.on, days: Math.round(num(q?.near?.days, 3, 0, 30)) } });
      c.frac = { price: side(b.frac.price, DEF.frac.price), idx: side(b.frac.idx, DEF.frac.idx), al: { conf: b.frac.al?.conf !== false, brk: b.frac.al?.brk !== false } };
    }
    if (Array.isArray(b.maAl)) c.maAl = b.maAl.filter(m => m && /^[a-z0-9]{1,6}$/.test(m.id) && ['sma', 'ema'].includes(m.type) && +m.n >= 2 && +m.n <= 1000).slice(0, 12)
      .map(m => ({ id: m.id, type: m.type, n: Math.round(+m.n), name: String(m.name || '').slice(0, 20), al: { mode: ['off', 'close', 'touch', 'cross'].includes(m.al?.mode) ? m.al.mode : 'off', dir: ['both', 'up', 'down'].includes(m.al?.dir) ? m.al.dir : 'both', x: /^[a-z0-9]{1,6}$/.test(m.al?.x || '') ? m.al.x : null } }));
    if (b.telegram) {
      for (const k of ['token', 'chatId']) if (typeof b.telegram[k] === 'string' && b.telegram[k].trim() !== '') c.telegram[k] = b.telegram[k].trim();
      if (typeof b.telegram.enabled === 'boolean') c.telegram.enabled = b.telegram.enabled;
      if (Array.isArray(b.telegram.events)) c.telegram.events = b.telegram.events;
    }
    if (b.levels) c.levels = b.levels;
    if (typeof b.publish === 'boolean') c.publish = b.publish;
    for (const k of ['intervalMin', 'publishMin', 'histMin']) if (b[k] != null && isFinite(+b[k])) c[k] = +b[k];
    if (b.heat) c.heat = { ...c.heat, ...b.heat };
    if (Array.isArray(b.lines)) c.lines = b.lines.filter(l => l && typeof l.id === 'string' && +l.p > 0).slice(0, 20).map(l => ({ id: l.id.slice(0, 8), p: +l.p, on: !!l.on }));
    if (b.div) c.div = { ...c.div, ...b.div };
    if (b.sig) c.sig = { ...c.sig, ...b.sig };
    if (b.pivot) { const P = b.pivot, ok = ['7', '30', '91', '182', '365', 'all']; c.pivot = { per: Array.isArray(P.per) ? P.per.filter(k => ok.includes(k)) : [], lo: !!P.lo, hi: !!P.hi, near: !!P.near, nearPct: +P.nearPct > 0 && +P.nearPct <= 10 ? +P.nearPct : 1, low: ['range', 'after', 'afterLow'].includes(P.low) ? P.low : 'range' }; }
    if (b.f50) { const F = b.f50, n = (v, d) => +v > 0 && +v <= 20 ? +v : d; c.f50 = { types: Array.isArray(F.types) ? F.types.filter(x => F50_TYPES.includes(x)) : DEF.f50.types, zoneL: n(F.zoneL, 3), confL: n(F.confL, 3), zoneS: n(F.zoneS, 3), confS: n(F.confS, 3), retestDays: Math.min(60, Math.max(3, +F.retestDays || 20)) }; }
    if (b.cdl) { const K = b.cdl, n = (v, d, lo, hi) => +v >= lo && +v <= hi ? +v : d; c.cdl = { types: Array.isArray(K.types) ? K.types.filter(x => CDL_TYPES.includes(x)) : DEF.cdl.types, lo: n(K.lo, 30, 1, 50), hi: n(K.hi, 70, 50, 99), look: Math.round(n(K.look, 3, 0, 14)), src: ['ours', 'off', 'both', 'either'].includes(K.src) ? K.src : 'ours', dir: ['both', 'long', 'short'].includes(K.dir) ? K.dir : 'both' }; }
    if (b.sma && typeof b.sma === 'object') { const Q = b.sma, num = (v, d, lo, hi) => isFinite(+v) && +v >= lo && +v <= hi ? +v : d, M = (m, D) => ({ on: !!(m?.on ?? D.on), hi: num(m?.hi, D.hi, 50, 99), lo: num(m?.lo, D.lo, 1, 50), src: m?.src === 'body' ? 'body' : m?.src === 'raw' ? 'raw' : D.src, mid: !!(m?.mid ?? D.mid), look: Math.round(num(m?.look, D.look, 1, 120)), slope: !!(m?.slope ?? D.slope), sd: Math.round(num(m?.sd, D.sd, 1, 20)), sp: num(m?.sp, D.sp, 0, 20), dist: num(m?.dist, D.dist, 0, 20) });
      const M3 = (m, D) => ({ on: !!(m?.on ?? D.on), hi: num(m?.hi, D.hi, 50, 99), lo: num(m?.lo, D.lo, 1, 50), src: m?.src === 'raw' ? 'raw' : 'body', look: Math.round(num(m?.look, D.look, 1, 120)), off: !!(m?.off ?? D.off),
        offMode: ['A', 'B', 'C'].includes(m?.offMode) ? m.offMode : 'A', offHi: num(m?.offHi, D.offHi, 50, 99), offLo: num(m?.offLo, D.offLo, 1, 50), once: !!(m?.once ?? D.once) });
      const lines = Array.isArray(Q.lines) ? Q.lines.filter(l => l && /^i[1-3]$/.test(l.id) && ['sma', 'ema'].includes(l.type) && +l.n >= 2 && +l.n <= 1000).map(l => ({ id: l.id, type: l.type, n: Math.round(+l.n), sig: !!l.sig, ms: Array.isArray(l.ms) ? l.ms.filter(x => ['m1', 'm2', 'm3'].includes(x)) : ['m1', 'm2', 'm3'] })) : DEF.sma.lines;
      c.sma = { n: Math.round(num(Q.n, 20, 5, 100)), dir: ['both', 'long', 'short'].includes(Q.dir) ? Q.dir : 'both', m1: M(Q.m1, DEF.sma.m1), m2: M(Q.m2, DEF.sma.m2), m3: M3(Q.m3, DEF.sma.m3), lines, cross: Array.isArray(Q.cross) ? Q.cross.filter(x => /^i[1-3]i[1-3]$/.test(x) && x.slice(0, 2) !== x.slice(2)) : [] }; }
    // V20: offizielle Signale, Mitschnitt-Schwelle, Heatmap-Zeitraum
    if (b.tplan && typeof b.tplan === 'object') { const q = b.tplan; c.tplan = { on: !!q.on, sl: ['cluster', 'half', 'allper'].includes(q.sl) ? q.sl : 'cluster', tps: Math.min(3, Math.max(1, Math.round(+q.tps) || 3)), buf: Math.min(3, Math.max(0, +q.buf || 0)), hook: typeof q.hook === 'string' && /^https:\/\//i.test(q.hook.trim()) ? q.hook.trim().slice(0, 500) : '' }; }
    if (b.offSig && typeof b.offSig === 'object') { const Q = b.offSig, num = (v, d, lo, hi) => isFinite(+v) && +v >= lo && +v <= hi ? +v : d;
      c.offSig = { lo: num(Q.lo, 13, 1, 50), hi: num(Q.hi, 70, 50, 99), ext: Q.ext !== false, frac: Q.frac !== false, before: Math.round(num(Q.before, 5, 0, 30)), after: Math.round(num(Q.after, 0, 0, 30)), lv: !!Q.lv, x: Array.isArray(Q.x) ? Q.x.filter(x => /^i[1-3]$/.test(x)) : [] }; }
    if (b.oiRecMin != null && isFinite(+b.oiRecMin)) c.oiRecMin = Math.min(168, Math.max(24, Math.round(+b.oiRecMin)));
    if (b.heat && b.heat.per != null && !['all', ...Object.keys(HM_PER)].includes(b.heat.per)) b.heat.per = 'all';
    if (b.vwap && typeof b.vwap === 'object') { const Q = b.vwap, ok = /^(ema8|close)_[WMQY]$/; c.vwap = { src: ['hlc3', 'hl2', 'ohlc4', 'close'].includes(Q.src) ? Q.src : 'hlc3', combos: Array.isArray(Q.combos) ? Q.combos.filter(x => ok.test(x)) : DEF.vwap.combos, conf: !!Q.conf, confDays: Math.min(10, Math.max(0, Math.round(+Q.confDays || 0))), dir: ['both', 'long', 'short'].includes(Q.dir) ? Q.dir : 'both', trend: { mode: ['off', 'mark', 'hide'].includes(Q.trend?.mode) ? Q.trend.mode : 'hide', n: Math.min(400, Math.max(5, Math.round(+Q.trend?.n || 200))), tf: Q.trend?.tf === '4h' ? '4h' : '1d' }, touch: Array.isArray(Q.touch) ? Q.touch.filter(a => ['W', 'M', 'Q', 'Y'].includes(a)) : [] }; }
    if (b.avg) c.avg = { sig: !!b.avg.sig, n: Math.min(2000, Math.max(1, Math.round(+b.avg.n) || 7)) };
    if (b.rep && typeof b.rep === 'object') { c.rep = {}; for (const [k, v] of Object.entries(b.rep)) c.rep[k] = { iv: Math.min(1440, Math.max(0, +v.iv || 0)), max: Math.min(20, Math.max(1, +v.max || 1)) }; }
    saveCfg(c); send(res, 200, { ok: true }); if (b.recollect) run(); return;
  }
  if (p === '/api/telegram/test' && req.method === 'POST') { try { await telegram('✅ Testnachricht vom Fear & Greed V21 – Alarme kommen hier an.'); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
  if (p === '/api/telegram/chatid' && req.method === 'POST') {
    // Chat-ID automatisch finden: Nutzer schreibt dem Bot vorher eine Nachricht
    try {
      const c = cfg(); if (!c.telegram.token) throw new Error('Erst den Bot-Token eintragen');
      const j = await (await fetch(`https://api.telegram.org/bot${c.telegram.token}/getUpdates`, { signal: AbortSignal.timeout(20000) })).json();
      const chat = (j.result || []).map(x => x.message?.chat || x.channel_post?.chat).filter(Boolean).at(-1);
      if (!chat) throw new Error('Keine Nachricht gefunden – schreib dem Bot zuerst etwas in Telegram');
      c.telegram.chatId = String(chat.id); saveCfg(c); return send(res, 200, { chatId: c.telegram.chatId });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (p === '/api/refresh' && req.method === 'POST') { run(); return send(res, 200, { ok: true }); }
  let file = path.join(WWW, p === '/' ? 'index.html' : p);
  if (p.endsWith('/') && p !== '/') file = path.join(file, 'index.html');
  // V21: alte lokale Adressen (…:8797/data/…, /fear-greed-v20.html) zeigen weiter auf Fear & Greed
  if (!fs.existsSync(file) && fs.existsSync(path.join(FGW, p))) file = path.join(FGW, p);
  if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Nicht gefunden'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.on('error', e => { if (e.code === 'EADDRINUSE') { log(`Port ${PORT} belegt – das Programm läuft schon (http://localhost:${PORT}).`); process.exit(0); } throw e; });
server.listen(PORT, '127.0.0.1', () => {
  log(`Fear & Greed V21 läuft: http://localhost:${PORT}/fear-greed/`);
  buildSite();
  const loop = async () => { await run(); setTimeout(loop, iv().data * 60e3); };
  loop();
  setInterval(saveState, 60e3);
});
