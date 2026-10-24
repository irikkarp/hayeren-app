#!/usr/bin/env bash
# 55-set-bot-token.sh - безопасно записать токен бота в /opt/hayeren/.env.
# Токен вводится СКРЫТО (не виден на экране, не попадает в историю команд
# и не выводится). Не вставляйте токен в чат и в репозиторий.
#
# Запуск: sudo bash 55-set-bot-token.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"

ENV_FILE="$APP_DIR/.env"
[ -f "$ENV_FILE" ] || die "Нет $ENV_FILE. Сначала 50-app-dirs.sh."

if grep -qE '^BOT_TOKEN=.+' "$ENV_FILE"; then
  warn "Токен уже задан."
  confirm "Заменить новым?" || exit 0
fi

read -r -s -p "Токен бота (ввод скрыт): " token; echo
[ -n "$token" ] || die "Пустой токен."
# Формат токена Telegram: цифры:символы. Сам токен не печатаем.
[[ "$token" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || die "Токен не похож на токен BotFather (формат 123456:ABC...)."

read -r -p "Username бота без @ (он публичный, можно присылать в чат): " botname
[[ "$botname" =~ ^[A-Za-z0-9_]{3,}$ ]] || die "Некорректный username."

tmp="$(mktemp)"
chmod 600 "$tmp"
grep -vE '^(BOT_TOKEN|BOT_USERNAME)=' "$ENV_FILE" > "$tmp" || true
printf 'BOT_TOKEN=%s\nBOT_USERNAME=%s\n' "$token" "$botname" >> "$tmp"
unset token
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$tmp" "$ENV_FILE"
rm -f "$tmp"
ok "Токен записан в $ENV_FILE (права 600). На экран не выводился."
ls -l "$ENV_FILE"
