@echo off
rem Startet das Hintergrund-Programm (falls es nicht schon laeuft) und oeffnet das Dashboard.
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:8797/api/status -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "" wscript.exe "%~dp0start-hidden.vbs"
  timeout /t 5 /nobreak >nul
)
start "" http://localhost:8797
