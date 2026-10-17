# Fear & Greed – Version 8

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v8.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (`Fear-Greed-V8.lnk`, abschaltbar im Zahnrad → „Programm auf dem PC“).
Live-Werte jede Minute (einstellbar), große Verläufe stündlich. Protokoll: `data\server.log`.
Online für Freunde: **https://vrilyassluxion.github.io/fear-greed/** (alle 10 Minuten neu, die alten Links auf v6/v7 leiten weiter).

Beim ersten Öffnen erscheint das **Handbuch** (Knopf „Handbuch“ oben rechts, abschaltbar).

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
