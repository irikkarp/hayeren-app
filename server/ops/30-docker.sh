#!/usr/bin/env bash
# 30-docker.sh - проверка Docker и плагина Compose. Docker на сервере уже стоит
# (пакеты Ubuntu) и обслуживает VPN-контейнер Amnezia.
#
# НЕ переустанавливаем Docker, НЕ меняем /etc/docker/daemon.json и НИКОГДА не
# перезапускаем демон: перезапуск остановит VPN-контейнер.
# Ротация логов задаётся в compose-файлах на уровне сервиса.
#
# Запуск: sudo bash 30-docker.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
need_root "$@"
check_os

command -v docker >/dev/null || die "Docker не найден. Ожидалось, что он уже стоит (проверьте 00-check.sh). Ничего не ставлю."
docker --version
VPN_BEFORE="$(vpn_snapshot)"
info "VPN до изменений:"; echo "${VPN_BEFORE:-  (контейнеры VPN не найдены)}"

if docker compose version >/dev/null 2>&1; then
  skip "Плагин compose уже есть: $(docker compose version)"
else
  info "Плагина compose нет. Ставлю только пакет docker-compose-v2 (без трогания демона)."
  # needrestart в режиме «только список»: не перезапускает службы после apt.
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l NEEDRESTART_SUSPEND=1
  apt-get update -qq
  # Сначала симуляция: если apt собирается ставить/обновлять docker.io, containerd,
  # runc (их обновление перезапускает демон), останавливаемся.
  PLAN="$(apt-get install -s --no-upgrade docker-compose-v2 2>&1)" \
    || die "Пакет docker-compose-v2 недоступен (проверить на 26.04). Пришлите вывод в чат, ничего не изменено."
  echo "$PLAN" | grep -E '^(Inst|Remv) ' || true
  if echo "$PLAN" | grep -E '^(Inst|Remv) (docker|containerd|runc)' | grep -vE '^Inst docker-compose-v2 '; then
    die "apt хочет изменить пакеты Docker/containerd/runc. Это может перезапустить VPN. Остановлено, пришлите вывод в чат."
  fi
  confirm "Установить только docker-compose-v2?" || exit 0
  apt-get install -y -qq --no-upgrade docker-compose-v2
  docker compose version || die "После установки 'docker compose' не работает (проверить на 26.04)."
  ok "Плагин compose установлен. Демон Docker не перезапускался."
fi

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

vpn_compare "$VPN_BEFORE"
