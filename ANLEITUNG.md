# Fear & Greed – Version 18

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v18.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (`Fear-Greed-V18.lnk`, abschaltbar im Zahnrad → „Programm auf dem PC“).
Live-Werte jede Minute (einstellbar), große Verläufe stündlich. Protokoll: `data\server.log`.
Online für Freunde: **https://vrilyassluxion.github.io/fear-greed/** (alle 10 Minuten neu, die alten Links auf v6–v17 leiten weiter).

Beim ersten Öffnen erscheint das **Handbuch** (Knopf „Handbuch“ oben rechts, abschaltbar).

## Neu in V18
- **SMA-20-Signale im Index-Chart** (Knopf „SMA-Signale“): Methode 1 „Extrem“ (78,6 / 21,4, am Tageswert) und Methode 2 „Mittelbereich“ (61,8 / 38,2 + SMA über/unter 50, am 7-Tage-Mittel); Steigungsregel, 50er-Regel, Tage zurück, Mindestabstand einstellbar; Pfeile im Index- und/oder Kurs-Chart; Alarm (Browser + Telegram)
- **VWAP** (Kasten „VWAP“ + Menü ▾): Anker Session/Woche/Monat/Quartal/Jahr, Quelle, Bänder wie TradingView, größerer Zeitraum hinten; **VWAP-Signale** „Schluss kreuzt“ / „EMA 8 kreuzt“ (Tagesschluss, Neustart-Tage ausgelassen, Trendfilter EMA 200, optional Schluss-Bestätigung), Alarm (Browser + Telegram); Volumen jetzt im Verlauf (Spalte 18)
- **Methoden-Vergleich:** Spalte Ø 7T, Schalter je Zeile, 3 beste/schwächste farbig, Sortieren per Klick, Klick auf Methode = verwenden
- **Mittelung** wählbar (Kreis und Index-Chart getrennt: 7/14/21/30/100/365/1000 + frei), Schalter „alle Signale mit der Mittelung“ (auch Telegram)
- **Zwei Chart-Fenster** (eigene Höhe, Kopplung abschaltbar), **Magnet 🧲** (aus/schwach/stark), **Schloss 🔒** für eigene Linien, Index-Docht einstellbar, 4h-Verlauf ≈ 1,4 Jahre
- **Muster-Kasten** mit Menü (Auswahl, Richtung, je Stelle die extremsten / extremste je Phase), Maus-Info; **MA ▾** mit 10 Plätzen (5/8/13/50/200)
- **Heatmap:** Gate.io, HTX, Kraken dazu; Bitget, Deribit, Hyperliquid werden stündlich mitgeschrieben (ab 7 Tagen wählbar); freie Kombination
- **Einstellungs-Sets** (3 Plätze + Datei), Fenster minimieren, Anordnung A/B unten, „Aktuelle Markteinschätzung“, Tabellenwerte mittig
- **Ticker:** Trennlinie $/€ zurück, Pfeile dicker und gleich hoch, feste Breite, 4H/1H/15M/5M (Liste/Säulen), $/€ bei Liquidationen
- **Alarme:** eigene Töne (3 Dateien), Spalte „Abspielen“ (1×/3×/5×/3 s/10 s/bis OK), „Erinnerung 1/3“ schon bei der ersten Meldung; Überschriften im Zahnrad weiß/fett
- **Handbuch:** neue Abschnitte SMA-20, VWAP, Methoden-Vergleich erklärt, Sets; Minimieren je Box; „Neu in …“ chronologisch unter „Weitere Funktionen“; „Für später gemerkt“ ganz unten

