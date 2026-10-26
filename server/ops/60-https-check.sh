#!/usr/bin/env bash
# 60-https-check.sh - ВРЕМЕННАЯ проверка HTTPS: запускает только Caddy,
# который отвечает "ok" на /health по адресу <ip-через-дефисы>.sslip.io
# и сам получает сертификат Let's Encrypt. Кода бэкенда здесь нет.
#
# Требует: 20-firewall.sh (порты 80/443 открыты), 30-docker.sh, 50-app-dirs.sh.
# Запускается ТОЛЬКО контейнер Caddy (docker compose up -d). Остальные
# контейнеры, в том числе VPN, и демон Docker не затрагиваются.
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

# Адрес сервера. По умолчанию - адрес нашего сервера; можно ввести другой.
DEFAULT_HOST="208-85-20-164.sslip.io"
read -r -p "Адрес для HTTPS [$DEFAULT_HOST]: " typed
HOST="${typed:-$DEFAULT_HOST}"
[[ "$HOST" =~ ^[0-9]{1,3}(-[0-9]{1,3}){3}\.sslip\.io$ ]] || die "Ожидался адрес вида 208-85-20-164.sslip.io, получено: '$HOST'"
info "Адрес для проверки: https://$HOST/health"

# --- Защита VPN ---
# Caddy публикует 80/tcp, 443/tcp, 443/udp. VPN Amnezia работает на своём
# UDP/TCP-порту. Если один из наших портов уже занят (в т.ч. самим VPN), стоп.
VPN_BEFORE="$(vpn_snapshot)"
info "VPN до запуска:"; echo "${VPN_BEFORE:-  (контейнеры VPN не найдены)}"
if [ -z "$(docker ps -q --filter name=hayeren-caddy-test)" ]; then
  BUSY="$(ss -H -tuln 2>/dev/null | awk '{print $1" "$5}' | grep -E '(tcp .*:(80|443)$|udp .*:443$)' || true)"
  PUBLISHED="$(docker ps --format '{{.Names}}: {{.Ports}}' | grep -E ':(80|443)->' || true)"
  if [ -n "$BUSY$PUBLISHED" ]; then
    warn "Порты 80/443 уже заняты, запуск Caddy может задеть то, что на них работает (возможно, VPN):"
    echo "$BUSY"; echo "$PUBLISHED"
    die "Остановлено. Пришлите этот вывод в чат."
  fi
fi

warn "Caddy запросит сертификат у Let's Encrypt. Частые перезапуски упираются в лимиты выпуска."
confirm "Запустить?" || exit 0

sed "s/__HOST__/$HOST/g" "$SCRIPT_DIR/templates/Caddyfile.template" > "$CADDY_DIR/Caddyfile"
cp "$SCRIPT_DIR/templates/docker-compose.caddy-test.yml" "$COMPOSE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$CADDY_DIR/Caddyfile" "$COMPOSE"

docker compose -f "$COMPOSE" up -d
vpn_compare "$VPN_BEFORE"
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
