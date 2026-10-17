// Gemeinsame Rechenlogik für die Seite und das Hintergrund-Programm (V8):
// Signale ohne Repaint, Signal-Methoden, Divergenzen, Heatmap-Cluster, Alarm-Texte.
// Die Seite bekommt diesen Code beim Bauen eingesetzt (Platzhalter /*SHARED*/), das Programm importiert ihn.

const sClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sDay = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

/* ---------- Extremphasen-Signale (ohne Repaint) ---------- */
// rows: [[datum, wert, kurs]]. Phase bestätigt = 3. Tag in Folge jenseits der Schwelle.
// Wende bestätigt = Wert hat sich in der Phase um "back" Punkte vom Extrem gelöst.
export function phaseSignals(rows, hi, lo, back = 5) {
  const out = []; let run = null;
  for (const [d, v] of rows) {
    if (v == null) { run = null; continue; }
    const type = v >= hi ? 'greed' : v <= lo ? 'fear' : null;
    if (type && run && run.type === type) {
      run.days++; run.ext = type === 'greed' ? Math.max(run.ext, v) : Math.min(run.ext, v);
      if (run.days === 3) out.push({ d, kind: 'phase', type, v });
      if (run.days >= 3 && !run.turned && Math.abs(v - run.ext) >= back) { run.turned = true; out.push({ d, kind: 'turn', type, v, ext: run.ext }); }
    } else run = type ? { type, days: 1, ext: v, turned: false } : null;
  }
  return out;
}
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

/* ---------- Signal-Methoden ---------- */
// std = 7-Tage-Mittel (wie bisher) · daily = Tageswert (schneller) · both = 90 UND 365 Tage extrem (weniger Fehlsignale)
// peak = Extrempunkt (siehe peakSignals)
// price = Standard, aber nur wenn der Kurs nahe am 30-Tage-Hoch (Gier) bzw. -Tief (Angst) ist
export const METHODS = ['std', 'daily', 'both', 'price', 'peak'];
export function methodSignals(H, method, o) {
  const { col, rawCol, colA, colB, hi, lo, back = 5 } = o;
  if (method === 'peak') return peakSignals(divRows(H, col), o.peak || {});
  let rows;
  if (method === 'daily') rows = H.filter(r => r[rawCol] != null).map(r => [r[0], r[rawCol], r[3]]);
  else if (method === 'both') rows = H.filter(r => r[colA] != null && r[colB] != null).map(r => {
    const a = r[colA], b = r[colB];
    const v = a >= hi && b >= hi ? Math.min(a, b) : a <= lo && b <= lo ? Math.max(a, b) : sClamp(Math.round((a + b) / 2), lo + 1, hi - 1);
    return [r[0], v, r[3]];
  });
  else rows = H.filter(r => r[col] != null).map(r => [r[0], r[col], r[3]]);
  let sig = phaseSignals(rows, hi, lo, back);
  if (method === 'price') {
    const px = H.filter(r => r[3] != null), idx = new Map(px.map((r, i) => [r[0], i]));
    sig = sig.filter(s => {
      const i = idx.get(s.d); if (i == null) return false;
      const win = px.slice(Math.max(0, i - 30), i + 1).map(r => r[3]), p = px[i][3];
      return s.type === 'greed' ? p >= Math.max(...win) * (1 - (o.tol ?? 4) / 100) : p <= Math.min(...win) * (1 + (o.tol ?? 4) / 100);
    });
  }
  return sig;
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
    let n = 2, extras = 0;                                   // weitere Cluster heißen immer ab 3 (L2/S2 = nächster)
    for (const z of list || []) {
      if (extras >= (o.extra ?? 0)) break;
      if (inside(z)) continue;
      out.push({ id: side + (++n), side, kind: 'extra', z }); taken.push(z); extras++;
    }
  }
  return out;
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
export function alarmText(kind, x, lang = 'de') {
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
