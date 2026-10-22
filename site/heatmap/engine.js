"use strict";
// Liquidations-Modell im Browser: aus Open-Interest-Zuwachs geschätzte Positionen je Hebel.
// Jede Minute mit steigendem OI erzeugt Segmente (USD, Liquidationspreis, Hebel, Seite, Start).
// Ein Segment endet, sobald der Kurs seinen Liquidationspreis berührt. Sinkt das OI, schrumpfen
// alle offenen Segmente anteilig über den kumulierten Faktor F(t): Wert = base * F(t).

const CFG = {
  leverages: [5, 10, 25, 50, 100],
  levWeights: [0.30, 0.30, 0.20, 0.12, 0.08],
  maintMargin: 0.005,
  decayHalfLifeDays: 14,
};
const LONG = 1, SHORT = -1, OPEN = 2 ** 52;

class Grow {
  constructor(Type, cap = 4096) { this.T = Type; this.a = new Type(cap); this.n = 0; }
  push(v) { if (this.n >= this.a.length) this._grow(this.n + 1); this.a[this.n++] = v; }
  _grow(need) { const b = new this.T(Math.max(need, this.a.length * 2)); b.set(this.a.subarray(0, this.n)); this.a = b; }
  get v() { return this.a.subarray(0, this.n); }
  get last() { return this.a[this.n - 1]; }
}

class SymbolModel {
  constructor(coin) {
    this.coin = coin;
    this.t = new Grow(Float64Array); this.o = new Grow(Float64Array); this.h = new Grow(Float64Array);
    this.l = new Grow(Float64Array); this.c = new Grow(Float64Array); this.vol = new Grow(Float64Array);
    this.tb = new Grow(Float64Array); this.oi = new Grow(Float64Array); this.logf = new Grow(Float64Array);
    this.sStart = new Grow(Int32Array, 65536); this.sEnd = new Grow(Float64Array, 65536); this.sLiq = new Grow(Float64Array, 65536);
    this.sBase = new Grow(Float64Array, 65536); this.sLev = new Grow(Int8Array, 65536); this.sSide = new Grow(Int8Array, 65536);
    this.alive = [];
    this.live = null; this.price = NaN; this.change24 = 0; this.oiAll = {}; this.liqEvents = [];
    this.bubbles = []; this.walls = []; this.hl = {}; this.updated = 0;
    const sw = CFG.levWeights.reduce((a, b) => a + b, 0); this.levW = CFG.levWeights.map((w) => w / sw);
    this.decay = Math.log(0.5) / (CFG.decayHalfLifeDays * 1440);
  }
  get n() { return this.t.n; }

  _newSegments(i, dOi) {
    const h = this.h.a[i], l = this.l.a[i], c = this.c.a[i], vol = this.vol.a[i], tb = this.tb.a[i];
    const entry = (h + l + c) / 3;
    const share = Math.min(0.75, Math.max(0.25, vol > 0 ? tb / vol : 0.5));
    const fStart = Math.exp(this.logf.a[i]), mm = CFG.maintMargin;
    const first = this.sStart.n;
    CFG.leverages.forEach((lev, li) => {
      const w = this.levW[li];
      for (const [side, part] of [[LONG, share], [SHORT, 1 - share]]) {
        this.sStart.push(i); this.sEnd.push(OPEN);
        this.sLiq.push(side === LONG ? entry * (1 - 1 / lev + mm) : entry * (1 + 1 / lev - mm));
        this.sBase.push(dOi * w * part / fStart); this.sLev.push(li); this.sSide.push(side);
      }
    });
    return first;
  }

