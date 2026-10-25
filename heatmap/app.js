"use strict";
// Liquidation Heatmap – Oberfläche (reines Canvas, keine Fremdbibliotheken)

const $ = (id) => document.getElementById(id);
const S = {
  coin: "BTC", tf: 60, range: 4320, levs: [5, 10, 25, 50, 100], sides: ["long", "short"], since: 0,
  hl: true, layers: { volume: true, bubbles: true, walls: true }, autoY: true,
  meta: null, data: null, state: null, alerts: [],
  view: { x0: 0, x1: 100, p0: 0, p1: 1 }, follow: true,
  mouse: null, heatImg: null, activeInput: null, dir: "buy",
};
const COLORS = { green: "#22d3a6", red: "#ff4d6d", teal: "#2de0c8", gold: "#ffb23f", gold2: "#ffd36b", violet: "#b48cff" };
const AXIS_W = 70, PROF_W = 150, BOTTOM_H = 28;
const DAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

// ---------------------------------------------------------------- Formatierung
function fmtPrice(p) {
  if (p == null || isNaN(p)) return "–";
  const d = p >= 1000 ? 0 : p >= 1 ? 2 : 5;
  return p.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUsd(v) {
  if (v == null || isNaN(v)) return "–";
  if (v >= 1e9) return (v / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Mrd. $";
  if (v >= 1e6) return Math.round(v / 1e6).toLocaleString("de-DE") + " Mio. $";
  if (v >= 1e3) return Math.round(v / 1e3).toLocaleString("de-DE") + " Tsd. $";
  return Math.round(v) + " $";
}
function fmtUsdShort(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mrd";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " Mio";
  return Math.round(v / 1e3) + " Tsd";
}
const pad2 = (n) => String(n).padStart(2, "0");
function fmtTime(sec, withDate) {
  const d = new Date(sec * 1000);
  if (withDate === "full") return `${DAYS[d.getDay()]}, ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (withDate) return `${DAYS[d.getDay()]}, ${pad2(d.getDate())}.`;
  return `${DAYS[d.getDay()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const numLoose = (v) => { // akzeptiert 81.000 / 81000,5 / 81000.5
  if (v == null || v === "") return null;
  let s = String(v).trim();
  if (/,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const x = parseFloat(s); return isNaN(x) ? null : x;
};

// ---------------------------------------------------------------- Farbskala
const LUT = (() => {
  const stops = [[0, [13, 7, 22, 0]], [0.06, [40, 10, 62, 255]], [0.25, [78, 20, 110, 255]], [0.45, [128, 32, 140, 255]],
    [0.62, [196, 52, 130, 255]], [0.76, [245, 98, 70, 255]], [0.88, [255, 168, 60, 255]], [1, [255, 240, 150, 255]]];
  const out = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    for (let j = 0; j < 4; j++) out[i * 4 + j] = c0[j] + (c1[j] - c0[j]) * f;
  }
  out[3] = 0;
  return out;
})();
const lutColor = (t, a = 1) => { const i = Math.max(0, Math.min(255, Math.round(t * 255))) * 4; return `rgba(${LUT[i]},${LUT[i + 1]},${LUT[i + 2]},${a})`; };

// ---------------------------------------------------------------- API
// Alle Daten kommen direkt aus dem Browser (local.js), es gibt keinen eigenen Server.
const api = (path, opts) => Local.api(path, opts);
function chartUrl() {
  const rows = Math.round(Math.min(900, Math.max(300, plotRect().h * 1.1)));
  let url = `/api/chart?coin=${S.coin}&tf=${S.tf}&range=${S.range}&levs=${S.levs.join(",")}&sides=${S.sides.join(",")}&since=${S.since}&rows=${rows}&auto=1`;
  if (!S.autoY && S.data) { const pad = (S.view.p1 - S.view.p0) * 0.25; url += `&pmin=${S.view.p0 - pad}&pmax=${S.view.p1 + pad}`; }
  return url;
}
let loadSeq = 0;
async function loadChart(resetView) {
  const seq = ++loadSeq;
  try {
    const d = await api(chartUrl());
    if (seq !== loadSeq) return;
    if (!d.ready) { $("loading").textContent = Local.statusText; setTimeout(() => loadChart(resetView), 1000); return; }
    $("loading").style.display = "none";
    const prevN = S.data ? S.data.candles.t.length : 0;
    S.data = d;
    buildHeatImage();
    const n = d.candles.t.length;
    if (resetView || !prevN) fitView(true);
    else if (S.follow) { const w = S.view.x1 - S.view.x0; S.view.x1 = n - 1 + w * 0.12; S.view.x0 = S.view.x1 - w; }
    if (S.autoY) autoFitY();
    renderZones(); draw();
  } catch (e) {
    $("loading").style.display = "grid"; $("loading").textContent = "Fehler: " + e.message;
    setTimeout(() => loadChart(resetView), 5000);
  }
}
async function loadState() {
  try {
    const s = await api(`/api/state?coin=${S.coin}`);
    S.state = s; renderState();
  } catch (e) {}
}
async function loadAlerts() { try { S.alerts = await api("/api/alerts"); renderAlerts(); draw(); } catch (e) {} }

// ---------------------------------------------------------------- Heatmap-Bild
function buildHeatImage() {
  const h = S.data.heat;
  if (!h) { S.heatImg = null; return; }
  const bytes = h.bytes;
  S.heatBytes = bytes;
  const cv = document.createElement("canvas"); cv.width = h.cols; cv.height = h.rows;
  const cx = cv.getContext("2d"); const img = cx.createImageData(h.cols, h.rows);
  // Daten sind zeilenweise (rows x cols), Zeile 0 = oben
  for (let i = 0; i < bytes.length; i++) { const q = bytes[i] * 4; const o = i * 4; img.data[o] = LUT[q]; img.data[o + 1] = LUT[q + 1]; img.data[o + 2] = LUT[q + 2]; img.data[o + 3] = LUT[q + 3]; }
  cx.putImageData(img, 0, 0);
  S.heatImg = cv;
}
function heatValueAt(col, price) {
  const d = S.data, h = d && d.heat; if (!h || col < 0 || col >= h.cols) return 0;
  const row = Math.floor((d.pmax - price) / (d.pmax - d.pmin) * h.rows);
  if (row < 0 || row >= h.rows) return 0;
  const q = S.heatBytes[row * h.cols + col] / 255;
  return h.vmax * Math.pow(q, 1 / h.gamma);
}

// ---------------------------------------------------------------- Geometrie
const cv = $("chart"), ctx = cv.getContext("2d");
function size() { const r = $("wrap").getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); S.W = r.width; S.H = r.height; }
function plotRect() { const W = S.W || 800, H = S.H || 500; return { x: 0, y: 0, w: W - AXIS_W - PROF_W, h: H - BOTTOM_H }; }
const xOf = (i) => { const r = plotRect(); return (i - S.view.x0) / (S.view.x1 - S.view.x0) * r.w; };
const iOf = (x) => { const r = plotRect(); return S.view.x0 + x / r.w * (S.view.x1 - S.view.x0); };
const yOf = (p) => { const r = plotRect(); return (S.view.p1 - p) / (S.view.p1 - S.view.p0) * r.h; };
const pOf = (y) => { const r = plotRect(); return S.view.p1 - y / r.h * (S.view.p1 - S.view.p0); };
function candleIndexForTime(sec) {
  const t = S.data.candles.t; let lo = 0, hi = t.length - 1;
  if (sec < t[0]) return -1;
  if (sec >= t[t.length - 1] + S.tf * 60) return t.length - 1 + (sec - t[t.length - 1]) / (S.tf * 60);
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t[m] <= sec) lo = m; else hi = m - 1; }
  return lo + Math.min(0.999, (sec - t[lo]) / (S.tf * 60));
}

function fitView(all) {
  const n = S.data.candles.t.length;
  if (all) { S.view.x0 = -1; S.view.x1 = n - 1 + Math.max(4, n * 0.12); }
  S.follow = true; autoFitY();
}
function autoFitY() {
  const c = S.data.candles, n = c.t.length;
  const a = Math.max(0, Math.floor(S.view.x0)), b = Math.min(n - 1, Math.ceil(S.view.x1));
  let lo = Infinity, hi = -Infinity;
  for (let i = a; i <= b; i++) { lo = Math.min(lo, c.l[i]); hi = Math.max(hi, c.h[i]); }
  if (!isFinite(lo)) return;
  const p = S.data.price || c.c[n - 1];
  const span = Math.max(hi - lo, p * 0.02);
  const padv = Math.max(span * 0.55, p * 0.045);
  S.view.p0 = Math.max(S.data.pmin, lo - padv); S.view.p1 = Math.min(S.data.pmax, hi + padv);
}

// ---------------------------------------------------------------- Zeichnen
let drawPending = false;
function draw() { if (!drawPending) { drawPending = true; requestAnimationFrame(() => { drawPending = false; drawNow(); }); } }
function drawNow() {
  if (!S.W) size();
  const W = S.W, H = S.H, r = plotRect(), d = S.data;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d0716"; ctx.fillRect(0, 0, W, H);
  if (!d) return;
  const c = d.candles, n = c.t.length;
  const cw = r.w / (S.view.x1 - S.view.x0);

  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, r.w, r.h); ctx.clip();
  // Heatmap
  if (S.heatImg) {
    const h = d.heat;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "low";
    const x = xOf(-0.5), y = yOf(d.pmax), w = h.cols * cw, hh = yOf(d.pmin) - y;
    ctx.drawImage(S.heatImg, x, y, w, hh);
  }
  drawGrid(r);
  if (S.layers.volume) drawVolumeProfile(r);
  // Kerzen
  const a = Math.max(0, Math.floor(S.view.x0) - 1), b = Math.min(n - 1, Math.ceil(S.view.x1) + 1);
  const bw = Math.max(1, cw * 0.62);
  for (let i = a; i <= b; i++) {
    const up = c.c[i] >= c.o[i], x = xOf(i);
    ctx.strokeStyle = ctx.fillStyle = up ? COLORS.green : COLORS.red;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, yOf(c.h[i])); ctx.lineTo(Math.round(x) + 0.5, yOf(c.l[i])); ctx.stroke();
    const y1 = yOf(Math.max(c.o[i], c.c[i])), y2 = yOf(Math.min(c.o[i], c.c[i]));
    ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
  }
  if (S.layers.bubbles) drawBubbles(r);
  if (S.layers.walls) drawWalls(r, cw);
  ctx.restore();

  drawProfiles(r);
  drawAxes(r, cw);
  drawLevelLines(r);
  drawCrosshair(r);
}

