' Startet den Server unsichtbar im Hintergrund (wird auch vom Windows-Autostart benutzt).
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FolderExists(dir & "\data") Then fso.CreateFolder(dir & "\data")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Run "cmd /c node """ & dir & "\server.js"" >> """ & dir & "\data\server.log"" 2>&1", 0, False