  // rows: [minute, o, h, l, c, volUsd, takerBuyUsd, oiUsd|NaN]
  bootstrap(rows) {
    if (!rows.length) return;
    const n0 = this.n;
    for (const r of rows) { this.t.push(r[0]); this.o.push(r[1]); this.h.push(r[2]); this.l.push(r[3]); this.c.push(r[4]); this.vol.push(r[5]); this.tb.push(r[6]); }
    // OI-Lücken linear füllen
    const oi = rows.map((r) => r[7]);
    const known = []; oi.forEach((v, i) => { if (!isNaN(v)) known.push(i); });
    if (known.length >= 2) {
      let k = 0;
      for (let i = 0; i < oi.length; i++) {
        if (i <= known[0]) { oi[i] = oi[known[0]]; continue; }
        if (i >= known[known.length - 1]) { oi[i] = oi[known[known.length - 1]]; continue; }
        while (known[k + 1] < i) k++;
        const a = known[k], b = known[k + 1];
        oi[i] = oi[a] + (oi[b] - oi[a]) * (i - a) / (b - a);
      }
    }
    let lf = 0;
    for (let i = 0; i < oi.length; i++) {
      this.oi.push(oi[i]);
      const d = i ? oi[i] - oi[i - 1] : 0;
      const red = d < 0 && isFinite(d) ? Math.min(0.9, -d / Math.max(oi[i - 1], 1)) : 0;
      lf += Math.log1p(-red) + this.decay; this.logf.push(lf);
      if (d > 0) this._newSegments(n0 + i, d);
    }
    this._resolveEndsBulk();
    this.price = this.c.last;
    this.alive = []; const e = this.sEnd.a; for (let s = 0; s < this.sEnd.n; s++) if (e[s] === OPEN) this.alive.push(s);
  }

  // Erste Minute nach Start, in der der Kurs den Liquidationspreis berührt (Sparse-Table + binäre Suche).
  _resolveEndsBulk() {
    const n = this.n; if (!n || !this.sStart.n) return;
    const lows = this.l.v, highs = this.h.v;
    const K = Math.max(1, Math.floor(Math.log2(n)) + 1);
    const stMin = [Float64Array.from(lows)], stMax = [Float64Array.from(highs)];
    for (let k = 1; k < K; k++) {
      const step = 1 << (k - 1), pm = stMin[k - 1], px = stMax[k - 1];
      const m = Float64Array.from(pm), x = Float64Array.from(px);
      for (let i = 0; i + step < n; i++) { m[i] = Math.min(pm[i], pm[i + step]); x[i] = Math.max(px[i], px[i + step]); }
      stMin.push(m); stMax.push(x);
    }
    const st = this.sStart.a, liq = this.sLiq.a, side = this.sSide.a, end = this.sEnd.a;
    for (let s = 0; s < this.sStart.n; s++) {
      let pos = st[s] + 1; const L = liq[s], isLong = side[s] === LONG;
      for (let k = K - 1; k >= 0; k--) {
        const span = 1 << k; if (pos + span > n) continue;
        const safe = isLong ? stMin[k][pos] > L : stMax[k][pos] < L;
        if (safe) pos += span;
      }
      end[s] = pos < n ? pos : OPEN;
    }
  }

  addMinute(minute, o, h, l, c, vol, tb, oiUsd) {
    if (this.n && minute <= this.t.last) return;
    const prevOi = this.oi.n ? this.oi.last : NaN;
    if (oiUsd == null || isNaN(oiUsd)) oiUsd = prevOi;
    this.t.push(minute); this.o.push(o); this.h.push(h); this.l.push(l); this.c.push(c); this.vol.push(vol); this.tb.push(tb); this.oi.push(oiUsd);
    const d = isNaN(prevOi) || isNaN(oiUsd) ? 0 : oiUsd - prevOi;
    const red = d < 0 ? Math.min(0.9, -d / Math.max(prevOi, 1)) : 0;
    this.logf.push((this.logf.n ? this.logf.last : 0) + Math.log1p(-red) + this.decay);
    const i = this.n - 1;
    const keep = [];
    for (const s of this.alive) {
      const hit = this.sSide.a[s] === LONG ? this.sLiq.a[s] >= l : this.sLiq.a[s] <= h;
      if (hit) this.sEnd.a[s] = i; else keep.push(s);
    }
    this.alive = keep;
    if (d > 0) { const first = this._newSegments(i, d); for (let s = first; s < this.sStart.n; s++) this.alive.push(s); }
    this.price = c;
  }

