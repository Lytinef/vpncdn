# AmneziaWG (userspace amneziawg-go) + amneziawg-tools + мини-API провижининга.
# Прямой режим VPN: WireGuard с обфускацией (Jc/Jmin/Jmax/S1/S2/H1-4) против DPI.

# ── сборка amneziawg-go и amneziawg-tools ──
FROM golang:1.25-alpine AS build
RUN apk add --no-cache git make gcc musl-dev linux-headers bash
# userspace-реализация (TUN), т.к. в ядре нет awg-модуля
RUN git clone --depth=1 https://github.com/amnezia-vpn/amneziawg-go /src/go \
 && cd /src/go && go build -ldflags="-s -w" -o /out/amneziawg-go .
# CLI: awg (= wg) и awg-quick
RUN git clone --depth=1 https://github.com/amnezia-vpn/amneziawg-tools /src/tools \
 && make -C /src/tools/src \
 && make -C /src/tools/src install DESTDIR=/out/tools

# ── рантайм: node (API) + бинари awg + сетевые утилиты ──
FROM node:20-alpine
RUN apk add --no-cache bash iproute2 iptables ca-certificates
COPY --from=build /out/amneziawg-go /usr/bin/amneziawg-go
COPY --from=build /out/tools/usr/bin/awg /usr/bin/awg
# awg-quick не нужен: интерфейс поднимаем вручную в entrypoint.sh
# (amneziawg-go + awg set + ip + iptables).

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY api.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV AWG_PORT=8091 \
    AWG_IFACE=awg0 \
    AWG_LISTEN_PORT=51820 \
    AWG_SUBNET=10.8.2 \
    PEERS_FILE=/data/awg-peers.json

EXPOSE 8091
ENTRYPOINT ["./entrypoint.sh"]
