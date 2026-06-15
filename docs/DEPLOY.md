# Развёртывание на чистом VPS

Пошаговая инструкция для нового сервера (Ubuntu 22.04/24.04).

Система состоит из двух ролей:

1. **Control-plane** — backend (API), веб-админка, PostgreSQL, Redis. Домены `api.example.com`, `admin.example.com`.
2. **VPN-узел (origin)** — Xray + агент за CDN NGENIX. Домен origin `node1.example.com`, CDN-домен `vpn.example.com`.

**По умолчанию обе роли на одном VPS** — узел уже включён в прод-стек
`deploy/docker-compose.prod.yml`. Отдельный `xray/docker-compose.yml` нужен,
только если узел выносится на другую машину (раздел 8).

> На одном VPS запускается **ровно один** стек — `deploy/docker-compose.prod.yml`.
> Не запускайте `xray/docker-compose.yml` параллельно: будет конфликт порта 8443.

---

## 0. Что подготовить заранее

- Домены и DNS A-записи (на одном VPS все три указывают на его IP):
  - `api.example.com` → IP VPS
  - `admin.example.com` → IP VPS
  - `node1.example.com` → IP VPS (origin; нужен для TLS-сертификата узла)
  - `vpn.example.com` → CNAME на NGENIX (CDN, настраивается в панели NGENIX)
- **Telegram-бот**: создать у `@BotFather`, получить токен и username; задать
  **домен Login Widget** = `api.example.com`.
- **YooKassa**: магазин, `shopId` + секретный ключ; включить сохранённые способы оплаты.
- **NGENIX**: доступ в панель CDN.

---

## 1. Базовая подготовка VPS

```bash
apt update && apt -y upgrade
apt -y install ca-certificates curl git ufw

# Docker + compose plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Получите код на сервер (`git clone` вашего репозитория). Далее — проект в `/opt/vpncdn`.

> Все команды compose ниже — с фиксированным именем проекта `-p vpncdn`, чтобы
> повторные запуски пересоздавали те же контейнеры, а не плодили дубликаты.

---

## 2. Сертификат origin (ДО запуска стека)

Узел Xray слушает 8443 с TLS, поэтому сертификат нужен **до** первого `up`
(иначе Xray внутри не стартует). Порт 80 в этот момент должен быть свободен.

```bash
cd /opt/vpncdn
mkdir -p xray/cert xray/data
apt -y install certbot
certbot certonly --standalone -d node1.lytinef.ru
cp /etc/letsencrypt/live/node1.lytinef.ru/fullchain.pem xray/cert/fullchain.pem
cp /etc/letsencrypt/live/node1.lytinef.ru/privkey.pem   xray/cert/privkey.pem
```

> Продление: сертификат origin выпущен `--standalone` (порт 80). Перед `certbot renew`
> временно гасите Caddy: `docker compose -p vpncdn -f deploy/docker-compose.prod.yml stop caddy`,
> затем `certbot renew`, скопируйте свежие `*.pem` в `xray/cert/`, поднимите Caddy и
> перезапустите узел. Либо используйте acme.sh с DNS-валидацией провайдера.

---

## 3. Секреты и конфиги

### 3.1. Backend

```bash
cd /opt/vpncdn
cp server/.env.example server/.env
nano server/.env
```

| Переменная | Значение |
|---|---|
| `PUBLIC_API_URL` | `https://api.example.com` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | из BotFather |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | из YooKassa |
| `YOOKASSA_RETURN_URL` | `vpncdn://payment/result` |
| `ADMIN_JWT_SECRET` | случайная строка |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | логин/пароль первого админа |
| `ADMIN_ORIGIN` | `https://admin.example.com` |
| `DB_HOST` | `postgres` |
| `DB_PASSWORD` | **тот же**, что `POSTGRES_PASSWORD` в `deploy/.env` |

### 3.2. Деплой

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env        # POSTGRES_PASSWORD (= DB_PASSWORD), ADMIN_API_BASE_URL, AGENT_SECRET
nano deploy/Caddyfile   # реальные домены api./admin. и e-mail
```

`AGENT_SECRET` сгенерируйте: `openssl rand -hex 24` — он же понадобится в админке.

---

## 4. Запуск всего стека

```bash
cd /opt/vpncdn
docker compose -p vpncdn -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Поднимаются: PostgreSQL, Redis, backend, админка, Caddy (TLS для `api.`/`admin.`),
Xray-узел (origin `:8443` + агент во внутренней сети).

- Миграции БД применяются автоматически при старте backend.
- Caddy сам выпустит сертификаты `api.`/`admin.` (нужны корректные DNS и открытые 80/443).

