FROM node:20-alpine

RUN apk add --no-cache ca-certificates unzip wget

# Xray-core (pinned)
ARG XRAY_VERSION=v1.8.23
RUN wget -O /tmp/xray.zip \
      https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-64.zip \
 && unzip /tmp/xray.zip -d /tmp/xray \
 && mv /tmp/xray/xray /usr/bin/xray \
 && mkdir -p /usr/local/share/xray \
 && mv /tmp/xray/*.dat /usr/local/share/xray/ \
 && rm -rf /tmp/xray.zip /tmp/xray
ENV XRAY_LOCATION_ASSET=/usr/local/share/xray

WORKDIR /app
COPY agent/package.json ./
RUN npm install --omit=dev
COPY agent/server.js ./
COPY agent/proto ./proto
COPY config.base.json /etc/xray/config.base.json

ENV XRAY_BASE_CONFIG=/etc/xray/config.base.json \
    XRAY_CONFIG=/etc/xray/config.generated.json \
    CLIENTS_FILE=/data/clients.json \
    AGENT_PORT=8090

# 8443 — VLESS+WS+TLS (origin для NGENIX), 8090 — агент (закрыть фаерволом для backend)
EXPOSE 8443 8090

CMD ["node", "server.js"]
