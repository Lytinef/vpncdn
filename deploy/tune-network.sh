#!/usr/bin/env bash
# Сетевой тюнинг origin-VPS для скорости VPN.
# Включает BBR + увеличенные TCP-буферы + TCP Fast Open + MTU probing.
# Запускать на ХОСТЕ VPS (не в контейнере), один раз, под root:
#   sudo bash deploy/tune-network.sh
# Контейнеры используют ядро хоста, поэтому это влияет и на xray-node.
set -e

cat >/etc/sysctl.d/99-unway-net.conf <<'EOF'
# Congestion control BBR + честная очередь (fq) — главный прирост throughput.
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# Большие буферы для высоких BDP (длинные/международные пути через CDN).
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Быстрее устанавливать соединения и держать throughput.
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_mtu_probing = 1

# Очереди приёма под нагрузкой.
net.core.netdev_max_backlog = 16384
net.core.somaxconn = 8192
EOF

# Грузим модуль BBR (на старых ядрах может потребоваться).
modprobe tcp_bbr 2>/dev/null || true

sysctl --system >/dev/null

echo "congestion control: $(sysctl -n net.ipv4.tcp_congestion_control)"
echo "qdisc:              $(sysctl -n net.core.default_qdisc)"
echo "Готово. Если congestion control не 'bbr' — ядро старше 4.9, обнови ядро."
