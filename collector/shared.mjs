// Gemeinsame Rechenlogik für die Seite und das Hintergrund-Programm (V8):
// Signale ohne Repaint, Signal-Methoden, Divergenzen, Heatmap-Cluster, Alarm-Texte.
// Die Seite bekommt diesen Code beim Bauen eingesetzt (Platzhalter /*SHARED*/), das Programm importiert ihn.

const sClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sDay = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

/* ---------- Extremphasen-Signale (ohne Repaint) ---------- */
// rows: [[datum, wert, kurs]]. Phase bestätigt = 3. Tag in Folge jenseits der Schwelle.
// Wende bestätigt = Wert hat sich in der Phase um "back" Punkte vom Extrem gelöst.
// Austritt = Wert verlässt die Extremzone wieder (nach mind. 3 Tagen darin), z. B. von unter 30 wieder über 30 → sicherer, aber später.
export function phaseSignals(rows, hi, lo, back = 5, o = {}) {
  // o.minDays = Tage in Folge bis zum Signal (1 = schon beim ersten Berühren), o.tol = Berührung zählt schon ± Punkte vor der Grenze
  const md = Math.max(1, o.minDays ?? 3), tol = o.tol ?? 0, out = []; let run = null;
  for (const [d, v] of rows) {
    if (v == null) { run = null; continue; }
    const type = v >= hi - tol ? 'greed' : v <= lo + tol ? 'fear' : null;
    if (type && run && run.type === type) { run.days++; run.ext = type === 'greed' ? Math.max(run.ext, v) : Math.min(run.ext, v); }
    else {
      if (run && run.days >= md) out.push({ d, kind: 'exit', type: run.type, v, ext: run.ext, days: run.days });
      run = type ? { type, days: 1, ext: v, turned: false } : null;
    }
    if (!run) continue;
    if (run.days === md) out.push({ d, kind: 'phase', type: run.type, v });
    if (run.days >= md && !run.turned && Math.abs(v - run.ext) >= back) { run.turned = true; out.push({ d, kind: 'turn', type: run.type, v, ext: run.ext }); }
  }
  return out;
}
// Auslöser: entry = beim Eintritt (Phase am 3. Tag + Wende), exit = beim Austritt aus der Zone, both = alles
export const trig = (sig, t = 'entry') => sig.filter(s => s.kind === 'peak' || (t === 'both') || (t === 'exit' ? s.kind === 'exit' : s.kind !== 'exit'));
// Extremphasen (für die Punkte im Chart): mindestens 3 Tage, Spitze = extremster Wert
export function phaseRuns(rows, hi, lo) {
  const out = []; let cur = null;
  for (const [d, v] of rows) {
    const type = v == null ? null : v >= hi ? 'xgreed' : v <= lo ? 'xfear' : null;
    if (type && cur && cur.type === type) { cur.to = d; cur.days++; if (type === 'xfear' ? v < cur.peak : v > cur.peak) { cur.peak = v; cur.peakDay = d; } }
    else { if (cur && cur.days >= 3) out.push(cur); cur = type ? { type, from: d, to: d, days: 1, peak: v, peakDay: d } : null; }
  }
  if (cur && cur.days >= 3) out.push({ ...cur, ongoing: cur.to === rows.at(-1)?.[0] });
  return out;
}
// 7-Tage-Mittel einer Spalte (offizieller Index), wie im Video
export function mean7(H, col) {
  const rows = H.filter(r => r[col] != null);
  return rows.map((r, i) => { const w = []; for (let j = Math.max(0, i - 6); j <= i; j++) w.push(rows[j][col]); return [r[0], w.length >= 3 ? Math.round(w.reduce((a, b) => a + b) / w.length) : null, r[3]]; });
}

/* ---------- Pivots: höchstes Hoch und tiefstes Tief (danach oder im ganzen Zeitraum) ---------- */
// Zeiträume in Tagen (Schlüssel wie im Chart-Knopf): 7T, 1M, 3M, 6M, 12M, gesamt
export const PV_DAYS = { '7': 7, '30': 30, '91': 91, '182': 182, '365': 365, all: 99999 };
export const PV_ORDER = ['7', '30', '91', '182', '365', 'all'];
// rows = Verlaufszeilen mit Kurs; lowMode 'after' = tiefstes Tief nach dem höchsten Hoch (gibt es danach keins: tiefstes Tief im Zeitraum), 'range' = tiefstes Tief im ganzen Zeitraum
// V16: mode 'range' = höchstes Hoch und tiefstes Tief im Zeitraum (Standard), 'after' = Tief nach dem höchsten Hoch,
// 'afterLow' = Hoch nach dem tiefsten Tief; gibt es danach (noch) keins, gilt das Extrem im ganzen Zeitraum
export function pivotOf(rows, mode = 'range') {
  let iH = -1, vH = -Infinity, iL = -1, vL = Infinity;
  const scanH = from => { iH = -1; vH = -Infinity; rows.forEach((r, k) => { if (k < from) return; const v = r[10] ?? r[3]; if (v != null && v > vH) { vH = v; iH = k; } }); };
  const scanL = from => { iL = -1; vL = Infinity; rows.forEach((r, k) => { if (k < from) return; const v = r[11] ?? r[3]; if (v != null && v < vL) { vL = v; iL = k; } }); };
  let hiAfter = null, loAfter = null;
  if (mode === 'afterLow') { scanL(0); scanH(iL + 1); if (iH < 0) scanH(0); else hiAfter = rows[iL][0]; }
  else { scanH(0); scanL(mode === 'after' ? iH + 1 : 0); if (iL < 0) scanL(0); else if (mode === 'after') loAfter = rows[iH][0]; }
  return { iH, iL, hi: iH >= 0 ? { p: vH, d: rows[iH][0], after: hiAfter } : null, lo: iL >= 0 ? { p: vL, d: rows[iL][0], after: loAfter } : null };
}
// Alarm-Stufen: nur abgeschlossene Tage (vor "today"), damit ein Bruch nicht sofort das Tief mitverschiebt
export function pivotAlarmLevels(H, per, lowMode, today) {
  const px = H.filter(r => r[3] != null && r[0] < today), rows = px.slice(-(PV_DAYS[per] ?? 91));
  return rows.length >= 3 ? pivotOf(rows, lowMode) : null;
}
// Rückblick: Wie oft wurde das Pivot-Tief (-Hoch) dieses Zeitraums unterschritten (überschritten), und was passierte danach?
// back = Kurs schließt innerhalb von 7 Tagen wieder auf der anderen Seite (Fehlausbruch / Sweep); ch30 = Kurs 30 Tage später gegenüber der Stufe
export function pivotStats(H, per, side, lowMode = 'range', o = {}) {
  const px = H.filter(r => r[3] != null), n = PV_DAYS[per] ?? 91, win = o.win ?? 7, gap = o.gap ?? 7, ev = [];
  let last = -1e9;
  for (let i = Math.min(n, 30); i < px.length; i++) {
    if (i - last < gap) continue;
    const pv = pivotOf(px.slice(Math.max(0, i - n), i), lowMode), lv = side === 'lo' ? pv.lo : pv.hi; if (!lv) continue;
    const r = px[i], hit = side === 'lo' ? (r[11] ?? r[3]) < lv.p : (r[10] ?? r[3]) > lv.p; if (!hit) continue;
    last = i;
    if (i + win >= px.length) continue;                          // noch zu frisch für eine Auswertung
    let back = false; for (let k = i; k <= i + win; k++) if (side === 'lo' ? px[k][3] > lv.p : px[k][3] < lv.p) { back = true; break; }
    const c30 = px[i + 30]?.[3];
    ev.push({ d: r[0], p: lv.p, back, ch30: c30 ? (c30 / lv.p - 1) * 100 : null });
  }
  const w30 = ev.filter(e => e.ch30 != null);
  return { n: ev.length, back: ev.filter(e => e.back).length, n30: w30.length, up30: w30.filter(e => e.ch30 > 0).length,
    avg30: w30.length ? w30.reduce((a, e) => a + e.ch30, 0) / w30.length : null, from: px[0]?.[0] };
}
// Pivot-Alarme: Tief unterschritten / Hoch überschritten / Annäherung (± nearPct). pa = { per: ['91', …], lo, hi, near, nearPct, low }
export function pivotEvents(H, price, pa, today) {
  const out = []; if (!(price > 0) || !pa?.per?.length) return out;
  const L = {}; for (const k of PV_ORDER) L[k] = pivotAlarmLevels(H, k, pa.low, today);
  for (const side of ['lo', 'hi']) {
    if (!pa[side]) continue;
    const brk = [], near = [];
    for (const per of PV_ORDER.filter(k => pa.per.includes(k))) {
      const x = L[per]?.[side]; if (!x) continue;
      const crossed = side === 'lo' ? price < x.p : price > x.p, dist = Math.abs(price / x.p - 1) * 100;
      if (crossed) brk.push({ per, lvl: x }); else if (pa.near && dist <= (pa.nearPct ?? 1)) near.push({ per, lvl: x, dist });
    }
    const beyond = PV_ORDER.map(per => ({ per, ...(L[per]?.[side] || {}) })).filter(v => v.p && (side === 'lo' ? v.p < price : v.p > price))
      .sort((a, b) => side === 'lo' ? b.p - a.p : a.p - b.p);
    const key = (ev, list) => `pv:${side}:${ev}:${list.map(x => x.per + '@' + Math.round(x.lvl.p)).join(',')}`;
    if (brk.length) out.push({ side, ev: 'break', list: brk, next: beyond[0] || null, key: key('break', brk) });
    if (near.length) out.push({ side, ev: 'near', list: near, next: null, key: key('near', near) });
  }
  return out;
}
// fertige Daten für den Alarm-Text: Rückblick für den längsten betroffenen Zeitraum, nächster Cluster in Bruch-Richtung
export function pivotPayload(H, e, CL, price, lowMode) {
  const main = e.list.at(-1), st = pivotStats(H, main.per, e.side, lowMode);
  const cl = e.ev === 'break' && CL?.length ? nextCluster(CL, price, e.side === 'hi') : null;
  return { ...e, main, st, cl };
}