## Neu in V17
- **Kerzenmuster im Extrem** (Knopf „Muster“ neben den Signalen): Hammer, umgekehrter Hammer, bullisches Engulfing, Piercing Line, Morning Star (Long, bei Index ≤ 30) und Shooting Star, Hanging Man, bärisches Engulfing, Dark Cloud Cover, Evening Star (Short, bei ≥ 70) – nur geschlossene Tageskerzen, Index am Kerzentag oder bis 3 Tage davor im Extrem; Index wählbar (unser / offiziell / beide / einer reicht), Grenzen und Tage einstellbar, jedes Muster an/aus, Trendfilter (⚠), eigene Zeilen im Methoden-Vergleich, eigener Alarm (Browser + Telegram)
- **Pivot-Linien genau am Docht:** 4h-, 1h- und 15m-Kerzen in € werden mit dem Euro-Kurs ihres Tages umgerechnet (vorher heutiger Kurs → Lücke zwischen Linie und Docht); Punkt an der Kerze mit dem Extrem; Beschriftung rechts wird so breit wie das längste Label (nicht mehr abgeschnitten)
- **Ticker:** $ und € genau untereinander, Pfeile als Grafik exakt mittig, „TICK“ und „24 H“ tiefer auf einer Linie, Long/Short-Kästchen höher, Prozent größer; im Zahnrad „Ticker – Größen & Abstände“ (Pixel, leer = automatisch) und die Größe für den Doppelklick
- **Was das jetzt heißt:** Pulsieren je Knopf an/aus (Tendenz pulsiert jetzt auch), Schriftgrößen für Abwarten-Knopf, „Tendenz:“ (größer) und Tendenz-Wert
- **Einschätzung:** 1 Smart Money, 2 Offiziell (laut Lehrbuch), 3 Kombiniert (1 + 2), Urteile genau untereinander
- Aktiver Reiter „Extreme der letzten 12 Monate / Die letzten 12 Tage“ gelb gefüllt, alle Knöpfe und Kästen über dem Chart gleich hoch, Divergenz-Knopf schmaler, Tabellen ohne waagerechte Bildlaufleiste
- **Handbuch:** neuer Abschnitt Kerzenmuster (mit Rückblick-Zahlen), 50er-Linie Schritt für Schritt mit Rückblick, Pivot am Docht, Ticker-Größen, Pulsieren, Einschätzung 1/2/3

## Neu in V16
- **Pivots korrigiert:** in der angezeigten Währung gerechnet (in € vorher erst in $ gesucht, dann umgerechnet), Standard „höchstes Hoch + tiefstes Tief im Zeitraum“, dazu „tiefstes Tief nach dem Hoch“ und „höchstes Hoch nach dem Tief“; mehrere Zeiträume gleichzeitig (▾ neben „Pivot“), Fibonacci aus wählbarem Zeitraum, Richtung wie TradingView
- **50er-Linie im Index-Chart** (Knopf „50er“): 8 Signalarten – Bounce, Ablehnung, Durchbruch hoch/runter, Retest Long/Short, Fehlausbruch hoch/runter; Zone und Bestätigung je Long/Short, Pfeile auch im Kurs-Chart, eigene Zeilen im Methoden-Vergleich, Alarm (Browser + Telegram)
- **Trendfilter auch für Verkäufe** (⚠ neben ▼ = Verkauf gegen Aufwärtstrend), einstellbar Kauf + Verkauf / nur Kauf / nur Verkauf
- **Alarme:** Fenster bleiben stehen (✕ = schließen, OK = erledigt), Alarm-Verlauf (Knopf 🔔), Wiederholung und Ton je Alarmart, Pivot-Alarme standardmäßig 1M/3M/6M mit „Einordnung“ aus dem Rückblick, Pivot-Erinnerungen auch per Telegram
- **Heatmap-Börsen frei kombinierbar** (▾ mit Häkchen), Kerzen zusätzlich 1M und 1J, Beschriftung „Zeitraum:“
- **Index-MA** mit Box „SMA 20“ und eigenen Einstellungen (Linienart, Dicke, Farbmodus), MA-Verlängerung je Linie
- **Knöpfe gruppiert** in Kästen, Erklärungen beim Darüberfahren (Zustand + Klick/Rechtsklick), Divergenz-Knopf mit fester Breite
- Eigene Alarmlinien über dem Kurs rot / darunter grün, Ticker-Reiter ⇅ oben/unten, Ticker-Werte größer mit gleichen Rändern, Statuszeile oben, Hinweis „neue Version – neu laden“, Tabellen und Trend-Kästen deutlicher umrahmt, gewählte Zeile im Vergleich umrahmt, gleich große Knöpfe bei „Was das jetzt heißt“, $/€ im Titel mit festen Ziffern, weniger Abstand in SMC, Zahnrad dicker umrahmt
- **Handbuch:** V15-Abschnitte werden jetzt wirklich angezeigt (lagen in V15 hinter der V14-Fassung), neu: 50er-Linie, Pivot-Berechnung, Alarm-Verlauf/Erinnerungen, Trendfilter beidseitig

