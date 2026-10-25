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

// V19: Spalte gemittelt wie der eigene Index (für den offiziellen Index „mitmitteln“): 1 = Tageswert, 7 = wie bisher (mean7), sonst N Werte (erst ab N Werten)
export function avgMap(H, col, N = 7) {
  if (N === 7) return new Map(mean7(H, col).filter(r => r[1] != null).map(r => [r[0], r[1]]));
  const out = new Map(), q = []; let s = 0;
  for (const r of H) { const v = r[col]; if (v == null) continue; if (N <= 1) { out.set(r[0], v); continue; } q.push(v); s += v; if (q.length > N) s -= q.shift(); if (q.length >= N) out.set(r[0], Math.round(s / N)); }
  return out;
}
// V19: offizielle Indizes – Spalte im Verlauf (CryptoRank ab V19 mitgeschrieben)
export const OFF_COL = { alt: 4, cmc: 5, cfgi: 6, coinglass: 7, cr: 19 };

/* ---------- Pivots: höchstes Hoch und tiefstes Tief (danach oder im ganzen Zeitraum) ---------- */
// Zeiträume in Tagen (Schlüssel wie im Chart-Knopf): 7T, 1M, 3M, 6M, 12M, gesamt
export const PV_DAYS = { '7': 7, '30': 30, '91': 91, '182': 182, '365': 365, all: 99999 };
// V21: mehr Zeiträume (1 und 3 Tage, 2 Wochen, 2 Monate, 2 Jahre)
export const PV_ORDER = ['1', '3', '7', '14', '30', '61', '91', '182', '365', '730', 'all'];
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

/* ---------- V19: gleitende Linie (wie maCalc auf der Seite: leere Tage werden übersprungen) ---------- */
export function maLine(V, type = 'sma', n = 20) {
  const out = new Array(V.length).fill(null);
  if (type === 'ema') { const k = 2 / (n + 1); let e = null, c = 0; V.forEach((v, i) => { if (v == null) return; e = e == null ? v : v * k + e * (1 - k); if (++c >= n) out[i] = e; }); }
  else { const q = []; let s = 0; V.forEach((v, i) => { if (v == null) return; q.push(v); s += v; if (q.length > n) s -= q.shift(); if (q.length === n) out[i] = s / n; }); }
  return out;
}
/* ---------- V18: SMA-20-Signale im Index (Methode 1 „Extrem“, Methode 2 „Mittelbereich“) ---------- */
// V19: die Linie ist frei wählbar (o.line = {type: 'sma'|'ema', n}, Standard SMA 20) – Methode 3 „Extrem + Kreuz“ dazu; o.rejects = verworfene Kreuze mit Grund
// Methode 3: unser Index (Körper = Reihe v, oder Docht) war in den letzten „look“ Tagen ≤ lo (Long) bzw. ≥ hi (Short), optional auch der offizielle Index
// (offMode A = der gewählte, B = mindestens einer, C = alle mit Wert; rows[i].offs = [gewählter, weitere …]); danach schließt die Kerze über/unter der Linie.
// „once“: je Extrem nur ein Signal – neu scharf erst, wenn der Index die Grenze wieder erreicht.
// rows: [{d, v, raw}] – v = Index-Reihe (Körper, z. B. 7-Tage-Mittel), raw = Tageswert (Docht). Nur abgeschlossene Tage übergeben (kein Repaint).
// Signal am Tag, an dem der Index die SMA kreuzt (Schluss gestern auf der einen, heute auf der anderen Seite, optional mit Mindestabstand „dist“).
// Vorher (bis „look“ Tage zurück) muss das Extrem erreicht sein: Short ≥ hi, Long ≤ lo – gemessen am Docht (src 'raw') oder Körper ('body').
// mid = SMA über 50 (Short) bzw. unter 50 (Long); slope = SMA in „sd“ Tagen höchstens „sp“ Punkte gegen die Signalrichtung gelaufen.
export const SMA_DEF = { n: 20, m1: { on: true, hi: 78.6, lo: 21.4, src: 'raw', mid: false, look: 20, slope: true, sd: 3, sp: 1, dist: 0 }, m2: { on: true, hi: 61.8, lo: 38.2, src: 'body', mid: true, look: 20, slope: true, sd: 3, sp: 1, dist: 0 },
  m3: { on: true, hi: 61.8, lo: 38.2, src: 'body', look: 20, off: true, offMode: 'A', offHi: 61.8, offLo: 38.2, once: true } };
export const SMA_M = ['m1', 'm2', 'm3'];
export function smaSignals(rows, o = {}) {
  const line = o.line || { type: 'sma', n: o.n ?? 20 }, V = rows.map(r => r.v), out = [], rej = [];
  const S = maLine(V, line.type, line.n), r1 = x => Math.round(x * 10) / 10;
  const MS = SMA_M.map(k => ({ k, m: { ...SMA_DEF[k], ...(o[k] || {}) } })).filter(x => x.m.on);
  const m3 = MS.find(x => x.k === 'm3')?.m, arm = { L: false, S: false };
  const offOk = (r, test, mode) => { const xs = (r.offs || []).filter(x => x != null), a = r.offs?.[0];
    return mode === 'B' ? xs.some(test) : mode === 'C' ? xs.length > 0 && xs.every(test) : a != null && test(a); };
  for (let i = 1; i < rows.length; i++) {
    if (m3 && V[i] != null) { const e = m3.src === 'raw' ? (rows[i].raw ?? V[i]) : V[i]; if (e <= m3.lo) arm.L = true; if (e >= m3.hi) arm.S = true; }
    if (S[i] == null || S[i - 1] == null || V[i] == null || V[i - 1] == null) continue;
    const up = V[i - 1] <= S[i - 1] && V[i] > S[i], dn = V[i - 1] >= S[i - 1] && V[i] < S[i]; if (!up && !dn) continue;
    const base = { d: rows[i].d, i, v: V[i], sma: r1(S[i]), kind: 'sma', up, line }, why = []; let fired = false;
    for (const { k, m } of MS) {
      const X = rows.slice(Math.max(0, i - m.look), i + 1).map(r => m.src === 'body' ? r.v : (r.raw ?? r.v)).filter(x => x != null); if (!X.length) continue;
      const ext = up ? Math.min(...X) : Math.max(...X), lim = up ? m.lo : m.hi, extOk = up ? ext <= m.lo : ext >= m.hi;
      if (k === 'm3') {
        const w = rows.slice(Math.max(0, i - m.look), i + 1), oLim = up ? m.offLo : m.offHi;
        const offHit = !m.off || w.some(r => offOk(r, x => up ? x <= m.offLo : x >= m.offHi, m.offMode));
        const armed = !m.once || (up ? arm.L : arm.S);
        if (!extOk) why.push({ m: k, r: 'ext', ext, lim }); else if (!offHit) why.push({ m: k, r: 'off', lim: oLim, mode: m.offMode }); else if (!armed) why.push({ m: k, r: 'once' });
        else { out.push({ ...base, type: k, lim, ext, offLim: m.off ? oLim : null }); fired = true; if (up) arm.L = false; else arm.S = false; }
        continue;
      }
      if (i < m.sd || S[i - m.sd] == null) continue;
      const slope = S[i] - S[i - m.sd], midOk = !m.mid || (up ? S[i] < 50 : S[i] > 50), slopeOk = !m.slope || (up ? slope >= -m.sp : slope <= m.sp), distOk = up ? V[i] > S[i] + m.dist : V[i] < S[i] - m.dist;
      if (!extOk) why.push({ m: k, r: 'ext', ext, lim }); else if (!midOk) why.push({ m: k, r: 'mid', sma: r1(S[i]) }); else if (!slopeOk) why.push({ m: k, r: 'slope', s: r1(slope), sp: m.sp, sd: m.sd });
      else if (!distOk) why.push({ m: k, r: 'dist', gap: r1(Math.abs(V[i] - S[i])), dist: m.dist });
      else { out.push({ ...base, type: k, lim, ext }); fired = true; }
    }
    if (!fired && o.rejects) rej.push({ ...base, rej: true, why });
  }
  const res = out.sort((a, b) => a.i - b.i);
  if (o.rejects) res.rejects = rej;
  return res;
}

