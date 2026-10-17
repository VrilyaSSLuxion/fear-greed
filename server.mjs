// Fear & Greed V10 – Hintergrund-Programm
// Läuft unsichtbar, sammelt jede Minute (einstellbar) alle Daten (inkl. dauerhaftem Liquidations-Mitschnitt),
// speichert den Verlauf, liefert die Seite unter http://localhost:8797 aus und verschickt Telegram-Alarme.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect } from './collector/engine.mjs';
import { methodSignals, phaseSignals, trig, mean7, divergences, divRows, clusterSet, heatEvents, alarmText } from './collector/shared.mjs';

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
  heat: { pct: 1, approach: true, zone: true, poc: true, nearest: true, extra: 2, alarmExtra: false, cool: 720 }, lines: [],
  div: { left: 5, right: 5, minGap: 5, maxGap: 60, hidden: false, zone: true, src: '7', win: 'auto', official: false }, sig: { method: 'std', trigger: 'entry' },
  telegram: { token: '', chatId: '', enabled: false, events: ['p1', 'p2', 'turn', 'heat', 'lines', 'div'] } };
function cfg() { try { const c = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); return { ...DEF, ...c, heat: { ...DEF.heat, ...(c.heat || {}) }, div: { ...DEF.div, ...(c.div || {}) }, sig: { ...DEF.sig, ...(c.sig || {}) }, telegram: { ...DEF.telegram, ...(c.telegram || {}) } }; } catch { return structuredClone(DEF); } }
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
  for (const k of ['p1', 'p2']) {
    if (c.sig.method === 'peak' && k === 'p2') continue;
    const o = { col: COLS.idx, rawCol: COLS.raw, colA: COLS.idx, colB: COLS.other, hi: lv[k].hi, lo: lv[k].lo, trigger: c.sig.trigger };
    for (const sg of methodSignals(history, c.sig.method, o)) {
      if (sg.d !== today) continue;
      if ((sg.kind === 'phase' || sg.kind === 'exit') && !t.events.includes(k)) continue;
      if ((sg.kind === 'turn' || sg.kind === 'peak') && !t.events.includes('turn')) continue;
      await send1(`${sg.d}:${k}:${sg.kind}:${sg.type}:${c.sig.method}:${c.sig.trigger}`, alarmText(sg.kind, { ...sg, ...S, hi: lv[k].hi, lo: lv[k].lo }), sent);
    }
    if (t.events.includes('off')) for (const sg of trig(phaseSignals(mean7(history, 4), lv[k].hi, lv[k].lo), c.sig.trigger)) {
      if (sg.d !== today) continue;
      await send1(`off:${sg.d}:${k}:${sg.kind}:${sg.type}`, alarmText(sg.kind, { ...sg, ...S, official: true, hi: lv[k].hi, lo: lv[k].lo }), sent);
    }
  }
  if (t.events.includes('div')) {
    const d = c.div, w = d.win === 'auto' ? '90' : d.win, col = d.src === 'd' ? (w === '90' ? 16 : 12) : (w === '90' ? 14 : 1);
    for (const x of divergences(divRows(history, col), d)) if (x.conf === today) await send1(`div:${x.conf}:${x.type}:u`, alarmText('div', { ...x, ...S, right: d.right }), sent);
  }
}
async function checkHeatAlerts(latest) {
  const c = cfg(), t = c.telegram; if (!t.enabled || !t.token || !t.chatId || !t.events.includes('heat')) return;
  const sent = (state.alertsSent ||= {}), price = latest.btc.price, idx = latest.modes.binance90?.index;
  for (const e of heatEvents(clusterSet(latest.heatmap, { nearest: c.heat.nearest, extra: c.heat.extra }), price, c.heat))
    await send1(`heat:${e.c.id}:${e.ev}:${e.c.z.p}`, alarmText('cluster', { ...e, pct: c.heat.pct, idx, zone: ZNAME(idx), price }), sent, c.heat.cool * 60e3);
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
    latest.server = true;
    latest.intervals = { data: I.data, publish: I.publish, hist: I.hist };
    latest.rateLimited = latest.status.filter(x => x.ok === false && /429|rate|too many/i.test(x.msg || '')).map(x => x.name);
    fs.writeFileSync(path.join(WWW, 'data', 'latest.json'), JSON.stringify(latest));
    fs.writeFileSync(path.join(WWW, 'data', 'history.json'), JSON.stringify(history));
    // Tagebuch: aktueller Stand je Lauf (für spätere Auswertung, ab wann ein Punkt verlässlich war)
    fs.appendFileSync(path.join(DATA, 'journal.jsonl'), JSON.stringify({ t: Date.now(), btc: latest.btc.price, idx: Object.fromEntries(Object.entries(latest.modes).map(([k, m]) => [k, [m.index, m.live]])) }) + '\n');
    buildSite();
    await checkAlerts(latest, history); await checkHeatAlerts(latest); await checkLineAlerts(latest); saveState();
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
  for (const v of ['v6', 'v7', 'v8', 'v9']) fs.writeFileSync(path.join(WWW, `fear-greed-${v}.html`), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=fear-greed-v10.html"><a href="fear-greed-v10.html">fear-greed-v10.html</a>');
  fs.writeFileSync(path.join(WWW, 'fear-greed-v10.html'), html.replace('<!--ENGINE-->', `<script>window.FG_STANDALONE = true;</script>\n<script type="module">\n${engine}\nwindow.FG_ENGINE = { collect };\nwindow.dispatchEvent(new Event('fg-engine'));\n</script>`));
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
const LNK = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Fear-Greed-V10.lnk');
const autostartOn = () => fs.existsSync(LNK);
function setAutostart(on) {
  return new Promise((res, rej) => {
    if (!on) { try { if (fs.existsSync(LNK)) fs.unlinkSync(LNK); res(false); } catch (e) { rej(e); } return; }
    const vbs = path.join(ROOT, 'start-hidden.vbs');
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${LNK.replace(/'/g, "''")}');$s.TargetPath=\"$env:WINDIR\\System32\\wscript.exe\";$s.Arguments='"${vbs.replace(/'/g, "''")}"';$s.WorkingDirectory='${ROOT.replace(/'/g, "''")}';$s.Description='Fear & Greed V10 (Hintergrund)';$s.Save()`;
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
    return send(res, 200, { server: true, version: 10, autostart: autostartOn(), lastRun, lastError, intervals: I, nextRun: lastRun ? lastRun + I.data * 60e3 : null, heat: c.heat, lines: c.lines, div: c.div, sig: c.sig,
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
    saveCfg(c); send(res, 200, { ok: true }); if (b.recollect) run(); return;
  }
  if (p === '/api/telegram/test' && req.method === 'POST') { try { await telegram('✅ Testnachricht vom Fear & Greed V10 – Alarme kommen hier an.'); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
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
  log(`Fear & Greed V10 läuft: http://localhost:${PORT}`);
  buildSite();
  const loop = async () => { await run(); setTimeout(loop, iv().data * 60e3); };
  loop();
  setInterval(saveState, 60e3);
});