## Neu in V15
- **Heatmap-Quelle wählbar** (Auswahl neben „Heatmap“): Binance (wie bisher), Bybit, OKX oder kombiniert – eigene Schätzung aus stündlichem Open Interest; gilt auch für Cluster-Linien, Ticker und Alarme. CoinGlass (API nur im Plan Professional, 699 $/Monat), CoinAnk (keine offizielle API, Bot-Schutz) und MEXC (kein OI-Verlauf) sind im Handbuch erklärt und verlinkt
- **Kerzengröße** (Auswahl „Kerze“): Auto, 15m, 1h, 4h, 1T, 1W; Index-Chart bleibt täglich
- **Aktuelle Kurslinie**: Standard weiß gestrichelt und dicker; Stil, Dicke, Farbe und Farbmodus grün/rot wie TradingView im Zahnrad
- **Fibonacci-Stufen** einzeln an/aus mit eigener Farbe (38,2 rot, 50 weiß, 61,8 grün, 78,6 blau, 88,7 rot, 23,6 aus)
- **Richtungs-Kasten** neben der Legende: Bewegung (24 h oder Kurs über/unter EMA mit Periode und Zeitrahmen), nächstes Pivot-Ziel, größter Cluster Richtung Long/Short
- **EMA** in € glatt (aus Euro-Kursen gerechnet), Verlängerung endet am Chart-Rand (Beschriftung bleibt beim Hineinzoomen sichtbar), MA auch bei Stunden-/Minutenkerzen
- **Chart-Überschriften** gelb und dicker umrahmt; **Bedienleiste** oben in einem Kasten mit Erklärungen beim Darüberfahren (Binance/Multi-Source, $/€)
- **Ticker** ganz einklappbar (nur der Reiter bleibt, Hinweis beim Darüberfahren), Position unten oder oben im Zahnrad
- **„Tendenz:“** größer und fetter, Aktions-Knopf schmaler; „(Schätzung, keine Garantie)“ mit Abstand; unten „Heatmap: eigene Schätzung aus …-Daten · Zum Vergleich: liquidate.fun“
- **Handbuch**: neue Abschnitte „Chart: Zeitraum, Kerzen, Kurslinie, Richtung“, „Liquidations-Heatmap – so wird geschätzt“, „Andere Heatmap-Quellen“, „Weitere Funktionen“, „Für später gemerkt“

