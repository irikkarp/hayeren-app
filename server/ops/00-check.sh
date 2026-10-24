#!/usr/bin/env bash
# 00-check.sh - ТОЛЬКО ЧТЕНИЕ. Ничего не меняет на сервере.
# Показывает: систему, ресурсы, что слушает порты 22/80/443, есть ли Docker,
# nginx, apache, Caddy, фаервол, настройки SSH. Вывод не содержит паролей и
# ключей - его можно целиком скопировать и прислать в чат.
#
# Запуск: sudo bash 00-check.sh   (или от root)
set -uo pipefail   # без -e: проверки не должны обрываться на первой неудаче

section() { printf '\n===== %s =====\n' "$1"; }

section "Система"
grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release 2>/dev/null
uname -srm
uptime -p 2>/dev/null

section "Ресурсы"
echo "CPU: $(nproc) ядер"
free -h
echo "--- swap ---"
swapon --show 2>/dev/null || true
[ -z "$(swapon --show 2>/dev/null)" ] && echo "swap не настроен"
echo "--- диск ---"
df -h / 2>/dev/null

section "Сеть"
echo "IPv4-адреса интерфейсов:"
ip -4 -brief addr 2>/dev/null
echo "IPv6-адреса интерфейсов:"
ip -6 -brief addr 2>/dev/null

section "Кто слушает порты (22 / 80 / 443)"
if command -v ss >/dev/null; then
  ss -tulpn 2>/dev/null | grep -E ':(22|80|443)\b' || echo "порты 22/80/443 никем не заняты"
fi

section "Установленное ПО"
for tool in docker nginx apache2 httpd caddy ufw fail2ban sqlite3 git curl; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "есть:    $tool"
  else
    echo "нет:     $tool"
  fi
done
echo "--- версии ---"
docker --version 2>/dev/null || true
docker compose version 2>/dev/null || true
echo "--- активные службы ---"
for svc in nginx apache2 caddy docker fail2ban ufw unattended-upgrades; do
  printf '%s: %s\n' "$svc" "$(systemctl is-active "$svc" 2>/dev/null || true)"
done
if command -v docker >/dev/null 2>&1; then
  echo "--- контейнеры Docker (имена и образы) ---"
  docker ps -a --format '{{.Names}}  {{.Image}}  {{.Status}}' 2>/dev/null || true
fi

section "Фаервол"
ufw status verbose 2>/dev/null || echo "ufw недоступен или нет прав (запустите через sudo)"

section "SSH (действующие настройки)"
if [ "$(id -u)" -eq 0 ]; then
  sshd -T 2>/dev/null | grep -E '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|kbdinteractiveauthentication) ' \
    || echo "не удалось прочитать настройки sshd"
else
  echo "нужны права root (запустите через sudo), чтобы показать настройки"
fi
ls /etc/ssh/sshd_config.d/ 2>/dev/null

section "Пользователи с оболочкой входа (только имена)"
awk -F: '$7 !~ /(nologin|false)$/ {print $1}' /etc/passwd

section "Каталог приложения"
ls -ld /opt/hayeren 2>/dev/null || echo "/opt/hayeren ещё не создан"

section "Конец"
echo "Скопируйте всё выше и пришлите в чат. Здесь нет паролей и ключей."
