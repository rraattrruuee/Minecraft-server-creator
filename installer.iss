[Setup]
AppName=MCPanel
AppVersion=0.2.5
DefaultDirName={autopf}\MCPanel
DefaultGroupName=MCPanel
UninstallDisplayIcon={app}\mcpanel-windows-latest.exe
SetupIconFile=app\static\img\default_icon.ico
Compression=lzma
SolidCompression=yes
OutputDir=dist
OutputBaseFilename=MCPanel-Installation-Windows

[Files]
Source: "dist\mcpanel-windows-latest.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\MCPanel"; Filename: "{app}\mcpanel-windows-latest.exe"
Name: "{commondesktop}\MCPanel"; Filename: "{app}\mcpanel-windows-latest.exe"
; Start Menu shortcut
Name: "{group}\MCPanel (start)"; Filename: "{app}\mcpanel-windows-latest.exe"
; Add to Start Menu and register file associations
Name: "{userdesktop}\MCPanel"; Filename: "{app}\mcpanel-windows-latest.exe"