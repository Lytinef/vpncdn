# Сборка нативных VPN-библиотек для клиента (Android)

Клиенту нужны два пребилт-артефакта в `client/android/libs/`:

1. **libv2ray.aar** — Xray-core через gomobile (ядро туннеля).
2. **tun2socks** (`hev-socks5-tunnel`) — мост TUN → SOCKS5 (нативные `.so` + JNI).

## 1. libv2ray.aar (Xray gomobile)

Используется проект `AndroidLibXrayLite` (де-факто стандарт для v2rayNG-подобных клиентов).

```bash
# Зависимости: Go 1.21+, Android NDK, gomobile
go install golang.org/x/mobile/cmd/gomobile@latest
gomobile init

git clone https://github.com/2dust/AndroidLibXrayLite
cd AndroidLibXrayLite
# собрать aar
gomobile bind -target=android -androidapi 24 -o libv2ray.aar ./
cp libv2ray.aar ../<repo>/client/android/libs/libxray.aar
```

API, который использует клиент (`XrayCore.kt`):
- `Libv2ray.newV2RayPoint(supportsSet, false)`
- `point.configureFileContent`, `point.domainName`, `point.runLoop()/stopLoop()`
- `point.queryStats("proxy","uplink"/"downlink")` — метрики
- `V2RayVPNServiceSupportsSet.protect(fd)` — защита сокетов ядра (обязательно)

## 2. hev-socks5-tunnel (tun2socks)

```bash
git clone --recursive https://github.com/heiher/hev-socks5-tunnel
# собрать .so под все ABI через Android NDK (см. README проекта),
# плюс JNI-обёртку TProxyStartService/TProxyStopService/TProxyGetStats
```

Поместите `libhev-socks5-tunnel.so` (по ABI: arm64-v8a, armeabi-v7a, x86_64) в
`client/android/app/src/main/jniLibs/<abi>/` либо упакуйте в `tun2socks.aar`.

JNI-методы, ожидаемые клиентом (`Tun2socks.kt`):
- `TProxyStartService(configPath: String, fd: Int)`
- `TProxyStopService()`
- `TProxyGetStats(): long[]`  // [tx, rx]

## Проверка интеграции

После добавления библиотек:

```bash
cd client
flutter run --dart-define=API_BASE_URL=https://api.example.com
```

При нажатии «Подключиться» система запросит разрешение VPN, поднимется TUN,
запустится Xray и tun2socks, на главном экране появятся пинг и скорость.