// Waagerechte Linien (Preis, Zonen, Hyperliquid, Alarme) wie bei TradingView bis zur Preisachse,
// mit farbigem Preis-Label auf der Achse und Kerzen-Countdown unter dem aktuellen Preis.
function drawLevelLines(r) {
  const d = S.data, right = r.w + PROF_W, lines = [];
  for (const z of d.zones || []) lines.push({ p: z.price, col: z.side === "short" ? COLORS.gold : COLORS.violet, alpha: 0.7,
    box: `${fmtPrice(z.price)} $ · ${fmtUsd(z.usd)}` });
  if (S.hl) for (const z of d.hl_levels || []) lines.push({ p: z.price, col: COLORS.teal, alpha: 0.7, dash: [3, 4],
    box: `HL ${fmtPrice(z.price)} $ · ${fmtUsd(z.usd)}` });
  for (const a of S.alerts) {
    if (a.coin !== S.coin || a.status === "closed") continue;
    const ref = a.entry || (a.trigger.type === "price" ? a.trigger.value : null);
    if (ref) lines.push({ p: +ref, col: "#ffffff", alpha: 0.85, dash: [6, 3],
      tag: (a.direction === "buy" ? "Kauf " : "Verkauf ") + (a.status === "armed" ? "(wartet)" : "Einstieg") });
    lines.push({ p: a.sl, col: COLORS.red, alpha: 0.9, dash: [6, 3], tag: "SL" });
    a.tps.forEach((t, k) => lines.push({ p: t, col: COLORS.green, alpha: 0.9, dash: [6, 3],
      tag: `TP${k + 1}` + (a.hits.includes(`TP${k + 1}`) ? " ✓" : "") }));
  }
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, S.W, r.h); ctx.clip();
  for (const L of lines) {
    const y = Math.round(yOf(L.p)) + 0.5; if (y < 0 || y > r.h) continue;
    ctx.globalAlpha = L.alpha; ctx.strokeStyle = L.col; ctx.lineWidth = 1; ctx.setLineDash(L.dash || []);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(right, y); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  // Preislinie
  const py = Math.round(yOf(d.price)) + 0.5;
  ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(right, py); ctx.stroke(); ctx.setLineDash([]);
  // Boxen im Chart und Markierungen der Alarme
  const placed = [];
  for (const L of lines) {
    const y = yOf(L.p); if (y < 10 || y > r.h - 10) continue;
    if (L.box) boxLabel(r.w - 8, y, L.box, L.col, placed);
    if (L.tag) { ctx.font = "bold 11px Inter, sans-serif"; const w = ctx.measureText(L.tag).width + 10;
      ctx.fillStyle = L.col; roundRect(130, y - 9, w, 18, 4); ctx.fill();
      ctx.fillStyle = "#0d0716"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(L.tag, 135, y + 0.5); }
  }
  // Labels auf der Preisachse
  for (const L of lines) { const y = yOf(L.p); if (y < 8 || y > r.h - 8) continue;
    label(right + 4, y, fmtPrice(L.p), L.col, L.col === "#ffffff" || L.col === COLORS.gold || L.col === COLORS.teal || L.col === COLORS.green ? "#0d0716" : "#fff"); }
  ctx.restore();
  priceLabel(right + 4, py, d.price);
}
function countdown() {
  const sec = S.tf * 60, now = Date.now() / 1000;
  let left = Math.max(0, Math.ceil((Math.floor(now / sec) + 1) * sec - now));
  const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s2 = left % 60;
  if (S.tf >= 1440) { const dd = Math.floor(h / 24); return dd ? `${dd}T ${pad2(h % 24)}:${pad2(m)}` : `${pad2(h)}:${pad2(m)}:${pad2(s2)}`; }
  return h ? `${pad2(h)}:${pad2(m)}:${pad2(s2)}` : `${pad2(m)}:${pad2(s2)}`;
}
function priceLabel(x, y, price) {
  const c = S.data.candles, n = c.t.length; const up = n ? c.c[n - 1] >= c.o[n - 1] : true;
  const bg = up ? COLORS.green : COLORS.red, w = AXIS_W - 6;
  ctx.fillStyle = bg; roundRect(x, y - 10, w, 36, 5); ctx.fill();
  ctx.fillStyle = "#0d0716"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "bold 12px Inter, Segoe UI, sans-serif"; ctx.fillText(fmtPrice(price), x + 6, y + 0.5);
  ctx.font = "11px Inter, Segoe UI, sans-serif"; ctx.fillText(countdown(), x + 6, y + 16);
}

