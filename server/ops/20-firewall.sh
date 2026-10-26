#!/usr/bin/env bash
# 20-firewall.sh - ДОБАВЛЯЕТ в уже работающий ufw порты 80/tcp, 443/tcp, 443/udp
# (для Caddy) и ставит fail2ban для SSH.
#
# Сервер с работающим VPN (Amnezia в Docker), поэтому скрипт НЕ делает:
#   - ufw default ... (политики остаются как есть),
#   - ufw reset / ufw reload / ufw enable / ufw disable,
#   - не удаляет и не меняет существующие правила.
# Порт VPN в ufw не открыт: Docker публикует его мимо ufw, это нормально.
#
# Запуск: sudo bash 20-firewall.sh [ваш-IP-для-whitelist-fail2ban]
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

command -v ufw >/dev/null || die "ufw не найден. На этом сервере он должен быть (проверьте 00-check.sh)."
ufw status | grep -q '^Status: active' \
  || die "ufw не активен. Мы его сами не включаем (решение контролёра): пришлите вывод 'ufw status' в чат."

VPN_BEFORE="$(vpn_snapshot)"
info "VPN до изменений:"; echo "${VPN_BEFORE:-  (контейнеры VPN не найдены)}"

# Резервные копии текущих правил (на случай, если потребуется сравнить).
BK="/root/fw-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"; chmod 700 "$BK"
ufw status numbered > "$BK/ufw-status.txt" 2>&1 || true
iptables-save  > "$BK/iptables.rules"  2>/dev/null || true
ip6tables-save > "$BK/ip6tables.rules" 2>/dev/null || true
nft list ruleset > "$BK/nft.rules" 2>/dev/null || true
ok "Копии текущих правил сохранены в $BK"

# Только ДОБАВЛЕНИЕ правил. Повтор безопасен: ufw пишет «Skipping adding existing rule».
ufw allow 80/tcp  comment 'HTTP (Lets Encrypt)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
ufw status verbose

# --- fail2ban для SSH ---
# Он добавляет СВОЮ цепочку только для порта SSH и не трогает правила Docker/VPN
# (те работают в цепочках DOCKER*/FORWARD и на другом порту).
# ПРОВЕРИТЬ на Ubuntu 26.04: пакет fail2ban и его работа с systemd-журналом.
# Если установка или запуск не удались, скрипт не падает: фаервол уже настроен.
SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"
SSH_PORT="${SSH_PORT:-22}"

IGNORE="127.0.0.1/8 ::1"
MYIP="${1:-}"
if [ -z "$MYIP" ] && [ -n "${SSH_CLIENT:-}" ]; then
  MYIP="${SSH_CLIENT%% *}"
  info "Вы подключены с IP $MYIP. Добавить его в белый список fail2ban?"
  confirm "Добавить $MYIP (он не будет банится при неверных паролях)?" || MYIP=""
fi
[ -z "$MYIP" ] || IGNORE="$IGNORE $MYIP"

if DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y -qq fail2ban; then
  JAIL="/etc/fail2ban/jail.d/hayeren-sshd.local"
  # Всегда перезаписываем наш файл: так можно поменять ignoreip повторным запуском.
  cat > "$JAIL" <<CONF
[DEFAULT]
ignoreip = $IGNORE

[sshd]
enabled  = true
port     = $SSH_PORT
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 10m
CONF
  ok "Настройка fail2ban записана ($JAIL), бан на 10 минут."
  systemctl enable fail2ban >/dev/null 2>&1 || true
  if systemctl is-active --quiet fail2ban; then
    fail2ban-client reload || warn "fail2ban не принял настройку, проверьте: journalctl -u fail2ban"
  else
    systemctl start fail2ban || warn "fail2ban не запустился: journalctl -u fail2ban -n 30"
  fi
  fail2ban-client status sshd || warn "Тюрьма sshd не активна (проверить на 26.04)."
else
  warn "fail2ban не установился (проверить на 26.04). Продолжаем без него, это не критично."
fi

vpn_compare "$VPN_BEFORE"

cat <<MSG

Если вы ошиблись паролем в приложении Amnezia и IP попал в бан:
  Веб-консоль Vultr (View Console), войти root, затем:
    fail2ban-client status sshd
    fail2ban-client set sshd unbanip <ваш-IP>
  Чтобы IP не банился вообще, запустите ещё раз: sudo bash $0 <ваш-IP>

Заметка: Docker публикует порты в обход ufw. В docker-compose наружу
публикуем только 80 и 443 (Caddy). Порт API наружу не публикуется никогда.
MSG
