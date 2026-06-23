# Бинарники Hysteria2 для клиентов (прямой режим)

Прямой режим в Unway работает через бинарь клиента Hysteria2 (подпроцесс,
отдаёт SOCKS; tun2socks/hev гонит в него трафик из TUN). Бинарники не в git —
их нужно положить вручную из официальных релизов:
https://github.com/apernet/hysteria/releases (версия v2.x, `app/...`).

## Windows
Скачать `hysteria-windows-amd64.exe` → переименовать в `hysteria.exe` →
положить в:
```
client/windows/bin/hysteria.exe
```
(каталог `bin/` целиком бандлится сборкой Windows.)

## Android
Скачать android-сборки и положить, переименовав в `libhysteria.so`:
```
client/android/app/src/full/jniLibs/arm64-v8a/libhysteria.so      <- hysteria-android-arm64
client/android/app/src/full/jniLibs/armeabi-v7a/libhysteria.so    <- hysteria-android-armv7
```
`useLegacyPackaging=true` (уже в build.gradle.kts) распакует .so в
nativeLibraryDir, откуда приложение запускает его как подпроцесс.

## Проверка версии
Windows: `client\windows\bin\hysteria.exe version`
