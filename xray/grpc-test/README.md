# Временный тест: поддерживает ли NGENIX gRPC

Изолированный стенд. Прод (8443/WS) и клиент **не трогаем**. После теста — удалить (раздел «Очистка»).

UUID теста: `e5075c0f-0472-457e-9afc-0c62c330de95`
serviceName: `vpncdngrpc`, порт origin: `8444`, ALPN: `h2`.

## 1. Поднять стенд на VPS
```bash
cd /opt/vpncdn
docker compose -p grpctest -f xray/grpc-test/docker-compose.yml up -d
ufw allow 8444/tcp        # временно
docker compose -p grpctest -f xray/grpc-test/docker-compose.yml logs --tail=20
```
Использует существующий сертификат `xray/cert` (node1.lytinef.ru).

## 2. Тест A — напрямую к origin (без CDN), проверяем сам gRPC на сервере
В v2rayNG импортировать ссылку:
```
vless://e5075c0f-0472-457e-9afc-0c62c330de95@node1.lytinef.ru:8444?encryption=none&security=tls&sni=node1.lytinef.ru&alpn=h2&type=grpc&serviceName=vpncdngrpc&mode=gun#GRPC-DIRECT
```
- **Работает** → origin gRPC исправен, идём к тесту через CDN.
- Не работает → проблема на origin (смотрим `logs` стенда), CDN ещё ни при чём.

## 3. Тест B — через NGENIX (главный вопрос)
DNS: завести `grpc.lytinef.ru` → CNAME на NGENIX (цель из панели, как для основного домена).

В NGENIX создать **отдельный** ресурс `grpc.lytinef.ru`:
- источник: `node1.lytinef.ru` порт **8444**, протокол **HTTPS**;
- **HTTP/2 к источнику = ВКЛ** (ключевое для gRPC! если нет такой опции — это уже ответ);
- фикс. Host = `node1.lytinef.ru` (чтобы SNI совпал с сертификатом origin);
- кэш выключить; путь — все (`/`);
- edge-сертификат на `grpc.lytinef.ru`.

В v2rayNG импортировать:
```
vless://e5075c0f-0472-457e-9afc-0c62c330de95@grpc.lytinef.ru:443?encryption=none&security=tls&sni=grpc.lytinef.ru&alpn=h2&type=grpc&serviceName=vpncdngrpc&mode=gun#GRPC-NGENIX
```
- **Работает** → NGENIX держит gRPC, можно думать о миграции транспорта.
- A работает, B нет → **NGENIX не проксирует gRPC** (нет сквозного HTTP/2 к origin). Остаёмся на WS.

## 4. Очистка (обязательно после теста)
```bash
docker compose -p grpctest -f xray/grpc-test/docker-compose.yml down
ufw delete allow 8444/tcp
rm -rf /opt/vpncdn/xray/grpc-test     # если не нужен
```
В NGENIX удалить тест-ресурс `grpc.lytinef.ru`, в DNS убрать запись.

## Диагностика origin (если тест A не идёт)
```bash
# виден ли gRPC-эндпоинт на origin (ждём HTTP/2):
curl -vk --http2 https://node1.lytinef.ru:8444/ 2>&1 | grep -iE "ALPN|HTTP/2|subject"
docker compose -p grpctest -f xray/grpc-test/docker-compose.yml logs --tail=40
```
