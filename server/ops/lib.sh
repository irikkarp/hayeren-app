#!/usr/bin/env bash
# Общие функции для скриптов подготовки сервера. Сам по себе не запускается:
# другие скрипты подключают его строкой `source "$SCRIPT_DIR/lib.sh"`.

# Остановиться при любой ошибке, при обращении к необъявленной переменной
# и при ошибке внутри конвейера (a | b).
set -euo pipefail

APP_DIR="/opt/hayeren"
DEPLOY_USER="deploy"

info() { printf '\033[34m[инфо]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ готово ]\033[0m %s\n' "$*"; }
skip() { printf '\033[90m[пропуск]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[внимание]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[ОШИБКА]\033[0m %s\n' "$*" >&2; exit 1; }

# Скрипт должен работать от root (или через sudo).
need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Запустите скрипт от root. Если вы вошли как deploy: sudo $0 $*"
  fi
}

# Спросить подтверждение. Ответ по умолчанию - «нет».
# Использование: confirm "Продолжить?" || exit 0
confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  case "$answer" in
    y|Y|yes|YES|д|Д|да|Да) return 0 ;;
    *) return 1 ;;
  esac
}

# Скрипты рассчитаны на Ubuntu 24.04. На другой системе просим подтверждения.
check_os() {
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
      warn "Система: ${PRETTY_NAME:-неизвестно}. Скрипты проверялись на Ubuntu 24.04."
      confirm "Всё равно продолжить?" || exit 1
    fi
  fi
}
