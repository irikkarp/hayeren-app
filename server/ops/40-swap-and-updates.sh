#!/usr/bin/env bash
# 40-swap-and-updates.sh - проверка swap и автообновлений. Ничего не перезагружает.
# На сервере с VPN swap (/swapfile) и unattended-upgrades обычно уже есть:
# тогда скрипт только сообщает об этом и ничего не меняет.
# Автоперезагрузку НЕ включаем: перезагрузка сервера уронит VPN.
# Запуск: sudo bash 40-swap-and-updates.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

SWAP_FILE="/swapfile"
SWAP_SIZE_MB=1024

# --- swap ---
if [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then
  skip "Swap уже настроен, не трогаю:"
  swapon --show
else
  FREE_MB="$(df -Pm / | awk 'NR==2{print $4}')"
  [ "$FREE_MB" -gt $((SWAP_SIZE_MB + 2048)) ] || die "Мало свободного места на диске (${FREE_MB} МБ)."
  info "Swap нет. Создаю swap-файл ${SWAP_SIZE_MB} МБ."
  confirm "Создать?" || exit 0
  fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null \
    || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=none
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null
  swapon "$SWAP_FILE"
  grep -qE "^$SWAP_FILE\s" /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  ok "Swap включён и добавлен в /etc/fstab."
fi
free -m

# --- автообновления безопасности ---
if systemctl is-enabled --quiet unattended-upgrades 2>/dev/null \
   && grep -qs 'Unattended-Upgrade "1"' /etc/apt/apt.conf.d/20auto-upgrades; then
  skip "unattended-upgrades уже активен, не трогаю."
else
  warn "unattended-upgrades не настроен полностью."
  confirm "Установить и включить автообновления безопасности (без автоперезагрузки)?" || exit 0
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y -qq unattended-upgrades
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
  ok "Автообновления включены."
fi
if [ -f /var/run/reboot-required ]; then
  warn "Системе нужна перезагрузка (/var/run/reboot-required). НЕ перезагружайте сейчас: VPN упадёт. Выберите удобное время и предупредите пользователей VPN."
fi
if grep -rqs '^Unattended-Upgrade::Automatic-Reboot "true"' /etc/apt/apt.conf.d/; then
  warn "Включена автоперезагрузка (Automatic-Reboot). Она уронит VPN. Мы её не меняем; решение за владельцем."
fi
