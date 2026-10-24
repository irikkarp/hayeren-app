#!/usr/bin/env bash
# 20-firewall.sh - фаервол ufw (разрешены только 22, 80, 443) и fail2ban для SSH.
# Порт 80 нужен Caddy для выпуска сертификата Let's Encrypt.
#
# Защита от потери доступа: порт 22 разрешается ДО включения фаервола.
# Запуск: sudo bash 20-firewall.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

# Узнаём, на каком порту реально слушает SSH (обычно 22).
SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"
SSH_PORT="${SSH_PORT:-22}"
info "SSH слушает порт $SSH_PORT."

if ! command -v ufw >/dev/null; then
  info "Устанавливаю ufw и fail2ban..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw fail2ban
else
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban
fi

ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
# ufw сам пропускает повторяющиеся правила, поэтому команды идемпотентны.
ufw allow "${SSH_PORT}/tcp" comment 'SSH'   >/dev/null
ufw allow 80/tcp  comment 'HTTP (Lets Encrypt)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 443/udp comment 'HTTP/3' >/dev/null

if ufw status | grep -q '^Status: active'; then
  skip "ufw уже включён."
else
  warn "Сейчас включится фаервол. Порт $SSH_PORT уже разрешён, текущее соединение не оборвётся."
  confirm "Включить ufw?" || exit 0
  ufw --force enable
  ok "ufw включён."
fi
ufw status verbose

# fail2ban: блокирует IP, которые подбирают пароли SSH.
JAIL="/etc/fail2ban/jail.d/hayeren-sshd.local"
if [ -f "$JAIL" ]; then
  skip "Настройка fail2ban уже есть."
else
  cat > "$JAIL" <<CONF
[sshd]
enabled = true
port = $SSH_PORT
maxretry = 5
findtime = 10m
bantime = 1h
CONF
  ok "Настройка fail2ban записана."
fi
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban
fail2ban-client status sshd || true

cat <<MSG

Заметка: Docker сам прописывает правила в обход ufw для опубликованных портов.
Поэтому в docker-compose наружу публикуем только 80 и 443 (Caddy).
Порт API наружу не публикуется никогда.
MSG
