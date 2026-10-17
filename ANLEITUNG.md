# Fear & Greed – Version 13

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v13.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (`Fear-Greed-V13.lnk`, abschaltbar im Zahnrad → „Programm auf dem PC“).
Live-Werte jede Minute (einstellbar), große Verläufe stündlich. Protokoll: `data\server.log`.
Online für Freunde: **https://vrilyassluxion.github.io/fear-greed/** (alle 10 Minuten neu, die alten Links auf v6–v12 leiten weiter).

Beim ersten Öffnen erscheint das **Handbuch** (Knopf „Handbuch“ oben rechts, abschaltbar).

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
