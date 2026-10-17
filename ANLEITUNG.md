# Fear & Greed – Version 11

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v11.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (`Fear-Greed-V11.lnk`, abschaltbar im Zahnrad → „Programm auf dem PC“).
Live-Werte jede Minute (einstellbar), große Verläufe stündlich. Protokoll: `data\server.log`.
Online für Freunde: **https://vrilyassluxion.github.io/fear-greed/** (alle 10 Minuten neu, die alten Links auf v6–v10 leiten weiter).

Beim ersten Öffnen erscheint das **Handbuch** (Knopf „Handbuch“ oben rechts, abschaltbar).

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