## Neu in V14
- **Handbuch** wieder im Stil von V12 (goldener Strich, jeder Abschnitt im goldenen Kasten) und zusätzlich jede Überschrift im kleinen goldenen Rahmen. Neue Abschnitte: **Die drei Ansichten** (SMC / SMC 2 / VrilyaSS mit Vergleichstabelle), **Warum VrilyaSS?**, **Tops/Böden** (wie gezählt wird, mit Beispielen), **Pivot-Linien**, **Alarme – wo und wie**. Knopf „Handbuch“ jetzt in allen drei Ansichten
- **Pivot-Knopf schaltet durch:** aus → P-Sicht → P-7T → P-1M → P-3M → P-6M → P-12M → Pivot (alles) → aus (Rechtsklick = zurück); die Leiste Sicht/7T/1M… daneben ist weg. Dicke und „tiefstes Tief nach dem Hoch / im ganzen Zeitraum“ im Zahnrad
- **Pivot-Alarme** (Zahnrad → Pivot-Alarme): Zeiträume 7T…Alles, Tief unterschritten / Hoch überschritten / Annäherung (± %). Meldung mit Rückblick seit 2020 (wie oft der Kurs innerhalb von 7 Tagen zurückkam), Szenario A (Sweep) / B (Ausbruch) und nächstem Ziel (nächstes Pivot oder Liquidations-Cluster). Browser und Telegram
- **Tops/Böden mit Zwischen-Stufe:** Knopf 1× = Zyklus (35 %), 2× = Zyklus + Zwischen (20 %, kleiner und blasser), 3× = aus
- **Cluster-Knopf schaltet durch:** alle → nur nächste → nur stärkste → nur fernste → aus; Cluster-Namen (L1, S2, LF …) in kleiner Box am Linienanfang
- **EMA 50/200:** Beschriftung in Box auf der Linie (oben / unten / auf der Linie / rechts, Box an/aus), Farbe fest / grün-rot / abgestuft nach Dauer, Verlängerung um N Kerzen (gestrichelt)
- **Index-Chart:** Titel im Kasten, eigene Knöpfe daneben (MA, 75/25, 85/15, Offizieller Index); MA-Knopf oben schaltet nur noch den Kurs-Chart
- **Trennlinien** im Chart (Skala rechts, unter dem Index-Chart), deutlichere goldene Leiste zum Ziehen (Farbe im Zahnrad)
- **SMC-Titelzeile** in einer Zeile, **Zahnrad** mit grauem Rahmen, **Ticker**: TICK/24 H größer, 24-h-Prozent unten, LONGS/SHORTS fett, Liquidationen höher und Alarmzeilen größer

## Neu in V13
- **Ansicht „SMC 2“**: SMC mit eigenen Erweiterungen (Flaggen, $ und €, Trennstriche, erweiterter Ticker) – **SMC** bleibt 1:1 das Original
- **Titelzeile**: Titel im eigenen goldenen Kasten, Trennstriche zwischen Titel | Kurse | 24h | Knöpfe | DE·EN·AR, größere Kurse und Flaggen, kein Freiraum
- **Handbuch** wieder wie V11 (ohne große Kästen), nur die Überschriften in kleinen goldenen Rahmen – Inhalt von V12 (Links, Videos, Meinung) bleibt
- **Fenster-Überschriften**: goldener Rahmen und goldene Schrift, Farben im Zahnrad → Rahmen
- **Trendfilter für Kauf-Signale** (Zahnrad → Signale): EMA 200, ADX, MACD (Woche) – einzeln oder kombiniert; Modus aus / markieren (⚠) / ausblenden. Standard: markieren mit EMA 200. Die Methoden-Tabelle hat für jeden Filter eine eigene Zeile zum Vergleich. Alarme (Browser + Telegram) bekommen den Hinweis „⚠ Gegen den Trend“
- **Gleitende Durchschnitte**: EMA 200 + EMA 50 im Kurs-Chart, SMA 20 im Index-Chart, Knopf „MA“, Art/Periode/Farbe im Zahnrad
- **Fibonacci**: Schnellwahl der Stufen 61,8/38,2 (Zahnrad → Signale), Fibonacci-Linien zwischen Pivot-Hoch und -Tief (Knopf „Fibo“, Stufen einstellbar)
- **L/S-Labels an den Punkten** (VrilyaSS): grünes L unter Angst-Punkten, rotes S über Gier-Punkten; Text L/S oder Long/Short, Größe, Farben einstellbar
- **Pivot-Bereich** eigener Schalter (Sicht · 7T · 1M · 3M · 6M · 12M · Alles), unabhängig vom Chart-Bereich
- **Vollbild ⛶** an jedem Fenster (Esc schließt)
- **Ticker**: Höhe oben am Griff ziehbar (bis halbe Bildschirmhöhe, Doppelklick = Standard), einklappbar (▾), rechter Teil größer, Größen im Zahnrad
- **Bitcoin in den nächsten 24 Stunden**: Prozentzahlen kleiner, Schriftgröße einstellbar
- Kleinere Änderungen: Linie/Kerzen im Kasten, hellere Rahmen bei inaktiven Knöpfen, Aktion + Tendenz in einer Zeile, weniger Leerraum in der Hauptkarte, Empfehlungs-Zeile ganz umrahmt, Trennlinie vor „liquidate.fun öffnen“, Einschätzung untereinander (① Smart Money → ② Offiziell → ③ Kombiniert)

