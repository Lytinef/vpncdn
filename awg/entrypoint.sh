#!/bin/bash
# Поднимает userspace AmneziaWG-интерфейс + NAT, затем запускает API провижининга.
set -e

IFACE="${AWG_IFACE:-awg0}"
SUBNET="${AWG_SUBNET:-10.8.2}"
PORT="${AWG_LISTEN_PORT:-51820}"
: "${AWG_PRIVATE_KEY:?AWG_PRIVATE_KEY не задан}"

MTU="${AWG_MTU:-1376}"

# Профиль обфускации AmneziaWG 2.0 (ДОЛЖЕН совпадать с клиентами). Значения по
# умолчанию — рабочий awg2-профиль; переопределяются через env.
JC="${AWG_JC:-6}";   JMIN="${AWG_JMIN:-10}"; JMAX="${AWG_JMAX:-50}"
S1="${AWG_S1:-102}"; S2="${AWG_S2:-94}";  S3="${AWG_S3:-24}";  S4="${AWG_S4:-5}"
H1="${AWG_H1:-735017314-1784971875}";  H2="${AWG_H2:-1928766202-1941935460}"
H3="${AWG_H3:-2096113811-2127150958}"; H4="${AWG_H4:-2141629287-2145783098}"
# I1 — «магический» пакет, мимикрирующий под DNS-ответ (awg2). Длинный → отдельно.
I1="${AWG_I1:-<b 0x084481800001000300000000077469636b65747306776964676574096b696e6f706f69736b0272750000010001c00c0005000100000039001806776964676574077469636b6574730679616e646578c025c0390005000100000039002b1765787465726e616c2d7469636b6574732d776964676574066166697368610679616e646578036e657400c05d000100010000001c000457fafe25>}"

# 1) Интерфейс: предпочитаем kernel-модуль amneziawg (быстрый датапас), иначе
# userspace amneziawg-go (медленнее, но без модуля ядра).
if ip link add dev "$IFACE" type amneziawg 2>/dev/null; then
  echo "[awg] kernel-модуль amneziawg"
else
  echo "[awg] kernel-модуля нет → userspace amneziawg-go"
  amneziawg-go "$IFACE"
fi

# 2) ключ + порт + awg2-обфускация
printf '%s\n' "$AWG_PRIVATE_KEY" > /tmp/awg.key
awg set "$IFACE" private-key /tmp/awg.key listen-port "$PORT" \
  jc "$JC" jmin "$JMIN" jmax "$JMAX" s1 "$S1" s2 "$S2" s3 "$S3" s4 "$S4" \
  h1 "$H1" h2 "$H2" h3 "$H3" h4 "$H4" i1 "$I1"
rm -f /tmp/awg.key

# 3) адрес сервера в подсети + MTU + поднять линк
ip addr add "$SUBNET.1/24" dev "$IFACE" 2>/dev/null || true
ip link set "$IFACE" mtu "$MTU"
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
