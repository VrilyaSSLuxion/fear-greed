' Startet das Fear & Greed V22 Programm als TESTVERSION (Port 8798) unsichtbar im Hintergrund – kein Autostart.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FolderExists(dir & "\data") Then fso.CreateFolder(dir & "\data")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Environment("Process")("FG_PORT") = "8798"
sh.Run "cmd /c node """ & dir & "\server.mjs"" >> """ & dir & "\data\server.log"" 2>&1", 0, False
