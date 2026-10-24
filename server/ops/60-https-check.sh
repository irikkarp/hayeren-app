#!/usr/bin/env bash
# 60-https-check.sh - ВРЕМЕННАЯ проверка HTTPS: запускает только Caddy,
# который отвечает "ok" на /health по адресу <ip-через-дефисы>.sslip.io
# и сам получает сертификат Let's Encrypt. Кода бэкенда здесь нет.
#
# Требует: 20-firewall.sh (порты 80/443 открыты), 30-docker.sh, 50-app-dirs.sh.
# Запуск: sudo bash 60-https-check.sh [up|down]   (по умолчанию up)
#
# ПОТОМ ЗАМЕНИТСЯ: когда появится бэкенд, в Caddyfile вместо строки
# `respond /health ...` будет `reverse_proxy api:3000`, а вместо
# docker-compose.caddy-test.yml - полный docker-compose.yml с сервисами caddy+api.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"

CADDY_DIR="$APP_DIR/caddy"
COMPOSE="$CADDY_DIR/docker-compose.caddy-test.yml"

if [ "${1:-up}" = "down" ]; then
  docker compose -f "$COMPOSE" down
  ok "Тестовый Caddy остановлен."
  exit 0
fi

command -v docker >/dev/null || die "Нет Docker (30-docker.sh)."
[ -d "$CADDY_DIR" ] || die "Нет $CADDY_DIR (50-app-dirs.sh)."

# Определяем публичный IPv4 и просим подтвердить.
IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
read -r -p "Публичный IPv4 сервера [${IP:-введите вручную}]: " typed
IP="${typed:-$IP}"
[[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || die "Некорректный IPv4: '$IP'"
HOST="${IP//./-}.sslip.io"
info "Адрес для проверки: https://$HOST/health"

# Если наш тестовый Caddy уже запущен - порты заняты им, это нормально.
if [ -z "$(docker ps -q --filter name=hayeren-caddy-test)" ] && ss -tln | grep -qE ':(80|443)\s'; then
  warn "Порты 80/443 заняты чем-то другим:"
  ss -tlnp | grep -E ':(80|443)\s' || true
  confirm "Всё равно попробовать?" || exit 1
fi

warn "Caddy запросит сертификат у Let's Encrypt. Частые перезапуски упираются в лимиты выпуска."
confirm "Запустить?" || exit 0

sed "s/__HOST__/$HOST/g" "$SCRIPT_DIR/templates/Caddyfile.template" > "$CADDY_DIR/Caddyfile"
cp "$SCRIPT_DIR/templates/docker-compose.caddy-test.yml" "$COMPOSE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$CADDY_DIR/Caddyfile" "$COMPOSE"

docker compose -f "$COMPOSE" up -d
info "Жду выпуска сертификата (до 60 секунд)..."
for _ in $(seq 1 12); do
  sleep 5
  if curl -fsS --max-time 8 "https://$HOST/health" 2>/dev/null; then
    echo
    ok "HTTPS работает: https://$HOST/health"
    echo "Откройте этот адрес в браузере на Mac: должен быть замок и слово ok."
    exit 0
  fi
done
warn "Пока не отвечает. Смотрим логи (там нет секретов):"
docker compose -f "$COMPOSE" logs --tail 40 caddy || true
echo "Пришлите этот вывод в чат. Остановить тест: sudo bash $0 down"
exit 1
