# Развёртывание на чистом VPS

Пошаговая инструкция для нового сервера (Ubuntu 22.04/24.04).

Система состоит из двух ролей. Их можно держать на одном VPS или на разных:

1. **Control-plane** — backend (API), веб-админка, PostgreSQL, Redis. (домены `api.example.com`, `admin.example.com`)
2. **VPN-узел (origin)** — Xray + агент, за CDN NGENIX. (домен origin `node1.example.com`, CDN-домен `vpn.example.com`)

Минимально: 1 control-plane VPS + 1 узел. Можно начать с обоих ролей на одном VPS.

---

## 0. Что подготовить заранее

- Домены и DNS A-записи:
  - `api.example.com` → IP control-plane
  - `admin.example.com` → IP control-plane
  - `node1.example.com` → IP узла (origin; нужен для выпуска TLS-сертификата)
  - `vpn.example.com` → CNAME на NGENIX (CDN, настраивается в панели NGENIX)
- **Telegram-бот**: создать у `@BotFather`, получить токен и username; в настройках бота
  задать **домен Login Widget** = `api.example.com`.
- **YooKassa**: магазин, `shopId` + секретный ключ; включить сохранённые способы оплаты
  (для рекуррента); позже указать URL вебхука.
- **NGENIX**: доступ в панель CDN.

---

## 1. Базовая подготовка VPS (для обеих ролей)

```bash
# под root или через sudo
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

Получите код проекта на сервер (git clone вашего репозитория или `scp` каталога `vpncdn/`).
Далее предполагается, что проект лежит в `/opt/vpncdn`.

---

## 2. Control-plane (backend + админка + БД)

### 2.1. Настроить секреты backend

```bash
cd /opt/vpncdn
cp server/.env.example server/.env
nano server/.env
```

Заполните в `server/.env`:

| Переменная | Значение |
|---|---|
| `PUBLIC_API_URL` | `https://api.example.com` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | длинные случайные строки (`openssl rand -hex 32`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | из BotFather |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | из YooKassa |
| `YOOKASSA_RETURN_URL` | `vpncdn://payment/result` |
| `ADMIN_JWT_SECRET` | случайная строка |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | логин/пароль первого администратора |
| `ADMIN_ORIGIN` | `https://admin.example.com` |
| `DB_PASSWORD` | тот же, что в `deploy/.env` |

### 2.2. Настроить деплой

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env        # POSTGRES_PASSWORD (= DB_PASSWORD), ADMIN_API_BASE_URL=https://api.example.com
nano deploy/Caddyfile   # заменить домены api./admin. и e-mail
```

### 2.3. Запуск

```bash
cd /opt/vpncdn
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

- Миграции БД применяются автоматически при старте backend (`migrationsRun`).
- Caddy сам выпустит TLS-сертификаты для `api.` и `admin.` (нужны корректные DNS и открытые 80/443).

### 2.4. Сиды (тарифы, администратор, стартовый список обхода)

```bash
docker compose -f deploy/docker-compose.prod.yml exec server node dist/database/seeds/run-seed.js
```

### 2.5. Проверка

```bash
curl https://api.example.com/health           # {"status":"ok",...}
```
Откройте `https://admin.example.com` и войдите под `ADMIN_BOOTSTRAP_EMAIL`/`PASSWORD`.

### 2.6. Фаервол control-plane

```bash
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable
```
Порты 5432/6379/3000 наружу НЕ открываются (только внутри docker-сети).

### 2.7. YooKassa webhook

В личном кабинете YooKassa укажите URL уведомлений:
`https://api.example.com/api/payments/yookassa/webhook` (события `payment.succeeded`, `payment.canceled`).

---

## 3. VPN-узел (Xray + агент)

На VPS узла (после шага 1):

### 3.1. TLS-сертификат origin

```bash
cd /opt/vpncdn/xray
mkdir -p cert data
# проще всего через acme.sh или certbot для node1.example.com:
apt -y install certbot
certbot certonly --standalone -d node1.example.com
cp /etc/letsencrypt/live/node1.example.com/fullchain.pem cert/fullchain.pem
cp /etc/letsencrypt/live/node1.example.com/privkey.pem   cert/privkey.pem
```

### 3.2. Запуск узла

```bash
cd /opt/vpncdn/xray
export AGENT_SECRET=$(openssl rand -hex 24)
echo "AGENT_SECRET=$AGENT_SECRET"      # сохраните — понадобится в админке
AGENT_SECRET=$AGENT_SECRET docker compose up -d --build
curl -H "Authorization: Bearer $AGENT_SECRET" http://127.0.0.1:8090/health
```

### 3.3. Фаервол узла

```bash
ufw allow OpenSSH
ufw allow 8443/tcp                      # origin для NGENIX (в идеале — только подсети NGENIX)
ufw allow from <IP_CONTROL_PLANE> to any port 8090 proto tcp   # агент только для backend
ufw enable
```

> Если control-plane и узел на одном VPS — агент уже доступен по `127.0.0.1:8090`,
> и в админке URL агента укажите `http://127.0.0.1:8090`.

---

## 4. NGENIX (CDN-прослойка)

Настройте ресурс по инструкции [`xray/NGENIX.md`](../xray/NGENIX.md):
личный домен `vpn.example.com`, источник `node1.example.com:8443` по HTTPS,
проксирование WebSocket, без кэша для `/ws`, TLS на `vpn.example.com`.

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
| URL агента | `http://<IP_узла>:8090` (или `http://127.0.0.1:8090`) |
| Секрет агента | значение `AGENT_SECRET` |

После сохранения backend сможет заводить VLESS-клиентов на узле (через gRPC, без рестарта Xray).

---

## 6. Клиентское приложение

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

## 7. Чек-лист приёмки

- [ ] `https://api.example.com/health` отвечает `ok`
- [ ] Админка открывается, вход работает, видны 3 тарифа
- [ ] Узел добавлен, `/health` агента отвечает
- [ ] Вход в приложении через Telegram проходит (домен Login Widget = api.example.com)
- [ ] Покупка подписки → оплата YooKassa → подписка `active`
- [ ] Подключение VPN (на full-сборке) поднимает туннель, на главном экране пинг/скорость
- [ ] Webhook YooKassa приходит и продлевает подписку

---

## 8. Эксплуатация

- **Логи**: `docker compose -f deploy/docker-compose.prod.yml logs -f server`
- **Обновление**: `git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build`
- **Бэкап БД**:
  ```bash
  docker compose -f deploy/docker-compose.prod.yml exec postgres \
    pg_dump -U vpn vpn | gzip > backup_$(date +%F).sql.gz
  ```
- **Несколько узлов**: повторите раздел 3 на новых VPS и добавьте их в админке —
  backend распределяет устройства по наименее загруженным узлам автоматически.
