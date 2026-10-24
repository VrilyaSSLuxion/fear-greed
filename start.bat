@echo off
rem Startet den Daten-Server (falls er nicht schon laeuft) und oeffnet das Dashboard im Browser.
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:8787/api/state -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "" wscript.exe "%~dp0start-hidden.vbs"
  timeout /t 4 /nobreak >nul
)
start "" http://localhost:8787
