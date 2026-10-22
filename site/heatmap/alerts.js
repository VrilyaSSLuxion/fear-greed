"use strict";
// Kauf-/Verkaufsalarme mit Einstieg, Stop-Loss und bis zu drei Take-Profit-Zielen.
// Gespeichert im Browser (localStorage). Sie laufen, solange die Seite geöffnet ist.

const Alerts = (() => {
  const KEY = "lhm.alerts", TG = "lhm.telegram";
  const ALL = [0, 1, 2, 3, 4];
  let alerts = [];
  try { alerts = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { alerts = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(alerts)); } catch (e) {} };
  const zoneCache = {}, wave = {};
  const fmt = (p) => p.toLocaleString("de-DE", { maximumFractionDigits: p >= 1000 ? 0 : p >= 1 ? 2 : 5 }) + " $";
  const fmtUsd = (v) => v >= 1e9 ? (v / 1e9).toFixed(2).replace(".", ",") + " Mrd. $" : v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + " Mio. $" : Math.round(v / 1e3) + " Tsd. $";

  function telegram() { try { return JSON.parse(localStorage.getItem(TG) || "{}"); } catch (e) { return {}; } }
  function setTelegram(token, chat) { try { localStorage.setItem(TG, JSON.stringify({ token: token.trim(), chat: chat.trim() })); } catch (e) {} }
  function notify(title, text, id) {
    Local.emit({ type: "alert", title, text, id });
    const tg = telegram();
    if (tg.token && tg.chat) {
      const body = new URLSearchParams({ chat_id: tg.chat, text: `${title}\n${text}` });
      fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, { method: "POST", body, mode: "no-cors" }).catch(() => {});
    }
  }

  function validate(a) {
    if (!Local.COINS.includes(a.coin)) return "Unbekannter Coin";
    if (!["buy", "sell"].includes(a.direction)) return "Richtung muss Kauf oder Verkauf sein";
    const t = a.trigger || {};
    if (!["now", "price", "zone", "liq_wave", "big_order"].includes(t.type)) return "Unbekannter Auslöser";
    if (t.type === "price" && !t.value) return "Preis für den Auslöser fehlt";
    const tps = (a.tps || []).filter((x) => x);
    if (!a.sl || !tps.length) return "Stop-Loss und mindestens ein Take-Profit sind nötig";
    const ref = a.entry || (t.type === "price" ? t.value : Local.model(a.coin).price);
    if (a.direction === "buy" && !(a.sl < ref && ref < Math.min(...tps))) return "Bei Kauf muss gelten: SL < Einstieg < TP";
    if (a.direction === "sell" && !(a.sl > ref && ref > Math.max(...tps))) return "Bei Verkauf muss gelten: SL > Einstieg > TP";
    return null;
  }
  async function create(a) {
    const err = validate(a); if (err) throw new Error(err);
    const tps = a.tps.filter((x) => x).map(Number).sort((x, y) => (a.direction === "sell" ? y - x : x - y)).slice(0, 3);
    const al = { id: Math.random().toString(16).slice(2, 12), coin: a.coin, direction: a.direction, trigger: a.trigger,
      entry: a.entry ? +a.entry : null, sl: +a.sl, tps, note: a.note || "", status: "armed", created: Date.now(), hits: [], result_r: null, history: [] };
    alerts.unshift(al); save();
    if (al.trigger.type === "now") trigger(al, Local.model(al.coin).price, "sofort");
    return al;
  }
  function remove(id) { alerts = alerts.filter((a) => a.id !== id); save(); return { ok: true }; }

  function suggest(coin, direction) {
    const m = Local.model(coin), p = m.price;
    const zones = m.zones(ALL, [LONG, SHORT], 0, 12);
    const distinct = (zs) => { const out = []; for (const z of zs) if (out.every((o) => Math.abs(z.price - o.price) > p * 0.005)) out.push(z); return out; };
    const above = distinct(zones.filter((z) => z.price > p).sort((a, b) => a.price - b.price));
    const below = distinct(zones.filter((z) => z.price < p).sort((a, b) => b.price - a.price));
    let tps, sl;
    if (direction === "buy") { tps = above.slice(0, 3).map((z) => z.price); if (!tps.length) tps = [p * 1.01, p * 1.02, p * 1.03]; sl = below.length ? below[0].price * 0.9985 : p * 0.985; }
    else { tps = below.slice(0, 3).map((z) => z.price); if (!tps.length) tps = [p * 0.99, p * 0.98, p * 0.97]; sl = above.length ? above[0].price * 1.0015 : p * 1.015; }
    const risk = Math.abs(p - sl);
    return { entry: p, sl, tps, rr: tps.map((t) => (risk ? Math.abs(t - p) / risk : 0)) };
  }

  function trigger(a, price, reason) {
    if (a.status !== "armed") return;
    a.status = "active"; a.triggered_at = Date.now(); if (!a.entry) a.entry = price;
    a.history.push({ t: a.triggered_at, text: "Ausgelöst: " + reason }); save();
    notify(`${a.direction === "buy" ? "KAUF" : "VERKAUF"}-Alarm ${a.coin}`,
      `${reason}\nEinstieg ${fmt(a.entry)} · SL ${fmt(a.sl)} · TP ${a.tps.map(fmt).join(" / ")}${a.note ? "\n" + a.note : ""}`, a.id);
  }
  function track(a, price) {
    const buy = a.direction === "buy", risk = Math.abs(a.entry - a.sl) || 1e-9; let msg = null;
    if (buy ? price <= a.sl : price >= a.sl) { a.status = "closed"; a.result_r = -1; a.hits.push("SL"); msg = `Stop-Loss erreicht bei ${fmt(price)} (−1 R)`; }
    else {
      const n = a.hits.filter((h) => h.startsWith("TP")).length;
      if (n < a.tps.length) {
        const tp = a.tps[n];
        if (buy ? price >= tp : price <= tp) {
          const r = Math.abs(tp - a.entry) / risk; a.hits.push(`TP${n + 1}`); a.result_r = Math.round(r * 100) / 100;
          msg = `TP${n + 1} erreicht bei ${fmt(tp)} (+${r.toFixed(2).replace(".", ",")} R)`; if (n + 1 === a.tps.length) a.status = "closed";
        }
      }
    }
    if (msg) { a.history.push({ t: Date.now(), text: msg }); if (a.status === "closed") a.closed_at = Date.now(); save();
      notify(`${a.coin} ${buy ? "Kauf" : "Verkauf"}: ${msg.split(" bei")[0]}`, msg, a.id); }
  }

  function onPrice(coin, price) {
    for (const a of alerts) {
      if (a.coin !== coin || a.status === "closed") continue;
      if (a.status === "armed") {
        const t = a.trigger;
        if (t.type === "price" && ((t.op === "above" && price >= t.value) || (t.op === "below" && price <= t.value)))
          trigger(a, price, `Kurs ${t.op === "above" ? "über" : "unter"} ${fmt(+t.value)}`);
        else if (t.type === "zone") for (const z of zoneCache[coin] || [])
          if (z.usd >= +(t.min_usd || 0) && Math.abs(z.price - price) / price * 100 <= +(t.within_pct || 0.3)) { trigger(a, price, `Kurs an Liquidationszone ${fmt(z.price)} (${fmtUsd(z.usd)})`); break; }
      } else if (a.status === "active") track(a, price);
    }
  }
  function onMinute(coin) { zoneCache[coin] = Local.model(coin).zones(ALL, [LONG, SHORT], 0, 6); }
  function onLiquidation(coin, side, usd, price) {
    const now = Date.now(), w = (wave[coin] = wave[coin] || []);
    w.push([now, side, usd]); while (w.length && w[0][0] < now - 60000) w.shift();
    for (const a of alerts) {
      if (a.coin !== coin || a.status !== "armed" || a.trigger.type !== "liq_wave") continue;
      const want = a.direction === "buy" ? LONG : SHORT, total = w.filter((x) => x[1] === want).reduce((s, x) => s + x[2], 0);
      if (total >= +(a.trigger.min_usd || 0)) trigger(a, price, `${want === LONG ? "Long" : "Short"}-Liquidationswelle ${fmtUsd(total)} in 60 s`);
    }
  }
  function onBubble(coin, b) {
    if (b.kind !== "trade") return;
    for (const a of alerts) if (a.coin === coin && a.status === "armed" && a.trigger.type === "big_order" && b.side === a.direction && b.usd >= +(a.trigger.min_usd || 0))
      trigger(a, b.price, `Große ${a.direction === "buy" ? "Kauf" : "Verkaufs"}order ${fmtUsd(b.usd)}`);
  }
  return { list: () => alerts, create, remove, suggest, onPrice, onMinute, onLiquidation, onBubble, telegram, setTelegram, test: () => notify("Test-Alarm", "Telegram und Browser-Meldungen funktionieren.") };
})();
