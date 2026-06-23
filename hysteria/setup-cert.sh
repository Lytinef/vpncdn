#!/usr/bin/env bash
# Одноразовая генерация self-signed сертификата для Hysteria2 и вычисление
# pinSHA256 (его клиент пинит вместо проверки CA — защита от MITM без ACME).
# Запуск на сервере: bash hysteria/setup-cert.sh
set -e
cd "$(dirname "$0")"

if [ ! -f cert.pem ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/CN=api.lytinef.ru"
  echo "Создан cert.pem/key.pem (CN=api.lytinef.ru)"
else
  echo "cert.pem уже существует — пропускаю генерацию"
fi

PIN=$(openssl x509 -in cert.pem -noout -fingerprint -sha256 | sed 's/.*Fingerprint=//')
echo ""
echo "pinSHA256 = $PIN"
echo ""
echo "Пропиши его узлу в БД (поле directCertPin), напр.:"
echo "  UPDATE nodes SET \"directCertPin\"='$PIN';"
