// Fear & Greed V16 – Hintergrund-Programm
// Läuft unsichtbar, sammelt jede Minute (einstellbar) alle Daten (inkl. dauerhaftem Liquidations-Mitschnitt),
// speichert den Verlauf, liefert die Seite unter http://localhost:8797 aus und verschickt Telegram-Alarme.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect } from './collector/engine.mjs';
import { methodSignals, phaseSignals, trig, trendInfo, applyTrend, mean7, divergences, divRows, clusterSet, heatEvents, alarmText, touchTrack, nextCluster, pivotEvents, pivotPayload, fiftySignals, F50_TYPES } from './collector/shared.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data'), WWW = path.join(ROOT, 'www');
fs.mkdirSync(path.join(WWW, 'data'), { recursive: true });
fs.mkdirSync(DATA, { recursive: true });
const PORT = +process.env.FG_PORT || 8797; // FG_PORT/FG_NOPUBLISH nur zum Testen
// Intervalle (Minuten) – im Zahnrad einstellbar: Daten holen, online veröffentlichen (GitHub: max. ~10 Builds/Stunde), große Verläufe
const iv = () => { const c = cfg(); return { data: Math.max(1, Math.min(60, +c.intervalMin || 1)), publish: Math.max(6, Math.min(120, +c.publishMin || 10)), hist: Math.max(15, Math.min(1440, +c.histMin || 60)) }; };
const HCACHE = {};
const log = (...a) => console.log(new Date().toLocaleString('de-DE'), '·', ...a);

/* ---------- Konfiguration (API-Keys, Telegram) ---------- */
const CFG_PATH = path.join(ROOT, 'config.json');
const DEF = { sosovalueApiKey: '', coinglassApiKey: '', coinalyzeApiKey: '', intervalMin: 1, publishMin: 10, histMin: 60,
  heat: { src: 'binance', pct: 1, approach: true, zone: true, poc: true, nearest: true, extra: 2, alarmExtra: false, cool: 720, far: true, farPct: 50, farRange: 20, reactOn: true, react: 1, brk: 1, reactH: 24 }, lines: [],
  div: { left: 5, right: 5, minGap: 5, maxGap: 60, hidden: false, zone: true, src: '7', win: 'auto', official: false }, sig: { method: 'std', trigger: 'entry', minDays: 3, tol: 0, trend: { basis: ['ema'], mode: 'mark', emaN: 200, adxMin: 25 } },
  pivot: { per: ['30', '91', '182'], lo: true, hi: true, near: false, nearPct: 1, low: 'range' },
  f50: { types: ['bounce', 'reject', 'brkUp', 'brkDn', 'retL', 'retS', 'failUp', 'failDn'], zoneL: 3, confL: 3, zoneS: 3, confS: 3, retestDays: 20 },
  rep: { pivot: { iv: 120, max: 5 } },
  telegram: { token: '', chatId: '', enabled: false, events: ['p1', 'p2', 'turn', 'heat', 'lines', 'div', 'react', 'pivot', 'f50'] } };
function cfg() { try { const c = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); return { ...DEF, ...c, heat: { ...DEF.heat, ...(c.heat || {}) }, div: { ...DEF.div, ...(c.div || {}) }, sig: { ...DEF.sig, ...(c.sig || {}) }, pivot: { ...DEF.pivot, ...(c.pivot || {}) }, f50: { ...DEF.f50, ...(c.f50 || {}) }, rep: { ...DEF.rep, ...(c.rep || {}) }, telegram: { ...DEF.telegram, ...(c.telegram || {}) } }; } catch { return structuredClone(DEF); } }
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
stream('Binance Liquidationen', 'wss://fstream.binance.com/market/stream?streams=!forceOrder@arr', null, m => { const o = m.data?.o; if (o) addLiq('b', o.S === 'SELL', +o.z * +o.ap, o.T); });
stream('Bybit Liquidationen', 'wss://stream.bybit.com/v5/public/linear',
  { op: 'subscribe', args: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'SUIUSDT', 'LINKUSDT', 'AVAXUSDT'].map(s => 'allLiquidation.' + s) },
  m => { for (const x of m.data || []) addLiq('y', x.S === 'Buy', +x.v * +x.p, +x.T); });