## Neu in V12
- **Handbuch** neu: Trennlinie, zentrierte Überschriften, Abschnitte in goldenen Kästen, „Worum geht es?“ mit allen offiziellen Indizes, Kanal-Link und den zwei Videos (15.10.2026 ab 11:57 erstmals vom Bau, 16.10.2026 ab 8:21 verbesserte Version), Meinung des Seitenbetreibers
- **Signal ab Tag** (1/2/3) und **Berührung ± Punkte** (Zahnrad → Signale)
- **Tops/Böden (rückwirkend)** ab 35 % Bewegung, **Pivot-Linien** (höchstes Hoch / tiefstes Tief danach) – eigene Knöpfe, Farben im Zahnrad
- **Rahmen**: Schalter oben, Farbe/Dicke im Zahnrad; Überschriften in Kästen, deutlichere Tabellen-Linien, senkrechte Trennlinien, 7 letzte Tage
- **Was das jetzt heißt**: Label pulsiert, daneben die **Tendenz** (kaufen/verkaufen/steigend/fallend)
- **Flaggen** 🇺🇸/🇪🇺 im Titel und Ticker, $ und € rechts
- **Sprache Arabisch** (AR), Texte rechtsbündig, Alarm-Meldungen im Browser arabisch

## Neu in V11
- **Cluster-Labels mit Volumen**: z. B. „L2 79,6K · 34 Mio“, stärkster Cluster mit ★; Label-Spalte breiter
- **LF/SF = weit entferntester starker Cluster** (mind. 50 % des Volumens des stärksten, max. 20 % vom Kurs – beides einstellbar), eigene Linie (Strich-Punkt) und Alarm
- **Reaktions-Alarm**: Cluster angelaufen → Reaktion (Standard 1 % Gegenbewegung in 24 Std.) oder Durchbruch (1 % darüber hinaus), mit Zeit, Volumen und nächstem Cluster; Browser + Telegram
- **Aktuelle Kurslinie** bis zur Preisskala (wie TradingView)
- **Ticker**: LIQUIDATIONEN mit 4 Zeilen (SF, S1, L1, LF: Preis · Abstand · Mio. · Alarmstufe), Prozentzahlen unter dem Balken größer
- **Einschätzung**: ① Smart Money, ② offiziell (Lehrbuch), ③ kombiniert (Gewichtung 1:1 / 2:1 / 3:1 im Zahnrad, Standard 2:1)
- Trennlinien in der Liquiditäts-Einschätzung, im Titel (Preise | 24h | Knöpfe | DE/EN), sichtbare Rahmen um Schalter-Gruppen

## Neu in V10
- **Signale als Dreiecke**: ▲ unter dem Kurs = Long, ▼ über dem Kurs = Short; hohl = Phase bestätigt, voll = Wende, voll mit weißem Rand = Zone verlassen
- **Signal auslösen** (Zahnrad → Signale): beim Eintritt (wie bisher), beim Austritt (z. B. wieder über 30) oder beides
- Offizielle Linie/Signale: hat die gewählte Quelle kaum Verlauf (CFGI.io), nimmt die Seite automatisch alternative.me (Hinweis in der Legende)
- Knopf **„Cluster L/S“** (L1…/S1… an/aus), **„🔔 Eigene Linien“**, **Divergenz**-Knopf schaltet weiter: Linien + Labels → nur Linien → nur Labels → aus
- **Chart wie MT4**: Ende des Charts vom Rand verschieben (Abstand einstellbar, Standard 15 %), Chart automatisch ans Ende scrollen; Chart lässt sich über das Ende hinaus schieben
- Titel (VrilyaSS) mit Trennlinien: Titel | Dollar/Euro | Knöpfe
- Labels rechts nach Wichtigkeit; weitere Cluster fallen weg, wenn kein Platz ist