/* ---------- V18: VWAP (volumengewichteter Durchschnittspreis) mit Anker wie bei TradingView ---------- */
// Anker: S = Session (Tag, UTC), W = Woche (ab Montag), M = Monat, Q = Quartal, Y = Jahr. Quelle: hlc3 (Standard), hl2, ohlc4, close.
const vwMonday = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
export const VW_KEY = { S: d => d, W: vwMonday, M: d => d.slice(0, 7), Q: d => d.slice(0, 4) + 'Q' + Math.floor((+d.slice(5, 7) - 1) / 3), Y: d => d.slice(0, 4) };
export const VW_ANCH = ['S', 'W', 'M', 'Q', 'Y'];
export const VW_MINAGE = { S: 1, W: 3, M: 5, Q: 10, Y: 20 };   // Signale erst ab dem 3./5./10./20. Tag des Zeitraums (am Anfang startet der VWAP direkt am Kurs)
export const vwTp = (r, src) => src === 'close' ? r.c : src === 'hl2' ? (r.h + r.l) / 2 : src === 'ohlc4' ? (r.o + r.h + r.l + r.c) / 4 : (r.h + r.l + r.c) / 3;
// rows: [{d, o, h, l, c, v}] (d = Datum der Kerze, bei Stundenkerzen das UTC-Datum); skipFirst = ersten (evtl. unvollständigen) Zeitraum auslassen
export function vwapCalc(rows, anchor, src = 'hlc3', skipFirst = false) {
  const key = VW_KEY[anchor] || VW_KEY.W, w = [], sd = [], age = []; let k0 = null, first = null, pv = 0, pv2 = 0, vv = 0, a = 0;
  for (const r of rows) {
    const k = key(r.d); if (first == null) first = k;
    if (k !== k0) { k0 = k; pv = pv2 = vv = 0; a = 0; }
    const tp = vwTp(r, src), v = r.v || 0; if (v > 0 && tp > 0) { pv += tp * v; pv2 += tp * tp * v; vv += v; } a++;
    const m = vv && !(skipFirst && k === first) ? pv / vv : null;
    w.push(m); sd.push(m != null ? Math.sqrt(Math.max(0, pv2 / vv - m * m)) : null); age.push(a);
  }
  return { w, sd, age };
}
// Signale auf Tageskerzen (nur abgeschlossene Tage): Art 'close' = Schluss kreuzt VWAP, 'ema8' = EMA 8 kreuzt VWAP; combos = ['ema8_W', 'close_Y', …]
// conf (nur ema8): Signal erst, wenn nach dem Kreuz ein Tagesschluss auf der Signalseite des VWAP liegt (am Kreuz-Tag oder bis confDays danach)
// trend: { mode: 'off' | 'mark' | 'hide', n: 200, tf: '1d' | '4h' } – Long nur über, Short nur unter der EMA (4h wird aus Tageskerzen angenähert: EMA n/6 Tage)
export function vwapSignals(rows, o = {}) {
  const C = rows.map(r => r.c), out = [], ema = (a, n) => { const k = 2 / (n + 1), r = []; let e = a[0]; a.forEach((x, i) => { e = i ? x * k + e * (1 - k) : x; r.push(e); }); return r; };
  const E8 = ema(C, 8), tr = o.trend || { mode: 'hide', n: 200, tf: '1d' }, TE = ema(C, Math.max(2, Math.round(tr.tf === '4h' ? (tr.n || 200) / 6 : (tr.n || 200))));
  for (const combo of o.combos || ['ema8_W']) {
    const [type, A] = combo.split('_'); if (!VW_KEY[A] || A === 'S') continue;
    const { w, age } = vwapCalc(rows, A, o.src || 'hlc3'), minA = VW_MINAGE[A];
    let pend = null;
    for (let i = 1; i < rows.length; i++) {
      if (w[i] == null || w[i - 1] == null || age[i] < minA || age[i - 1] < minA - 1) { pend = null; continue; }
      let up = false, dn = false;
      if (type === 'close') { up = C[i - 1] <= w[i - 1] && C[i] > w[i]; dn = C[i - 1] >= w[i - 1] && C[i] < w[i]; }
      else {
        const xu = E8[i - 1] <= w[i - 1] && E8[i] > w[i], xd = E8[i - 1] >= w[i - 1] && E8[i] < w[i];
        if (!o.conf) { up = xu; dn = xd; }
        else { if (xu) pend = { up: true, i }; if (xd) pend = { up: false, i }; if (pend && i - pend.i <= (o.confDays ?? 2)) { if (pend.up && C[i] > w[i] && E8[i] > w[i]) { up = true; pend = null; } else if (!pend.up && C[i] < w[i] && E8[i] < w[i]) { dn = true; pend = null; } } else if (pend && i - pend.i > (o.confDays ?? 2)) pend = null; }
      }
      if (!up && !dn) continue;
      if (o.dir === 'long' && !up || o.dir === 'short' && !dn) continue;
      const against = tr.mode !== 'off' && (up ? C[i] < TE[i] : C[i] > TE[i]);
      if (against && tr.mode === 'hide') continue;
      out.push({ d: rows[i].d, i, up, type: combo, vt: type, anchor: A, kind: 'vwap', vw: Math.round(w[i]), c: Math.round(C[i]), e8: Math.round(E8[i]), ...(against ? { against: ['ema'] } : {}) });
    }
  }
  return out.sort((a, b) => a.i - b.i);
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
// V19: basis 'close' = wie bisher (Schlusskurs), 'wick' = der Punkt sitzt am höchsten Hoch / tiefsten Tief (Docht) des Schwungs; die Wende selbst zählt weiter am Schlusskurs
export function majorTurns(H, pct = 20, basis = 'close') {
  const px = H.filter(r => r[3] != null), out = []; if (px.length < 3) return out;
  const W = basis === 'wick', hv = r => W ? (r[10] ?? r[3]) : r[3], lv = r => W ? (r[11] ?? r[3]) : r[3];
  let dir = 0, hi = 0, lo = 0, hiW = 0, loW = 0;
  for (let i = 1; i < px.length; i++) {
    const p = px[i][3];
    if (p >= px[hi][3]) hi = i; if (p <= px[lo][3]) lo = i;
    if (hv(px[i]) >= hv(px[hiW])) hiW = i; if (lv(px[i]) <= lv(px[loW])) loW = i;
    if (dir >= 0 && p <= px[hi][3] * (1 - pct / 100)) { if (dir === 1 || !out.length) out.push({ d: px[hiW][0], t: 'top', p: hv(px[hiW]) }); dir = -1; lo = i; loW = i; }
    else if (dir <= 0 && p >= px[lo][3] * (1 + pct / 100)) { if (dir === -1 || !out.length) out.push({ d: px[loW][0], t: 'bottom', p: lv(px[loW]) }); dir = 1; hi = i; hiW = i; }
  }
  return out;
}
/* ---------- V19: Fraktale (wie „Williams Fractals“ bei TradingView) ---------- */
// Hoch-Fraktal = Kerze, deren Hoch höher ist als die „left“ Kerzen davor und die „right“ Kerzen danach (Tief entsprechend). Erst sicher, wenn die rechten
// Kerzen geschlossen sind (Bestätigungstag c) – kein Nachmalen. rows: [{d, h, l, c}] nur abgeschlossene Kerzen.
// Filter: filt 'alt' = nur die extremsten (Hoch und Tief wechseln sich ab, gleiche hintereinander → nur das extremste), 'all' = alle;
// minGap = Mindestabstand in Kerzen, minMove = Mindestbewegung seit dem letzten Gegen-Fraktal (% beim Kurs, Punkte wenn o.pts).
export const FRAC_DEF = { left: 2, right: 2, basis: 'wick', filt: 'alt', minGap: 0, minMove: 0 };
export function fractals(rows, o = {}) {
  const L = Math.max(1, o.left ?? 2), R = Math.max(1, o.right ?? 2), W = (o.basis ?? 'wick') === 'wick', hv = r => W ? r.h : r.c, lv = r => W ? r.l : r.c, raw = [];
  for (let i = L; i < rows.length - R; i++) {
    const h = hv(rows[i]), l = lv(rows[i]); let isH = h != null, isL = l != null;
    for (let k = i - L; k <= i + R && (isH || isL); k++) {
      if (k === i) continue; const a = hv(rows[k]), b = lv(rows[k]);
      if (isH && (a == null || a >= h)) isH = false;
      if (isL && (b == null || b <= l)) isL = false;
    }
    if (isH) raw.push({ i, d: rows[i].d, c: rows[i + R].d, ci: i + R, t: 'hi', p: h });
    if (isL) raw.push({ i, d: rows[i].d, c: rows[i + R].d, ci: i + R, t: 'lo', p: l });
  }
  const out = [], gap = +o.minGap || 0, mm = +o.minMove || 0, more = (a, b) => a.t === 'hi' ? a.p > b.p : a.p < b.p;
  for (const f of raw) {
    const last = out.at(-1), lastT = [...out].reverse().find(x => x.t === f.t);
    if (o.filt !== 'all' && last && last.t === f.t) { if (more(f, last)) out[out.length - 1] = f; continue; }
    if (gap && lastT && f.i - lastT.i < gap) { if (more(f, lastT)) out[out.lastIndexOf(lastT)] = f; continue; }
    if (mm && last && last.t !== f.t) { const mv = o.pts ? Math.abs(f.p - last.p) : Math.abs(f.p / last.p - 1) * 100; if (mv < mm) continue; }
    out.push(f);
  }
  return out;
}
// Ausbruch: Schlusskurs über dem letzten noch nicht gebrochenen Hoch-Fraktal (Long) bzw. unter dem letzten Tief-Fraktal (Short) – erst nach dessen Bestätigung
export function fracBreaks(rows, fr) {
  const out = [], byC = new Map(); for (const f of fr) (byC.get(f.ci) || byC.set(f.ci, []).get(f.ci)).push(f);
  let hi = null, lo = null;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].c;
    if (c != null && hi && c > hi.p) { out.push({ d: rows[i].d, i, up: true, p: hi.p, from: hi.d, c, kind: 'frac', type: 'brk' }); hi = null; }
    if (c != null && lo && c < lo.p) { out.push({ d: rows[i].d, i, up: false, p: lo.p, from: lo.d, c, kind: 'frac', type: 'brk' }); lo = null; }
    for (const f of byC.get(i) || []) f.t === 'hi' ? hi = f : lo = f;
  }
  return out;
}
// Kurs-Fraktal nur, wenn der Index am Fraktal-Tag (± look Tage) im Extrem war (Tief ≤ lo, Hoch ≥ hi); idx = Map Datum → Index
export function fracIdxFilter(fr, idx, o = {}) {
  const look = o.look ?? 2, ok = (d, t) => { for (let k = -look; k <= look; k++) { const v = idx.get(sDay(d, k)); if (v != null && (t === 'lo' ? v <= o.lo : v >= o.hi)) return true; } return false; };
  return fr.filter(f => ok(f.d, f.t));
}
// Kurs- und Index-Fraktal zusammen: gleiche Art innerhalb von ± days Tagen
export function fracNear(a, b, days = 3) { return a.filter(f => b.some(g => g.t === f.t && Math.abs(Date.parse(g.d) - Date.parse(f.d)) <= days * 864e5)); }
/* ---------- V19: Kurs kreuzt MA / MA kreuzt MA (Tagesschluss) ---------- */
// rows: [{d, c}] abgeschlossene Tage; m: [{id, type, n, al: {mode: 'close'|'cross', dir: 'both'|'up'|'down', x: id der zweiten Linie}}]
export function maCrossEvents(rows, mas) {
  const C = rows.map(r => r.c), line = new Map(mas.map(m => [m.id, maLine(C, m.type, m.n)])), out = [];
  for (const m of mas) {
    const a = line.get(m.id), al = m.al || {}; if (!al.mode || al.mode === 'off' || al.mode === 'touch') continue;
    const b = al.mode === 'cross' ? line.get(al.x) : C; if (!b || (al.mode === 'cross' && al.x === m.id)) continue;
    for (let i = 1; i < rows.length; i++) {
      if (a[i] == null || a[i - 1] == null || b[i] == null || b[i - 1] == null) continue;
      // close: Kurs (b) kreuzt die Linie (a); cross: Linie a kreuzt Linie b
      const [p0, p1, q0, q1] = al.mode === 'cross' ? [a[i - 1], a[i], b[i - 1], b[i]] : [b[i - 1], b[i], a[i - 1], a[i]];
      const up = p0 <= q0 && p1 > q1, dn = p0 >= q0 && p1 < q1; if (!up && !dn) continue;
      if ((al.dir === 'up' && !up) || (al.dir === 'down' && !dn)) continue;
      out.push({ d: rows[i].d, i, id: m.id, up, mode: al.mode, x: al.x, ma: a[i], mb: al.mode === 'cross' ? b[i] : null, c: C[i], kind: 'ma', type: al.mode });
    }
  }
  return out.sort((p, q) => p.i - q.i);
}
// sig: [{d, up: true = Kauf-Signal (Kurs sollte steigen)}]
export function evalSignals(sig, H, turns, win = 14, from = null) {
  const px = new Map(H.filter(r => r[3] != null).map(r => [r[0], r[3]]));
  const fwd = (d, n) => { const a = px.get(d), b = px.get(sDay(d, n)); return a && b ? (b / a - 1) * 100 : null; };
  const res = { n: sig.length, buy: 0, sell: 0, ok30: 0, n30: 0, avg30: 0, n7: 0, avg7: 0, okB: 0, nB: 0, okS: 0, nS: 0, tops: 0, bottoms: 0, nTops: 0, nBottoms: 0 };
  for (const s of sig) {
    s.up ? res.buy++ : res.sell++;
    const r7 = fwd(s.d, 7); if (r7 != null) { res.n7++; res.avg7 += s.up ? r7 : -r7; }
    const r = fwd(s.d, 30); if (r == null) continue;
    res.n30++; const g = s.up ? r : -r; res.avg30 += g; if (g > 0) res.ok30++;
    if (s.up) { res.nB++; if (g > 0) res.okB++; } else { res.nS++; if (g > 0) res.okS++; }
  }
  if (res.n30) res.avg30 /= res.n30;
  if (res.n7) res.avg7 /= res.n7;
  const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= win * 864e5;
  for (const t of turns) {
    if (from && t.d < from) continue;                       // nur Wendepunkte, für die es schon Index-Werte gab
    if (t.t === 'top') { res.nTops++; if (sig.some(s => !s.up && near(s.d, t.d))) res.tops++; }
    else { res.nBottoms++; if (sig.some(s => s.up && near(s.d, t.d))) res.bottoms++; }
  }
  return res;
}

