; Unway Windows installer. Compiled by build.ps1 after
; `flutter build windows --release`. Version is passed via /DAppVersion=...
; (defaults to 1.0.0 if not set).

#define AppName "Unway"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define Publisher "Unway"
#define ExeName "unway.exe"
; Built app folder, relative to this .iss.
#define BuildDir "..\client\build\windows\x64\runner\Release"

[Setup]
; Stable AppId - keep constant across versions (needed for upgrade/uninstall).
AppId={{A1C4E2D0-7B93-4F58-8E2A-9D6F1B3C5E70}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#ExeName}
; VPN client needs admin rights -> install into Program Files.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
OutputDir=output
OutputBaseFilename=Unway-Setup-{#AppVersion}
SetupIconFile=..\client\windows\runner\resources\app_icon.ico

[Languages]
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#BuildDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#ExeName}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#ExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#ExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent runascurrentuser
