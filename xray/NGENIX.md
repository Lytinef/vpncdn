# Настройка прослойки NGENIX (CDN)

Схема трафика:

```
Клиент (VLESS+WS+TLS) ──HTTPS:443──▶ NGENIX (CDN) ──▶ Origin (Xray :8443, WS+TLS) ──▶ Интернет
```

Для CDN трафик выглядит как обычный HTTPS/WebSocket, что и даёт устойчивость к блокировкам.

## 1. Origin

1. Поднимите VPS, разверните узел: `xray/docker-compose.yml` (см. `README.md`).
2. Выпустите TLS-сертификат на домен origin (например `node1-origin.example.com`)
   через acme.sh/certbot, положите `fullchain.pem` и `privkey.pem` в `xray/cert/`.
3. Xray слушает `:8443`, путь WebSocket — `/ws` (см. `config.base.json`).
4. Откройте на фаерволе `8443` только для диапазонов NGENIX, `8090` — только для backend.

## 2. Ресурс в NGENIX

1. Создайте CDN-ресурс с **личным доменом** (CNAME), например `vpn.example.com` —
   именно его клиент указывает как `cdnDomain` (поле узла в админке).
2. **Origin (источник)**: `node1-origin.example.com:8443`, протокол к источнику — **HTTPS**.
3. Включите проксирование **WebSocket** (Upgrade/Connection заголовки) и проброс
   заголовка `Host`.
4. Отключите кэширование для пути `/ws` (динамика, без кэша).
5. TLS: сертификат на `vpn.example.com` (Let's Encrypt в панели NGENIX или загрузка своего).
6. Таймауты соединения к источнику — увеличьте (туннель долгоживущий), напр. 1 час.

## 3. Запись узла в админке

В админке → «Узлы» → добавить:

| Поле        | Значение                          |
|-------------|-----------------------------------|
| CDN-домен   | `vpn.example.com` (домен в NGENIX)|
| SNI         | `vpn.example.com`                 |
| Порт        | `443`                             |
| WebSocket path | `/ws`                          |
| Origin-хост | `node1-origin.example.com` (справочно) |
| URL агента  | `http://<origin-ip>:8090`         |
| Секрет агента | значение `AGENT_SECRET`         |

После сохранения backend сможет добавлять/удалять VLESS-клиентов на узле через агент,
а клиент — подключаться через `vpn.example.com` (CDN).

## Проверка

```bash
# Health агента (с backend-хоста)
curl -H "Authorization: Bearer $AGENT_SECRET" http://<origin-ip>:8090/health

# TLS до CDN
openssl s_client -connect vpn.example.com:443 -servername vpn.example.com </dev/null
```