/* ---------- 50er-Linie im Index: Bounce, Ablehnung, Durchbruch, Retest, Fehlausbruch ---------- */
// rows: [{d, v}] tägliche Index-Werte. Zone um die 50: Long-Seite 50 + zL, Short-Seite 50 − zS; Bestätigung = Rücklauf um conf Punkte.
// Signale erscheinen am Bestätigungstag und wandern nicht mehr. up = Long-Signal.
export const F50_TYPES = ['bounce', 'reject', 'brkUp', 'brkDn', 'retL', 'retS', 'failUp', 'failDn'];
export function fiftySignals(rows, o = {}) {
  const L = o.level ?? 50, zL = o.zoneL ?? 3, cL = o.confL ?? 3, zS = o.zoneS ?? 3, cS = o.confS ?? 3, N = o.retestDays ?? 20, out = [];
  let side = 0, lastBrk = null, touch = null;
  const push = (i, type, up) => out.push({ d: rows[i].d, i, v: rows[i].v, type, up, kind: 'f50' });
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].v; if (v == null) continue;
    const above = v > L + zL, below = v < L - zS;
    if (!side) { side = above ? 1 : below ? -1 : 0; continue; }
    if (!above && !below) {                                                     // in der Zone
      if (!touch) touch = { from: side, ext: v }; else touch.ext = side > 0 ? Math.min(touch.ext, v) : Math.max(touch.ext, v);
      if (touch.done) continue;
      const rec = lastBrk && i - lastBrk.i <= N;
      if (touch.from > 0 && v >= touch.ext + cL && v > L) { push(i, rec && lastBrk.dir > 0 ? 'retL' : 'bounce', true); touch.done = true; }
      else if (touch.from < 0 && v <= touch.ext - cS && v < L) { push(i, rec && lastBrk.dir < 0 ? 'retS' : 'reject', false); touch.done = true; }
      continue;
    }
    const now = above ? 1 : -1;
    if (now === side) {                                                         // zurück auf dieselbe Seite = Bounce/Ablehnung bestätigt
      if (touch && !touch.done) { const rec = lastBrk && i - lastBrk.i <= N; if (now > 0) push(i, rec && lastBrk.dir > 0 ? 'retL' : 'bounce', true); else push(i, rec && lastBrk.dir < 0 ? 'retS' : 'reject', false); }
      touch = null; continue;
    }
    const fail = lastBrk && lastBrk.dir === -now && i - lastBrk.i <= N;          // Seitenwechsel: Durchbruch oder gescheiterter Durchbruch
    push(i, fail ? (now > 0 ? 'failDn' : 'failUp') : (now > 0 ? 'brkUp' : 'brkDn'), now > 0);
    lastBrk = { dir: now, i }; side = now; touch = null;
  }
  return out;
}

/* ---------- V17: Kerzenmuster (Tageskerzen), nur wenn der Index im Extrem ist ---------- */
// Bullische Muster zählen nur, wenn der Index am Tag der Kerze (oder bis „look“ Tage davor) auf/unter „lo“ war, bärische auf/über „hi“.
// Index: o.ours / o.off = Map Datum → Wert (7-Tage-Mittel wie im Chart); o.src = 'ours' | 'off' | 'both' (beide im Extrem) | 'either' (einer reicht).
// Nur geschlossene Kerzen (o.today = heutiges Datum, diese Kerze läuft noch) – das Signal erscheint am Kerzentag und wandert nicht mehr.
export const CDL_TYPES = ['hammer', 'invHammer', 'engBull', 'piercing', 'morning', 'shooting', 'hanging', 'engBear', 'darkCloud', 'evening'];
export const CDL_BULL = ['hammer', 'invHammer', 'engBull', 'piercing', 'morning'];
export const CDL_S = { hammer: 'H', invHammer: 'iH', engBull: 'E↑', piercing: 'PL', morning: 'MS', shooting: 'SS', hanging: 'HM', engBear: 'E↓', darkCloud: 'DC', evening: 'ES' };
export const CDL_N = {
  de: { hammer: 'Hammer', invHammer: 'Umgekehrter Hammer', engBull: 'Bullisches Engulfing', piercing: 'Piercing Line', morning: 'Morning Star', shooting: 'Shooting Star', hanging: 'Hanging Man', engBear: 'Bärisches Engulfing', darkCloud: 'Dark Cloud Cover', evening: 'Evening Star' },
  en: { hammer: 'Hammer', invHammer: 'Inverted hammer', engBull: 'Bullish engulfing', piercing: 'Piercing line', morning: 'Morning star', shooting: 'Shooting star', hanging: 'Hanging man', engBear: 'Bearish engulfing', darkCloud: 'Dark cloud cover', evening: 'Evening star' },
  ar: { hammer: 'المطرقة', invHammer: 'المطرقة المقلوبة', engBull: 'الابتلاع الصاعد', piercing: 'خط الاختراق', morning: 'نجمة الصباح', shooting: 'الشهاب', hanging: 'الرجل المشنوق', engBear: 'الابتلاع الهابط', darkCloud: 'الغطاء السحابي المظلم', evening: 'نجمة المساء' } };
const CDL_TEST = (() => {
  const O = r => r[9], C = r => r[3], Hh = r => r[10], Ll = r => r[11];
  const body = r => Math.abs(C(r) - O(r)), rng = r => Hh(r) - Ll(r), up = r => C(r) > O(r), dn = r => C(r) < O(r);
  const upW = r => Hh(r) - Math.max(O(r), C(r)), loW = r => Math.min(O(r), C(r)) - Ll(r);
  return {
    // Hammer: kleiner Körper oben, unterer Docht mind. 2× Körper, kaum oberer Docht
    hammer: (a, b, c) => rng(c) > 0 && loW(c) >= 2 * body(c) && upW(c) <= .35 * rng(c) && body(c) <= .35 * rng(c),
    invHammer: (a, b, c) => rng(c) > 0 && upW(c) >= 2 * body(c) && loW(c) <= .15 * rng(c) && body(c) <= .35 * rng(c),
    // Engulfing: Körper der neuen Kerze umschließt den Körper der Vortageskerze (Gegenfarbe)
    engBull: (a, b, c) => dn(b) && up(c) && C(c) > O(b) && O(c) <= C(b) * 1.001 && body(c) > body(b),
    piercing: (a, b, c) => dn(b) && up(c) && body(b) > .5 * rng(b) && C(c) > (O(b) + C(b)) / 2 && C(c) < O(b),
    morning: (a, b, c) => dn(a) && body(a) > .5 * rng(a) && body(b) < .3 * body(a) && up(c) && C(c) > (O(a) + C(a)) / 2,
    shooting: (a, b, c) => rng(c) > 0 && upW(c) >= 2 * body(c) && loW(c) <= .35 * rng(c) && body(c) <= .35 * rng(c),
    hanging: (a, b, c) => rng(c) > 0 && loW(c) >= 2 * body(c) && upW(c) <= .15 * rng(c) && body(c) <= .35 * rng(c),
    engBear: (a, b, c) => up(b) && dn(c) && C(c) < O(b) && O(c) >= C(b) * .999 && body(c) > body(b),
    darkCloud: (a, b, c) => up(b) && dn(c) && body(b) > .5 * rng(b) && C(c) < (O(b) + C(b)) / 2 && C(c) > O(b),
    evening: (a, b, c) => up(a) && body(a) > .5 * rng(a) && body(b) < .3 * body(a) && dn(c) && C(c) < (O(a) + C(a)) / 2 };
})();
export function candleSignals(H, o = {}) {
  const lo = o.lo ?? 30, hi = o.hi ?? 70, look = o.look ?? 3, src = o.src || 'ours', A = o.ours || new Map(), B = o.off || new Map(), out = [];
  const rows = H.filter(r => r[3] != null && r[9] != null && r[10] != null && r[11] != null && (!o.today || r[0] < o.today));
  const hit = (M, i, bull) => { for (let k = 0; k <= look; k++) { const r = rows[i - k]; if (!r) break; const v = M.get(r[0]); if (v != null && (bull ? v <= lo : v >= hi)) return true; } return false; };
  const zone = (i, bull) => src === 'off' ? hit(B, i, bull) : src === 'both' ? hit(A, i, bull) && hit(B, i, bull) : src === 'either' ? hit(A, i, bull) || hit(B, i, bull) : hit(A, i, bull);
  for (let i = 2; i < rows.length; i++) {
    const zb = zone(i, true), zs = zone(i, false); if (!zb && !zs) continue;
    for (const type of CDL_TYPES) {
      const bull = CDL_BULL.includes(type); if (bull ? !zb : !zs) continue;
      if (CDL_TEST[type](rows[i - 2], rows[i - 1], rows[i])) out.push({ d: rows[i][0], i, type, up: bull, kind: 'cdl', zl: bull ? lo : hi, look, v: A.get(rows[i][0]) ?? null, vo: B.get(rows[i][0]) ?? null, h: rows[i][10], l: rows[i][11] });
    }
  }
  return out;
}

