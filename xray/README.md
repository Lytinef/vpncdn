# Xray-узел (origin за NGENIX)

Каждый VPN-узел — это VPS с Xray (VLESS+WS+TLS) и агентом управления.
Backend добавляет/удаляет клиентов через HTTP API агента; клиент подключается
через домен в NGENIX.

## Состав

| Файл                  | Назначение                                                   |
|-----------------------|-------------------------------------------------------------|
| `config.base.json`    | Базовый конфиг Xray (агент дозаполняет список клиентов)      |
| `agent/server.js`     | Супервайзер Xray + HTTP API (`/clients`)                     |
| `agent/Dockerfile`    | Образ: Xray-core + Node-агент                                |
| `docker-compose.yml`  | Стек узла                                                    |
| `NGENIX.md`           | Настройка CDN-прослойки                                      |
| `MOBILE.md`           | Сборка нативных библиотек для клиента                        |

## Запуск узла

```bash
cd xray
mkdir -p cert data
# положить fullchain.pem / privkey.pem в ./cert (домен origin)
export AGENT_SECRET=$(openssl rand -hex 24)
docker compose up -d --build
curl -H "Authorization: Bearer $AGENT_SECRET" http://localhost:8090/health
```

Затем добавьте узел в админке (см. `NGENIX.md`), указав `AGENT_SECRET` и URL агента.

## HTTP API агента

| Метод  | Путь               | Тело                  | Назначение            |
|--------|--------------------|-----------------------|-----------------------|
| GET    | `/health`          | —                     | проверка              |
| GET    | `/clients`         | —                     | список клиентов       |
| POST   | `/clients`         | `{uuid,email}`        | добавить VLESS-клиента|
| DELETE | `/clients/:uuid`   | —                     | удалить клиента       |

Все, кроме `/health`, требуют `Authorization: Bearer <AGENT_SECRET>`.

> Клиенты добавляются/удаляются **динамически через gRPC API Xray**
> (`HandlerService.AlterInbound` → `AddUserOperation`/`RemoveUserOperation`),
> **без перезапуска Xray** — активные сессии других пользователей не рвутся.
> Список клиентов хранится в `data/clients.json` и автоматически восстанавливается
> в работающем Xray после его (пере)запуска.
