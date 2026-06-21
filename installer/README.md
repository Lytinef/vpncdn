# Установщик Unway (Windows)

Собирает обычный установщик (Inno Setup): установка в Program Files (папку можно
выбрать), ярлык в меню «Пуск», по желанию — ярлык на рабочем столе, плюс
деинсталлятор. Приложение ставится с правами администратора (нужно для VPN).

## Как собрать новую версию

1. Собрать приложение:
   ```
   cd client
   flutter build windows --release
   ```
2. Собрать установщик (из корня репозитория):
   ```
   powershell -ExecutionPolicy Bypass -File installer\build.ps1
   ```
   или двойной клик по `installer\build.bat`.

Готовый файл: `installer\output\Unway-Setup-<версия>.exe`
(версия берётся из `client/pubspec.yaml`).

## Требования (один раз)

- Flutter с Windows-десктопом и Visual Studio (C++).
- Inno Setup 6: `winget install --id JRSoftware.InnoSetup -e`
  (build.ps1 сам находит `ISCC.exe`).

## Что внутри

`unway.iss` упаковывает всю папку сборки
`client/build/windows/x64/runner/Release` (включая `xray.exe`, `tun2socks.exe`,
`wintun.dll`). Конфиги/логи приложение пишет в `%LOCALAPPDATA%\Unway`.
