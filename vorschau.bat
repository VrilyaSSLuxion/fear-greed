@echo off
rem Lokale Vorschau: sammelt einmal alle Daten (ca. 1-2 Minuten) und zeigt die Seite unter http://localhost:8792
cd /d "%~dp0"
echo Sammle Daten, bitte warten...
node collector\collect.mjs --out dist
if errorlevel 1 (
  echo Fehler beim Sammeln der Daten.
  pause
  exit /b 1
)
start "" http://localhost:8792
node collector\serve.mjs
