# Smart Money Fear & Greed – Version 3

## Was ist in diesem Ordner?

| Datei / Ordner | Wofür |
|---|---|
| `fear-greed-v3.html` | **Einzeldatei zum Verschicken.** Doppelklick genügt, kein Server, kein Claude. VIX, DXY, ETF-Flows und CoinMarketCap fehlen hier (Browser-Sperre der Anbieter). |
| `vorschau.bat` | Lokale Vorschau mit **allen** Daten auf deinem PC: http://localhost:8792 |
| `site/index.html` | Die Webseite |
| `collector/` | Sammelt die Daten und berechnet den Index (`engine.mjs`) |
| `.github/workflows/` | Automatik für GitHub: alle 10 Minuten neue Daten, Seite online |
| `vorschau/` | Erste Entwürfe und Screenshots |

## Online stellen (einmalig, ca. 10 Minuten)

Danach läuft die Seite rund um die Uhr unter einem festen Link – ohne deinen PC und ohne Claude. Den Link kannst du deinem Kumpel schicken.

1. **GitHub-Konto anlegen:** https://github.com/signup (kostenlos).
2. **Anmelden auf dem PC:** In einem Terminal `gh auth login` eingeben und den Schritten folgen (GitHub.com → HTTPS → im Browser anmelden).
3. **Claude Bescheid geben** – dann lege ich das Repository an und lade alles hoch.
   Oder selbst: auf github.com ein **öffentliches** Repository `fear-greed` anlegen und den Inhalt dieses Ordners hochladen.
4. **Pages einschalten:** Repository → *Settings* → *Pages* → bei *Source* **GitHub Actions** wählen.
5. **Ersten Lauf starten:** Repository → *Actions* → *Daten aktualisieren* → *Run workflow*.
6. Nach 2–3 Minuten ist die Seite erreichbar unter:
   `https://<dein-github-name>.github.io/fear-greed/`
   Die Einzeldatei liegt dort auch zum Herunterladen (Zahnrad → Einzeldatei).

## ETF-Flows (SoSoValue, kostenlos)

1. Auf https://sosovalue.com anmelden und im Bereich **API** einen kostenlosen API-Key beantragen.
2. Repository → *Settings* → *Secrets and variables* → *Actions* → **New repository secret**
   - Name: `SOSOVALUE_API_KEY`
   - Wert: dein Key
3. Optional später: `COINGLASS_API_KEY` (kostenpflichtig) genauso anlegen.

Für die lokale Vorschau kannst du die Keys stattdessen in eine `config.json` schreiben (Vorlage: `config.example.json`). Die Datei wird nicht hochgeladen.

## Gut zu wissen

- **Liquidationen:** OKX wird vollständig erfasst, Binance und Bybit per Stichprobe (60 Sekunden pro Lauf, hochgerechnet). Der Baustein bekommt erst Punkte gegen die eigenen 365 Tage, wenn 60 Tage gesammelt sind – bis dahin zählt der Anteil liquidierter Shorts direkt.
- **Binance Open Interest / Long-Short:** Binance liefert nur 30 Tage Verlauf. Bis genug eigener Verlauf gesammelt ist, wird gegen den Durchschnitt mehrerer Börsen gemessen.
- **GitHub Pages ist öffentlich:** Jeder mit dem Link kann die Seite sehen. API-Keys bleiben als Secret geheim.
- Keine Anlageberatung.