function drawGrid(r) {
  ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1;
  for (const p of priceTicks()) { const y = Math.round(yOf(p)) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.w, y); ctx.stroke(); }
}
function priceTicks() {
  const span = S.view.p1 - S.view.p0; const raw = span / 6; const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const out = []; for (let p = Math.ceil(S.view.p0 / step) * step; p <= S.view.p1; p += step) out.push(p); return out;
}
function drawAxes(r, cw) {
  ctx.fillStyle = "#0d0716"; ctx.fillRect(r.w + PROF_W, 0, AXIS_W, S.H); ctx.fillRect(0, r.h, S.W, BOTTOM_H);
  ctx.fillStyle = "#9a8db0"; ctx.font = "12px Inter, Segoe UI, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (const p of priceTicks()) ctx.fillText(fmtPrice(p), r.w + PROF_W + 10, yOf(p));
  // Zeitachse
  const c = S.data.candles; if (!c.t.length) return;
  const steps = [5, 15, 30, 60, 120, 240, 360, 720, 1440, 2880, 10080, 43200].filter((s) => s >= S.tf);
  const pxPerMin = cw / S.tf; const step = steps.find((s) => s * pxPerMin >= 110) || steps[steps.length - 1];
  const t0 = c.t[Math.max(0, Math.floor(S.view.x0))] || c.t[0];
  const tz = new Date().getTimezoneOffset() * 60;
  let t = Math.ceil((t0 - tz) / (step * 60)) * step * 60 + tz;
  ctx.textAlign = "center";
  const tEnd = c.t[c.t.length - 1] + (S.view.x1 - c.t.length) * S.tf * 60;
  for (let k = 0; k < 60 && t <= tEnd; k++, t += step * 60) {
    const i = candleIndexForTime(t); if (i < 0) continue; const x = xOf(Math.floor(i) + (i % 1) - 0.5 + 0.5);
    if (x < 30 || x > r.w - 20) continue;
    ctx.fillText(fmtTime(t, step >= 1440), x, r.h + BOTTOM_H / 2);
  }
}
function label(x, y, text, bg, fg, axis) {
  ctx.font = "bold 12px Inter, Segoe UI, sans-serif"; const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg; roundRect(x, y - 10, w, 20, 5); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 6, y + 0.5);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function rowY(row) { const d = S.data; return yOf(d.pmax - (row + 0.5) / d.rows * (d.pmax - d.pmin)); }
