// V22: Backtest „Welche Liquidations-Seite wird zuerst erreicht?“ – aus der langen Stunden-Historie (Bybit-Open-Interest + Binance-Stundenkerzen, ab 07.2020).
// Gleiches Modell wie die Heatmap (Hebel 5/10/25/50/100, neue Positionen aus OI-Zuwachs, erreichte Level sind liquidiert, sinkendes OI verkleinert alle).
// Alle 4 Stunden ein Zeitpunkt: nächster und stärkster Long-Cluster unter dem Kurs, Short-Cluster darüber → welche Seite berührt der Kurs zuerst (höchstens 7 Tage)?
// Dazu ein kleines lernendes Modell (logistische Regression: Abstand, Größe, Trend 24 Std./7 Tage), trainiert auf den ersten 75 %, geprüft auf den letzten 25 %.
const LEV = [[5, 0.10], [10, 0.30], [25, 0.30], [50, 0.20], [100, 0.10]], H = 3600e3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Cluster zu einem Zeitpunkt: Fächer von 0,25 % des Kurses, nur ±15 %; „nächster“ = erster Fächer mit mind. 50 % des stärksten (wie die Heatmap)
export function clustersAt(active, price) {
  const bin = price * 0.0025, L = new Map(), S = new Map();
  for (const a of active) { const d = a.p / price - 1; if (Math.abs(d) > 0.15) continue;
    const b = Math.round(a.p / bin); if (a.s > 0 && a.p < price) L.set(b, (L.get(b) || 0) + a.u); else if (a.s < 0 && a.p > price) S.set(b, (S.get(b) || 0) + a.u); }
  const side = (M, below) => { const rows = [...M.entries()].map(([b, u]) => ({ p: b * bin, u })).sort((x, y) => below ? y.p - x.p : x.p - y.p); if (!rows.length) return null;
    const mx = Math.max(...rows.map(r => r.u)), top = rows.find(r => r.u === mx), near = rows.find(r => r.u >= mx * 0.5); return { top, near }; };
  const l = side(L, true), s = side(S, false); return l && s ? { L: l, S: s } : null;
}
// erste Berührung ab Stunde j+1: 'L' (Tief ≤ Long-Level), 'S' (Hoch ≥ Short-Level), 'X' beide in derselben Stunde, null = keine in maxH Stunden
function firstHit(kl, j, pL, pS, maxH) {
  for (let k = j + 1; k < Math.min(kl.length, j + 1 + maxH); k++) { const hi = +kl[k][2], lo = +kl[k][3], a = lo <= pL, b = hi >= pS; if (a && b) return { s: 'X', h: k - j }; if (a) return { s: 'L', h: k - j }; if (b) return { s: 'S', h: k - j }; }
  return null;
}
const feats = (r) => [Math.log(r.dS / r.dL), Math.log(r.uS / r.uL), r.r24 * 10, r.r7 * 3];
const sig = z => 1 / (1 + Math.exp(-z));
function trainLR(X, Y, it = 400, lr = 0.3, l2 = 0.001) {
  const d = X[0].length; let w = new Array(d + 1).fill(0);
  for (let e = 0; e < it; e++) { const g = new Array(d + 1).fill(0);
    for (let i = 0; i < X.length; i++) { const z = w[0] + X[i].reduce((s, v, k) => s + v * w[k + 1], 0), err = sig(z) - Y[i]; g[0] += err; for (let k = 0; k < d; k++) g[k + 1] += err * X[i][k]; }
    w = w.map((v, k) => v - lr * (g[k] / X.length + (k ? l2 * v : 0))); }
  return w;
}
export const lrProb = (w, f) => sig(w[0] + f.reduce((s, v, k) => s + v * w[k + 1], 0));
export const heatFeats = feats;

// je Seite (welche ist näher) und Abstands-Verhältnis (fern/nah): Anteil „nähere zuerst“ und Zufalls-Erwartung
const QB = [[1, 1.5], [1.5, 2.5], [2.5, 99]];
function cellStat(R) { const o = {}; for (const sd of ['L', 'S']) o[sd] = QB.map(([a, b]) => { const S = R.filter(r => (r.dL < r.dS ? 'L' : 'S') === sd && (q => q >= a && q < b)(Math.max(r.dL, r.dS) / Math.min(r.dL, r.dS)));
    return { a, b, n: S.length, p: S.length ? S.filter(r => r.hit === sd).length / S.length : null, rw: S.length ? S.reduce((s, r) => s + Math.max(r.dL, r.dS) / (r.dL + r.dS), 0) / S.length : null, medH: S.length ? S.map(r => r.hh).sort((x, y) => x - y)[Math.floor(S.length / 2)] : null }; }); return o; }
