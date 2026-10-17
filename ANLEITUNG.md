# Fear & Greed – Version 7

## Starten

| Datei | Wofür |
|---|---|
| `start.bat` | Startet das Programm (falls nicht schon aktiv) und öffnet **http://localhost:8797** |
| `stop.bat` | Beendet das Programm |
| `fear-greed-v7.html` | Einzeldatei zum Verschicken – Doppelklick, braucht nur Browser + Internet |

Das Programm startet automatisch mit Windows (abschaltbar: Zahnrad → „Programm auf dem PC“ → „Mit Windows starten“).
Es läuft unsichtbar im Hintergrund, holt die Live-Werte **jede Minute** (einstellbar), die großen Verläufe stündlich,
schneidet Liquidationen dauerhaft mit und speichert den Verlauf im Ordner `data`. Protokoll: `data\server.log`.

Online für Freunde: **https://vrilyassluxion.github.io/fear-greed/** – wird alle 10 Minuten neu hochgeladen
(einstellbar ab 6 Minuten; GitHub erlaubt nur etwa 10 Aktualisierungen pro Stunde). PC aus = online bleibt der letzte Stand.

## Ansichten
- **SMC** – seine neueste Version 1:1 („Unsere Longs sind aufgegangen“)
- **VrilyaSS** – dein Stil: Linie/Kerzen, Zahlen, Index im Chart, **Heatmap**, **Stufen 75/25 + 85/15**, **Signale**, Vergleich, Trend, Euro

## Neu in V7
- **Aktualisierung einstellbar** (Zahnrad → „Aktualisierung“): Daten holen (Standard 1 Min.), online (Standard 10 Min., mindestens 6), Verläufe (Standard 60 Min.).
  Fußzeile zeigt „Daten alle X Min. neu“ bzw. online „online alle Y Min. neu“ (Tooltip mit der GitHub-Grenze).
  Lehnt ein Anbieter wegen zu vieler Abfragen ab, erscheint im Zahnrad eine Warnung.
- **Schneller**: Long/Short im 5-Minuten-Takt, heutige Tageskerze, VIX/DXY und CoinMarketCap live.
- **Heatmap-Cluster im Chart**: stärkster Long-Cluster (grün) und Short-Cluster (rot) als Linie von der Mitte bis zum rechten Rand,
  mit Zone (heller Bereich) und Preis-Label rechts. Nächste Cluster gestrichelt (abschaltbar).
  Linien-, Label-Hintergrund- und Label-Schriftfarben einzeln unter „Chart-Darstellung“.
- **Cluster-Alarm** (Zahnrad → „Liquidations-Heatmap & Cluster-Alarm“): Abstand in % (Standard 1 %),
  Annäherung / Zone erreicht / Cluster (POC) erreicht. Die berechnete Alarmstufe steht unter dem Chart
  (z. B. „Short-Cluster 80.000 → ab 79.200“) und unten im Ticker unter „LIQUIDATIONEN“. Alarm im Browser und per Telegram.
- **Handy**: Standard „wie am PC“ (Desktop-Ansicht verkleinert, mit zwei Fingern zoomen), optional „Handy-optimiert“.
  Hinweis „Handy quer halten“ im Hochformat (abschaltbar).
- **Ticker**: Euro-Kurs gleich groß wie Dollar, Trennlinie dazwischen (abschaltbar).

## Telegram einrichten
1. In Telegram **@BotFather** öffnen → `/newbot` → Namen vergeben → Token kopieren
2. Zahnrad → Telegram → Token einfügen → **Speichern**
3. Deinem neuen Bot in Telegram irgendeine Nachricht schreiben
4. **Chat-ID finden** → **Telegram-Alarme an** → Häkchen bei „Liquidations-Cluster“ → **Speichern** → **Test**