/* ---------- V18: Heatmap aus beliebig vielen Börsen kombinieren (Stufen je Börse aufsummieren, dann Cluster wie im Programm) ---------- */
// V21: + Binance COIN-M, Bybit invers, OKX invers (mit Verlauf) und Bitfinex, KuCoin, BingX, Aster, Phemex (mitgeschrieben)
export const HM_EX = ['binance', 'bybit', 'okx', 'gate', 'htx', 'kraken', 'bitget', 'deribit', 'hyperliquid', 'binancecm', 'bybitinv', 'okxinv', 'bitfinex', 'kucoin', 'bingx', 'aster', 'phemex'];
export const hmParts = k => !k || k === 'binance' ? ['binance'] : k === 'all' ? ['binance', 'bybit', 'okx'] : String(k).split('+').filter(x => HM_EX.includes(x));
export function liqFromRows(rows, price, bin, hours) {
  const below = rows.filter(r => r[0] < price && r[1] > 0), above = rows.filter(r => r[0] > price && r[2] > 0);
  const maxL = Math.max(0, ...below.map(r => r[1])), maxS = Math.max(0, ...above.map(r => r[2]));
  const nearL = [...below].reverse().find(r => r[1] >= maxL * 0.5), nearS = above.find(r => r[2] >= maxS * 0.5);
  const topL = below.find(r => r[1] === maxL), topS = above.find(r => r[2] === maxS);
  const zone = (list, i, peak) => { if (!peak) return null; const k = list.indexOf(peak), th = peak[i] * 0.4; let a = k, b = k;
    while (a > 0 && list[a - 1][i] >= th && list[a][0] - list[a - 1][0] <= bin * 2) a--;
    while (b < list.length - 1 && list[b + 1][i] >= th && list[b + 1][0] - list[b][0] <= bin * 2) b++;
    return { p: peak[0], usd: peak[i], lo: list[a][0] - bin / 2, hi: list[b][0] + bin / 2, zoneUsd: list.slice(a, b + 1).reduce((x, r) => x + r[i], 0) }; };
  const peaks = (list, i) => { const mx = Math.max(0, ...list.map(r => r[i])), out = [];
    const cand = list.filter((r, k) => r[i] >= mx * 0.15 && (k === 0 || r[i] >= list[k - 1][i]) && (k === list.length - 1 || r[i] >= list[k + 1][i])).sort((x, y) => y[i] - x[i]);
    for (const r of cand) { const z = zone(list, i, r); if (out.some(o => z.p >= o.lo && z.p <= o.hi)) continue; out.push(z); if (out.length >= 8) break; } return out; };
  return { price, bin, rows, longNear: zone(below, 1, nearL), shortNear: zone(above, 2, nearS), longTop: zone(below, 1, topL), shortTop: zone(above, 2, topS), longs: peaks(below, 1), shorts: peaks(above, 2), hours, updated: Date.now() };
}
// V20: Heatmap-Zeitraum – nur Positionen, die in den letzten 12 Std. / 1 Tag / … eröffnet wurden (hm.exP[per][ex]); 'all' = alles (≈ 3 Wochen)
export const HM_PER = { '1h': 1, '4h': 4, '12h': 12, '1d': 24, '3d': 72, '1w': 168, '2w': 336, '1mo': 720, '3mo': 2184, '6mo': 4380, '1y': 8760 };
// V20: Dollar-Wert einer Binance-Liquidation (!forceOrder@arr). COIN-M-Kontrakte (z. B. BTCUSD_PERP, ETHUSD_251226) zählen in Kontrakten
// zu 100 $ (BTC) bzw. 10 $ (alle anderen) – vorher Kontrakte × Kurs gerechnet, dadurch rund 800× zu hoch. USDⓈ-M: Menge in Coins × Durchschnittspreis.
export function liqUsd(o) { const q = +o.z || +o.q || 0; return /USD_(PERP|\d{6})$/.test(o.s || '') ? q * (/^BTCUSD_/.test(o.s) ? 100 : 10) : q * +(o.ap || o.p || 0); }
export function liqCombine(hm, parts, per) {
  if (!hm) return hm;
  const EX = per && per !== 'all' && hm.exP?.[per] ? hm.exP[per] : null, src = EX || hm.ex || {};
  let P = (parts?.length ? parts : ['binance']).filter(p => p === 'binance' || src[p]?.length);
  // V21: grobe Zeiträume (1/3 Monate) gibt es nicht für jede Börse – dann die vorhandenen nehmen
  if (EX && !P.some(p => EX[p]?.length)) P = Object.keys(EX).filter(p => EX[p]?.length);
  if (!EX && (!P.length || (P.length === 1 && P[0] === 'binance'))) return hm;
  const m = new Map();
  for (const p of P.length ? P : ['binance']) for (const r of (p === 'binance' ? (src.binance || (EX ? [] : hm.rows)) : src[p] || [])) { const x = m.get(r[0]) || [r[0], 0, 0]; x[1] += r[1]; x[2] += r[2]; m.set(r[0], x); }
  return { ...liqFromRows([...m.values()].sort((a, b) => a[0] - b[0]), hm.price, hm.bin, EX ? HM_PER[per] : hm.hours), src: (P.length ? P : ['binance']).join('+'), parts: P.length ? P : ['binance'], ex: hm.ex, exP: hm.exP, exState: hm.exState, recMin: hm.recMin, per: EX ? per : 'all' };
}
/* ---------- V21: Mitte-Stufen zwischen Long- und Short-Cluster, Handelsplan aus den Clustern ---------- */
// 0 % = Long-Cluster, 100 % = Short-Cluster; Paar: stärkste (L1/S1), nächste (L2/S2) oder fernste (LF/SF)
// V21c: mehrere Paare gleichzeitig (pairs), z. B. Mitte L1/S1 und Mitte L2/S2; doppelte Paare (L2 fehlt → L1) nur einmal
export const MID_DEF = { pair: 'top', pairs: ['top', 'near'], lv: [50], ticker: true, al: false };
export function midLevels(CL, o = MID_DEF) {
  const suf = { top: '1', near: '2', far: 'F' }, seen = new Set(), out = [];
  for (const pr of (o.pairs?.length ? o.pairs : [o.pair || 'top'])) {
    const pick = side => CL.find(c => c.id === side + (suf[pr] || '1')) || CL.find(c => c.id === side + '1');
    const L = pick('L'), S = pick('S'); if (!L || !S || seen.has(L.id + S.id)) continue; seen.add(L.id + S.id);
    for (const f of [...(o.lv?.length ? o.lv : [50])].sort((a, b) => a - b)) out.push({ f, p: L.z.p + (S.z.p - L.z.p) * f / 100, L: L.id, S: S.id });
  }
  return out;
}
// SL hinter dem nächsten Cluster der eigenen Seite (Puffer in %), wahlweise halber Weg dorthin; TP = nächste Cluster der Gegenseite
export const TPLAN_DEF = { on: false, sl: 'cluster', tps: 3, buf: 0.15, hook: '' };
export function tradePlan(CL, price, up, o = TPLAN_DEF) {
  if (!(price > 0) || !CL?.length) return null;
  const dist = c => Math.abs(c.z.p - price);
  const own = CL.filter(c => c.side === (up ? 'L' : 'S') && (up ? c.z.p < price : c.z.p > price)).sort((a, b) => dist(a) - dist(b));
  const opp = [...new Map(CL.filter(c => c.side === (up ? 'S' : 'L') && (up ? c.z.p > price : c.z.p < price)).sort((a, b) => dist(a) - dist(b)).map(c => [Math.round(c.z.p), c])).values()];
  const n = own[0], b = (o.buf ?? 0.15) / 100;
  let sl = n ? (o.sl === 'half' ? (price + n.z.p) / 2 : up ? n.z.p * (1 - b) : n.z.p * (1 + b)) : (up ? price * 0.97 : price * 1.03);
  const tps = opp.slice(0, o.tps || 3).map(c => ({ id: c.id, p: c.z.p })), risk = Math.abs(price - sl);
  return { up, entry: price, sl, slFrom: n?.id || '3 %', tps, rr: tps.map(x => risk ? Math.abs(x.p - price) / risk : null) };
}
export function tradePlanText(pl, lang) {
  if (!pl) return ''; const de = lang === 'de', ar = lang === 'ar', P = n => nf(n, lang);
  return `\n${ar ? 'الخطة' : 'Plan'}: ${pl.up ? 'Long' : 'Short'} · ${ar ? 'الدخول' : de ? 'Einstieg' : 'entry'} ${P(pl.entry)} · SL ${P(pl.sl)} (${pl.slFrom})`
    + pl.tps.map((x, i) => ` · TP${i + 1} ${P(x.p)} (${x.id}${pl.rr[i] ? ` · R ${pl.rr[i].toFixed(1)}` : ''})`).join('') + `\n${ar ? '(ليست نصيحة استثمارية)' : de ? '(keine Anlageberatung)' : '(not financial advice)'}`;
}
/* ---------- V20: offizieller Index – eigene Grenzen (z. B. 13 / 70) ---------- */
// Long: die offizielle Linie war auf/unter lo und geht wieder darüber → Signal am Tag des Austritts (ext = tiefster Wert, extDay = dessen Tag);
// Short spiegelbildlich mit hi. rows: [[datum, wert], …] (Reihe wie im Chart, z. B. 7-Tage-Mittel).
export function offExitSignals(rows, lo = 13, hi = 70) {
  const out = []; let run = null;
  for (const [d, v] of rows) {
    if (v == null) continue;
    const zone = v <= lo ? 'L' : v >= hi ? 'S' : null;
    if (zone && run?.z === zone) { if (zone === 'L' ? v < run.ext : v > run.ext) { run.ext = v; run.extDay = d; } continue; }
    if (run && !zone) out.push({ d, up: run.z === 'L', v, ext: run.ext, extDay: run.extDay, from: run.from, lim: run.z === 'L' ? lo : hi, kind: 'offx', type: 'exit' });
    run = zone ? { z: zone, ext: v, extDay: d, from: d } : null;
  }
  return out;
}
// Zum offiziellen Signal das Fraktal im Kurs: Tief-Fraktal (Long) bzw. Hoch-Fraktal (Short) von „before“ Kerzen vor bis „after“ Kerzen nach dem Signal-Tag,
// das extremste gewinnt; ohne Fraktal (fb = true) das tiefste Tief / höchste Hoch im Fenster. pr = Kurs-Kerzen [{d,h,l,c}], fr = fractals(pr, …).
export function offFracSignals(sig, pr, fr, before = 5, after = 0) {
  const ix = new Map(pr.map((r, i) => [r.d, i])), out = [];
  for (const s of sig) {
    const i = ix.get(s.d); if (i == null) continue;
    const a = Math.max(0, i - before), b = Math.min(pr.length - 1, i + after), t = s.up ? 'lo' : 'hi';
    const cand = fr.filter(f => f.t === t && f.i >= a && f.i <= b);
    let best = cand.reduce((m, f) => !m || (s.up ? f.p < m.p : f.p > m.p) ? f : m, null), fb = false;
    if (!best) { let k = a; for (let j = a; j <= b; j++) if (s.up ? pr[j].l < pr[k].l : pr[j].h > pr[k].h) k = j; best = { i: k, d: pr[k].d, c: pr[Math.min(pr.length - 1, k + after)].d, p: s.up ? pr[k].l : pr[k].h }; fb = true; }
    out.push({ d: best.d, c: best.c || s.d, up: s.up, p: best.p, from: s.d, fb, kind: 'offf', type: 'frac' });
  }
  return out;
}
/* ---------- V20: zwei Linien kreuzen sich (z. B. Index-Linie EMA 8 × SMA 20, offizieller Index × Index-Linie) ---------- */
// A und B: Reihen gleicher Länge (null = kein Wert); rows[i].d = Datum. up = A geht über B.
export function seriesCross(rows, A, B) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (A[i] == null || A[i - 1] == null || B[i] == null || B[i - 1] == null) continue;
    if (A[i - 1] <= B[i - 1] && A[i] > B[i]) out.push({ d: rows[i].d, i, up: true, a: A[i], b: B[i] });
    else if (A[i - 1] >= B[i - 1] && A[i] < B[i]) out.push({ d: rows[i].d, i, up: false, a: A[i], b: B[i] });
  }
  return out;
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
  de: { '1': '1 Tag (heute)', '3': '3 Tage', '7': '7 Tage', '14': '2 Wochen', '30': '1 Monat', '61': '2 Monate', '91': '3 Monate', '182': '6 Monate', '365': '12 Monate', '730': '2 Jahre', all: 'gesamter Verlauf' },
  en: { '1': '1 day (today)', '3': '3 days', '7': '7 days', '14': '2 weeks', '30': '1 month', '61': '2 months', '91': '3 months', '182': '6 months', '365': '12 months', '730': '2 years', all: 'all-time' },
  ar: { '1': 'يوم (اليوم)', '3': '3 أيام', '7': '7 أيام', '14': 'أسبوعان', '30': 'شهر', '61': 'شهران', '91': '3 أشهر', '182': '6 أشهر', '365': '12 شهراً', '730': 'سنتان', all: 'كامل السجل' } };