## Neu in V9
- Seite startet immer auf **Deutsch** und in der **SMC-Ansicht** (Standard im Zahnrad änderbar; oben umschalten gilt bis zum Neuladen)
- Signale besser sichtbar (◆ neben der Kurslinie), **Anzahl im Knopf** (z. B. „Signale · 2“ = 2 im sichtbaren Zeitraum)
- Knopf **„Mitte“** (Mitte zwischen L1 und S1)
- **Liquiditäts-Einschätzung**: Liegen die Longs oder die Shorts näher/dichter? → eher zuerst nach unten oder oben (unter dem Chart und in der Einschätzung)
- **Titel (VrilyaSS)**: Dollar und darunter Euro
- **Ticker**: Trennlinien nach ₿ und nach dem Tick-Pfeil; Long-/Short-Alarm mit Abstand und stärkstem Cluster (POC), auch in der SMC-Ansicht
- **Karte „Empfehlung Spot & Futures“** (VrilyaSS, rechts): Vorlage je Zone, Texte im Zahnrad änderbar

## Neu in V8
- **Gemeinsame Rechenlogik** `collector/shared.mjs` für Seite und Telegram (Signale, Methoden, Divergenz, Cluster, Alarm-Texte)
- **Signal-Methoden** (Zahnrad → Signale & Divergenz): Standard, Tageswert, 90 + 365 Tage, Kurs-Bestätigung, Extrempunkt
- **Methoden-Vergleich (Backtest)** unter „Trend & Einschätzung“: Kauf/Verkauf richtig nach 30 Tagen, große Tops/Böden (≥ 20 %) erkannt
- **Divergenz** wie RSI bei TradingView: Linien im Kurs- und Index-Chart, Label „Bull“/„Bear“ am Bestätigungstag (Tage einstellbar, Standard 5)
- **Signale offizieller Index** (Punkte und Signale in Türkis), eigener Knopf
- **Heatmap-Cluster mit Namen**: L1/S1 stärkster, L2/S2 nächster, L3/S3 … weitere (Anzahl einstellbar); Labels rechts weichen sich aus
- **🔔 Alarmlinien** (gold, gepunktet) auf der Alarmstufe, **Mitte M** zwischen L1 und S1 (optional)
- **Eigene Alarmlinien** A1, A2 … (Knopf „Eigene Linien“, mit der Maus verschieben, „+ Linie“ im Zahnrad), Alarm beim Kreuzen
- **Sperrzeit** der Cluster-Alarme einstellbar (Standard 12 Std.), Alarm-Meldungen mit Szenarien
- **Ebenen ▾**: jedes Element im Chart einzeln an/aus
- **Index-Chart**: Skala in 10er-Schritten, rechte Skala ziehen = zoomen
- **Leiste unter dem Kreis**: alle offiziellen Indizes gleichzeitig; darunter **die letzten Tage einzeln** (Anzahl einstellbar)
- **Ticker**: großes ₿, Pfeil „Tick“ (letzte Bewegung) und „24 h“ (Tagesrichtung), Long-/Short-Alarm ausgeschrieben

## Telegram einrichten
1. In Telegram **@BotFather** öffnen → `/newbot` → Namen vergeben → Token kopieren
2. Zahnrad → Telegram → Token einfügen → **Speichern**
3. Deinem neuen Bot in Telegram irgendeine Nachricht schreiben
4. **Chat-ID finden** → **Telegram-Alarme an** → gewünschte Häkchen → **Speichern** → **Test**
