#!/usr/bin/env bash
# 40-swap-and-updates.sh - swap-файл (1 ГБ) и автоматические обновления безопасности.
# Запуск: sudo bash 40-swap-and-updates.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

SWAP_FILE="/swapfile"
SWAP_SIZE_MB=1024

# --- swap ---
if [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then
  skip "Swap уже настроен:"
  swapon --show
else
  FREE_MB="$(df -Pm / | awk 'NR==2{print $4}')"
  [ "$FREE_MB" -gt $((SWAP_SIZE_MB + 2048)) ] || die "Мало свободного места на диске (${FREE_MB} МБ)."
  info "Создаю swap-файл ${SWAP_SIZE_MB} МБ (на 1 ГБ RAM он страхует от нехватки памяти)."
  confirm "Создать?" || exit 0
  fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null \
    || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=none
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null
  swapon "$SWAP_FILE"
  ok "Swap включён."
fi
if ! grep -qE "^$SWAP_FILE\s" /etc/fstab && [ -f "$SWAP_FILE" ]; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  ok "Swap добавлен в /etc/fstab (переживёт перезагрузку)."
else
  skip "Запись в /etc/fstab уже есть или swap не наш."
fi
# Редко пользоваться swap'ом - только когда памяти почти не осталось.
SYSCTL="/etc/sysctl.d/99-hayeren.conf"
if [ ! -f "$SYSCTL" ]; then
  echo "vm.swappiness=10" > "$SYSCTL"
  sysctl -q -p "$SYSCTL"
  ok "vm.swappiness=10."
else
  skip "$SYSCTL уже есть."
fi

# --- автообновления безопасности ---
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades
AUTO="/etc/apt/apt.conf.d/20auto-upgrades"
if grep -q 'Unattended-Upgrade "1"' "$AUTO" 2>/dev/null; then
  skip "Автообновления уже включены."
else
  cat > "$AUTO" <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
  ok "Автообновления безопасности включены."
fi
# Автоперезагрузку НЕ включаем: это решение владельца (сервер перезапустится сам в 04:00).
if [ -f /var/run/reboot-required ]; then
  warn "Системе нужна перезагрузка (/var/run/reboot-required). Сделайте её вручную в удобное время: sudo reboot"
fi
systemctl is-enabled unattended-upgrades || true
