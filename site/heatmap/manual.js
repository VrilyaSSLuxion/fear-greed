// V21b: Handbuch der Heatmap-Seite (Knopf „📖 Handbuch“ oben in der Reiter-Leiste)
window.PAGE_MANUAL = {
  de: `<h2>Liquidation Heatmap – so funktioniert sie</h2>
<p>Die Seite schätzt, <b>wo Positionen liquidiert würden</b>: Steigt das Open Interest, werden neue Positionen angenommen (mit typischen Hebeln 5×–100×, Long/Short nach Käufer-Anteil). Erreicht der Kurs einen Liquidationspreis, verschwindet die Position. Helle Bänder = viele mögliche Liquidationen. Eine <b>Schätzung</b>, keine echten Daten der Börsen.</p>
<h3>Zeitraum und Kerzen</h3><ul><li>Oben rechts der <b>Zeitraum</b> (12 Std. … 1 Jahr), in der Leiste die <b>Kerzengröße</b> (5m … 1W). Bei langen Zeiträumen wechselt die Kerze automatisch auf eine größere.</li>
<li><b>Bis 30 Tage</b>: aus Minutenkerzen und dem 5-Minuten-Open-Interest von Binance (genau). <b>Länger (6 Monate, 1 Jahr)</b>: Stundenwerte, die das PC-Programm liefert (Binance-Kerzen + Open Interest von Bybit, an Binance angeglichen) – gröber.</li>
<li>Der Verlauf wird im Browser zwischengespeichert; beim nächsten Öffnen lädt nur das Neue.</li></ul>
<h3>Rechts und unten</h3><ul><li><b>Modell</b> = aktuelle Liquidations-Stufen je Preis; <b>Hyperliquid</b> = echte große Positionen dort (wenn eingeschaltet).</li>
<li><b>Volumenprofil</b> links: gehandeltes Volumen je Preis (Kauf/Verkauf), <b>POC</b> = meistes Volumen, <b>VAH/VAL</b> = Grenzen der Value Area (70 %). Farben, Linien und Deckkraft in den Einstellungen.</li>
<li><b>Bubbles</b> = große Trades, <b>Orderbuch-Wände</b> = große Aufträge im tiefen Orderbuch (Schwellen in Mio. $ einstellbar).</li>
<li><b>Ticker unten</b>: Longs/Shorts der letzten 24 Std. – bei Bitcoin vom PC-Programm (wie auf der Fear-&amp;-Greed-Seite).</li></ul>
<h3>Bedienung</h3><ul><li>Mausrad/Finger: Zeit zoomen · ziehen: verschieben · rechte Skala ziehen: Preis zoomen · Doppelklick: zurück.</li>
<li><b>Rechtsklick</b> in den Chart: Kauf-/Verkaufs-Alarm oder Preis-Alarm an dieser Stelle.</li>
<li><b>Alarme</b> (rechts): Auslöser (Preis, Zone, Liquidationswelle, große Order), Einstieg, Stop-Loss, bis 3 Ziele – danach verfolgt die Seite TP/SL und zeigt das Ergebnis in R. Nur solange die Seite offen ist; mit Telegram auch aufs Handy.</li>
<li><b>Andere Heatmaps</b>: Vergleich mit fremden Modellen (andere Modelle, andere Ergebnisse).</li></ul>
<p class="muted">Keine Anlageberatung.</p>`,
  en: `<h2>Liquidation Heatmap – how it works</h2>
<p>The page estimates <b>where positions would be liquidated</b>: when open interest rises, new positions are assumed (typical leverage 5×–100×, long/short by buyer share). When price reaches a liquidation price, the position disappears. Bright bands = many possible liquidations. An <b>estimate</b>, not real exchange data.</p>
<h3>Period and candles</h3><ul><li>Top right the <b>period</b> (12 h … 1 year), in the bar the <b>candle size</b> (5m … 1W). For long periods the candle switches to a larger one automatically.</li>
<li><b>Up to 30 days</b>: from 1-minute candles and Binance 5-minute open interest (precise). <b>Longer (6 months, 1 year)</b>: hourly values delivered by the PC program (Binance candles + Bybit open interest scaled to Binance) – coarser.</li>
<li>History is cached in the browser; next time only new data is loaded.</li></ul>
<h3>Right side and bottom</h3><ul><li><b>Model</b> = current liquidation levels by price; <b>Hyperliquid</b> = real large positions there (when enabled).</li>
<li><b>Volume profile</b> on the left: traded volume by price (buy/sell), <b>POC</b> = most volume, <b>VAH/VAL</b> = value area bounds (70 %). Colours, lines and opacity in the settings.</li>
<li><b>Bubbles</b> = large trades, <b>order book walls</b> = large orders in the deep order book (thresholds in M $).</li>
<li><b>Ticker at the bottom</b>: longs/shorts of the last 24 h – for Bitcoin from the PC program (as on the Fear &amp; Greed page).</li></ul>
<h3>Usage</h3><ul><li>Mouse wheel/fingers: zoom time · drag: pan · drag the right scale: zoom price · double-click: reset.</li>
<li><b>Right-click</b> in the chart: buy/sell alert or price alert at that spot.</li>
<li><b>Alerts</b> (right): trigger (price, zone, liquidation wave, large order), entry, stop loss, up to 3 targets – the page then tracks TP/SL and shows the result in R. Only while the page is open; with Telegram also on your phone.</li>
<li><b>Other heatmaps</b>: compare with third-party models (different models, different results).</li></ul>
<p class="muted">Not investment advice.</p>`,
  ar: `<h2>خريطة التصفيات – كيف تعمل</h2>
<p>تقدّر الصفحة <b>أين ستُصفّى المراكز</b>: عندما ترتفع الفائدة المفتوحة تُفترض مراكز جديدة (برافعة 5×–100×، شراء/بيع حسب حصة المشترين). عندما يصل السعر إلى سعر التصفية يختفي المركز. الأشرطة الفاتحة = تصفيات محتملة كثيرة. <b>تقدير</b> وليس بيانات حقيقية من البورصات.</p>
<h3>الفترة والشموع</h3><ul><li>أعلى اليمين <b>الفترة</b> (12 ساعة … سنة)، وفي الشريط <b>حجم الشمعة</b>. في الفترات الطويلة تتغير الشمعة تلقائياً إلى أكبر.</li>
<li><b>حتى 30 يوماً</b>: من شموع الدقيقة والفائدة المفتوحة لـ Binance (دقيق). <b>أطول (6 أشهر، سنة)</b>: قيم بالساعة يوفرها برنامج الحاسوب – أقل دقة.</li>
<li>يُحفظ السجل في المتصفح؛ في المرة التالية يُحمّل الجديد فقط.</li></ul>
<h3>اليمين والأسفل</h3><ul><li><b>النموذج</b> = مستويات التصفية الحالية حسب السعر؛ <b>Hyperliquid</b> = مراكز كبيرة حقيقية هناك.</li>
<li><b>ملف الحجم</b> يساراً: الحجم المتداول حسب السعر، <b>POC</b> = أكبر حجم، <b>VAH/VAL</b> = حدود منطقة القيمة (70 %).</li>
<li><b>الفقاعات</b> = صفقات كبيرة، <b>جدران الأوامر</b> = أوامر كبيرة في دفتر الأوامر العميق.</li>
<li><b>الشريط بالأسفل</b>: الشراء/البيع لآخر 24 ساعة – لبيتكوين من برنامج الحاسوب.</li></ul>
<h3>الاستخدام</h3><ul><li>عجلة الفأرة/الأصابع: تكبير الوقت · السحب: تحريك · سحب المقياس الأيمن: تكبير السعر · نقر مزدوج: إعادة.</li>
<li><b>النقر الأيمن</b> في الرسم: تنبيه شراء/بيع أو تنبيه سعر في هذا المكان.</li>
<li><b>التنبيهات</b>: المحفّز والدخول ووقف الخسارة وحتى 3 أهداف – فقط والصفحة مفتوحة؛ مع تيليغرام على الهاتف أيضاً.</li></ul>
<p class="muted">ليست نصيحة استثمارية.</p>`
};