  // ------------------------------------------------------------ Abfragen
  rangeIdx(tf, rangeMin) {
    if (!this.n) return [0, 0];
    const t0 = Math.floor((this.t.last - rangeMin) / tf) * tf;
    let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.t.a[m] < t0) lo = m + 1; else hi = m; }
    return [lo, this.n];
  }
  sinceIdx(sinceMin) {
    if (sinceMin <= 0 || !this.n) return 0;
    const t0 = this.t.last - sinceMin;
    let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.t.a[m] < t0) lo = m + 1; else hi = m; }
    return lo;
  }
  candles(tf, rangeMin) {
    const [i0, i1] = this.rangeIdx(tf, rangeMin);
    const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
    let key = null;
    for (let i = i0; i < i1; i++) {
      const k = Math.floor(this.t.a[i] / tf);
      if (k !== key) { key = k; out.t.push(k * tf * 60); out.o.push(this.o.a[i]); out.h.push(this.h.a[i]); out.l.push(this.l.a[i]); out.c.push(this.c.a[i]); out.v.push(this.vol.a[i]); }
      else { const j = out.t.length - 1; out.h[j] = Math.max(out.h[j], this.h.a[i]); out.l[j] = Math.min(out.l[j], this.l.a[i]); out.c[j] = this.c.a[i]; out.v[j] += this.vol.a[i]; }
    }
    const lv = this.live;
    if (lv && out.t.length && lv.minute > this.t.last) {
      const k = Math.floor(lv.minute / tf);
      if (k * tf * 60 === out.t[out.t.length - 1]) { const j = out.t.length - 1; out.h[j] = Math.max(out.h[j], lv.h); out.l[j] = Math.min(out.l[j], lv.l); out.c[j] = lv.c; }
      else { out.t.push(k * tf * 60); out.o.push(lv.o); out.h.push(lv.h); out.l.push(lv.l); out.c.push(lv.c); out.v.push(lv.vol); }
    }
    return out;
  }
  _sel(levs, sides, sinceI) {
    const L = new Uint8Array(CFG.leverages.length); levs.forEach((x) => L[x] = 1);
    const wantL = sides.includes(LONG), wantS = sides.includes(SHORT);
    return (s) => L[this.sLev.a[s]] && (this.sSide.a[s] === LONG ? wantL : wantS) && this.sStart.a[s] >= sinceI;
  }
  heatmap(tf, rangeMin, pmin, pmax, rows, levs, sides, sinceMin) {
    const [i0, i1] = this.rangeIdx(tf, rangeMin);
    if (i1 <= i0) return { cols: 0, grid: null };
    const colOf = new Int32Array(i1 - i0); const colEnd = [];
    let key = Math.floor(this.t.a[i0] / tf), col = 0;
    for (let i = i0; i < i1; i++) { const k = Math.floor(this.t.a[i] / tf); if (k !== key) { colEnd.push(i - 1); key = k; col++; } colOf[i - i0] = col; }
    colEnd.push(i1 - 1);
    const cols = col + 1, W = cols + 1;
    const grid = new Float64Array(rows * W);
    const sel = this._sel(levs, sides, this.sinceIdx(sinceMin));
    const st = this.sStart.a, en = this.sEnd.a, liq = this.sLiq.a, base = this.sBase.a, span = pmax - pmin;
    for (let s = 0; s < this.sStart.n; s++) {
      if (st[s] >= i1 || en[s] <= i0) continue;
      const L = liq[s]; if (L < pmin || L >= pmax) continue;
      if (!sel(s)) continue;
      const a = Math.max(st[s], i0) - i0, e = Math.min(Math.min(en[s], i1), i1 - 1) - i0;
      const r = Math.min(rows - 1, Math.floor((L - pmin) / span * rows));
      grid[r * W + colOf[a]] += base[s]; grid[r * W + colOf[e] + 1] -= base[s];
    }
    const f = colEnd.map((i) => Math.exp(this.logf.a[i]));
    const out = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      let acc = 0;
      for (let c = 0; c < cols; c++) { acc += grid[r * W + c]; out[r * cols + c] = Math.max(0, acc * f[c]); }
    }
    return { cols, grid: out };
  }
  currentLevels(levs, sides, sinceMin) {
    const sel = this._sel(levs, sides, this.sinceIdx(sinceMin)); const f = this.logf.n ? Math.exp(this.logf.last) : 1;
    const out = [];
    for (const s of this.alive) if (sel(s)) out.push([this.sLiq.a[s], this.sBase.a[s] * f, this.sSide.a[s]]);
    return out;
  }
  profile(pmin, pmax, rows, levs, sides, sinceMin) {
    const longs = new Array(rows).fill(0), shorts = new Array(rows).fill(0);
    for (const [L, usd, side] of this.currentLevels(levs, sides, sinceMin)) {
      if (L < pmin || L >= pmax) continue;
      const r = Math.min(rows - 1, Math.floor((L - pmin) / (pmax - pmin) * rows));
      if (side === LONG) longs[r] += usd; else shorts[r] += usd;
    }
    return { longs, shorts };
  }
  zones(levs, sides, sinceMin, count = 2, widthPct = 0.25, maxDistPct = 15) {
    const p = this.price; if (!p || isNaN(p)) return [];
    const w = p * widthPct / 100, out = [];
    const lv = this.currentLevels(levs, sides, sinceMin);
    for (const [side, above] of [[SHORT, true], [LONG, false]]) {
      const bins = new Map();
      for (const [L, usd, s] of lv) {
        if (s !== side || (above ? L <= p : L >= p) || Math.abs(L - p) > p * maxDistPct / 100) continue;
        const b = Math.floor(L / w); const x = bins.get(b) || [0, 0]; x[0] += usd; x[1] += usd * L; bins.set(b, x);
      }
      [...bins.values()].sort((a, b) => b[0] - a[0]).slice(0, count).forEach(([usd, pv]) => {
        const price = pv / usd; out.push({ price, usd, side: side === SHORT ? "short" : "long", dist_pct: (price - p) / p * 100 });
      });
    }
    return out.sort((a, b) => b.price - a.price);
  }
  volumeProfile(tf, rangeMin, pmin, pmax, rows) {
    const [i0, i1] = this.rangeIdx(tf, rangeMin);
    const buy = new Float64Array(rows + 1), sell = new Float64Array(rows + 1), sc = rows / (pmax - pmin);
    const clampR = (x) => Math.min(rows - 1, Math.max(0, Math.floor(x)));
    for (let i = i0; i < i1; i++) {
      const r0 = clampR((this.l.a[i] - pmin) * sc), r1 = clampR((this.h.a[i] - pmin) * sc), sp = r1 - r0 + 1;
      const b = this.tb.a[i] / sp, s = (this.vol.a[i] - this.tb.a[i]) / sp;
      buy[r0] += b; buy[r1 + 1] -= b; sell[r0] += s; sell[r1 + 1] -= s;
    }
    const B = [], S = [], tot = []; let ab = 0, as = 0;
    for (let r = 0; r < rows; r++) { ab += buy[r]; as += sell[r]; B.push(ab); S.push(as); tot.push(ab + as); }
    let poc = 0; for (let r = 1; r < rows; r++) if (tot[r] > tot[poc]) poc = r;
    let lo = poc, hi = poc, acc = tot[poc]; const target = tot.reduce((a, b) => a + b, 0) * 0.7;
    while (acc < target && (lo > 0 || hi < rows - 1)) {
      const down = lo > 0 ? tot[lo - 1] : -1, up = hi < rows - 1 ? tot[hi + 1] : -1;
      if (up >= down) acc += tot[++hi]; else acc += tot[--lo];
    }
    return { buy: B, sell: S, poc, val: lo, vah: hi };
  }
  liqTotals(nowMs) {
    const cut = nowMs - 86400000; while (this.liqEvents.length && this.liqEvents[0][0] < cut) this.liqEvents.shift();
    let longs = 0, shorts = 0; for (const e of this.liqEvents) { if (e[1] === LONG) longs += e[2]; else shorts += e[2]; }
    return { longs, shorts };
  }
}
