#!/usr/bin/env bash
# 50-app-dirs.sh - каталоги /opt/hayeren, шаблон .env (БЕЗ секретов) и Caddyfile.
# Запуск: sudo bash 50-app-dirs.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"

id "$DEPLOY_USER" >/dev/null 2>&1 || die "Нет пользователя $DEPLOY_USER. Сначала 10-user-and-ssh.sh."

for d in "$APP_DIR" "$APP_DIR/data" "$APP_DIR/backups" "$APP_DIR/caddy"; do
  if [ -d "$d" ]; then
    skip "$d уже есть."
  else
    install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$d"
    ok "Создан $d"
  fi
done
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
chmod 750 "$APP_DIR"

# .env: создаём только если его нет; существующий НИКОГДА не перезаписываем.
ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  skip "$ENV_FILE уже существует, не трогаю."
else
  cat > "$ENV_FILE" <<'CONF'
# Секреты и настройки сервера Hayeren. Права 600, владелец deploy.
# Этот файл живёт ТОЛЬКО на сервере. Не копируйте его в чат и в репозиторий.
# BOT_TOKEN задаётся скриптом 55-set-bot-token.sh (ввод скрыт).
BOT_TOKEN=
BOT_USERNAME=
CORS_ORIGINS=https://irikkarp.github.io
DB_PATH=/data/app.db
CONF
  ok "Создан шаблон $ENV_FILE (токен пустой)."
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# Шаблон Caddyfile копируем рядом; адрес подставит 60-https-check.sh.
if [ -f "$SCRIPT_DIR/templates/Caddyfile.template" ]; then
  install -m 640 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SCRIPT_DIR/templates/Caddyfile.template" "$APP_DIR/caddy/Caddyfile.template"
  ok "Шаблон Caddyfile скопирован в $APP_DIR/caddy/."
fi

ls -la "$APP_DIR"
