# Fear & Greed – Version 10

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v10.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (`Fear-Greed-V10.lnk`, abschaltbar im Zahnrad → „Programm auf dem PC“).
Live-Werte jede Minute (einstellbar), große Verläufe stündlich. Protokoll: `data\server.log`.
Online für Freunde: **https://vrilyassluxion.github.io/fear-greed/** (alle 10 Minuten neu, die alten Links auf v6–v9 leiten weiter).

Beim ersten Öffnen erscheint das **Handbuch** (Knopf „Handbuch“ oben rechts, abschaltbar).

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
