# Нативный AmneziaWG в Unway (прямой режим)

Прямой режим в приложении поднимает awg-туннель сам (без внешних приложений):
ядро **amneziawg-go** (userspace) как подпроцесс + тул **awg** для применения
конфигурации. Бинари не в git — их нужно собрать/положить вручную.

## 1. amneziawg-go (собирается из исходников)
```
docker build -f client/native/amneziawg/build-binaries.Dockerfile \
  --target export -o client/native/amneziawg/out .
```
Разложить:
- `out/amneziawg-go.exe`            → `client/windows/bin/amneziawg-go.exe`
- `out/amneziawg-go-android-arm64`  → `client/android/app/src/full/jniLibs/arm64-v8a/libawg.so`
- `out/amneziawg-go-android-arm`    → `client/android/app/src/full/jniLibs/armeabi-v7a/libawg.so`

## 2. awg (amneziawg-tools, применение конфига + генерация ключей)
Готовые сборки берутся из AmneziaWG/AmneziaVPN:
- **Windows**: `awg.exe` из установки AmneziaVPN (папка с amneziawg) или релизов
  `amnezia-vpn/amneziawg-tools` → `client/windows/bin/awg.exe`.
- **Android**: бинарь `awg` (arm64/armv7) → `libawgtools.so` в соответствующие
  `jniLibs/<abi>/`. (Если недоступен — конфигурацию применяем напрямую через
  UAPI amneziawg-go; см. движок.)

## Как это работает в движке
- Windows: `amneziawg-go.exe` создаёт wintun-адаптер `awg0` → `awg setconf awg0 <conf>`
  → netsh выставляет IP/MTU/маршруты (0.0.0.0/0 через awg0, host-route на endpoint
  мимо туннеля).
- Android: VpnService отдаёт TUN-fd → `amneziawg-go` с `WG_TUN_FD=<fd>` →
  `awg setconf` → маршруты задаёт VpnService.Builder.
- Ключи WG генерятся на устройстве (`awg genkey`/`pubkey`), приватный хранится
  локально, публичный уходит на сервер (`POST /devices/:id/awg`).
