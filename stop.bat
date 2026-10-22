@echo off
rem Beendet das Hintergrund-Programm von V19.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*%~dp0server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; 'Programm beendet (PID ' + $_.ProcessId + ')' }"
pause