### 4.1. Сиды (тарифы, админ, список обхода)

```bash
docker compose -p vpncdn -f deploy/docker-compose.prod.yml exec server node dist/database/seeds/run-seed.js
```

### 4.2. Проверки

```bash
# API
curl https://api.lytinef.ru/health
# агент Xray-узла (он во внутренней сети, не на хосте):
docker compose -p vpncdn -f deploy/docker-compose.prod.yml exec server wget -qO- http://xray-node:8090/health
# статус контейнеров
docker compose -p vpncdn -f deploy/docker-compose.prod.yml ps
```
Откройте `https://admin.example.com`, войдите под `ADMIN_BOOTSTRAP_EMAIL`/`PASSWORD` — видны 3 тарифа.

### 4.3. Фаервол

```bash
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 8443/tcp          # origin для NGENIX (в идеале ограничить подсетями NGENIX)
ufw enable
```
Порты 5432/6379/3000/8090 наружу НЕ открываются (только внутри docker-сети).

### 4.4. YooKassa webhook

URL уведомлений: `https://api.example.com/api/payments/yookassa/webhook`
(события `payment.succeeded`, `payment.canceled`).

---

## 5. Регистрация узла в админке

`https://admin.example.com` → «Узлы» → добавить:

| Поле | Значение |
|---|---|
| CDN-домен | `vpn.example.com` |
| SNI | `vpn.example.com` |
| Порт | `443` |
| WebSocket path | `/ws` |
| Origin-хост | `node1.example.com` |
| URL агента | `http://xray-node:8090` (узел в одном стеке) |
| Секрет агента | значение `AGENT_SECRET` из `deploy/.env` |

После сохранения backend заводит VLESS-клиентов на узле через gRPC (без рестарта Xray).

---

## 6. NGENIX (CDN-прослойка)

Настройте ресурс по [`xray/NGENIX.md`](../xray/NGENIX.md): личный домен `vpn.example.com`,
источник `node1.example.com:8443` по HTTPS, проксирование WebSocket, без кэша для `/ws`,
TLS на `vpn.example.com`.

---

## 7. Клиентское приложение

Stub-сборка (без VPN-ядра) ставится сразу:
```bash
cd client
flutter build apk --release --flavor stub --dart-define=API_BASE_URL=https://api.example.com
```
Полноценный VPN — flavor `full` с нативными библиотеками (см. [`xray/MOBILE.md`](../xray/MOBILE.md)):
```bash
# положить libxray.aar и tun2socks в client/android/app/libs/
flutter build apk --release --flavor full --dart-define=API_BASE_URL=https://api.example.com
```

---

## 8. (Опционально) Вынос узла на ОТДЕЛЬНЫЙ VPS

Если узлов несколько или узел на другой машине — на control-plane уберите сервис
`xray-node` из `deploy/docker-compose.prod.yml`, а на машине узла:

```bash
cd /opt/vpncdn/xray
mkdir -p cert data
certbot certonly --standalone -d nodeN.example.com
cp /etc/letsencrypt/live/nodeN.example.com/fullchain.pem cert/fullchain.pem
cp /etc/letsencrypt/live/nodeN.example.com/privkey.pem   cert/privkey.pem
export AGENT_SECRET=$(openssl rand -hex 24)
AGENT_SECRET=$AGENT_SECRET docker compose -p vpnnode up -d --build
```
Фаервол узла: открыть `8443` (для NGENIX) и `8090` только для IP control-plane.
В админке URL агента = `http://<IP_узла>:8090`. Backend сам распределяет устройства
по наименее загруженным узлам.

---

## 9. Чек-лист приёмки

- [ ] `https://api.lytinef.ru/health` отвечает `ok`
- [ ] Админка открывается, вход работает, видны 3 тарифа
- [ ] Агент узла отвечает (`exec server wget http://xray-node:8090/health`)
- [ ] Вход в приложении через Telegram проходит (домен Login Widget = api.example.com)
- [ ] Покупка подписки → оплата YooKassa → подписка `active`
- [ ] Подключение VPN (на full-сборке) поднимает туннель, на главном экране пинг/скорость
- [ ] Webhook YooKassa приходит и продлевает подписку

---

## 10. Эксплуатация

- **Логи**: `docker compose -p vpncdn -f deploy/docker-compose.prod.yml logs -f server`
- **Обновление**: `git pull && docker compose -p vpncdn -f deploy/docker-compose.prod.yml up -d --build`
- **Бэкап БД**:
  ```bash
  docker compose -p vpncdn -f deploy/docker-compose.prod.yml exec postgres \
    pg_dump -U vpn vpn | gzip > backup_$(date +%F).sql.gz
  ```