function drawVolumeProfile(r) {
  const vp = S.data.volume; if (!vp) return;
  const rows = S.data.rows, maxW = Math.min(110, r.w * 0.12);
  let mx = 0; for (let i = 0; i < rows; i++) mx = Math.max(mx, vp.buy[i] + vp.sell[i]);
  if (!mx) return;
  const rh = Math.max(1, Math.abs(yOf(S.data.pmin) - yOf(S.data.pmax)) / rows);
  for (let i = 0; i < rows; i++) {
    const tot = vp.buy[i] + vp.sell[i]; if (!tot) continue;
    const y = yOf(S.data.pmin + (i + 0.5) / rows * (S.data.pmax - S.data.pmin)); if (y < -2 || y > r.h + 2) continue;
    const wb = vp.buy[i] / mx * maxW, ws = vp.sell[i] / mx * maxW;
    const inVA = i >= vp.val && i <= vp.vah;
    ctx.fillStyle = inVA ? "rgba(45,224,200,.38)" : "rgba(45,224,200,.18)"; ctx.fillRect(0, y - rh / 2, wb, rh);
    ctx.fillStyle = inVA ? "rgba(255,77,109,.38)" : "rgba(255,77,109,.18)"; ctx.fillRect(wb, y - rh / 2, ws, rh);
  }
  const yp = yOf(S.data.pmin + (vp.poc + 0.5) / rows * (S.data.pmax - S.data.pmin));
  ctx.strokeStyle = "rgba(255,211,107,.8)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, yp); ctx.lineTo(maxW + 30, yp); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,211,107,.9)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText("POC", maxW + 34, yp);
}
function drawProfiles(r) {
  const d = S.data, rows = d.rows, x0 = r.w, mid = x0 + 52;
  ctx.fillStyle = "#0b0612"; ctx.fillRect(x0, 0, PROF_W, r.h);
  ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.beginPath(); ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, r.h); ctx.stroke();
  const rh = Math.max(1, Math.abs(yOf(d.pmin) - yOf(d.pmax)) / rows);
  const pr = d.profile; let mx = 0;
  for (let i = 0; i < rows; i++) mx = Math.max(mx, pr.longs[i] + pr.shorts[i]);
  const maxW = PROF_W - 60;
  if (mx) for (let i = 0; i < rows; i++) {
    const v = pr.longs[i] + pr.shorts[i]; if (!v) continue;
    const y = yOf(d.pmin + (i + 0.5) / rows * (d.pmax - d.pmin)); if (y < 0 || y > r.h) continue;
    const t = Math.pow(v / mx, 0.6);
    ctx.fillStyle = lutColor(0.45 + t * 0.55, 0.95); ctx.fillRect(mid + 2, y - rh / 2, t * maxW, Math.max(1, rh));
  }
  if (S.hl) {
    const hp = d.hl_profile; let hm = 0; for (let i = 0; i < rows; i++) hm = Math.max(hm, hp.longs[i] + hp.shorts[i]);
    if (hm) for (let i = 0; i < rows; i++) {
      const v = hp.longs[i] + hp.shorts[i]; if (!v) continue;
      const y = yOf(d.pmin + (i + 0.5) / rows * (d.pmax - d.pmin)); if (y < 0 || y > r.h) continue;
      const w = Math.pow(v / hm, 0.6) * 48;
      ctx.fillStyle = "rgba(45,224,200,.85)"; ctx.fillRect(mid - w, y - rh / 2, w, Math.max(1, rh));
    }
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Hyperliquid", mid - 24, 12);
  }
  ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Modell", mid + 40, 12);
}
function boxLabel(xRight, y, text, col, placed) {
  ctx.font = "bold 12px Inter, Segoe UI, sans-serif"; const w = ctx.measureText(text).width + 16;
  let yy = y; for (const p of placed) if (Math.abs(p - yy) < 22) yy = p + 22 * Math.sign(yy - p || 1);
  placed.push(yy);
  ctx.fillStyle = "rgba(14,8,22,.92)"; roundRect(xRight - w, yy - 11, w, 22, 6); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, xRight - w + 8, yy + 0.5);
}
function drawBubbles(r) {
  const bs = S.data.bubbles || []; const c = S.data.candles; if (!c.t.length) return;
  const zoom = Math.min(1.4, Math.max(0.5, Math.sqrt((r.w / (S.view.x1 - S.view.x0)) / 8)));
  const groups = new Map();
  for (const b of bs) {
    const i = Math.floor(candleIndexForTime(b.t / 1000)); if (i < S.view.x0 - 1 || i > S.view.x1 + 1) continue;
    const k = i + "|" + b.side + "|" + b.kind; const g = groups.get(k);
    if (g) { g.pv += b.price * b.usd; g.usd += b.usd; } else groups.set(k, { i, side: b.side, kind: b.kind, usd: b.usd, pv: b.price * b.usd });
  }
  const list = [...groups.values()].sort((a, b) => b.usd - a.usd).slice(0, 400).reverse();
  for (const b of list) {
    b.price = b.pv / b.usd;
    const x = xOf(b.i), y = yOf(b.price); if (y < -30 || y > r.h + 30) continue;
    const rad = Math.min(30, Math.max(3, Math.sqrt(b.usd / 1e5) * 2.2)) * zoom;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    if (b.kind === "liq") { ctx.fillStyle = "rgba(255,214,0,.12)"; ctx.strokeStyle = "rgba(255,214,0,.9)"; }
    else if (b.side === "buy") { ctx.fillStyle = "rgba(34,211,166,.28)"; ctx.strokeStyle = "rgba(34,211,166,.9)"; }
    else { ctx.fillStyle = "rgba(255,77,109,.28)"; ctx.strokeStyle = "rgba(255,77,109,.9)"; }
    ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
    if (rad > 13) { ctx.fillStyle = "#fff"; ctx.font = "bold 10px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(fmtUsdShort(b.usd), x, y); }
  }
}
function drawWalls(r, cw) {
  const n = S.data.candles.t.length; const x = xOf(n - 1) + cw * 1.2; if (x > r.w) return;
  let mx = 0; for (const w of S.data.walls || []) mx = Math.max(mx, w.usd);
  for (const w of S.data.walls || []) {
    const y = yOf(w.price); if (y < 0 || y > r.h) continue;
    const room = r.w - x - 8; if (room < 20) continue;
    const len = Math.min(room - 46, 14 + w.usd / mx * 46);
    ctx.fillStyle = w.side === "bid" ? "rgba(34,211,166,.85)" : "rgba(255,77,109,.85)";
    ctx.fillRect(x, y - 2, Math.max(6, len), 4);
    if (room > 70) { ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(fmtUsdShort(w.usd) + " $", x + Math.max(6, len) + 4, y); }
  }
}
function drawCrosshair(r) {
  const m = S.mouse; const tip = $("tip");
  if (!m || m.x > r.w || m.y > r.h) { tip.style.display = "none"; return; }
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m.x, 0); ctx.lineTo(m.x, r.h); ctx.moveTo(0, m.y); ctx.lineTo(r.w + PROF_W, m.y); ctx.stroke(); ctx.setLineDash([]);
  const p = pOf(m.y); label(r.w + PROF_W + 4, m.y, fmtPrice(p), "#2a1d3d", "#fff");
  const c = S.data.candles; const i = Math.round(iOf(m.x));
  if (i < 0 || i >= c.t.length) { tip.style.display = "none"; return; }
  const est = heatValueAt(i, p);
  tip.innerHTML = `<b>${fmtTime(c.t[i], "full")}</b><br>Preis ${fmtPrice(p)} $<br>Geschätzt offen ${fmtUsd(est)}<br>Schluss ${fmtPrice(c.c[i])} $`;
  tip.style.display = "block";
  const tx = m.x + 18 + 190 > r.w ? m.x - 200 : m.x + 18;
  tip.style.left = tx + "px"; tip.style.top = Math.min(r.h - 110, m.y + 14) + "px";
}