export function heatBacktest(LH, o = {}) {
  const kl = LH.kl, oiM = new Map(LH.oi.map(([t, v]) => [t, v])), step = o.step || 4, warm = o.warm || 24 * 30, maxH = o.maxH || 168, t0 = Date.now();
  let active = [], prev = null; const snaps = [];
  for (let j = 0; j < kl.length; j++) {
    const k = kl[j], t = +k[0], h = +k[2], l = +k[3], c = +k[4];
    if (active.length) active = active.filter(a => a.s > 0 ? l > a.p : h < a.p);
    const cur = oiM.get(t);
    if (cur > 0) {
      if (prev > 0) { const d = cur - prev;
        if (d < 0) { const f = cur / prev; for (const a of active) a.u *= f; }
        else if (d > 0) { const usd = d * c, vol = +k[7] || 0, tb = +k[10] || 0, sh = clamp(vol > 0 ? tb / vol : 0.5, 0.3, 0.7), e = (h + l + c) / 3;
          for (const [lev, w] of LEV) { active.push({ s: 1, p: e * (1 - 1 / lev + 0.004), u: usd * sh * w }); active.push({ s: -1, p: e * (1 + 1 / lev - 0.004), u: usd * (1 - sh) * w }); } } }
      prev = cur;
    }
    if (j % 168 === 0 && active.length) active = active.filter(a => a.u >= 2000 && Math.abs(a.p / c - 1) <= 0.35);   // aufräumen
    if (j < warm || j % step || j + 1 >= kl.length) continue;
    const C = clustersAt(active, c); if (!C) continue;
    const r24 = j >= 24 ? c / +kl[j - 24][4] - 1 : 0, r7 = j >= 168 ? c / +kl[j - 168][4] - 1 : 0;
    for (const kind of ['near', 'top']) { const zL = C.L[kind], zS = C.S[kind]; if (!zL || !zS) continue;
      const hit = firstHit(kl, j, zL.p, zS.p, maxH);
      snaps.push({ kind, t, c, dL: (c - zL.p) / c, dS: (zS.p - c) / c, uL: zL.u, uS: zS.u, r24, r7, hit: hit?.s || null, hh: hit?.h ?? null }); }
  }
  const out = { updated: Date.now(), from: +kl[0][0], to: +kl.at(-1)[0], hours: kl.length, step, maxH, ms: 0, kinds: {} };
  for (const kind of ['near', 'top']) {
    const R = snaps.filter(r => r.kind === kind && (r.hit === 'L' || r.hit === 'S') && r.dL > 0 && r.dS > 0), n = R.length; if (n < 200) continue;
    const nearer = R.filter(r => (r.dL < r.dS ? 'L' : 'S') === r.hit).length, bigger = R.filter(r => (r.uL > r.uS ? 'L' : 'S') === r.hit).length;
    const agree = R.filter(r => (r.dL < r.dS) === (r.uL > r.uS)), agreeOk = agree.filter(r => (r.dL < r.dS ? 'L' : 'S') === r.hit).length;
    const conf = R.filter(r => (r.dL < r.dS) !== (r.uL > r.uS)), confNear = conf.filter(r => (r.dL < r.dS ? 'L' : 'S') === r.hit).length;
    const hrs = R.map(r => r.hh).sort((a, b) => a - b), in24 = R.filter(r => r.hh <= 24).length;
    // ehrlicher Vergleich: bei reinem Zufall (Kurs ohne Richtung) erreicht man die nähere Seite schon mit p = ferner / (nah + fern) zuerst
    const rw = R.reduce((s, r) => s + Math.max(r.dL, r.dS) / (r.dL + r.dS), 0) / n;
    // Verhältnis-Fächer: wie oft gewinnt die nähere Seite, je nachdem wie viel näher sie ist (Abstand weit / nah)
    const bk = [[1, 1.5], [1.5, 2.5], [2.5, 99]].map(([a, b]) => { const S = R.filter(r => { const q = Math.max(r.dL, r.dS) / Math.min(r.dL, r.dS); return q >= a && q < b; }); return { a, b, n: S.length, p: S.length ? S.filter(r => (r.dL < r.dS ? 'L' : 'S') === r.hit).length / S.length : null, rw: S.length ? S.reduce((s, r) => s + Math.max(r.dL, r.dS) / (r.dL + r.dS), 0) / S.length : null }; });
    // Seiten getrennt: wird die Long- bzw. Short-Seite öfter zuerst erreicht als der Zufall erwartet?
    const sideStat = sd => { const S = R.filter(r => (r.dL < r.dS ? 'L' : 'S') === sd); return { n: S.length, p: S.length ? S.filter(r => r.hit === sd).length / S.length : null, rw: S.length ? S.reduce((s, r) => s + Math.max(r.dL, r.dS) / (r.dL + r.dS), 0) / S.length : null }; };
    // lernendes Modell (zeitlich getrennt: erste 75 % lernen, letzte 25 % prüfen)
    const cut = Math.floor(n * 0.75), Xtr = R.slice(0, cut).map(feats), Ytr = R.slice(0, cut).map(r => r.hit === 'S' ? 1 : 0);
    const w = trainLR(Xtr, Ytr), te = R.slice(cut), accM = te.filter(r => (lrProb(w, feats(r)) >= 0.5 ? 'S' : 'L') === r.hit).length / te.length, accB = te.filter(r => (r.dL < r.dS ? 'L' : 'S') === r.hit).length / te.length;
    // für die Anzeige: Modell auf allen Daten neu lernen (gleiche Merkmale)
    const wAll = trainLR(R.map(feats), R.map(r => r.hit === 'S' ? 1 : 0));
    out.kinds[kind] = { n, none: snaps.filter(r => r.kind === kind && !r.hit).length, both: snaps.filter(r => r.kind === kind && r.hit === 'X').length,
      nearer: nearer / n, rw, bigger: bigger / n, nearL: sideStat('L'), nearS: sideStat('S'), cells: cellStat(R), agree: { n: agree.length, p: agree.length ? agreeOk / agree.length : null }, conflict: { n: conf.length, nearer: conf.length ? confNear / conf.length : null },
      medH: hrs[Math.floor(hrs.length / 2)], in24: in24 / n, buckets: bk,
      model: { w: wAll.map(v => +v.toFixed(4)), test: { n: te.length, acc: accM, base: accB }, use: te.length >= 300 && accM >= accB + 0.015 } };
  }
  out.ms = Date.now() - t0; return out;
}
