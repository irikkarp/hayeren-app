#!/usr/bin/env bash
# 30-docker.sh - Docker Engine и Compose из официального репозитория Docker.
# Запуск: sudo bash 30-docker.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

# Если на сервере уже работает что-то на 80/443, ставить наш Caddy нельзя без решения владельца.
if ss -tln 2>/dev/null | grep -qE ':(80|443)\s'; then
  warn "Порты 80/443 уже заняты:"
  ss -tlnp | grep -E ':(80|443)\s' || true
  confirm "Продолжить установку Docker (наш Caddy потом может не запуститься)?" || exit 1
fi

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  skip "Docker и Compose уже установлены: $(docker --version)"
else
  info "Подключаю репозиторий Docker и устанавливаю пакеты (нужен интернет)."
  confirm "Продолжить?" || exit 0
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -s /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  # shellcheck disable=SC1091
  CODENAME="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ok "Docker установлен."
fi

# Ротация логов контейнеров, чтобы они не съели диск.
DAEMON_JSON="/etc/docker/daemon.json"
if [ -f "$DAEMON_JSON" ]; then
  skip "$DAEMON_JSON уже существует, не трогаю."
else
  cat > "$DAEMON_JSON" <<'CONF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
CONF
  systemctl restart docker
  ok "Ротация логов Docker настроена."
fi
systemctl enable --now docker >/dev/null 2>&1

# Группа docker фактически равна root-доступу, поэтому спрашиваем.
if id "$DEPLOY_USER" >/dev/null 2>&1; then
  if id -nG "$DEPLOY_USER" | grep -qw docker; then
    skip "$DEPLOY_USER уже в группе docker."
  else
    warn "Участник группы docker может получить root на сервере. Это нужно, чтобы $DEPLOY_USER запускал контейнеры без sudo."
    if confirm "Добавить $DEPLOY_USER в группу docker?"; then
      usermod -aG docker "$DEPLOY_USER"
      ok "Добавлен. Применится после нового входа по SSH."
    fi
  fi
else
  warn "Пользователя $DEPLOY_USER нет. Сначала выполните 10-user-and-ssh.sh."
fi

docker --version
docker compose version