export const PVS = {
  de: { '1': '1T', '3': '3T', '7': '7T', '14': '2W', '30': '1M', '61': '2M', '91': '3M', '182': '6M', '365': '12M', '730': '2J', all: 'Alles' },
  en: { '1': '1D', '3': '3D', '7': '7D', '14': '2W', '30': '1M', '61': '2M', '91': '3M', '182': '6M', '365': '12M', '730': '2Y', all: 'All' },
  ar: { '1': '1ي', '3': '3ي', '7': '7ي', '14': '2أ', '30': '1ش', '61': '2ش', '91': '3ش', '182': '6ش', '365': '12ش', '730': '2س', all: 'الكل' } };
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
const SMAN = { de: { m1: 'Methode 1 (Extrem)', m2: 'Methode 2 (Mittelbereich)', m3: 'Methode 3 (Extrem + Kreuz)' }, en: { m1: 'Method 1 (extreme)', m2: 'Method 2 (middle range)', m3: 'Method 3 (extreme + cross)' }, ar: { m1: 'الطريقة 1 (القصوى)', m2: 'الطريقة 2 (النطاق الأوسط)', m3: 'الطريقة 3 (القصوى + التقاطع)' } };
export const lineName = l => `${(l?.type || 'sma').toUpperCase()} ${l?.n ?? 20}`;
function smaText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', up = x.up, nm = (SMAN[lang] || SMAN.de)[x.type], ln = lineName(x.line);
  const title = `${up ? '🟢' : '🔴'} ${ln} · ${nm} · ${ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short'}`;
  const off = x.offLim != null ? (ar ? ` والمؤشر الرسمي أيضاً ${up ? '≤' : '≥'} ${x.offLim}` : de ? `, offizieller Index ebenfalls ${up ? '≤' : '≥'} ${x.offLim}` : `, official index also ${up ? '≤' : '≥'} ${x.offLim}`) : '';
  const body = ar ? `المؤشر (${x.v}) قطع ${ln} (${x.sma}) ${up ? 'للأعلى' : 'للأسفل'} – إغلاق يوم ${dmyS(x.d)}. قبل ذلك وصل إلى ${up ? '≤' : '≥'} ${x.lim} (${x.ext})${off}.`
    : de ? `Index (${x.v}) hat die ${ln} (${x.sma}) nach ${up ? 'oben' : 'unten'} gekreuzt – Tagesschluss ${dmyS(x.d)}. Vorher ${up ? '≤' : '≥'} ${x.lim} erreicht (${x.ext})${off}.`
    : `Index (${x.v}) crossed the ${ln} (${x.sma}) ${up ? 'upwards' : 'downwards'} – daily close ${dmyS(x.d)}. Before it reached ${up ? '≤' : '≥'} ${x.lim} (${x.ext})${off}.`;
  return { title, body: body + tail + na };
}
// V19: Fraktal-Alarme (neues Fraktal bestätigt / Ausbruch über bzw. unter das letzte Fraktal) und MA-Alarme
function fracText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', P = n => x.where === 'idx' ? String(Math.round(n)) : nf(n, lang), up = x.type === 'brk' ? x.up : x.t === 'lo';
  const where = x.where === 'idx' ? (ar ? 'المؤشر' : 'Index') : (ar ? 'السعر' : de ? 'Kurs' : 'Price');
  if (x.type === 'brk') {
    const title = `${up ? '🟢' : '🔴'} ${ar ? 'كسر الفركتال' : de ? 'Fraktal-Ausbruch' : 'Fractal breakout'} · ${where} · ${ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short'}`;
    const body = ar ? `إغلاق يوم ${dmyS(x.d)} ${up ? 'فوق قمة' : 'تحت قاع'} الفركتال من ${dmyS(x.from)} (${P(x.p)}).`
      : de ? `Schluss ${dmyS(x.d)} ${up ? 'über dem Hoch' : 'unter dem Tief'}-Fraktal vom ${dmyS(x.from)} (${P(x.p)}).` : `Close ${dmyS(x.d)} ${up ? 'above the high' : 'below the low'} fractal of ${dmyS(x.from)} (${P(x.p)}).`;
    return { title, body: body + tail + na };
  }
  const title = `${up ? '🔺' : '🔻'} ${ar ? (up ? 'فركتال قاع' : 'فركتال قمة') : de ? (up ? 'Tief-Fraktal' : 'Hoch-Fraktal') : (up ? 'Low fractal' : 'High fractal')} · ${where}`;
  const body = ar ? `${up ? 'قاع' : 'قمة'} ${dmyS(x.d)} عند ${P(x.p)} – مؤكد بعد إغلاق الشموع اليمنى (${dmyS(x.c)}).`
    : de ? `${up ? 'Tief' : 'Hoch'} vom ${dmyS(x.d)} bei ${P(x.p)} – bestätigt, nachdem die rechten Kerzen geschlossen haben (${dmyS(x.c)}).` : `${up ? 'Low' : 'High'} of ${dmyS(x.d)} at ${P(x.p)} – confirmed after the right candles closed (${dmyS(x.c)}).`;
  return { title, body: body + tail + na };
}
// V20: offizieller Index 13/70 (Austritt), Fraktal dazu, Kreuz offizieller Index × Index-Linie, Kreuz zweier Index-Linien, Fibonacci
function offxText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', up = x.up, P = n => nf(n, lang), side = ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short';
  if (x.type === 'frac') return { title: `${up ? '🔺' : '🔻'} ${ar ? 'فركتل للمؤشر الرسمي' : de ? 'Fraktal zum offiziellen Signal' : 'Fractal for the official signal'} · ${side}`,
    body: (ar ? `${up ? 'قاع' : 'قمة'} ${x.fb ? 'السعر' : 'فركتل'} ${dmyS(x.d)} عند ${P(x.p)} – إشارة المؤشر الرسمي ${dmyS(x.from)}.` : de ? `${x.fb ? (up ? 'Tiefster Kurs' : 'Höchster Kurs') : (up ? 'Tief-Fraktal' : 'Hoch-Fraktal')} am ${dmyS(x.d)} bei ${P(x.p)} – zum offiziellen Signal vom ${dmyS(x.from)}.` : `${x.fb ? (up ? 'Lowest price' : 'Highest price') : (up ? 'Low fractal' : 'High fractal')} on ${dmyS(x.d)} at ${P(x.p)} – for the official signal of ${dmyS(x.from)}.`) + tail + na };
  if (x.type === 'cross') return { title: `${up ? '🟢' : '🔴'} ${ar ? 'المؤشر الرسمي يقطع' : de ? 'Offizieller Index kreuzt' : 'Official index crosses'} ${x.name} · ${side}`,
    body: (ar ? `الخط الرسمي (${x.a}) قطع ${x.name} (${Math.round(x.b * 10) / 10}) ${up ? 'للأعلى' : 'للأسفل'} – ${dmyS(x.d)}.` : de ? `Die offizielle Linie (${x.a}) hat die ${x.name} (${Math.round(x.b * 10) / 10}) nach ${up ? 'oben' : 'unten'} gekreuzt – ${dmyS(x.d)}.` : `The official line (${x.a}) crossed the ${x.name} (${Math.round(x.b * 10) / 10}) ${up ? 'upwards' : 'downwards'} – ${dmyS(x.d)}.`) + tail + na };
  return { title: `${up ? '🟢' : '🔴'} ${ar ? 'المؤشر الرسمي' : de ? 'Offizieller Index' : 'Official index'} ${up ? '↑ ' + x.lim : '↓ ' + x.lim} · ${side}`,
    body: (ar ? `الخط الرسمي كان ${up ? '≤' : '≥'} ${x.lim} (الأقصى ${x.ext} في ${dmyS(x.extDay)}) وعاد الآن ${up ? 'فوق' : 'تحت'} ${x.lim} (${x.v}) – ${dmyS(x.d)}.` : de ? `Die offizielle Linie war ${up ? '≤' : '≥'} ${x.lim} (Extrem ${x.ext} am ${dmyS(x.extDay)}) und ist jetzt wieder ${up ? 'über' : 'unter'} ${x.lim} (${x.v}) – ${dmyS(x.d)}.` : `The official line was ${up ? '≤' : '≥'} ${x.lim} (extreme ${x.ext} on ${dmyS(x.extDay)}) and is now back ${up ? 'above' : 'below'} ${x.lim} (${x.v}) – ${dmyS(x.d)}.`) + tail + na };
}
function ilxText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', up = x.up;
  return { title: `${up ? '🟢' : '🔴'} ${x.na} × ${x.nb} (${ar ? 'المؤشر' : 'Index'}) · ${ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short'}`,
    body: (ar ? `${x.na} (${Math.round(x.a * 10) / 10}) قطع ${x.nb} (${Math.round(x.b * 10) / 10}) في رسم المؤشر ${up ? 'للأعلى' : 'للأسفل'} – إغلاق يوم ${dmyS(x.d)}.` : de ? `${x.na} (${Math.round(x.a * 10) / 10}) hat im Index-Chart die ${x.nb} (${Math.round(x.b * 10) / 10}) nach ${up ? 'oben' : 'unten'} gekreuzt – Tagesschluss ${dmyS(x.d)}.` : `${x.na} (${Math.round(x.a * 10) / 10}) crossed the ${x.nb} (${Math.round(x.b * 10) / 10}) in the index chart ${up ? 'upwards' : 'downwards'} – daily close ${dmyS(x.d)}.`) + tail + na };
}
function fibText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', up = x.up, P = n => nf(n, lang);
  return { title: `${up ? '🟢' : '🔴'} Fibonacci ${x.v} % · ${ar ? (up ? 'للأعلى' : 'للأسفل') : de ? (up ? 'nach oben' : 'nach unten') : (up ? 'upwards' : 'downwards')}`,
    body: (ar ? `السعر عبر مستوى فيبوناتشي ${x.v} % (${P(x.p)}) ${up ? 'للأعلى' : 'للأسفل'}.` : de ? `Der Kurs hat die Fibonacci-Stufe ${x.v} % (${P(x.p)}) nach ${up ? 'oben' : 'unten'} gekreuzt.` : `Price crossed the Fibonacci level ${x.v} % (${P(x.p)}) ${up ? 'upwards' : 'downwards'}.`) + tail + na };
}
function maText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', P = n => nf(n, lang), up = x.up, a = x.name || x.id, b = x.nameX || x.x;
  const title = `${up ? '🟢' : '🔴'} ${x.mode === 'cross' ? `${a} × ${b}` : a} · ${x.mode === 'touch' ? (ar ? 'لمس' : de ? 'berührt' : 'touched') : ar ? (up ? 'للأعلى' : 'للأسفل') : de ? (up ? 'nach oben' : 'nach unten') : (up ? 'upwards' : 'downwards')}`;
  const body = x.mode === 'cross' ? (ar ? `${a} (${P(x.ma)}) قطع ${b} (${P(x.mb)}) ${up ? 'للأعلى' : 'للأسفل'} – إغلاق يوم ${dmyS(x.d)}.` : de ? `${a} (${P(x.ma)}) hat ${b} (${P(x.mb)}) nach ${up ? 'oben' : 'unten'} gekreuzt – Tagesschluss ${dmyS(x.d)}.` : `${a} (${P(x.ma)}) crossed ${b} (${P(x.mb)}) ${up ? 'upwards' : 'downwards'} – daily close ${dmyS(x.d)}.`)
    : x.mode === 'touch' ? (ar ? `السعر لمس ${a} (${P(x.ma)}) الآن.` : de ? `Der Kurs berührt gerade die ${a} (${P(x.ma)}).` : `Price is touching the ${a} (${P(x.ma)}) now.`)
    : (ar ? `الإغلاق (${P(x.c)}) ${up ? 'فوق' : 'تحت'} ${a} (${P(x.ma)}) – يوم ${dmyS(x.d)}.` : de ? `Tagesschluss ${dmyS(x.d)} (${P(x.c)}) jetzt ${up ? 'über' : 'unter'} der ${a} (${P(x.ma)}).` : `Daily close ${dmyS(x.d)} (${P(x.c)}) now ${up ? 'above' : 'below'} the ${a} (${P(x.ma)}).`);
  return { title, body: body + tail + na };
}
const VWN = { de: { W: 'Wochen-VWAP', M: 'Monats-VWAP', Q: 'Quartals-VWAP', Y: 'Jahres-VWAP', close: 'Schluss kreuzt', ema8: 'EMA 8 kreuzt' }, en: { W: 'weekly VWAP', M: 'monthly VWAP', Q: 'quarterly VWAP', Y: 'yearly VWAP', close: 'close crosses', ema8: 'EMA 8 crosses' }, ar: { W: 'VWAP الأسبوعي', M: 'VWAP الشهري', Q: 'VWAP الربعي', Y: 'VWAP السنوي', close: 'الإغلاق يقطع', ema8: 'EMA 8 يقطع' } };
function vwapText(x, lang, tail, na) {
  const de = lang === 'de', ar = lang === 'ar', N = VWN[lang] || VWN.de, up = x.up, P = n => nf(n, lang);
  // V20: Kurs berührt den VWAP live
  if (x.vt === 'touch') return { title: `${up ? '🟢' : '🔴'} VWAP · ${N[x.anchor]} · ${ar ? 'لمس' : de ? 'berührt' : 'touched'}`, body: (ar ? `السعر (${P(x.price)}) يلمس ${N[x.anchor]} (${P(x.vw)}) الآن – ${up ? 'من الأسفل' : 'من الأعلى'}.` : de ? `Der Kurs (${P(x.price)}) berührt gerade den ${N[x.anchor]} (${P(x.vw)}) – ${up ? 'von unten' : 'von oben'}.` : `Price (${P(x.price)}) is touching the ${N[x.anchor]} (${P(x.vw)}) now – ${up ? 'from below' : 'from above'}.`) + tail + na };
  const title = `${up ? '🟢' : '🔴'} VWAP · ${N[x.vt]} ${N[x.anchor]} · ${ar ? (up ? 'لونغ' : 'شورت') : up ? 'Long' : 'Short'}`;
  const body = ar ? `إغلاق يوم ${dmyS(x.d)}: ${x.vt === 'ema8' ? `EMA 8 (${P(x.e8)})` : `الإغلاق (${P(x.c)})`} ${up ? 'فوق' : 'تحت'} ${N[x.anchor]} (${P(x.vw)}).`
    : de ? `Tagesschluss ${dmyS(x.d)}: ${x.vt === 'ema8' ? `EMA 8 (${P(x.e8)})` : `Schluss (${P(x.c)})`} jetzt ${up ? 'über' : 'unter'} dem ${N[x.anchor]} (${P(x.vw)}).`
    : `Daily close ${dmyS(x.d)}: ${x.vt === 'ema8' ? `EMA 8 (${P(x.e8)})` : `close (${P(x.c)})`} now ${up ? 'above' : 'below'} the ${N[x.anchor]} (${P(x.vw)}).`;
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
  if (kind === 'sma') return smaText(x, 'ar', tail, na);
  if (kind === 'vwap') return vwapText(x, 'ar', tail, na);
  if (kind === 'frac') return fracText(x, 'ar', tail, na);
  if (kind === 'ma') return maText(x, 'ar', tail, na);
  if (kind === 'offx') return offxText(x, 'ar', tail, na);
  if (kind === 'ilx') return ilxText(x, 'ar', tail, na);
  if (kind === 'fib') return fibText(x, 'ar', tail, na);
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
    const up = x.type === 'greed' || ((x.kind === 'cdl' || x.kind === 'vwap') && !x.up);
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
  if (kind === 'sma') return smaText(x, lang, tail, na);
  if (kind === 'vwap') return vwapText(x, lang, tail, na);
  if (kind === 'frac') return fracText(x, lang, tail, na);
  if (kind === 'ma') return maText(x, lang, tail, na);
  if (kind === 'offx') return offxText(x, lang, tail, na);
  if (kind === 'ilx') return ilxText(x, lang, tail, na);
  if (kind === 'fib') return fibText(x, lang, tail, na);
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
