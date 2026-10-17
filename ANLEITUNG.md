# Fear & Greed – Version 6

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v6.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (abschaltbar: Zahnrad → „Programm auf dem PC“ → „Mit Windows starten“).
Es läuft unsichtbar im Hintergrund, holt alle 10 Minuten alle Daten, schneidet Liquidationen dauerhaft mit
und speichert den Verlauf im Ordner `data`. Protokoll: `data\server.log`.

## Ansichten
- **SMC** – seine neueste Version 1:1 („Unsere Longs sind aufgegangen“)
- **VrilyaSS** – dein Stil: Linie/Kerzen, Zahlen, Index im Chart, **Heatmap**, **Stufen 75/25 + 85/15**, **Signale**, Vergleich, Trend, Euro

## Neu in V6
- **Trennleiste** zwischen Bitcoin-Chart und Index-Chart: ziehen = Höhe ändern, Doppelklick = Standard
- **Zwei Stufen** für Extremphasen: Stufe 1 (75/25, wie im Video) und Stufe 2 (85/15). Werte, Farben und Anzeigen im Zahnrad
- **Punkte**: voll = Phase vorbei (fest), hohl/gestrichelt = Phase läuft noch (vorläufig, kann noch wandern)
- **Signale ohne Repaint**: ◆ = Extremphase bestätigt (3. Tag), ▲/▼ = Wende bestätigt (Index 5 Punkte vom Extrem zurück). Sie wandern nie. Auswertung in „Trend & Einschätzung“
- **Liquidations-Heatmap** (Schätzung aus Binance-Daten der letzten ~21 Tage) mit nächstem/stärkstem Long- und Short-Cluster
- **Alarme**: im Browser (Ton + Windows-Meldung) und per **Telegram** aufs Handy (läuft über das Programm, auch wenn die Seite zu ist)
- **API-Keys** (SoSoValue, Coinalyze, CoinGlass) direkt im Zahnrad eintragen

## Telegram einrichten
1. In Telegram **@BotFather** öffnen → `/newbot` → Namen vergeben → Token kopieren
2. Zahnrad → Telegram → Token einfügen → **Speichern**
3. Deinem neuen Bot in Telegram irgendeine Nachricht schreiben
4. **Chat-ID finden** → **Telegram-Alarme an** → **Speichern** → **Test**

## Online (GitHub)
Wie in V3/V4/V5 – sobald ein GitHub-Konto da ist. Dann läuft der Datensammler auch ohne PC.
