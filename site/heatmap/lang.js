/* V21: Sprache der Heatmap-Seite (Deutsch / Englisch / Arabisch) – folgt der Reiter-Leiste (Ereignis „sitelang“).
   Tauscht Oberflächentexte (Beschriftungen, Knöpfe, Platzhalter, Tooltips) über eine Wortliste aus; neue Texte der App werden mitübersetzt (MutationObserver).
   Frei zusammengesetzte Meldungen (z. B. Alarm-Texte mit Zahlen) bleiben vorerst Deutsch. */
(function () {
  var D = {
    'alle Börsen': ['all exchanges', 'كل البورصات'], '24 Std.': ['24 h', '24 ساعة'], '3 Tage': ['3 days', '3 أيام'], '7 Tage': ['7 days', '7 أيام'], '30 Tage': ['30 days', '30 يوماً'], '6 Monate': ['6 months', '6 أشهر'],
    'Ganze Ansicht': ['Full view', 'العرض الكامل'], 'Lade Daten …': ['Loading data …', 'جارٍ تحميل البيانات …'], 'Stärkste Zonen jetzt': ['Strongest zones now', 'أقوى المناطق الآن'],
    'Einstellungen': ['Settings', 'الإعدادات'], 'Hebel': ['Leverage', 'الرافعة'], 'Seite': ['Side', 'الجانب'], 'Nur neu eröffnete Positionen': ['Newly opened positions only', 'المراكز المفتوحة حديثاً فقط'],
    'Alle': ['All', 'الكل'], 'Echte Positionen Hyperliquid': ['Real Hyperliquid positions', 'مراكز Hyperliquid الحقيقية'], 'Aus': ['Off', 'إيقاف'], 'An': ['On', 'تشغيل'], 'Einblenden': ['Show', 'إظهار'],
    'Ebenen': ['Layers', 'الطبقات'], 'Volumenprofil': ['Volume profile', 'ملف الحجم'], 'Orderbuch-Wände': ['Order book walls', 'جدران دفتر الأوامر'], 'Raster im Chart': ['Grid in chart', 'الشبكة في الرسم'],
    'Farbstärke der Heatmap': ['Heatmap colour strength', 'شدة ألوان الخريطة'], 'Breite Volumenprofil': ['Volume profile width', 'عرض ملف الحجم'], 'Orderbuch-Wände ab (Mio. $)': ['Order book walls from (M $)', 'جدران الأوامر من (مليون $)'],
    'Aus dem tiefen Orderbuch (1000 Stufen, alle 15 s), in Preis-Fächern von 0,05 % zusammengefasst.': ['From the deep order book (1000 levels, every 15 s), grouped in 0.05 % price bins.', 'من دفتر الأوامر العميق (1000 مستوى، كل 15 ثانية)، مجمّعة في نطاقات سعرية 0.05 %.'],
    'Bubbles ab (Mio. $)': ['Bubbles from (M $)', 'الفقاعات من (مليون $)'], 'Gilt für neue Trades nach dem Speichern.': ['Applies to new trades after saving.', 'يسري على الصفقات الجديدة بعد الحفظ.'],
    'Andere Heatmaps': ['Other heatmaps', 'خرائط حرارية أخرى'], 'Fremde Seiten mit eigenen Modellen – zum Vergleich. Andere Modelle, andere Ergebnisse.': ['Third-party sites with their own models – for comparison. Different models, different results.', 'مواقع أخرى بنماذجها الخاصة – للمقارنة. نماذج مختلفة ونتائج مختلفة.'],
    'Noch keine Daten.': ['No data yet.', 'لا توجد بيانات بعد.'], 'Alarme': ['Alerts', 'التنبيهات'], '+ Neuer Alarm': ['+ New alert', '+ تنبيه جديد'], 'Kauf': ['Buy', 'شراء'], 'Verkauf': ['Sell', 'بيع'], 'Auslöser': ['Trigger', 'المحفّز'],
    'Kurs steigt über': ['Price rises above', 'السعر يرتفع فوق'], 'Kurs fällt unter': ['Price falls below', 'السعر ينخفض تحت'], 'Kurs erreicht Liquidationszone': ['Price reaches liquidation zone', 'السعر يصل إلى منطقة التصفية'],
    'Liquidationswelle (60 s)': ['Liquidation wave (60 s)', 'موجة تصفيات (60 ث)'], 'Große Order': ['Large order', 'أمر كبير'], 'Sofort verfolgen': ['Track immediately', 'تتبّع فوراً'], 'Preis': ['Price', 'السعر'],
    'Zone ab (Mio. $)': ['Zone from (M $)', 'المنطقة من (مليون $)'], 'Abstand höchstens (%)': ['Max distance (%)', 'أقصى مسافة (%)'], 'Betrag ab (Mio. $)': ['Amount from (M $)', 'المبلغ من (مليون $)'],
    'Einstieg': ['Entry', 'الدخول'], 'Notiz': ['Note', 'ملاحظة'], 'Vorschlag aus Zonen': ['Suggest from zones', 'اقتراح من المناطق'], 'Speichern': ['Save', 'حفظ'], 'Abbrechen': ['Cancel', 'إلغاء'], 'Löschen': ['Delete', 'حذف'],
    'Tipp: Feld anklicken, dann in den Chart klicken, um den Preis zu übernehmen – oder Rechtsklick in den Chart.': ['Tip: click a field, then click in the chart to take the price – or right-click in the chart.', 'نصيحة: انقر حقلاً ثم انقر في الرسم لأخذ السعر – أو انقر بالزر الأيمن في الرسم.'],
    'Telegram-Benachrichtigung (optional)': ['Telegram notification (optional)', 'إشعار تيليغرام (اختياري)'],
    'Alarme laufen, solange diese Seite offen ist. Mit Telegram kommen sie zusätzlich aufs Handy. Token und Chat-ID bleiben nur in diesem Browser gespeichert.': ['Alerts run while this page is open. With Telegram they also reach your phone. Token and chat ID stay in this browser only.', 'تعمل التنبيهات طالما الصفحة مفتوحة. مع تيليغرام تصل أيضاً إلى الهاتف. يبقى الرمز ومعرّف المحادثة في هذا المتصفح فقط.'],
    'Speichern und Test senden': ['Save and send test', 'حفظ وإرسال اختبار'], 'Stand –': ['As of –', 'حتى –'], 'LIQUIDATIONEN': ['LIQUIDATIONS', 'التصفيات'], 'DEMO-DATEN': ['DEMO DATA', 'بيانات تجريبية'],
    'Coin wählen': ['Choose coin', 'اختر العملة'], 'Kurs beim Auslösen': ['Price when triggered', 'السعر عند التفعيل'], 'z. B. 123456789': ['e.g. 123456789', 'مثلاً 123456789'],
    '🟢 Kauf-Alarm hier': ['🟢 Buy alert here', '🟢 تنبيه شراء هنا'], '🔴 Verkauf-Alarm hier': ['🔴 Sell alert here', '🔴 تنبيه بيع هنا'], 'Ausgelöst: ': ['Triggered: ', 'تم التفعيل: '],
    '12 Std.': ['12 h', '12 ساعة'], '1 Jahr': ['1 year', 'سنة'], 'Lade lange Historie (Stundenwerte) …': ['Loading long history (hourly) …', 'جارٍ تحميل السجل الطويل (بالساعة) …'],
    'Volumenprofil – Farben (Kauf · Verkauf · POC · VAH/VAL)': ['Volume profile – colours (buy · sell · POC · VAH/VAL)', 'ملف الحجم – الألوان (شراء · بيع · POC · VAH/VAL)'],
    'VAH- und VAL-Linie (Value Area 70 %)': ['VAH and VAL lines (value area 70 %)', 'خطا VAH و VAL (منطقة القيمة 70 %)'], 'POC/VAH/VAL über den ganzen Chart': ['POC/VAH/VAL across the whole chart', 'POC/VAH/VAL عبر الرسم كله'],
    'Deckkraft in der Value Area · außerhalb': ['Opacity inside the value area · outside', 'الشفافية داخل منطقة القيمة · خارجها']
  };
  var RX = [[/^🔔 Preis-Alarm \((über|unter) /, function (m, a) { return [['🔔 Price alert (' + (a === 'über' ? 'above' : 'below') + ' '], ['🔔 تنبيه سعر (' + (a === 'über' ? 'فوق' : 'تحت') + ' ']]; }],
    [/^Preis /, function () { return [['Price '], ['السعر ']]; }], [/^Geschätzt offen /, function () { return [['Est. open '], ['مفتوح تقديرياً ']]; }], [/^Schluss /, function () { return [['Close '], ['الإغلاق ']]; }]];
  var I = { de: -1, en: 0, ar: 1 }, lang = 'de', ORIG = new WeakMap(), ATTR = ['placeholder', 'title', 'aria-label'], busy = false;
  var getLang = function () { try { var s = sessionStorage.getItem('site_lang'); if (s && s in I) return s; } catch (e) { } try { var d = localStorage.getItem('fg9_deflang'); if (d && d in I) return d; } catch (e) { } return 'de'; };
  function trText(de) {
    if (lang === 'de') return de; var k = I[lang], t = de.trim(); if (!t) return de;
    var hit = D[t]; if (hit) return de.replace(t, hit[k]);
    for (var r = 0; r < RX.length; r++) { var m = t.match(RX[r][0]); if (m) { var rep = RX[r][1].apply(null, m)[k][0]; return de.replace(m[0], rep); } }
    return de;
  }
  function doNode(n) {
    if (n.nodeType === 3) { if (!n.parentNode || /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) return; var o = ORIG.get(n); if (o == null || (n.nodeValue !== o.tr)) { o = { de: n.nodeValue }; ORIG.set(n, o); } var v = trText(o.de); o.tr = v; if (n.nodeValue !== v) n.nodeValue = v; return; }
    if (n.nodeType !== 1) return;
    for (var a = 0; a < ATTR.length; a++) { var an = ATTR[a]; if (!n.hasAttribute(an)) continue; var key = 'data-de-' + an, de = n.getAttribute(key); if (de == null || (n.getAttribute(an) !== n.getAttribute('data-tr-' + an))) { de = n.getAttribute(an); n.setAttribute(key, de); } var v = trText(de); n.setAttribute('data-tr-' + an, v); if (n.getAttribute(an) !== v) n.setAttribute(an, v); }
    for (var c = n.firstChild; c; c = c.nextSibling) doNode(c);
  }
  function apply() { busy = true; try { doNode(document.body); } finally { busy = false; } document.documentElement.lang = lang; }
  var mo = new MutationObserver(function (list) { if (busy || lang === 'de') return; busy = true; try { list.forEach(function (m) { if (m.type === 'characterData') doNode(m.target); else m.addedNodes.forEach(doNode); }); } finally { busy = false; } });
  function start() { lang = getLang(); apply(); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  window.addEventListener('sitelang', function (e) { lang = e.detail; apply(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