/* ---------- Trendfilter (für Kauf-Signale) ---------- */
// Je Tag: Kurs unter EMA(n), starker Abwärtstrend laut ADX(14) (ADX > adxMin und -DI > +DI), MACD auf Wochenbasis negativ und unter Signal
export function trendInfo(H, o = {}) {
  const px = H.filter(r => r[3] != null), C = px.map(r => r[3]), Hh = px.map(r => r[10] ?? r[3]), Ll = px.map(r => r[11] ?? r[3]), map = new Map();
  if (!px.length) return map;
  const ema = (a, n) => { const k = 2 / (n + 1), out = []; let e = a[0]; a.forEach((v, i) => { e = i ? v * k + e * (1 - k) : v; out.push(e); }); return out; };
  const rma = (a, n) => { const out = []; let m = 0; a.forEach((v, i) => { m = i < n ? (m * i + v) / (i + 1) : (m * (n - 1) + v) / n; out.push(m); }); return out; };
  const tr = [], pdm = [], mdm = [];
  for (let i = 0; i < C.length; i++) {
    if (!i) { tr.push(Hh[0] - Ll[0]); pdm.push(0); mdm.push(0); continue; }
    const up = Hh[i] - Hh[i - 1], dn = Ll[i - 1] - Ll[i];
    tr.push(Math.max(Hh[i] - Ll[i], Math.abs(Hh[i] - C[i - 1]), Math.abs(Ll[i] - C[i - 1]))); pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  const atr = rma(tr, 14), pdi = rma(pdm, 14).map((v, i) => 100 * v / (atr[i] || 1)), mdi = rma(mdm, 14).map((v, i) => 100 * v / (atr[i] || 1));
  const adx = rma(pdi.map((p, i) => 100 * Math.abs(p - mdi[i]) / ((p + mdi[i]) || 1)), 14);
  const e = ema(C, o.emaN ?? 200), m12 = ema(C, 84), m26 = ema(C, 182), m = m12.map((v, i) => v - m26[i]), sig = ema(m, 63);
  // je Tag: Abwärtstrend (ema/adx/macd) und – für Verkaufs-Signale – Aufwärtstrend (emaUp/adxUp/macdUp)
  px.forEach((r, i) => map.set(r[0], { ema: C[i] < e[i], adx: adx[i] > (o.adxMin ?? 25) && mdi[i] > pdi[i], macd: m[i] < 0 && m[i] < sig[i],
    emaUp: C[i] > e[i], adxUp: adx[i] > (o.adxMin ?? 25) && pdi[i] > mdi[i], macdUp: m[i] > 0 && m[i] > sig[i], e: e[i], adxV: adx[i] }));
  return map;
}
// f = { basis: ['ema','adx','macd'], mode: 'off' | 'mark' | 'hide' } – ein Indikator reicht, um „gegen den Trend“ zu sein
export function applyTrend(sig, info, f) {
  if (!f || !info || f.mode === 'off' || !f.basis?.length) return sig;
  const out = [];
  for (const x of sig) {
    // f.sides: 'both' (Standard) / 'buy' / 'sell' – Kauf gegen Abwärtstrend, Verkauf gegen Aufwärtstrend
    const t = info.get(x.d), sides = f.sides || 'both', buy = x.type === 'fear' || (x.kind === 'cdl' && x.up), sell = x.type === 'greed' || (x.kind === 'cdl' && !x.up);
    const keys = !t ? [] : buy && sides !== 'sell' ? f.basis.filter(b => t[b]) : sell && sides !== 'buy' ? f.basis.filter(b => t[b + 'Up']) : [];
    if (keys.length && f.mode === 'hide') continue;
    out.push(keys.length ? { ...x, against: keys } : x);
  }
  return out;
}

/* ---------- Signal-Methoden ---------- */
// std = 7-Tage-Mittel (wie bisher) · daily = Tageswert (schneller) · both = 90 UND 365 Tage extrem (weniger Fehlsignale)
// peak = Extrempunkt (siehe peakSignals)
// price = Standard, aber nur wenn der Kurs nahe am 30-Tage-Hoch (Gier) bzw. -Tief (Angst) ist
export const METHODS = ['std', 'daily', 'both', 'price', 'peak'];
export function methodSignals(H, method, o) {
  const { col, rawCol, colA, colB, hi, lo, back = 5 } = o;
  if (method === 'peak') return applyTrend(peakSignals(divRows(H, col), o.peak || {}), o.trendInfo, o.trend);
  const T = o.trigger || 'entry';
  let rows;
  if (method === 'daily') rows = H.filter(r => r[rawCol] != null).map(r => [r[0], r[rawCol], r[3]]);
  else if (method === 'both') rows = H.filter(r => r[colA] != null && r[colB] != null).map(r => {
    const a = r[colA], b = r[colB];
    const v = a >= hi && b >= hi ? Math.min(a, b) : a <= lo && b <= lo ? Math.max(a, b) : sClamp(Math.round((a + b) / 2), lo + 1, hi - 1);
    return [r[0], v, r[3]];
  });
  else rows = H.filter(r => r[col] != null).map(r => [r[0], r[col], r[3]]);
  let sig = trig(phaseSignals(rows, hi, lo, back, { minDays: o.minDays, tol: o.tol }), T);
  if (method === 'price') {
    const px = H.filter(r => r[3] != null), idx = new Map(px.map((r, i) => [r[0], i]));
    sig = sig.filter(s => {
      const i = idx.get(s.d); if (i == null) return false;
      const win = px.slice(Math.max(0, i - 30), i + 1).map(r => r[3]), p = px[i][3];
      return s.type === 'greed' ? p >= Math.max(...win) * (1 - (o.tol ?? 4) / 100) : p <= Math.min(...win) * (1 + (o.tol ?? 4) / 100);
    });
  }
  return applyTrend(sig, o.trendInfo, o.trend);
}

// Extrempunkt: Index bildet ein bestätigtes Hoch (≥ hi) bzw. Tief (≤ lo) und der Kurs steht nahe seinem 60-Tage-Hoch/-Tief.
// Erkennt mehr Tops/Böden, liefert aber auch mehr Fehlsignale (siehe Auswertung). rows wie divRows: [d, v, tief, hoch, schluss]
export function peakSignals(rows, o = {}) {
  const L = o.left ?? 5, R = o.right ?? 5, hi = o.hi ?? 65, lo = o.lo ?? 35, n = o.n ?? 60, tol = o.tol ?? 10, v = rows.map(r => r[1]), out = [];
  for (let i = L; i < rows.length - R; i++) {
    let isH = true, isL = true;
    for (let j = i - L; j <= i + R; j++) { if (j === i) continue; if (v[j] >= v[i] && (j < i || v[j] > v[i])) isH = false; if (v[j] <= v[i] && (j < i || v[j] < v[i])) isL = false; }
    const win = rows.slice(Math.max(0, i - n), i + 1), p = rows[i][4];
    if (isH && v[i] >= hi && p >= Math.max(...win.map(r => r[3])) * (1 - tol / 100)) out.push({ d: rows[i + R][0], kind: 'peak', type: 'greed', v: v[i], at: rows[i][0] });
    if (isL && v[i] <= lo && p <= Math.min(...win.map(r => r[2])) * (1 + tol / 100)) out.push({ d: rows[i + R][0], kind: 'peak', type: 'fear', v: v[i], at: rows[i][0] });
  }
  return out;
}

/* ---------- Divergenzen (wie RSI-Divergenz bei TradingView) ---------- */
// rows: [[datum, indexwert, tief, hoch]]. Ein Tief ist bestätigt, wenn "left" Tage davor und "right" Tage danach höher waren
// (beim Hoch: niedriger). Das Signal erscheint am Bestätigungstag (Tief + right Tage) und wandert danach nie mehr.
// bull = Kurs tieferes Tief, Index höheres Tief · bear = Kurs höheres Hoch, Index tieferes Hoch
// hbull/hbear = versteckte Divergenz (Trend-Fortsetzung)
export function divergences(rows, o = {}) {
  const L = o.left ?? 5, R = o.right ?? 5, minGap = o.minGap ?? 5, maxGap = o.maxGap ?? 60, out = [];
  const v = rows.map(r => r[1]);
  const isPiv = (i, low) => {
    if (v[i] == null) return false;
    for (let j = i - L; j < i; j++) if (j < 0 || v[j] == null || (low ? v[j] <= v[i] : v[j] >= v[i])) return false;
    for (let j = i + 1; j <= i + R; j++) if (j >= v.length || v[j] == null || (low ? v[j] < v[i] : v[j] > v[i])) return false;
    return true;
  };
  for (const low of [true, false]) {
    let prev = null;
    for (let i = L; i < v.length - R; i++) {
      if (!isPiv(i, low)) continue;
      const cur = { i, d: rows[i][0], v: v[i], p: low ? rows[i][2] : rows[i][3] };
      if (prev && cur.i - prev.i >= minGap && cur.i - prev.i <= maxGap && cur.p != null && prev.p != null) {
        let type = null;
        if (low) { if (cur.v > prev.v && cur.p < prev.p) type = 'bull'; else if (o.hidden && cur.v < prev.v && cur.p > prev.p) type = 'hbull'; }
        else { if (cur.v < prev.v && cur.p > prev.p) type = 'bear'; else if (o.hidden && cur.v > prev.v && cur.p < prev.p) type = 'hbear'; }
        const zoneOk = !o.zone || (low ? Math.min(prev.v, cur.v) <= 40 : Math.max(prev.v, cur.v) >= 60);
        if (type && zoneOk) out.push({ type, a: prev, b: cur, confI: i + R, conf: rows[i + R][0] });
      }
      prev = cur;
    }
  }
  return out.sort((x, y) => x.confI - y.confI);
}
export function divRows(H, col) { return H.filter(r => r[col] != null && r[3] != null).map(r => [r[0], r[col], r[11] ?? r[3], r[10] ?? r[3], r[3]]); }

/* ---------- Große Wendepunkte und Auswertung ---------- */
// Zickzack auf dem Tageskurs: Hoch/Tief, sobald der Kurs um "pct" % dreht
export function majorTurns(H, pct = 20) {
  const px = H.filter(r => r[3] != null), out = []; if (px.length < 3) return out;
  let dir = 0, hi = 0, lo = 0;
  for (let i = 1; i < px.length; i++) {
    const p = px[i][3];
    if (p >= px[hi][3]) hi = i; if (p <= px[lo][3]) lo = i;
    if (dir >= 0 && p <= px[hi][3] * (1 - pct / 100)) { if (dir === 1 || !out.length) out.push({ d: px[hi][0], t: 'top', p: px[hi][3] }); dir = -1; lo = i; }
    else if (dir <= 0 && p >= px[lo][3] * (1 + pct / 100)) { if (dir === -1 || !out.length) out.push({ d: px[lo][0], t: 'bottom', p: px[lo][3] }); dir = 1; hi = i; }
  }
  return out;
}
// sig: [{d, up: true = Kauf-Signal (Kurs sollte steigen)}]
export function evalSignals(sig, H, turns, win = 14, from = null) {
  const px = new Map(H.filter(r => r[3] != null).map(r => [r[0], r[3]]));
  const fwd = (d, n) => { const a = px.get(d), b = px.get(sDay(d, n)); return a && b ? (b / a - 1) * 100 : null; };
  const res = { n: sig.length, buy: 0, sell: 0, ok30: 0, n30: 0, avg30: 0, okB: 0, nB: 0, okS: 0, nS: 0, tops: 0, bottoms: 0, nTops: 0, nBottoms: 0 };
  for (const s of sig) {
    s.up ? res.buy++ : res.sell++;
    const r = fwd(s.d, 30); if (r == null) continue;
    res.n30++; const g = s.up ? r : -r; res.avg30 += g; if (g > 0) res.ok30++;
    if (s.up) { res.nB++; if (g > 0) res.okB++; } else { res.nS++; if (g > 0) res.okS++; }
  }
  if (res.n30) res.avg30 /= res.n30;
  const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= win * 864e5;
  for (const t of turns) {
    if (from && t.d < from) continue;                       // nur Wendepunkte, für die es schon Index-Werte gab
    if (t.t === 'top') { res.nTops++; if (sig.some(s => !s.up && near(s.d, t.d))) res.tops++; }
    else { res.nBottoms++; if (sig.some(s => s.up && near(s.d, t.d))) res.bottoms++; }
  }
  return res;
}

/* ---------- Heatmap-Cluster ---------- */
// L1/S1 = stärkster Long-/Short-Cluster, L2/S2 = nächster, L3… = weitere starke Cluster (Anzahl einstellbar, mind. 1,5 % Abstand)
export function clusterSet(hm, o = {}) {
  const out = []; if (!hm) return out;
  for (const [side, top, near, list] of [['L', hm.longTop, hm.longNear, hm.longs], ['S', hm.shortTop, hm.shortNear, hm.shorts]]) {
    const taken = [];
    const inside = z => taken.some(t => z.p >= t.lo && z.p <= t.hi) || taken.some(t => Math.abs(z.p / t.p - 1) < (o.sep ?? 0.015));
    if (top) { out.push({ id: side + '1', side, kind: 'top', z: top }); taken.push(top); }
    if (o.nearest !== false && near && !inside(near)) { out.push({ id: side + '2', side, kind: 'near', z: near }); taken.push(near); }
    // LF/SF = weit entferntester starker Cluster: mind. far.pct % des Volumens des stärksten, höchstens far.range % vom Kurs entfernt
    if (o.far && top && hm.price) {
      const pr = hm.price, cand = (list || []).filter(z => z.usd >= top.usd * o.far.pct / 100 && Math.abs(z.p / pr - 1) * 100 <= o.far.range && !inside(z));
      const f = cand.sort((a, b) => Math.abs(b.p - pr) - Math.abs(a.p - pr))[0];
      if (f && Math.abs(f.p - pr) > Math.abs(top.p - pr)) { out.push({ id: side + 'F', side, kind: 'far', z: f }); taken.push(f); }
    }
    let n = 2, extras = 0;                                   // weitere Cluster heißen immer ab 3 (L2/S2 = nächster)
    for (const z of list || []) {
      if (extras >= (o.extra ?? 0)) break;
      if (inside(z)) continue;
      out.push({ id: side + (++n), side, kind: 'extra', z }); taken.push(z); extras++;
    }
  }
  return out;
}
// Liquiditäts-Einschätzung: Welche Seite liegt näher und dichter am Kurs? Longs (unten) vs. Shorts (oben).
// Zug je Cluster = Volumen / Abstand^1,5 – nahe, große Cluster ziehen stärker. q > 0,58 = eher zuerst nach unten, < 0,42 = eher zuerst nach oben.
export function liqBias(hm, price, within = 12) {
  if (!hm || !(price > 0)) return null;
  const stat = list => {
    const L = (list || []).filter(z => z && Math.abs(z.p / price - 1) * 100 <= within); if (!L.length) return null;
    const d = L.map(z => Math.abs(z.p / price - 1) * 100), ps = L.map(z => z.p);
    return { n: L.length, near: Math.min(...d), usd: L.reduce((s, z) => s + z.usd, 0), lo: Math.min(...ps), hi: Math.max(...ps), spread: (Math.max(...ps) - Math.min(...ps)) / price * 100, pull: L.reduce((s, z, i) => s + z.usd / Math.max(0.3, d[i]) ** 1.5, 0) };
  };
  const L = stat(hm.longs?.length ? hm.longs : [hm.longTop, hm.longNear]), S = stat(hm.shorts?.length ? hm.shorts : [hm.shortTop, hm.shortNear]);
  if (!L || !S) return null;
  const q = L.pull / (L.pull + S.pull);
  return { L, S, q, first: q > 0.58 ? 'down' : q < 0.42 ? 'up' : 'both' };
}
// Cluster angelaufen → Reaktion (Kurs entfernt sich um react % in Gegenrichtung) oder Durchbruch (Kurs läuft brk % über den Cluster hinaus).
// st = gemerkter Zustand (bleibt erhalten, auch wenn der Cluster nach dem Abholen aus der Heatmap verschwindet)
export function touchTrack(st, list, price, h, now = Date.now()) {
  const T = (st.t ||= {}), ev = [];
  if (!(price > 0)) return ev;
  for (const c of list) {
    if (c.kind === 'extra' && !h.alarmExtra) continue;
    const z = c.z, key = c.id + ':' + z.p;
    if (!T[key] && (c.side === 'L' ? price <= z.hi : price >= z.lo)) { T[key] = { id: c.id, side: c.side, kind: c.kind, p: z.p, lo: z.lo, hi: z.hi, usd: z.usd, t: now, ext: price }; ev.push({ kind: 'touch', x: T[key] }); }
  }
  for (const [key, x] of Object.entries(T)) {
    if (now - x.t > (h.reactH ?? 24) * 3600e3) { delete T[key]; continue; }
    x.ext = x.side === 'L' ? Math.min(x.ext, price) : Math.max(x.ext, price);
    const brk = x.side === 'L' ? price <= x.p * (1 - (h.brk ?? 1) / 100) : price >= x.p * (1 + (h.brk ?? 1) / 100);
    const react = x.side === 'L' ? price >= x.ext * (1 + (h.react ?? 1) / 100) : price <= x.ext * (1 - (h.react ?? 1) / 100);
    if (brk && !x.brk) { x.brk = now; ev.push({ kind: 'break', x }); }
    else if (react && !x.react && !x.brk) { x.react = now; ev.push({ kind: 'react', x }); }
  }
  return ev;
}
// nächster Cluster in Bewegungsrichtung (für die Meldung)
export function nextCluster(list, price, up, skipP) {
  return list.filter(x => x.z.p !== skipP && (up ? x.z.p > price : x.z.p < price)).sort((a, b) => up ? a.z.p - b.z.p : b.z.p - a.z.p)[0] || null;
}
export const alarmLevel = (c, pct) => c.side === 'L' ? c.z.p * (1 + pct / 100) : c.z.p * (1 - pct / 100);
// Ereignisse: Annäherung (X % davor), Zone erreicht (Kante), Cluster/POC erreicht
export function heatEvents(list, price, h) {
  const out = []; if (!(price > 0)) return out;
  for (const c of list) {
    if (c.kind === 'extra' && !h.alarmExtra) continue;
    const z = c.z, lvl = alarmLevel(c, h.pct);
    if (h.poc && (c.side === 'L' ? price <= z.p : price >= z.p)) out.push({ c, ev: 'poc', lvl });
    else if (h.zone && price >= z.lo && price <= z.hi) out.push({ c, ev: 'zone', lvl });
    else if (h.approach && (c.side === 'L' ? price <= lvl && price > z.p : price >= lvl && price < z.p)) out.push({ c, ev: 'approach', lvl });
  }
  return out;
}

/* ---------- Alarm-Texte (Browser + Telegram) ---------- */
const nf = (n, lang) => n == null ? '–' : Math.round(n).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') + ' $';
const PVN = {
  de: { '7': '7 Tage', '30': '1 Monat', '91': '3 Monate', '182': '6 Monate', '365': '12 Monate', all: 'gesamter Verlauf' },
  en: { '7': '7 days', '30': '1 month', '91': '3 months', '182': '6 months', '365': '12 months', all: 'all-time' },
  ar: { '7': '7 أيام', '30': 'شهر', '91': '3 أشهر', '182': '6 أشهر', '365': '12 شهراً', all: 'كامل السجل' } };
export const PVS = {
  de: { '7': '7T', '30': '1M', '91': '3M', '182': '6M', '365': '12M', all: 'Alles' },
  en: { '7': '7D', '30': '1M', '91': '3M', '182': '6M', '365': '12M', all: 'All' },
  ar: { '7': '7ي', '30': '1ش', '91': '3ش', '182': '6ش', '365': '12ش', all: 'الكل' } };
const dmyS = d => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '';
const F50N = {
  de: { bounce: 'Bounce an der 50', reject: 'Ablehnung an der 50', brkUp: 'Durchbruch über 50', brkDn: 'Durchbruch unter 50', retL: 'Retest der 50 hält (Long)', retS: 'Retest der 50 hält (Short)', failUp: 'Fehlausbruch über 50 (Bullenfalle)', failDn: 'Fehlausbruch unter 50 (Bärenfalle)' },
  en: { bounce: 'Bounce at 50', reject: 'Rejection at 50', brkUp: 'Break above 50', brkDn: 'Break below 50', retL: '50 retest holds (long)', retS: '50 retest holds (short)', failUp: 'False break above 50 (bull trap)', failDn: 'False break below 50 (bear trap)' },
  ar: { bounce: 'ارتداد عند 50', reject: 'رفض عند 50', brkUp: 'اختراق فوق 50', brkDn: 'كسر تحت 50', retL: 'إعادة اختبار 50 صامدة (لونغ)', retS: 'إعادة اختبار 50 صامدة (شورت)', failUp: 'اختراق كاذب فوق 50 (فخ الثيران)', failDn: 'كسر كاذب تحت 50 (فخ الدببة)' } };
export const F50S = { bounce: 'B', reject: 'A', brkUp: 'D↑', brkDn: 'D↓', retL: 'R↑', retS: 'R↓', failUp: 'F↑', failDn: 'F↓' };
function f50Text(x, lang, tail, na) {
  const nm = (F50N[lang] || F50N.de)[x.type], up = x.up, de = lang === 'de', ar = lang === 'ar';
  const title = `${up ? '🟢' : '🔴'} ${nm} · ${ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short'}`;
  const body = ar ? `المؤشر (متوسط 7 أيام) عند ${x.v} – تأكيد يوم ${dmyS(x.d)}.` : de ? `Index (7-Tage-Mittel) bei ${x.v} – bestätigt am ${dmyS(x.d)}.` : `Index (7-day average) at ${x.v} – confirmed on ${dmyS(x.d)}.`;
  return { title, body: body + tail + na };
}
function cdlText(x, lang, tail, na) {
  const nm = (CDL_N[lang] || CDL_N.de)[x.type], up = x.up, de = lang === 'de', ar = lang === 'ar', P = n => nf(n, lang);
  const iv = [x.v != null ? (ar ? `مؤشرنا ${x.v}` : de ? `unser Index ${x.v}` : `our index ${x.v}`) : '', x.vo != null ? (ar ? `الرسمي ${x.vo}` : de ? `offiziell ${x.vo}` : `official ${x.vo}`) : ''].filter(Boolean).join(' · ');
  const title = `${up ? '🟢' : '🔴'} ${ar ? 'نموذج شموع' : de ? 'Kerzenmuster' : 'Candle pattern'}: ${nm} · ${ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short'}`;
  const zoneTxt = ar ? (up ? 'خوف شديد' : 'طمع شديد') : de ? (up ? 'Angst-Extrem' : 'Gier-Extrem') : (up ? 'extreme fear' : 'extreme greed');
  const conf = up ? P(x.h) : P(x.l), lim = (up ? '≤ ' : '≥ ') + (x.zl ?? (up ? 30 : 70)), lk = x.look ?? 3;
  const body = ar ? `أُغلقت الشمعة اليومية ليوم ${dmyS(x.d)}: ${nm}. المؤشر في ${zoneTxt} (${lim}) في يوم الشمعة أو حتى ${lk} أيام قبله – يوم الشمعة: ${iv}.\nالتأكيد: إغلاق الشمعة التالية ${up ? 'فوق قمة' : 'تحت قاع'} شمعة النموذج (${conf}).`
    : de ? `Tageskerze vom ${dmyS(x.d)} geschlossen: ${nm}. Index im ${zoneTxt} (${lim}) am Kerzentag oder bis ${lk} Tage davor – am Kerzentag: ${iv}.\nBestätigung: nächste Kerze schließt ${up ? 'über dem Hoch' : 'unter dem Tief'} der Musterkerze (${conf}).`
    : `Daily candle of ${dmyS(x.d)} closed: ${nm}. Index in ${zoneTxt} (${lim}) on the candle day or up to ${lk} days before – on the candle day: ${iv}.\nConfirmation: next candle closes ${up ? 'above the high' : 'below the low'} of the pattern candle (${conf}).`;
  return { title, body: body + tail + na };
}
function pivotText(x, lang, P, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', lo = x.side === 'lo', m = x.main, st = x.st, pers = x.list.map(v => PVS[lang][v.per]).join(' · ');
  const pc = v => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', de ? ',' : '.') + ' %', dist = x.list[0].dist;
  const lvTxt = `${P(m.lvl.p)} (${dmyS(m.lvl.d)})`, aft = m.lvl.after ? (ar ? (lo ? `، بعد القمة في ${dmyS(m.lvl.after)}` : `، بعد القاع في ${dmyS(m.lvl.after)}`) : de ? (lo ? `, nach dem Hoch vom ${dmyS(m.lvl.after)}` : `, nach dem Tief vom ${dmyS(m.lvl.after)}`) : (lo ? `, after the high of ${dmyS(m.lvl.after)}` : `, after the low of ${dmyS(m.lvl.after)}`)) : '', nm = PVN[lang][m.per] + aft;
  // Einordnung aus dem Rückblick: ab 60 % Rückkehr = meist Fehlausbruch, bis 40 % = meist Fortsetzung, dazwischen gemischt
  const q = st?.n >= 5 ? st.back / st.n : null, ein = q == null ? '' : q >= .6 ? 'sweep' : q <= .4 ? 'cont' : 'mix';
  let title, body;
  if (ar) {
    title = x.ev === 'break' ? `${lo ? '📉 كسر قاع البيفوت' : '📈 اختراق قمة البيفوت'} · ${pers}` : `🔔 ${lo ? 'قاع' : 'قمة'} البيفوت ${pers}: على بعد ${dist.toFixed(1)} % فقط`;
    body = x.ev === 'break' ? `${lo ? 'تم كسر أدنى قاع' : 'تم اختراق أعلى قمة'} (${nm}) عند ${lvTxt} – السعر الآن ${P(x.price)}.` : `السعر ${P(x.price)} على بعد ${dist.toFixed(1)} % فقط من ${lo ? 'أدنى قاع' : 'أعلى قمة'} (${nm}) ${lvTxt}.`;
    if (st?.n) body += `\nسابقاً (منذ ${st.from?.slice(0, 4)}): في ${st.back} من ${st.n} حالة أغلق السعر خلال 7 أيام مرة أخرى ${lo ? 'فوق المستوى' : 'تحت المستوى'} (اختراق كاذب / سحب سيولة).` + (st.n30 ? ` بعد 30 يوماً كان السعر فوق المستوى في ${st.up30} من ${st.n30} (المتوسط ${pc(st.avg30)}).` : '');
    if (ein && x.ev === 'break') body += `\n<b>التقييم:</b> ${ein === 'sweep' ? `تاريخياً غالباً اختراق كاذب (${st.back} من ${st.n}) ← فرصة ${lo ? 'لونغ' : 'شورت'} على الأرجح، فقط بعد التأكيد` : ein === 'cont' ? `تاريخياً غالباً استمرار (${st.n - st.back} من ${st.n}) ← على الأرجح مزيد من ${lo ? 'الهبوط' : 'الصعود'}` : `تاريخياً مختلط (${st.back} من ${st.n} عادت)`}.`;
    if (x.ev === 'break') {
      body += lo ? `\nالسيناريو أ – سحب سيولة: يستعيد السعر القاع بسرعة ← لونغ فقط بعد التأكيد (إغلاق يومي فوق ${P(m.lvl.p)})، ووقف الخسارة تحت القاع الجديد.\nالسيناريو ب – كسر: يبقى السعر تحته` : `\nالسيناريو أ – سحب سيولة: يعود السعر تحت القمة بسرعة ← شورت فقط بعد التأكيد (إغلاق يومي تحت ${P(m.lvl.p)})، ووقف الخسارة فوق القمة الجديدة.\nالسيناريو ب – اختراق: يبقى السعر فوقها`;
      const tg = [x.next ? `${lo ? 'قاع' : 'قمة'} البيفوت ${PVS.ar[x.next.per]} ${P(x.next.p)}` : '', x.cl ? `تجمّع ${x.cl.id} ${P(x.cl.z.p)} (≈ ${Math.round(x.cl.z.usd / 1e6)} مليون $)` : ''].filter(Boolean).join(' · ');
      body += tg ? ` ← الهدف التالي: ${tg}.` : '.';
    } else body += `\nعند الكسر يصلك تنبيه منفصل.`;
    return { title, body: body + tail + na };
  }
  const T = (d, e) => de ? d : e;
  title = x.ev === 'break' ? `${lo ? T('📉 Pivot-Tief unterschritten', '📉 Pivot low broken') : T('📈 Pivot-Hoch überschritten', '📈 Pivot high broken')} · ${pers}`
    : `🔔 ${lo ? T('Pivot-Tief', 'Pivot low') : T('Pivot-Hoch', 'Pivot high')} ${pers}: ${T('nur noch', 'only')} ${dist.toFixed(1).replace('.', de ? ',' : '.')} % ${T('entfernt', 'away')}`;
  body = x.ev === 'break'
    ? T(`${lo ? 'Tiefstes Tief' : 'Höchstes Hoch'} (${nm}) bei ${lvTxt} ${lo ? 'unterschritten' : 'überschritten'} – Kurs jetzt ${P(x.price)}.`, `${lo ? 'Lowest low' : 'Highest high'} (${nm}) at ${lvTxt} ${lo ? 'broken to the downside' : 'broken to the upside'} – price now ${P(x.price)}.`)
    : T(`Kurs ${P(x.price)} ist nur noch ${dist.toFixed(1).replace('.', ',')} % vom ${lo ? 'tiefsten Tief' : 'höchsten Hoch'} (${nm}) ${lvTxt} entfernt.`, `Price ${P(x.price)} is only ${dist.toFixed(1)} % from the ${lo ? 'lowest low' : 'highest high'} (${nm}) ${lvTxt}.`);
  if (st?.n) body += T(`\nBisher (seit ${st.from?.slice(0, 4)}): In ${st.back} von ${st.n} Fällen schloss der Kurs innerhalb von 7 Tagen wieder ${lo ? 'darüber' : 'darunter'} (Fehlausbruch / Liquiditäts-Sweep), in ${st.n - st.back} lief er weiter.`
      + (st.n30 ? ` Nach 30 Tagen lag der Kurs in ${st.up30} von ${st.n30} Fällen über der Stufe (Ø ${pc(st.avg30)}).` : ''),
    `\nSo far (since ${st.from?.slice(0, 4)}): in ${st.back} of ${st.n} cases price closed back ${lo ? 'above' : 'below'} within 7 days (false break / liquidity sweep), in ${st.n - st.back} it kept going.`
      + (st.n30 ? ` After 30 days price was above the level in ${st.up30} of ${st.n30} cases (avg ${pc(st.avg30)}).` : ''));
  if (ein && x.ev === 'break') body += T(`\n<b>Einordnung:</b> ${ein === 'sweep' ? `historisch meist Fehlausbruch (${st.back} von ${st.n}) → eher ${lo ? 'Long' : 'Short'}-Chance, erst nach Bestätigung` : ein === 'cont' ? `historisch meist Fortsetzung (${st.n - st.back} von ${st.n}) → eher weiter ${lo ? 'abwärts' : 'aufwärts'}` : `historisch gemischt (${st.back} von ${st.n} zurück)`}.`,
    `\n<b>Assessment:</b> ${ein === 'sweep' ? `historically mostly a false break (${st.back} of ${st.n}) → rather a ${lo ? 'long' : 'short'} chance, only after confirmation` : ein === 'cont' ? `historically mostly continuation (${st.n - st.back} of ${st.n}) → rather further ${lo ? 'down' : 'up'}` : `historically mixed (${st.back} of ${st.n} came back)`}.`);
  if (x.ev === 'break') {
    body += lo ? T(`\nSzenario A – Sweep: Kurs holt das Tief schnell zurück → Long erst nach Bestätigung (Tagesschluss wieder über ${P(m.lvl.p)}), Stop unter dem neuen Tief.\nSzenario B – Ausbruch: Kurs bleibt darunter`, `\nScenario A – sweep: price quickly reclaims the low → long only after confirmation (daily close back above ${P(m.lvl.p)}), stop below the new low.\nScenario B – breakdown: price stays below`)
      : T(`\nSzenario A – Sweep: Kurs fällt schnell wieder unter das Hoch → Short erst nach Bestätigung (Tagesschluss wieder unter ${P(m.lvl.p)}), Stop über dem neuen Hoch.\nSzenario B – Ausbruch: Kurs bleibt darüber`, `\nScenario A – sweep: price quickly falls back below the high → short only after confirmation (daily close back below ${P(m.lvl.p)}), stop above the new high.\nScenario B – breakout: price stays above`);
    const tg = [x.next ? `${lo ? T('Pivot-Tief', 'pivot low') : T('Pivot-Hoch', 'pivot high')} ${PVS[lang][x.next.per]} ${P(x.next.p)}` : '', x.cl ? `${x.cl.side === 'L' ? 'Long' : 'Short'}-Cluster ${x.cl.id} ${P(x.cl.z.p)} (≈ ${Math.round(x.cl.z.usd / 1e6)} ${T('Mio.', 'M')} $)` : ''].filter(Boolean).join(' · ');
    body += tg ? T(` → nächstes Ziel: ${tg}.`, ` → next target: ${tg}.`) : '.';
  } else body += T('\nWird die Stufe gebrochen, kommt ein eigener Alarm.', '\nIf the level breaks you get a separate alert.');
  return { title, body: body + tail + na };
}
function alarmTextAr(kind, x) {
  const P = n => n == null ? '–' : Math.round(n).toLocaleString('en-US') + ' $', pc = v => (v > 0 ? '+' : '') + v.toFixed(1) + ' %';
  const tail = x.idx != null ? `\nالمؤشر الآن ${x.idx} (${x.zone}) · BTC ${P(x.price)}` : `\nBTC ${P(x.price)}`, na = '\n<i>سيناريوهات، ليست نصيحة استثمارية.</i>';
  if (kind === 'cluster') {
    const { c, ev, lvl, pct } = x, z = c.z, S = c.side === 'S', name = `${c.id} تجمّع ${S ? 'شورت' : 'لونغ'}`;
    const title = { approach: `🔔 ${name}: على بعد ${pct} % فقط`, zone: `🔔 ${name}: تم الوصول إلى المنطقة`, poc: `🎯 ${name}: تم الوصول إلى التجمّع` }[ev];
    const facts = `التجمّع ${P(z.p)} · المنطقة ${P(z.lo)} – ${P(z.hi)} · ≈ ${Math.round(z.usd / 1e6)} مليون $ · تنبيه من ${P(lvl)}`;
    const scen = S ? 'فوق السعر توجد تصفيات شورت كثيرة، وهذه المناطق تجذب السعر غالباً. السيناريو أ: تُلمس المنطقة ثم ارتداد للأسفل ← فرصة شورت بعد التأكيد. السيناريو ب: زخم قوي ← Short Squeeze ويستمر السعر بالصعود.'
      : 'تحت السعر توجد تصفيات لونغ كثيرة، وهذه المناطق تجذب السعر غالباً. السيناريو أ: تُلمس المنطقة ثم ارتداد للأعلى ← فرصة لونغ بعد التأكيد. السيناريو ب: سوق ضعيف ← سلسلة تصفيات ويستمر السعر بالهبوط.';
    return { title, body: `${facts}\n${scen}${tail}${na}` };
  }
  if (kind === 'react' || kind === 'break') {
    const c = x.x, next = x.next, L = c.side === 'L', name = `${c.id} تجمّع ${L ? 'لونغ' : 'شورت'}`, mio = Math.round(c.usd / 1e6), mv = (x.price / c.ext - 1) * 100, up = kind === 'react' ? L : !L;
    const tm = new Date(c.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const title = kind === 'react' ? `🎯 لمس ${name} (${mio} مليون $) ← رد فعل ${L ? 'للأعلى' : 'للأسفل'} ${pc(mv)}` : `⚠️ اختراق ${name} (${mio} مليون $) ← استمرار ${L ? 'للأسفل' : 'للأعلى'}`;
    const nx = next ? `التجمّع التالي ${up ? 'الأعلى' : 'الأدنى'}: ${next.id} ${P(next.z.p)} (${pc((next.z.p / x.price - 1) * 100)}، ≈ ${Math.round(next.z.usd / 1e6)} مليون $)` : 'لا يوجد تجمّع آخر قريب.';
    return { title, body: `تم لمس التجمّع ${P(c.p)} (المنطقة ${P(c.lo)} – ${P(c.hi)}) الساعة ${tm}، ثم ${L ? 'أدنى' : 'أعلى'} سعر ${P(c.ext)}.\n${nx}${tail}${na}` };
  }
  if (kind === 'pivot') return pivotText(x, 'ar', P, tail, na);
  if (kind === 'f50') return f50Text(x, 'ar', tail, na);
  if (kind === 'cdl') return cdlText(x, 'ar', tail, na);
  if (kind === 'line') { const up = x.dir > 0; return { title: `🔔 تم عبور خط التنبيه ${x.id} ${up ? 'للأعلى' : 'للأسفل'}`, body: `تم عبور الخط الخاص ${P(x.p)} ${up ? 'من الأسفل' : 'من الأعلى'}.${tail}` }; }
  if (kind === 'phase' || kind === 'turn' || kind === 'exit') {
    const g = x.type === 'greed', who = x.official ? ' · المؤشر الرسمي' : '';
    const title = kind === 'phase' ? `⚠️ تأكيد ${g ? 'الطمع الشديد' : 'الخوف الشديد'}${who}` : kind === 'turn' ? `🔄 انعطاف بعد ${g ? 'الطمع الشديد' : 'الخوف الشديد'}${who}` : `${g ? '🔻 مغادرة الطمع الشديد ← إشارة شورت' : '🔺 مغادرة الخوف الشديد ← إشارة لونغ'}${who}`;
    const body = kind === 'phase' ? (g ? `المؤشر فوق ${x.hi} (القيمة ${x.v}). حسب الفيديو: جني الأرباح وعدم الزيادة.` : `المؤشر تحت ${x.lo} (القيمة ${x.v}). حسب الفيديو: منطقة شراء، اشترِ على دفعات.`)
      : kind === 'turn' ? `ابتعد المؤشر ${Math.abs(x.v - x.ext)} نقاط عن القيمة القصوى (${x.ext}).` : `غادر المؤشر المنطقة القصوى بعد ${x.days} أيام (الآن ${x.v}). أبطأ من إشارة الدخول لكن أكثر أماناً.`;
    return { title, body: body + tail + na };
  }
  if (kind === 'peak') { const g = x.type === 'greed'; return { title: g ? '🔻 نقطة قصوى: قمة محتملة' : '🔺 نقطة قصوى: قاع محتمل', body: `شكّل المؤشر ${g ? 'قمة' : 'قاعاً'} عند ${x.v} في ${x.at} (مؤكد الآن).${tail}${na}` }; }
  if (kind === 'div') {
    const bull = x.type.includes('bull'), hid = x.type[0] === 'h';
    return { title: `${bull ? '🟢' : '🔴'} انفراج ${hid ? 'خفي ' : ''}${bull ? 'صاعد' : 'هابط'} ← إشارة ${bull ? 'لونغ' : 'شورت'}`, body: `السعر ${P(x.a.p)} ← ${P(x.b.p)}، المؤشر ${x.a.v} ← ${x.b.v}. مؤكد بعد ${x.right} أيام.${tail}${na}` };
  }
  return { title: kind, body: tail };
}
const TN = { ema: 'EMA', adx: 'ADX', macd: 'MACD (Woche)' };
export function alarmText(kind, x, lang = 'de') {
  const r = alarmTextBase(kind, x, lang);
  if (x.against?.length) {
    const b = x.against.map(k => TN[k] || k).join(' + ');
    const up = x.type === 'greed' || (x.kind === 'cdl' && !x.up);
    const w = lang === 'de' ? `⚠ Gegen den Trend (${b} zeigt ${up ? 'Aufwärtstrend' : 'Abwärtstrend'}) – nur kleine Tranche, Stop setzen.` : lang === 'ar' ? `⚠ عكس الاتجاه (${b} يُظهر اتجاهاً ${up ? 'صاعداً' : 'هابطاً'}) – دفعة صغيرة فقط مع وقف خسارة.` : `⚠ Against the trend (${b} shows an ${up ? 'uptrend' : 'downtrend'}) – small tranche only, set a stop.`;
    r.title = '⚠ ' + r.title; r.body = w + '\n' + r.body;
  }
  return r;
}
function alarmTextBase(kind, x, lang = 'de') {
  if (lang === 'ar') return alarmTextAr(kind, x);
  const de = lang === 'de', P = n => nf(n, lang), tail = x.idx != null ? (de ? `\nIndex jetzt ${x.idx} (${x.zone}) · BTC ${P(x.price)}` : `\nIndex now ${x.idx} (${x.zone}) · BTC ${P(x.price)}`) : `\nBTC ${P(x.price)}`;
  const na = de ? '\n<i>Szenarien, keine Anlageberatung.</i>' : '\n<i>Scenarios, not investment advice.</i>';
  if (kind === 'cluster') {
    const { c, ev, lvl, pct } = x, z = c.z, S = c.side === 'S', name = `${c.id} ${S ? 'Short' : 'Long'}-Cluster`;
    const title = de ? { approach: `🔔 ${name}: nur noch ${pct} % entfernt`, zone: `🔔 ${name}: Zone erreicht`, poc: `🎯 ${name}: Cluster erreicht` }[ev]
      : { approach: `🔔 ${name}: only ${pct} % away`, zone: `🔔 ${name}: zone reached`, poc: `🎯 ${name}: cluster reached` }[ev];
    const facts = de ? `Cluster ${P(z.p)} · Zone ${P(z.lo)} – ${P(z.hi)} · ≈ ${Math.round(z.usd / 1e6)} Mio. $ · Alarm ab ${P(lvl)}`
      : `Cluster ${P(z.p)} · zone ${P(z.lo)} – ${P(z.hi)} · ≈ ${Math.round(z.usd / 1e6)} M $ · alert from ${P(lvl)}`;
    const scen = de ? (S
      ? { approach: 'Über dem Kurs liegen viele Short-Liquidationen. Solche Zonen ziehen den Kurs oft an.\nSzenario A: Zone wird abgeholt, danach Abprall nach unten → Short-Setup möglich, erst nach Bestätigung (Ablehnung/Docht an der Zone).\nSzenario B: Starkes Momentum → Short-Squeeze, der Kurs läuft weiter hoch.\n→ Vorbereiten, Bestätigung abwarten.',
          zone: 'Der Kurs ist in der Zone – hier werden Shorts liquidiert (zusätzlicher Kaufdruck).\nAbprall mit Docht = Short-Chance. Durchbruch mit Volumen = Squeeze, Fortsetzung nach oben.',
          poc: 'Der stärkste Punkt ist erreicht, ein großer Teil der Liquidität ist abgeholt.\nOft folgt eine Gegenbewegung nach unten. Bricht der Kurs deutlich darüber hinaus, ist der Squeeze stark.' }[ev]
      : { approach: 'Unter dem Kurs liegen viele Long-Liquidationen. Solche Zonen ziehen den Kurs oft an.\nSzenario A: Zone wird abgeholt, danach Abprall nach oben → Long-Setup möglich, erst nach Bestätigung (Docht/Rückeroberung).\nSzenario B: Schwacher Markt → Long-Kaskade, der Kurs fällt weiter.\n→ Vorbereiten, Bestätigung abwarten.',
          zone: 'Der Kurs ist in der Zone – hier werden Longs liquidiert (zusätzlicher Verkaufsdruck).\nAbprall mit Docht = Long-Chance. Durchbruch mit Volumen = Kaskade, Fortsetzung nach unten.',
          poc: 'Der stärkste Punkt ist erreicht, ein großer Teil der Liquidität ist abgeholt.\nOft folgt eine Gegenbewegung nach oben. Fällt der Kurs deutlich darunter, ist der Abverkauf stark.' }[ev])
      : (S
      ? { approach: 'Many short liquidations sit above price; such zones often attract price.\nScenario A: zone gets taken, then rejection → short setup possible after confirmation.\nScenario B: strong momentum → short squeeze, price keeps rising.',
          zone: 'Price is inside the zone – shorts are being liquidated (extra buying).\nRejection wick = short chance. Break with volume = squeeze, continuation up.',
          poc: 'The strongest level is reached, much of the liquidity is taken.\nA move back down often follows; a clean break above means a strong squeeze.' }[ev]
      : { approach: 'Many long liquidations sit below price; such zones often attract price.\nScenario A: zone gets taken, then bounce → long setup possible after confirmation.\nScenario B: weak market → long cascade, price keeps falling.',
          zone: 'Price is inside the zone – longs are being liquidated (extra selling).\nBounce wick = long chance. Break with volume = cascade, continuation down.',
          poc: 'The strongest level is reached, much of the liquidity is taken.\nA bounce often follows; a clean break below means strong selling.' }[ev]);
    return { title, body: `${facts}\n${scen}${tail}${na}` };
  }
  if (kind === 'react' || kind === 'break') {
    const c = x.x, next = x.next, L = c.side === 'L', name = c.id + ' ' + (L ? 'Long' : 'Short') + '-Cluster', mio = Math.round(c.usd / 1e6);
    const pc = v => (v > 0 ? '+' : '') + (de ? v.toFixed(1).replace('.', ',') : v.toFixed(1)) + ' %';
    const tm = new Date(c.t).toLocaleTimeString(de ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    const mv = (x.price / c.ext - 1) * 100, up = kind === 'react' ? L : !L;
    const title = kind === 'react'
      ? (de ? `🎯 ${name} angelaufen (${mio} Mio. $) → Reaktion nach ${L ? 'oben' : 'unten'} ${pc(mv)}` : `🎯 ${name} hit (${mio} M $) → reaction ${L ? 'up' : 'down'} ${pc(mv)}`)
      : (de ? `⚠️ ${name} durchbrochen (${mio} Mio. $) → weiter nach ${L ? 'unten' : 'oben'}` : `⚠️ ${name} broken (${mio} M $) → continuing ${L ? 'down' : 'up'}`);
    const nx = next
      ? (de ? `Nächster ${up ? 'höherer' : 'tieferer'} Cluster: ${next.id} ${P(next.z.p)} (${pc((next.z.p / x.price - 1) * 100)}, ≈ ${Math.round(next.z.usd / 1e6)} Mio. $)` : `Next ${up ? 'higher' : 'lower'} cluster: ${next.id} ${P(next.z.p)} (${pc((next.z.p / x.price - 1) * 100)}, ≈ ${Math.round(next.z.usd / 1e6)} M $)`)
      : (de ? 'Kein weiterer Cluster in Reichweite.' : 'No further cluster in range.');
    const body = (de ? `Cluster ${P(c.p)} (Zone ${P(c.lo)} – ${P(c.hi)}) um ${tm} angelaufen, ${L ? 'Tief' : 'Hoch'} danach ${P(c.ext)}.` : `Cluster ${P(c.p)} (zone ${P(c.lo)} – ${P(c.hi)}) hit at ${tm}, then ${L ? 'low' : 'high'} ${P(c.ext)}.`) + '\n' + nx;
    return { title, body: body + tail + na };
  }
  if (kind === 'pivot') return pivotText(x, lang, P, tail, na);
  if (kind === 'f50') return f50Text(x, lang, tail, na);
  if (kind === 'cdl') return cdlText(x, lang, tail, na);
  if (kind === 'line') {
    const up = x.dir > 0;
    return { title: de ? `🔔 Alarmlinie ${x.id} ${up ? 'nach oben' : 'nach unten'} gekreuzt` : `🔔 Alert line ${x.id} crossed ${up ? 'upwards' : 'downwards'}`,
      body: (de ? `Eigene Linie ${P(x.p)} wurde ${up ? 'von unten nach oben' : 'von oben nach unten'} gekreuzt.` : `Own line ${P(x.p)} was crossed ${up ? 'from below' : 'from above'}.`) + tail };
  }
  if (kind === 'phase' || kind === 'turn') {
    const g = x.type === 'greed', who = x.official ? (de ? 'Offizieller Index' : 'Official index') : 'Smart Money Index';
    const lvl = g ? x.hi : x.lo;
    const title = kind === 'phase' ? (de ? `${g ? '⚠️ Extreme Gier' : '⚠️ Extreme Angst'} bestätigt · ${who}` : `${g ? '⚠️ Extreme greed' : '⚠️ Extreme fear'} confirmed · ${who}`)
      : (de ? `🔄 Wende nach ${g ? 'Extremer Gier' : 'Extremer Angst'} · ${who}` : `🔄 Turn after extreme ${g ? 'greed' : 'fear'} · ${who}`);
    const body = de ? (kind === 'phase'
      ? (g ? `3. Tag in Folge über ${lvl} (Wert ${x.v}). Laut Video: Gewinne sichern, nicht nachkaufen. Extreme Gier kann noch Tage anhalten – die Wende (▼) ist das schärfere Signal.`
           : `3. Tag in Folge unter ${lvl} (Wert ${x.v}). Laut Video: Kaufzone, in Tranchen kaufen. Der Boden kann noch tiefer liegen – die Wende (▲) bestätigt.`)
      : (g ? `Index ist ${Math.abs(x.v - x.ext)} Punkte vom Hoch (${x.ext}) zurück. Historisch oft Beginn einer Abkühlung/Korrektur.`
           : `Index ist ${Math.abs(x.v - x.ext)} Punkte vom Tief (${x.ext}) zurück. Historisch oft Beginn einer Erholung.`))
      : (kind === 'phase'
      ? (g ? `3rd day in a row above ${lvl} (value ${x.v}). Per the video: take profits, don't add. The turn (▼) is the sharper signal.`
           : `3rd day in a row below ${lvl} (value ${x.v}). Per the video: buy zone, buy in tranches. The turn (▲) confirms.`)
      : (g ? `Index is ${Math.abs(x.v - x.ext)} points off the high (${x.ext}). Often the start of a cool-down.`
           : `Index is ${Math.abs(x.v - x.ext)} points off the low (${x.ext}). Often the start of a recovery.`));
    return { title, body: body + tail + na };
  }
  if (kind === 'exit') {
    const g = x.type === 'greed', who = x.official ? (de ? ' · Offizieller Index' : ' · official index') : '';
    const title = de ? (g ? `🔻 Extreme Gier verlassen → Short-Signal${who}` : `🔺 Extreme Angst verlassen → Long-Signal${who}`) : (g ? `🔻 Left extreme greed → short signal${who}` : `🔺 Left extreme fear → long signal${who}`);
    const body = de
      ? (g ? `Der Index ist nach ${x.days} Tagen wieder unter ${x.hi} gefallen (jetzt ${x.v}, Hoch ${x.ext}). Bestätigt die Abkühlung – später als das Eintritts-Signal, dafür sicherer.`
           : `Der Index ist nach ${x.days} Tagen wieder über ${x.lo} gestiegen (jetzt ${x.v}, Tief ${x.ext}). Bestätigt die Erholung – später als das Eintritts-Signal, dafür sicherer.`)
      : `The index left the extreme zone after ${x.days} days (now ${x.v}, extreme ${x.ext}). Confirms the move – later than the entry signal, but safer.`;
    return { title, body: body + tail + na };
  }
  if (kind === 'peak') {
    const g = x.type === 'greed';
    const title = de ? (g ? '🔻 Extrempunkt: mögliches Top' : '🔺 Extrempunkt: möglicher Boden') : (g ? '🔻 Extreme point: possible top' : '🔺 Extreme point: possible bottom');
    const body = de
      ? (g ? `Der Index hat am ${x.at} ein Hoch bei ${x.v} gebildet (jetzt bestätigt), während der Kurs nahe seinem 60-Tage-Hoch stand. Erkennt mehr Tops als die Standard-Methode, liefert aber auch mehr Fehlsignale.`
           : `Der Index hat am ${x.at} ein Tief bei ${x.v} gebildet (jetzt bestätigt), während der Kurs nahe seinem 60-Tage-Tief stand. Erkennt mehr Böden als die Standard-Methode, liefert aber auch mehr Fehlsignale.`)
      : `The index formed a ${g ? 'high' : 'low'} of ${x.v} on ${x.at} (now confirmed) while price was near its 60-day ${g ? 'high' : 'low'}. Catches more turns, with more false signals.`;
    return { title, body: body + tail + na };
  }
  if (kind === 'div') {
    const t = x.type, bull = t === 'bull' || t === 'hbull', hid = t[0] === 'h';
    const title = de ? `${bull ? '🟢' : '🔴'} ${hid ? 'Versteckte ' : ''}${bull ? 'bullische' : 'bärische'} Divergenz${x.official ? ' (offiziell)' : ''} → ${bull ? 'Long' : 'Short'}-Signal`
      : `${bull ? '🟢' : '🔴'} ${hid ? 'Hidden ' : ''}${bull ? 'bullish' : 'bearish'} divergence${x.official ? ' (official)' : ''} → ${bull ? 'long' : 'short'} signal`;
    const body = de
      ? (hid ? (bull ? `Kurs höheres Tief (${P(x.a.p)} → ${P(x.b.p)}), Index tieferes Tief (${x.a.v} → ${x.b.v}). Spricht für eine Fortsetzung des Aufwärtstrends.`
                     : `Kurs tieferes Hoch (${P(x.a.p)} → ${P(x.b.p)}), Index höheres Hoch (${x.a.v} → ${x.b.v}). Spricht für eine Fortsetzung des Abwärtstrends.`)
             : (bull ? `Kurs tieferes Tief (${P(x.a.p)} → ${P(x.b.p)}), Index höheres Tief (${x.a.v} → ${x.b.v}). Die Angst lässt nach, obwohl der Kurs fällt – oft vor einer Erholung.`
                     : `Kurs höheres Hoch (${P(x.a.p)} → ${P(x.b.p)}), Index tieferes Hoch (${x.a.v} → ${x.b.v}). Die Gier lässt nach, obwohl der Kurs steigt – oft vor einer Korrektur.`))
        + ` Bestätigt ${x.right} Tage nach dem ${bull ? 'Tief' : 'Hoch'}.`
      : (hid ? `Hidden divergence: price ${P(x.a.p)} → ${P(x.b.p)}, index ${x.a.v} → ${x.b.v}. Suggests trend continuation.`
             : `Price ${P(x.a.p)} → ${P(x.b.p)}, index ${x.a.v} → ${x.b.v}. Sentiment is diverging from price – often before a ${bull ? 'recovery' : 'correction'}.`)
        + ` Confirmed ${x.right} days after the ${bull ? 'low' : 'high'}.`;
    return { title, body: body + tail + na };
  }
  return { title: kind, body: tail };
}