// ---------------------------------------------------------------- Seitenleiste & Kopf
function renderZones() {
  const el = $("zones"); const zs = S.data && S.data.zones || [];
  if (!zs.length) { el.innerHTML = '<div class="muted small">Noch keine Zonen.</div>'; return; }
  const p = S.data.price; let html = ""; let nowDone = false;
  for (const z of zs) {
    if (!nowDone && z.price < p) { html += `<div class="now">Preis ${fmtPrice(p)} $</div>`; nowDone = true; }
    const sign = z.dist_pct >= 0 ? "+" : "";
    html += `<div class="z"><div><div class="zp ${z.side}">${fmtPrice(z.price)} $</div><div class="zs">${z.side === "short" ? "Short" : "Long"}-Liquidationen · ${sign}${z.dist_pct.toFixed(1).replace(".", ",")} %</div></div><div class="zu">${fmtUsd(z.usd)}</div></div>`;
  }
  if (!nowDone) html += `<div class="now">Preis ${fmtPrice(p)} $</div>`;
  el.innerHTML = html;
}
function renderState() {
  const s = S.state; if (!s) return;
  $("coinName").textContent = s.coin; $("coinIcon").textContent = { BTC: "₿", ETH: "Ξ", SOL: "◎" }[s.coin] || s.coin[0];
  $("priceBig").textContent = fmtPrice(s.price) + " $";
  $("bPrice").textContent = "$" + (s.price ? s.price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
  const ch = s.change24 || 0; const el = $("chg");
  el.textContent = `${ch >= 0 ? "+" : ""}${ch.toFixed(1).replace(".", ",")} % · 24 Std.`; el.className = "chg " + (ch >= 0 ? "up" : "down");
  if (s.oi_all && s.oi_all.total) { $("oiAll").textContent = fmtUsd(s.oi_all.total); $("oiSource").textContent = s.oi_all.source || "alle Börsen"; }
  else if (s.oi_binance) { $("oiAll").textContent = fmtUsd(s.oi_binance); $("oiSource").textContent = "Binance"; }
  const d = new Date(s.updated_ms || Date.now());
  $("stand").textContent = `Stand ${pad2(d.getHours())}:${pad2(d.getMinutes())} · jede Minute neu`;
  const L = s.liq24.longs, Sh = s.liq24.shorts, tot = L + Sh || 1;
  $("liqLongs").textContent = Math.round(L).toLocaleString("de-DE"); $("liqShorts").textContent = Math.round(Sh).toLocaleString("de-DE");
  $("barL").style.width = (L / tot * 100) + "%"; $("barS").style.width = (Sh / tot * 100) + "%";
  const hl = s.hl || {};
  if (hl.error) $("hlInfo").textContent = hl.error;
  else if (hl.count != null) {
    const share = hl.share_pct != null ? `, das sind ${hl.share_pct.toFixed(0)} % aller offenen ${s.coin}-Positionen dort` : "";
    const t = new Date(hl.updated_ms);
    $("hlInfo").innerHTML = `${hl.count} offene ${s.coin}-Positionen der ${hl.wallets} größten Wallets, zusammen ${fmtUsd(hl.total_usd)}${share}.<br>Long ${fmtUsd(hl.long_usd)} · Short ${fmtUsd(hl.short_usd)}<br>Stand ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  }
}
function renderAlerts() {
  const el = $("alertList");
  if (!S.alerts.length) { el.innerHTML = '<div class="muted small">Noch keine Alarme.</div>'; return; }
  const trigText = (t) => ({ now: "sofort", price: `Kurs ${t.op === "above" ? "über" : "unter"} ${fmtPrice(+t.value)} $`, zone: `Zone ab ${fmtUsd(+t.min_usd)}`, liq_wave: `Liq.-Welle ab ${fmtUsd(+t.min_usd)}`, big_order: `Order ab ${fmtUsd(+t.min_usd)}` }[t.type]);
  const st = { armed: "wartet", active: "aktiv", closed: "beendet" };
  el.innerHTML = S.alerts.map((a) => `<div class="al">
    <div class="h"><span class="dir ${a.direction}">${a.direction === "buy" ? "KAUF" : "VERKAUF"} ${a.coin}</span>
    <span><span class="st ${a.status}">${st[a.status]}</span> <button class="x" data-del="${a.id}" title="Löschen">✕</button></span></div>
    <div class="muted">${trigText(a.trigger)}${a.entry ? " · Einstieg " + fmtPrice(a.entry) : ""}</div>
    <div>SL ${fmtPrice(a.sl)} · TP ${a.tps.map(fmtPrice).join(" / ")}</div>
    ${a.hits.length ? `<div class="muted">Erreicht: ${a.hits.join(", ")}${a.result_r != null ? ` · Ergebnis ${a.result_r > 0 ? "+" : ""}${String(a.result_r).replace(".", ",")} R` : ""}</div>` : ""}
    ${a.note ? `<div class="muted">${escapeHtml(a.note)}</div>` : ""}</div>`).join("");
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(title, text) {
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = `<b>${escapeHtml(title)}</b>${escapeHtml(text)}`;
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 12000);
  if ("Notification" in window && Notification.permission === "granted") { try { new Notification(title, { body: text }); } catch (e) {} }
}

// ---------------------------------------------------------------- Bedienung
function segHandler(id, attr, fn) {
  $(id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || !b.dataset[attr]) return;
    [...$(id).querySelectorAll("button")].forEach((x) => x.classList.toggle("on", x === b)); fn(b.dataset[attr]); });
}
function setup() {
  segHandler("tfSeg", "tf", (v) => { S.tf = +v; loadChart(true); });
  segHandler("rangeSeg", "range", (v) => { S.range = +v; loadChart(true); });
  segHandler("sinceChips", "since", (v) => { S.since = +v; loadChart(); });
  segHandler("hlChips", "hl", (v) => { S.hl = v === "1"; draw(); });
  $("levChips").innerHTML = S.meta.leverages.map((l) => `<button class="chip on" data-lev="${l}">${l}x</button>`).join("");
  $("levChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    b.classList.toggle("on"); S.levs = [...$("levChips").querySelectorAll(".on")].map((x) => +x.dataset.lev);
    if (!S.levs.length) { b.classList.add("on"); S.levs = [+b.dataset.lev]; } loadChart(); });
  $("sideChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    b.classList.toggle("on"); S.sides = [...$("sideChips").querySelectorAll(".on")].map((x) => x.dataset.side);
    if (!S.sides.length) { b.classList.add("on"); S.sides = [b.dataset.side]; } loadChart(); });
  $("layerChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    b.classList.toggle("on"); S.layers[b.dataset.layer] = b.classList.contains("on"); draw(); });
  const sel = $("coinSelect"); sel.innerHTML = S.meta.coins.map((c) => `<option>${c}</option>`).join("");
  sel.addEventListener("change", () => { S.coin = sel.value; S.data = null; $("loading").style.display = "grid"; loadState(); loadChart(true); });
  $("zoomIn").onclick = () => zoomX(0.75, plotRect().w * 0.85);
  $("zoomOut").onclick = () => zoomX(1.33, plotRect().w * 0.85);
  $("autoBtn").onclick = () => { S.autoY = !S.autoY; $("autoBtn").classList.toggle("on", S.autoY); if (S.autoY) autoFitY(); loadChart(); };
  $("fitBtn").onclick = () => { S.autoY = true; $("autoBtn").classList.add("on"); fitView(true); draw(); };

  // Maus: Chart ziehen, Preisachse ziehen = Preis-Zoom, Zeitachse ziehen = Zeit-Zoom (wie TradingView)
  let drag = null;
  const zoneAt = (x, y) => { const r = plotRect(); if (x >= r.w + PROF_W) return "yaxis"; if (y >= r.h) return "xaxis"; return "plot"; };
  const setMouse = (e) => { const rc = cv.getBoundingClientRect(); S.mouse = { x: e.clientX - rc.left, y: e.clientY - rc.top }; };
  const autoOff = () => { if (S.autoY) { S.autoY = false; $("autoBtn").classList.remove("on"); } };
  cv.addEventListener("mousemove", (e) => {
    setMouse(e);
    if (!drag) { const z = zoneAt(S.mouse.x, S.mouse.y); cv.style.cursor = z === "yaxis" ? "ns-resize" : z === "xaxis" ? "ew-resize" : "crosshair"; draw(); }
  });
  cv.addEventListener("mouseleave", () => { if (!drag) { S.mouse = null; draw(); } });
  cv.addEventListener("mousedown", (e) => {
    if (!S.data || e.button !== 0) return; setMouse(e); e.preventDefault();
    drag = { zone: zoneAt(S.mouse.x, S.mouse.y), x: S.mouse.x, y: S.mouse.y, v: { ...S.view }, moved: false };
    if (drag.zone === "plot") cv.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return; setMouse(e);
    const r = plotRect(), dx = S.mouse.x - drag.x, dy = S.mouse.y - drag.y, v = drag.v, n = S.data.candles.t.length;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.zone === "yaxis") {
      autoOff();
      const f = Math.exp(dy * 0.006), mid = (v.p0 + v.p1) / 2, half = (v.p1 - v.p0) / 2 * f;
      S.view.p0 = mid - half; S.view.p1 = mid + half;
    } else if (drag.zone === "xaxis") {
      const f = Math.exp(-dx * 0.005), w = Math.max(10, Math.min(n * 1.5 + 20, (v.x1 - v.x0) * f));
      S.view.x1 = v.x1; S.view.x0 = v.x1 - w; if (S.autoY) autoFitY();
    } else {
      const sx = dx / r.w * (v.x1 - v.x0);
      S.view.x0 = v.x0 - sx; S.view.x1 = v.x1 - sx; S.follow = S.view.x1 >= n - 1;
      if (S.autoY && Math.abs(dy) > 8) autoOff();
      if (!S.autoY) { const sy = dy / r.h * (v.p1 - v.p0); S.view.p0 = v.p0 + sy; S.view.p1 = v.p1 + sy; }
      else autoFitY();
    }
    draw();
  });
  window.addEventListener("mouseup", () => {
    if (!drag) return;
    if (drag.zone === "plot" && !drag.moved && S.activeInput && S.mouse) {
      S.activeInput.value = fmtPrice(pOf(S.mouse.y)).replace(/\./g, ""); S.activeInput.dispatchEvent(new Event("input")); S.activeInput.focus();
    }
    const wasDrag = drag; drag = null; cv.style.cursor = "crosshair";
    if (wasDrag.moved && !S.autoY) reloadSoon();
  });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); if (!S.data) return;
    const zone = S.mouse ? zoneAt(S.mouse.x, S.mouse.y) : "plot";
    if (e.shiftKey || zone === "yaxis") { // Preis-Zoom
      autoOff();
      const p = zone === "yaxis" ? (S.view.p0 + S.view.p1) / 2 : pOf(S.mouse ? S.mouse.y : plotRect().h / 2); const f = e.deltaY > 0 ? 1.15 : 0.87;
      S.view.p0 = p - (p - S.view.p0) * f; S.view.p1 = p + (S.view.p1 - p) * f;
    } else zoomX(e.deltaY > 0 ? 1.15 : 0.87, zone === "xaxis" ? plotRect().w : (S.mouse ? S.mouse.x : plotRect().w / 2));
    if (!S.autoY) reloadSoon();
    draw();
  }, { passive: false });
  cv.addEventListener("dblclick", () => { const z = S.mouse ? zoneAt(S.mouse.x, S.mouse.y) : "plot";
    if (z === "yaxis") { S.autoY = true; $("autoBtn").classList.add("on"); autoFitY(); draw(); } else $("fitBtn").click(); });
  window.addEventListener("resize", () => { size(); if (S.data && S.autoY) autoFitY(); draw(); });

  setupAlertForm();
}
let reloadTimer = null;
function reloadSoon() { // Heatmap passend zum sichtbaren Preisbereich neu laden, sobald der Nutzer kurz pausiert
  const d = S.data; if (!d) return;
  const span = S.view.p1 - S.view.p0, cur = d.pmax - d.pmin;
  if (S.view.p0 >= d.pmin && S.view.p1 <= d.pmax && span > cur * 0.3) return;
  clearTimeout(reloadTimer); reloadTimer = setTimeout(() => loadChart(), 350);
}
function zoomX(f, mx) {
  const i = iOf(mx); const n = S.data.candles.t.length;
  let x0 = i - (i - S.view.x0) * f, x1 = i + (S.view.x1 - i) * f;
  if (x1 - x0 < 10) return; if (x1 - x0 > n * 1.5 + 20) { x0 = -1; x1 = n + n * 0.12; }
  S.view.x0 = x0; S.view.x1 = x1; S.follow = x1 >= n - 1; if (S.autoY) autoFitY(); draw();
}

// ---------------------------------------------------------------- Alarm-Formular
function setupAlertForm() {
  const f = $("alertForm");
  const showTv = () => { const t = f.trigger.value; f.querySelectorAll(".tv").forEach((l) => l.classList.toggle("hidden", !l.dataset.for.split(" ").includes(t))); };
  f.trigger.addEventListener("change", showTv); showTv();
  $("newAlert").onclick = () => { f.classList.toggle("hidden"); if (!f.classList.contains("hidden") && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); };
  $("cancelAlert").onclick = () => { f.classList.add("hidden"); S.activeInput = null; };
  f.querySelectorAll(".chips button[data-dir]").forEach((b) => b.onclick = () => {
    S.dir = b.dataset.dir; f.querySelectorAll(".chips button[data-dir]").forEach((x) => x.classList.toggle("on", x === b)); });
  f.querySelectorAll("input").forEach((inp) => {
    if (["tvalue", "entry", "sl", "tp1", "tp2", "tp3"].includes(inp.name)) inp.addEventListener("focus", () => S.activeInput = inp);
    inp.addEventListener("input", updateRR);
  });
  $("suggestBtn").onclick = async () => {
    try {
      const s = await api(`/api/alerts/suggest?coin=${S.coin}&direction=${S.dir}`);
      const r0 = (v) => String(Math.round(v * (v > 100 ? 1 : 1000)) / (v > 100 ? 1 : 1000));
      f.entry.value = r0(s.entry); f.sl.value = r0(s.sl);
      ["tp1", "tp2", "tp3"].forEach((k, i) => f[k].value = s.tps[i] ? r0(s.tps[i]) : "");
      if (f.trigger.value.startsWith("price") && !f.tvalue.value) { f.trigger.value = "now"; f.trigger.dispatchEvent(new Event("change")); }
      updateRR();
    } catch (e) { $("alertErr").textContent = e.message; }
  };
  $("alertList").addEventListener("click", async (e) => { const b = e.target.closest("[data-del]"); if (!b) return;
    await api(`/api/alerts/${b.dataset.del}`, { method: "DELETE" }); loadAlerts(); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault(); $("alertErr").textContent = "";
    const t = f.trigger.value; let trigger;
    if (t === "price_above" || t === "price_below") trigger = { type: "price", op: t === "price_above" ? "above" : "below", value: numLoose(f.tvalue.value) };
    else if (t === "zone") trigger = { type: "zone", min_usd: (numLoose(f.zone_min.value) || 0) * 1e6, within_pct: numLoose(f.zone_pct.value) || 0.3 };
    else if (t === "liq_wave" || t === "big_order") trigger = { type: t, min_usd: (numLoose(f.usd_min.value) || 0) * 1e6 };
    else trigger = { type: "now" };
    const body = { coin: S.coin, direction: S.dir, trigger, entry: numLoose(f.entry.value), sl: numLoose(f.sl.value),
      tps: [numLoose(f.tp1.value), numLoose(f.tp2.value), numLoose(f.tp3.value)].filter((x) => x), note: f.note.value };
    try { await api("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      f.classList.add("hidden"); S.activeInput = null; loadAlerts(); }
    catch (err) { $("alertErr").textContent = err.message; }
  });
}
function updateRR() {
  const f = $("alertForm"); const e = numLoose(f.entry.value) || (S.data && S.data.price); const sl = numLoose(f.sl.value);
  const tps = [f.tp1.value, f.tp2.value, f.tp3.value].map(numLoose).filter((x) => x);
  if (!e || !sl || !tps.length) return;
  const risk = Math.abs(e - sl); if (!risk) return;
  $("rrInfo").textContent = "Chance-Risiko: " + tps.map((t, i) => `TP${i + 1} ${(Math.abs(t - e) / risk).toFixed(2).replace(".", ",")} R`).join(" · ") + ` · Risiko ${(risk / e * 100).toFixed(2).replace(".", ",")} %`;
}

// ---------------------------------------------------------------- Live
function connectWs() {
  Local.subscribe((m) => {
    if (m.type === "price" && m.coin === S.coin && S.data) {
      const c = S.data.candles, n = c.t.length; S.data.price = m.price;
      const bucket = Math.floor(Date.now() / 1000 / (S.tf * 60)) * S.tf * 60;
      if (n && c.t[n - 1] === bucket) { c.c[n - 1] = m.price; c.h[n - 1] = Math.max(c.h[n - 1], m.price); c.l[n - 1] = Math.min(c.l[n - 1], m.price); }
      else if (n && bucket > c.t[n - 1]) { c.t.push(bucket); c.o.push(m.price); c.h.push(m.price); c.l.push(m.price); c.c.push(m.price); c.v.push(0); }
      if (S.state) { S.state.price = m.price; $("priceBig").textContent = fmtPrice(m.price) + " $"; $("bPrice").textContent = "$" + m.price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      draw();
    } else if (m.type === "bubble" && m.coin === S.coin && S.data) { S.data.bubbles.push(m.bubble); draw(); }
    else if (m.type === "minute" && m.coin === S.coin) { loadChart(); loadState(); }
    else if (m.type === "alert") { toast(m.title, m.text); loadAlerts(); }
  });
}

(async function init() {
  size();
  S.meta = await api("/api/meta");
  S.coin = S.meta.coins[0];
  if (S.meta.demo) $("demoBadge").classList.remove("hidden");
  const tg = Alerts.telegram(); $("tgToken").value = tg.token || ""; $("tgChat").value = tg.chat || "";
  $("tgSave").onclick = () => { Alerts.setTelegram($("tgToken").value, $("tgChat").value); Alerts.test(); };
  setup();
  await loadState();
  await loadChart(true);
  loadAlerts();
  connectWs();
  setInterval(loadState, 10000);
  setInterval(draw, 1000); // Kerzen-Countdown
  setInterval(() => loadChart(), 60000);
})();