/* ---------- Alarme per Telegram (gleiche Rechnung wie die Seite, siehe collector/shared.mjs) ---------- */
async function telegram(text) {
  const t = cfg().telegram;
  if (!t.token || !t.chatId) throw new Error('Telegram nicht eingerichtet');
  const r = await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: t.chatId, text, parse_mode: 'HTML' }), signal: AbortSignal.timeout(20000) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || 'Fehler');
}
const ZNAME = v => v == null ? '' : v >= 75 ? 'Extreme Gier' : v >= 55 ? 'Gier' : v >= 45 ? 'Neutral' : v >= 25 ? 'Angst' : 'Extreme Angst';
async function send1(key, a, sent, minMs = Infinity) {
  if (sent[key] && (minMs === Infinity || Date.now() - sent[key] < minMs)) return;
  try { await telegram(`<b>${a.title}</b>\n${a.body}`); sent[key] = Date.now(); log('Telegram gesendet:', key); } catch (e) { log('Telegram-Fehler:', e.message); }
}
// Spalten wie auf der Seite (Standard: Binance, 90 Tage)
const COLS = { idx: 14, raw: 16, other: 1 };
async function checkAlerts(latest, history) {
  const c = cfg(), t = c.telegram; if (!t.enabled || !t.token || !t.chatId) return;
  const lv = c.levels || { p1: { hi: 75, lo: 25 }, p2: { hi: 85, lo: 15 } }, sent = (state.alertsSent ||= {});
  const today = new Date().toISOString().slice(0, 10), idx = latest.modes.binance90?.index, S = { idx, zone: ZNAME(idx), price: latest.btc.price };
  const TI = trendInfo(history, c.sig.trend || {});
  for (const k of ['p1', 'p2']) {
    if (c.sig.method === 'peak' && k === 'p2') continue;
    const o = { col: COLS.idx, rawCol: COLS.raw, colA: COLS.idx, colB: COLS.other, hi: lv[k].hi, lo: lv[k].lo, trigger: c.sig.trigger, minDays: c.sig.minDays, tol: c.sig.tol, trend: c.sig.trend, trendInfo: TI };
    for (const sg of methodSignals(history, c.sig.method, o)) {
      if (sg.d !== today) continue;
      if ((sg.kind === 'phase' || sg.kind === 'exit') && !t.events.includes(k)) continue;
      if ((sg.kind === 'turn' || sg.kind === 'peak') && !t.events.includes('turn')) continue;
      await send1(`${sg.d}:${k}:${sg.kind}:${sg.type}:${c.sig.method}:${c.sig.trigger}`, alarmText(sg.kind, { ...sg, ...S, hi: lv[k].hi, lo: lv[k].lo }), sent);
    }
    if (t.events.includes('off')) for (const sg of applyTrend(trig(phaseSignals(mean7(history, 4), lv[k].hi, lv[k].lo, 5, { minDays: c.sig.minDays, tol: c.sig.tol }), c.sig.trigger), TI, c.sig.trend)) {
      if (sg.d !== today) continue;
      await send1(`off:${sg.d}:${k}:${sg.kind}:${sg.type}`, alarmText(sg.kind, { ...sg, ...S, official: true, hi: lv[k].hi, lo: lv[k].lo }), sent);
    }
  }
  if (t.events.includes('div')) {
    const d = c.div, w = d.win === 'auto' ? '90' : d.win, col = d.src === 'd' ? (w === '90' ? 16 : 12) : (w === '90' ? 14 : 1);
    for (const x of divergences(divRows(history, col), d)) if (x.conf === today) await send1(`div:${x.conf}:${x.type}:u`, alarmText('div', { ...x, ...S, right: d.right }), sent);
  }
  // V16: Signale an der 50er-Linie des Index (Bounce, Ablehnung, Durchbruch, Retest, Fehlausbruch)
  if (t.events.includes('f50')) {
    const rows = history.filter(r => r[COLS.idx] != null).map(r => ({ d: r[0], v: r[COLS.idx] }));
    for (const x of fiftySignals(rows, c.f50)) if (x.d === today && c.f50.types.includes(x.type)) await send1(`f50:${x.d}:${x.type}`, alarmText('f50', { ...x, ...S }), sent);
  }
}
// V15: Heatmap-Quelle wie auf der Seite gewählt (Binance / Bybit / OKX / kombiniert)
const HMs = (latest, c) => (c.heat.src && c.heat.src !== 'binance' && latest.heatmap?.alt?.[c.heat.src]) || latest.heatmap;
async function checkHeatAlerts(latest) {
  const c = cfg(), t = c.telegram; if (!t.enabled || !t.token || !t.chatId || !t.events.includes('heat')) return;
  const sent = (state.alertsSent ||= {}), price = latest.btc.price, idx = latest.modes.binance90?.index;
  for (const e of heatEvents(clusterSet(HMs(latest, c), clOptS(c.heat)), price, c.heat))
    await send1(`heat:${e.c.id}:${e.ev}:${e.c.z.p}`, alarmText('cluster', { ...e, pct: c.heat.pct, idx, zone: ZNAME(idx), price }), sent, c.heat.cool * 60e3);
}
const clOptS = h => ({ nearest: h.nearest, extra: h.extra, far: h.far ? { pct: h.farPct, range: h.farRange } : null });
// Cluster angelaufen → Reaktion / Durchbruch (Zustand in state.touch, auch ohne Telegram weitergeführt)
async function checkReactAlerts(latest) {
  const c = cfg(), t = c.telegram, h = c.heat; if (!h.reactOn) return;
  const price = latest.btc.price, CL = clusterSet(HMs(latest, c), clOptS(h)), ev = touchTrack(state.touch ||= {}, CL, price, h);
  if (!t.enabled || !t.token || !t.chatId || !t.events.includes('react')) return;
  const idx = latest.modes.binance90?.index;
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
  const price = latest.btc.price, today = new Date().toISOString().slice(0, 10), idx = latest.modes.binance90?.index, sent = (state.alertsSent ||= {});
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
      const idx = latest.modes.binance90?.index;
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
    const { result, state: next } = await collect({ env: 'node', keys, state, wsSampleMs: 0, cache: HCACHE, histTtlMs: I.hist * 60e3 });
    state = next; saveState();
    const { history, ...latest } = result;
    latest.server = true; latest.appVersion = 16;
    latest.intervals = { data: I.data, publish: I.publish, hist: I.hist };
    latest.rateLimited = latest.status.filter(x => x.ok === false && /429|rate|too many/i.test(x.msg || '')).map(x => x.name);
    fs.writeFileSync(path.join(WWW, 'data', 'latest.json'), JSON.stringify(latest));
    fs.writeFileSync(path.join(WWW, 'data', 'history.json'), JSON.stringify(history));
    // Tagebuch: aktueller Stand je Lauf (für spätere Auswertung, ab wann ein Punkt verlässlich war)
    fs.appendFileSync(path.join(DATA, 'journal.jsonl'), JSON.stringify({ t: Date.now(), btc: latest.btc.price, idx: Object.fromEntries(Object.entries(latest.modes).map(([k, m]) => [k, [m.index, m.live]])) }) + '\n');
    buildSite();
    await checkAlerts(latest, history); await checkHeatAlerts(latest); await checkLineAlerts(latest); await checkReactAlerts(latest); await checkPivotAlerts(latest, history); saveState();
    lastRun = Date.now(); lastError = null;
    if (!lastPublish || Date.now() - lastPublish >= I.publish * 60e3 - 5000) await publish();
    if (!HCACHE.logged || HCACHE.logged !== HCACHE.t) { HCACHE.logged = HCACHE.t; log(`Verläufe neu geholt · Index ${latest.modes.binance90?.index}`); }
  } catch (e) { lastError = e.message; log('Fehler beim Sammeln:', e); }
  running = false;
}
function buildSite() {
  // gemeinsame Rechenlogik in die Seite einsetzen (Signale, Divergenz, Cluster, Alarm-Texte)
  const shared = fs.readFileSync(path.join(ROOT, 'collector', 'shared.mjs'), 'utf8').replace(/^export /gm, '');
  const html = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8').replace('/*SHARED*/', () => shared);
  fs.writeFileSync(path.join(WWW, 'index.html'), html);
  const engine = fs.readFileSync(path.join(ROOT, 'collector', 'engine.mjs'), 'utf8').replace(/^export /gm, '');
  // alte Links (V6, V7) leiten auf die neue Einzeldatei weiter
  for (const v of ['v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15']) fs.writeFileSync(path.join(WWW, `fear-greed-${v}.html`), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=fear-greed-v16.html"><a href="fear-greed-v16.html">fear-greed-v16.html</a>');
  fs.writeFileSync(path.join(WWW, 'fear-greed-v16.html'), html.replace('<!--ENGINE-->', `<script>window.FG_STANDALONE = true;</script>\n<script type="module">\n${engine}\nwindow.FG_ENGINE = { collect };\nwindow.dispatchEvent(new Event('fg-engine'));\n</script>`));
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
const LNK = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Fear-Greed-V16.lnk');
const autostartOn = () => fs.existsSync(LNK);
function setAutostart(on) {
  return new Promise((res, rej) => {
    if (!on) { try { if (fs.existsSync(LNK)) fs.unlinkSync(LNK); res(false); } catch (e) { rej(e); } return; }
    const vbs = path.join(ROOT, 'start-hidden.vbs');
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${LNK.replace(/'/g, "''")}');$s.TargetPath=\"$env:WINDIR\\System32\\wscript.exe\";$s.Arguments='"${vbs.replace(/'/g, "''")}"';$s.WorkingDirectory='${ROOT.replace(/'/g, "''")}';$s.Description='Fear & Greed V16 (Hintergrund)';$s.Save()`;
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], err => err ? rej(err) : res(true));
  });
}

/* ---------- Webserver ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
    return send(res, 200, { server: true, version: 16, autostart: autostartOn(), lastRun, lastError, intervals: I, nextRun: lastRun ? lastRun + I.data * 60e3 : null, heat: c.heat, lines: c.lines, div: c.div, sig: c.sig,
      keys: { sosovalue: !!c.sosovalueApiKey, coinglass: !!c.coinglassApiKey, coinalyze: !!c.coinalyzeApiKey },
      telegram: { enabled: c.telegram.enabled, configured: !!(c.telegram.token && c.telegram.chatId), events: c.telegram.events },
      publish: { enabled: c.publish !== false, last: lastPublish, error: publishError, url: c.publishUrl || 'https://vrilyassluxion.github.io/fear-greed/' } });
  }
  if (p === '/api/autostart' && req.method === 'POST') { const b = await body(req); try { return send(res, 200, { autostart: await setAutostart(!!b.enabled) }); } catch (e) { return send(res, 500, { error: e.message }); } }
  if (p === '/api/config' && req.method === 'POST') {
    const b = await body(req), c = cfg();
    for (const k of ['sosovalueApiKey', 'coinglassApiKey', 'coinalyzeApiKey']) if (typeof b[k] === 'string' && b[k].trim() !== '') c[k] = b[k].trim();
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
    if (b.rep && typeof b.rep === 'object') { c.rep = {}; for (const [k, v] of Object.entries(b.rep)) c.rep[k] = { iv: Math.min(1440, Math.max(0, +v.iv || 0)), max: Math.min(20, Math.max(1, +v.max || 1)) }; }
    saveCfg(c); send(res, 200, { ok: true }); if (b.recollect) run(); return;
  }
  if (p === '/api/telegram/test' && req.method === 'POST') { try { await telegram('✅ Testnachricht vom Fear & Greed V16 – Alarme kommen hier an.'); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
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
  const file = path.join(WWW, p === '/' ? 'index.html' : p);
  if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Nicht gefunden'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.on('error', e => { if (e.code === 'EADDRINUSE') { log(`Port ${PORT} belegt – das Programm läuft schon (http://localhost:${PORT}).`); process.exit(0); } throw e; });
server.listen(PORT, '127.0.0.1', () => {
  log(`Fear & Greed V16 läuft: http://localhost:${PORT}`);
  buildSite();
  const loop = async () => { await run(); setTimeout(loop, iv().data * 60e3); };
  loop();
  setInterval(saveState, 60e3);
});
