@echo off
REM Двойной клик — собирает установщик Unway (после flutter build windows --release).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
pause
