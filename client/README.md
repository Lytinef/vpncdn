# VPN-CDN — клиент (Flutter)

Кроссплатформенный клиент. Сейчас собирается под **Android**; Windows/iOS — позже
(UI переиспользуется, нужно добавить нативные VPN-модули под каждую платформу).

## Возможности

- Вход через Telegram (WebView → backend → JWT)
- Главный экран: подключение, **пинг / скорость загрузки / отдачи**
- Управление подпиской: покупка (YooKassa), отмена в конце периода, смена тарифа, возобновление
- **Kill switch**, **запуск при старте системы**
- **Раздельное туннелирование** (выбор приложений; режимы include/exclude)
- **Обход блокировок VPN** (РФ-приложения и сайты идут мимо туннеля; список с сервера)
- Выход / выход со всех устройств / удаление аккаунта (с предупреждениями)

> Раздельное туннелирование и обход можно менять **только при отключённом VPN**.

## Подготовка проекта

Часть стандартного Android-каркаса (gradle wrapper, иконки, `styles.xml`) генерируется Flutter.
Кастомные `AndroidManifest.xml`, `build.gradle`, Kotlin-исходники уже в репозитории и
не перезаписываются.

```bash
cd client
flutter create --platforms=android --org com.vpncdn .   # дозаполнит каркас, не трогая наши файлы
flutter pub get
```

## Нативные зависимости VPN-ядра

Положить в `client/android/libs/`:

| Файл                     | Что это                                   | Сборка |
|--------------------------|-------------------------------------------|--------|
| `libxray.aar` (libv2ray) | Xray-core через gomobile                  | см. `../xray/MOBILE.md` |
| `tun2socks.aar` + `.so`  | hev-socks5-tunnel (TUN → SOCKS)           | см. `../xray/MOBILE.md` |

## Запуск (dev)

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` — это `localhost` хост-машины для Android-эмулятора. Для реального устройства
укажите адрес backend, доступный по сети.

## Сборка релиза

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com
```

## Архитектура клиента

```
lib/
  config.dart            базовый URL API, deeplink-схема
  models/                DTO ответов backend
  services/
    api_client.dart      HTTP + авто-refresh токена
    api.dart             типизированные эндпоинты
    secure_store.dart    хранение токенов
    settings_store.dart  локальные настройки (kill switch, split, обход)
    vpn_engine.dart      мост к нативному ядру (MethodChannel/EventChannel)
  state/                 ChangeNotifier: AuthController, VpnController
  ui/screens/            экраны
android/.../vpn/         нативное ядро: VpnService, Xray, tun2socks, метрики
```

Связь Dart ↔ нативный код:
- `MethodChannel('vpncdn/vpn')` — команды (prepare/connect/disconnect/installedApps/…)
- `EventChannel('vpncdn/vpn/status')` — статус соединения
- `EventChannel('vpncdn/vpn/stats')` — пинг и скорость
