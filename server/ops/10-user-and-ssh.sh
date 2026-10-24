#!/usr/bin/env bash
# 10-user-and-ssh.sh - пользователь deploy и безопасный вход по SSH-ключу.
#
# Работает в ДВА этапа, чтобы вы не потеряли доступ к серверу:
#
#   sudo bash 10-user-and-ssh.sh prepare
#       Создаёт пользователя deploy, кладёт ваш ПУБЛИЧНЫЙ ключ, задаёт пароль
#       deploy (он нужен только для sudo, по SSH пароли будут запрещены).
#       Вход по паролю и root ПОКА НЕ отключаются.
#
#   >>> Теперь откройте ВТОРОЕ окно Терминала и проверьте вход:
#       ssh -i ~/.ssh/hayeren_vultr deploy@IP
#       Старое окно с root НЕ закрывайте. <<<
#
#   sudo bash 10-user-and-ssh.sh harden
#       Только после успешного входа ключом: запрещает пароли и вход root.
#       Скрипт проверяет по журналу, что вход deploy по ключу уже был.
#
#   sudo bash 10-user-and-ssh.sh rollback
#       Отменяет harden (удаляет наш файл настроек и перезагружает SSH).
#
# Скрипт идемпотентен: повторный запуск ничего не ломает.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

DROPIN="/etc/ssh/sshd_config.d/00-hayeren.conf"
HOME_DIR="/home/$DEPLOY_USER"
AUTH_KEYS="$HOME_DIR/.ssh/authorized_keys"

reload_ssh() {
  # На Ubuntu служба называется ssh (не sshd).
  systemctl reload ssh 2>/dev/null || systemctl restart ssh
}

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

СЛЕДУЮЩИЙ ШАГ (старое окно не закрывайте!):
  Откройте новое окно Терминала на Mac и выполните
      ssh -i ~/.ssh/hayeren_vultr ${DEPLOY_USER}@<IP-сервера>
  Если зашли без запроса пароля сервера (запрос парольной фразы ключа - нормально),
  вернитесь сюда и запустите:  sudo bash $0 harden
MSG
}

key_login_seen() {
  # Ищем в журнале успешный вход deploy именно по ключу.
  { journalctl -u ssh --no-pager 2>/dev/null; cat /var/log/auth.log 2>/dev/null; } \
    | grep -q "Accepted publickey for $DEPLOY_USER "
}

harden() {
  [ -s "$AUTH_KEYS" ] || die "У $DEPLOY_USER нет ключей. Сначала: bash $0 prepare"
  if [ -f "$DROPIN" ]; then
    skip "Защита уже включена ($DROPIN)."
    return
  fi
  if key_login_seen; then
    ok "В журнале найден успешный вход $DEPLOY_USER по ключу."
  else
    warn "В журнале НЕТ входа $DEPLOY_USER по ключу. Если отключить пароли сейчас, можно потерять доступ."
    warn "Сначала проверьте вход из второго окна (см. подсказку выше)."
    confirm "Я понимаю риск и всё равно хочу продолжить (не рекомендуется)?" || exit 1
  fi
  warn "После этого шага: вход root и вход по паролю по SSH станут невозможны."
  warn "Текущее окно НЕ закрывайте до проверки нового входа."
  confirm "Включить защиту SSH?" || exit 0

  # Файл с префиксом 00- читается первым; в sshd побеждает ПЕРВОЕ значение,
  # поэтому он перекрывает настройки облачного образа (50-cloud-init.conf).
  cat > "$DROPIN" <<CONF
# Создано server/ops/10-user-and-ssh.sh. Откат: bash 10-user-and-ssh.sh rollback
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
  chmod 644 "$DROPIN"

  # Проверка синтаксиса ДО применения: при ошибке откатываем файл.
  if ! sshd -t; then
    rm -f "$DROPIN"
    die "Конфигурация SSH некорректна, файл удалён, ничего не изменено."
  fi
  reload_ssh
  ok "Защита включена."
  sshd -T | grep -E '^(permitrootlogin|passwordauthentication) '
  cat <<MSG

ОБЯЗАТЕЛЬНО СЕЙЧАС: в ТРЕТЬЕМ окне снова проверьте
    ssh -i ~/.ssh/hayeren_vultr ${DEPLOY_USER}@<IP-сервера>
Если не получилось - в этом (ещё открытом) окне выполните:
    bash $0 rollback
MSG
}

rollback() {
  if [ -f "$DROPIN" ]; then
    rm -f "$DROPIN"
    sshd -t && reload_ssh
    ok "Защита SSH отключена (пароли и root снова разрешены, если так настроено у провайдера)."
  else
    skip "Файла $DROPIN нет, откатывать нечего."
  fi
}

case "${1:-}" in
  prepare)  prepare ;;
  harden)   harden ;;
  rollback) rollback ;;
  *) echo "Использование: sudo bash $0 {prepare|harden|rollback}"; exit 1 ;;
esac
