# Бинари AmneziaWG для нативного прямого режима

Keygen (WG-пара) делается в Dart (`lib/services/wg_keys.dart`, X25519) — бинарь
для ключей НЕ нужен. Нужен только исполняемый tunnel-компонент AmneziaWG.

## Windows
Нужен `amneziawg.exe` — tunnel-сервис AmneziaWG (форк wireguard.exe). Движок
поднимает его как `amneziawg.exe /installtunnelservice <unway-direct.conf>`
(сервис сам создаёт адаптер, применяет awg-параметры, маршруты, DNS, MTU,
исключает endpoint из туннеля). Снятие: `/uninstalltunnelservice unway-direct`.

Где взять:
- из установленной **AmneziaVPN** (Windows): `amneziawg.exe` в каталоге
  программы (обычно `C:\Program Files\AmneziaVPN\`), либо
- релизы `amnezia-vpn/amneziawg-windows` (asset с `amneziawg.exe`).

Положить:
```
client/windows/bin/amneziawg.exe
```
(каталог `bin/` бандлится сборкой; запуск требует прав администратора — у Unway есть.)

## Android (следующая стадия)
Планируется `amneziawg-go` (android-сборка через NDK) + VpnService с `WG_TUN_FD`;
конфиг применяется по UAPI, маршруты задаёт VpnService.Builder. Детали — когда
дойдём до Android-движка.
