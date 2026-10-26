#!/usr/bin/env bash
# 10-user-and-ssh.sh - пользователь deploy с SSH-ключом (для деплоев Hayeren).
#
#   sudo bash 10-user-and-ssh.sh prepare
#       Создаёт пользователя deploy, кладёт ваш ПУБЛИЧНЫЙ ключ, задаёт пароль
#       deploy (нужен только для sudo).
#
# ВАЖНО: на этом сервере работает VPN, которым управляет приложение Amnezia
# через SSH под root по паролю/ключу. Поэтому скрипт НЕ меняет настройки sshd:
# вход root и вход по паролю остаются как были. Режим «harden» (запрет root и
# паролей) удалён намеренно. Как безопасно отключить пароли позже - см.
# docs/devops/003-server-setup.md, раздел «Необязательно: перевод Amnezia на ключ».
#
# Скрипт идемпотентен: повторный запуск ничего не ломает.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

HOME_DIR="/home/$DEPLOY_USER"
AUTH_KEYS="$HOME_DIR/.ssh/authorized_keys"

prepare() {
  # 1. Пользователь
  if id "$DEPLOY_USER" >/dev/null 2>&1; then
    skip "Пользователь $DEPLOY_USER уже есть."
  else
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
    ok "Пользователь $DEPLOY_USER создан."
  fi
  if id -nG "$DEPLOY_USER" | grep -qw sudo; then
    skip "$DEPLOY_USER уже в группе sudo."
  else
    usermod -aG sudo "$DEPLOY_USER"
    ok "$DEPLOY_USER добавлен в sudo."
  fi

  # 2. Пароль для sudo (по SSH он использоваться не будет)
  if passwd -S "$DEPLOY_USER" | awk '{print $2}' | grep -q '^P$'; then
    skip "Пароль для $DEPLOY_USER уже задан."
  else
    info "Задайте пароль для $DEPLOY_USER. Он нужен только для команды sudo."
    info "Придумайте длинный и сохраните в менеджере паролей. Пароль при вводе не виден."
    passwd "$DEPLOY_USER"
  fi

  # 3. Публичный ключ
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HOME_DIR/.ssh"
  touch "$AUTH_KEYS"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
  chmod 600 "$AUTH_KEYS"

  if [ -s "$AUTH_KEYS" ]; then
    info "В authorized_keys уже есть ключи (отпечатки):"
    ssh-keygen -l -f "$AUTH_KEYS" || true
    confirm "Добавить ещё один ключ?" || { ok "Этап prepare завершён."; next_hint; return; }
  fi

  info "Вставьте ПУБЛИЧНЫЙ ключ одной строкой (начинается с ssh-ed25519, файл .pub)."
  info "На Mac получить его: cat ~/.ssh/hayeren_vultr.pub"
  read -r -p "Публичный ключ: " pubkey
  case "$pubkey" in
    ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;;
    *PRIVATE*) die "Это похоже на ПРИВАТНЫЙ ключ. Немедленно прекратите: приватный ключ никому не вставляют." ;;
    *) die "Не похоже на публичный ключ. Он должен начинаться с ssh-ed25519 ..." ;;
  esac
  tmp="$(mktemp)"
  printf '%s\n' "$pubkey" > "$tmp"
  ssh-keygen -l -f "$tmp" >/dev/null 2>&1 || { rm -f "$tmp"; die "Ключ не прошёл проверку ssh-keygen. Скопировали целиком?"; }
  rm -f "$tmp"

  if grep -qxF "$pubkey" "$AUTH_KEYS"; then
    skip "Такой ключ уже добавлен."
  else
    printf '%s\n' "$pubkey" >> "$AUTH_KEYS"
    ok "Ключ добавлен."
  fi
  ok "Этап prepare завершён."
  next_hint
}

next_hint() {
  cat <<MSG

СЛЕДУЮЩИЙ ШАГ (текущее окно не закрывайте):
  Откройте новое окно Терминала на Mac и выполните
      ssh -i ~/.ssh/hayeren_vultr ${DEPLOY_USER}@<IP-сервера>
  Должен запросить парольную фразу ключа (не пароль сервера) и пустить вас.
  Настройки SSH этим скриптом не менялись, приложение Amnezia работает как раньше.
MSG
}

case "${1:-}" in
  prepare)  prepare ;;
  *) echo "Использование: sudo bash $0 prepare"; exit 1 ;;
esac
