@echo off
rem Beendet den Daten-Server dieses Dashboards.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*%~dp0server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; 'Server beendet (PID ' + $_.ProcessId + ')' }"
pause
