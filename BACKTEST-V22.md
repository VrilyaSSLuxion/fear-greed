# Backtest V22 – neue Auswertungen (Stand 29.10.2026)

Ergänzt [BACKTEST-V21.md](BACKTEST-V21.md). Alles mit **Vergleich zum Zufall**, damit kein Vorteil vorgetäuscht wird. Keine Garantie, keine Anlageberatung.

## 1 · Liquidations-Heatmap: welche Seite wird zuerst erreicht? — **echter Vorteil bei den stärksten Clustern**

**Daten:**
- Bybit-Open-Interest und Binance-Stundenkerzen von 07.2020 bis 10.2026, das sind 55.012 Stunden.
- Das Modell ist dasselbe wie in der Heatmap (Hebel 5–100x).
- Alle 4 Stunden ein Zeitpunkt. Gemessen wird, welche Seite der Kurs innerhalb von 7 Tagen zuerst berührt.

**Zufall:** Bei einem Kurs ohne Richtung erreicht man die nähere Seite schon mit der Wahrscheinlichkeit `fern / (nah + fern)`. Genau damit wird verglichen.

| Clusterpaar | Fälle | Nähere Seite zuerst | Zufall wäre | Vorteil |
|---|---:|---:|---:|---:|
| **Stärkste (L1/S1)** | 8.543 | **75,7 %** | 69,4 % | **+6,3 Punkte** |
| Nächste (L2/S2) | 12.752 | 69,2 % | 68,5 % | +0,7 (kein echter Vorteil) |
| Größere Seite zuerst (L1/S1) | 8.543 | 50,1 % | 50 % | keiner – die Größe allein sagt nichts |

**Stärkste Cluster nach Lage** (welche Seite näher ist und wie viel näher):

| Nähere Seite | fern/nah 1–1,5 | 1,5–2,5 | ab 2,5 |
|---|---|---|---|
| Long (L1 näher) | 51,5 % (Zufall 54,9) | 70,3 % (66,0) | 86,8 % (79,9) |
| Short (S1 näher) | 61,9 % (Zufall 54,7) | 76,4 % (65,8) | 88,6 % (80,4) |

- **Short-Seite näher:** In jeder Lage zeigt sich ein deutlicher Vorteil von +7 bis +11 Punkten. Ein Teil davon kann am Aufwärtstrend von Bitcoin 2020–2026 liegen.
- **Long-Seite näher:** Erst ab dem 1,5-fachen Abstand gibt es einen Vorteil, darunter keinen.
- **Typische Zeit bis zur Berührung:** 31–69 Stunden.

**Lernendes Modell** (logistische Regression; erste 75 % der Zeit lernen, letzte 25 % prüfen):

| Merkmale | Test stärkste | Test nächste |
|---|---:|---:|
| Regel „nähere Seite“ | **80,8 %** | 68,4 % |
| Abstand, Größe, Trend 24 Std./7 Tage | 80,3 % | 68,5 % |
| + Schwankung 24 Std., Änderung des Open Interest 24 Std. | 80,1 % | 68,5 % |
| + Abstand in Schwankungs-Einheiten, Wechselwirkung | 79,0 % | 68,6 % |

Das Modell ist nicht besser als die Regel. Es wird alle 12 Stunden mit den neuen Daten neu trainiert und schaltet sich automatisch ein, sobald es im Test besser ist. Dazu zählt ein **Mitlauf** im PC-Programm die eigenen Einschätzungen ab dem 29.10.2026 mit.

## 2 · Trendlinien-Berührungen (Tageskerzen 09.2020–10.2026)

| Signal | Swing | Fälle | Vorteil 30 Tage | t-Wert |
|---|---|---:|---:|---:|
| Neue Linie (2. Berührung) | 3/3 | 217 | −0,3 % | −0,26 |
| 3. Berührung (Abpraller) | 3/3 | 106 | −0,3 % | −0,15 |
| 3. und weitere Berührungen | 5/5 | 93 | −4,1 % | −2,01 |

Abpraller an Trendlinien hatten keinen Vorteil. Bei größeren Swings waren sie sogar schlechter als Zufall: Die Linie wurde eher gebrochen.

## 3 · Indikatoren (Tageskerzen, im Dialog „ƒx Indikatoren“ je Signalgruppe nachrechenbar)

**Stochastik + U-Turn (VrilyaSS, 21/5/5):**

| Signal | Fälle | Vorteil 30 Tage |
|---|---:|---:|
| Kreuz | 330 | ±0 % |
| U-Turn | 255 | −0,8 % |
| Divergenz | 42 | −5,3 % |
| Versteckte Divergenz | 33 | +1,3 % |

Auf Tageskerzen gab es keinen verlässlichen Vorteil. Auf kleineren Kerzen kann es anders sein; das prüft der Dialog.
