// Sammelt alle Daten, berechnet den Index und schreibt die fertige Webseite nach --out.
// Aufruf: node collector/collect.mjs --out dist [--prev-url https://<name>.github.io/<repo>] [--prev-dir dist]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const OUT = path.resolve(arg('out', path.join(ROOT, 'dist')));
const PREV_URL = arg('prev-url', process.env.PREV_URL || '');
const PREV_DIR = arg('prev-dir', OUT);

// API-Keys: GitHub-Secrets (Umgebungsvariablen) oder lokale config.json
let local = {};
try { local = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch { }
const keys = {
  sosovalue: process.env.SOSOVALUE_API_KEY || local.sosovalueApiKey || '',
  coinglass: process.env.COINGLASS_API_KEY || local.coinglassApiKey || '',
  sosovalueUrl: process.env.SOSOVALUE_URL || local.sosovalueUrl || ''
};

// Zustand des letzten Laufs (Liquidationen, eigene Binance-Verläufe) laden
async function loadState() {
  if (PREV_URL) {
    try {
      const r = await fetch(PREV_URL.replace(/\/$/, '') + '/data/state.json?' + Date.now(), { signal: AbortSignal.timeout(20000) });
      if (r.ok) { console.log('Zustand von', PREV_URL, 'geladen'); return await r.json(); }
      console.log('Kein vorheriger Zustand online (HTTP ' + r.status + ') – starte neu');
    } catch (e) { console.log('Zustand nicht abrufbar:', e.message); }
  }
  try { return JSON.parse(fs.readFileSync(path.join(PREV_DIR, 'data', 'state.json'), 'utf8')); } catch { return {}; }
}

const t0 = Date.now();
const state = await loadState();
const { result, state: next } = await collect({ env: 'node', keys, state, wsSampleMs: +(process.env.WS_SAMPLE_MS || 60000) });

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
const { history, ...latest } = result;
fs.writeFileSync(path.join(OUT, 'data', 'latest.json'), JSON.stringify(latest));
fs.writeFileSync(path.join(OUT, 'data', 'history.json'), JSON.stringify(history));
fs.writeFileSync(path.join(OUT, 'data', 'state.json'), JSON.stringify(next));

// Webseite + Einzeldatei
const html = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
const engine = fs.readFileSync(path.join(ROOT, 'collector', 'engine.mjs'), 'utf8').replace(/^export /gm, '');
const standalone = html.replace('<!--ENGINE-->', `<script>window.FG_STANDALONE = true;</script>
<script type="module">\n${engine}\nwindow.FG_ENGINE = { collect };\nwindow.dispatchEvent(new Event('fg-engine'));\n</script>`);
fs.writeFileSync(path.join(OUT, 'fear-greed-v3.html'), standalone);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const m = latest.modes;
console.log(`Fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s · Index Binance ${m.binance.index} · Multi ${m.multi.index} · Offiziell ${latest.official.alt} · ${history.length} Tage Verlauf`);
const bad = latest.status.filter(s => s.ok === false);
if (bad.length) console.log('Fehlerhafte Quellen:', bad.map(s => `${s.name} (${s.msg})`).join('; '));
