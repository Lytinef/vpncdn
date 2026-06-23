#!/bin/bash
# Поднимает userspace AmneziaWG-интерфейс + NAT, затем запускает API провижининга.
set -e

IFACE="${AWG_IFACE:-awg0}"
SUBNET="${AWG_SUBNET:-10.8.2}"
PORT="${AWG_LISTEN_PORT:-51820}"
: "${AWG_PRIVATE_KEY:?AWG_PRIVATE_KEY не задан}"

# Параметры обфускации (ДОЛЖНЫ совпадать с клиентами). Значения по умолчанию —
# из env, чтобы можно было поменять без пересборки.
JC="${AWG_JC:-4}";   JMIN="${AWG_JMIN:-40}"; JMAX="${AWG_JMAX:-70}"
S1="${AWG_S1:-50}";  S2="${AWG_S2:-100}"
H1="${AWG_H1:-1735840940}"; H2="${AWG_H2:-1357416448}"
H3="${AWG_H3:-1644068449}"; H4="${AWG_H4:-1465942839}"

# 1) userspace-демон создаёт TUN awg0 (форкается в фон)
amneziawg-go "$IFACE"

# 2) ключ + порт + обфускация
printf '%s\n' "$AWG_PRIVATE_KEY" > /tmp/awg.key
awg set "$IFACE" private-key /tmp/awg.key listen-port "$PORT" \
  jc "$JC" jmin "$JMIN" jmax "$JMAX" s1 "$S1" s2 "$S2" \
  h1 "$H1" h2 "$H2" h3 "$H3" h4 "$H4"
rm -f /tmp/awg.key

# 3) адрес сервера в подсети + поднять линк
ip addr add "$SUBNET.1/24" dev "$IFACE" 2>/dev/null || true
ip link set "$IFACE" up

# 4) NAT: трафик пиров → в интернет
sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
iptables -t nat -C POSTROUTING -s "$SUBNET.0/24" -j MASQUERADE 2>/dev/null \
  || iptables -t nat -A POSTROUTING -s "$SUBNET.0/24" -j MASQUERADE
iptables -C FORWARD -i "$IFACE" -j ACCEPT 2>/dev/null || iptables -A FORWARD -i "$IFACE" -j ACCEPT
iptables -C FORWARD -o "$IFACE" -j ACCEPT 2>/dev/null || iptables -A FORWARD -o "$IFACE" -j ACCEPT

echo "[awg] $IFACE up на :$PORT, подсеть $SUBNET.0/24"

# 5) API провижининга (восстанавливает пиров из PEERS_FILE на старте)
exec node api.js
