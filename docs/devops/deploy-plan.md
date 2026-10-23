# План публикации Hayeren на GitHub Pages

Решение владельца (docs/PRODUCT.md, 2026-10-23): хостинг GitHub Pages, публичный репозиторий `hayeren-app`. Адрес сайта: `https://<логин>.github.io/hayeren-app/`. Логин в конфигах не нужен: `base = /hayeren-app/`.

Статус: всё подготовлено локально. Ничего не опубликовано, удалённого репозитория нет, коммиты не сделаны.

## 1. Что подготовлено

1. `.github/workflows/deploy-pages.yml`: запускается на push в `main` и вручную (`workflow_dispatch`). Job `build`: checkout, Node 22 (кэш npm по `app/package-lock.json`), `npm ci`, `npm run lint`, `npm test`, `npm run build` с `VITE_BASE=/hayeren-app/`, `configure-pages`, `upload-pages-artifact` (`app/dist`). Job `deploy` (права `pages: write`, `id-token: write`, environment `github-pages`): `deploy-pages`. Если lint или unit-тесты упали, деплоя нет. Concurrency `pages` без отмены текущего деплоя. E2E в деплой не входят (они в `ci.yml`).
2. `app/vite.config.ts`: `base` из `VITE_BASE` (по умолчанию `/`), `start_url` и `scope` манифеста равны `base`.
3. `app/playwright.config.ts` и `app/e2e/basepath.spec.ts`: smoke-проверка сборки под подпутём (см. раздел 2).
4. `netlify.toml` удалён: Netlify не используется.
5. Hash-роутинг (`#/...`) означает, что `404.html` с редиректом не нужен: сервер всегда отдаёт только `index.html`.

## 2. Результаты проверок (локально, base `/hayeren-app/`)

- `index.html` ссылается на `/hayeren-app/assets/...`, `/hayeren-app/manifest.webmanifest`, `/hayeren-app/registerSW.js`.
- `registerSW.js`: `navigator.serviceWorker.register('/hayeren-app/sw.js', { scope: '/hayeren-app/' })`.
- Манифест: `start_url` и `scope` равны `/hayeren-app/`; иконки заданы относительными путями и резолвятся от адреса манифеста.
- Precache в `sw.js` содержит пути относительно `sw.js` (например `index.html`, `pwa-192x192.png`); Workbox резолвит их от адреса `/hayeren-app/sw.js`, то есть с нужным префиксом. Корректно.
- `vite preview` с этим base и Playwright smoke `basepath.spec.ts`: страница открывается, манифест 200, `serviceWorker.ready.scope` = `/hayeren-app/`, `sw.js`, иконки и favicon отдают 200.
- Запуск: `cd app && VITE_BASE=/hayeren-app/ npm run test:e2e -- basepath`. Остальные e2e-тесты открывают `/` и под подпутём не гоняются (параметризовать 95 вызовов `goto` не стали; для деплоя достаточно smoke).
- Не проверено: реальный GitHub Pages и установка PWA на телефоне. Это цель ручного теста после публикации.

## 3. Пошаговый план для владельца

Шаги [ВНЕШНИЙ] публикуют что-то наружу или создают ресурсы.

1. Контролёр коммитит подготовленные файлы (локально, обратимо). Ветка сейчас `master`, а оба workflow слушают `main`: перед пушем переименовать (`git branch -m master main`) с согласия владельца.
2. [ВНЕШНИЙ] Владелец на github.com создаёт публичный пустой репозиторий `hayeren-app` (без README, .gitignore и лицензии).
3. [ВНЕШНИЙ] Владелец: Settings → Pages → Build and deployment → Source: GitHub Actions.
4. [ВНЕШНИЙ] Авторизация push с этого Mac: проще всего `brew install gh` и `gh auth login` (браузерный вход), либо SSH-ключ, либо personal access token. Секреты агентам не передавать.
5. [ВНЕШНИЙ] Первый push: `git remote add origin https://github.com/<логин>/hayeren-app.git`, затем `git push -u origin main`. Перед пушем: `git log -p | grep -i -E "key|secret|token"` (секретов быть не должно, `.env*` в `.gitignore`).
6. Статус деплоя: вкладка Actions репозитория, workflow «Deploy to GitHub Pages» (первый запуск займёт 1-3 минуты). Адрес: в логе job `Deploy` и в Settings → Pages (`Your site is live at ...`). Ожидаемый вид: `https://<логин>.github.io/hayeren-app/`.
7. Если первый деплой упал с ошибкой окружения `github-pages`: проверить, что Source в Settings → Pages выбран «GitHub Actions» (шаг 3), и перезапустить через Actions → Run workflow.
8. Smoke на телефоне: открыть адрес, дождаться загрузки, проверить работу в режиме полёта. iPhone: Safari → «Поделиться» → «На экран Домой». Android: Chrome → «Установить приложение».
9. Дальше каждое слияние в `main` публикует новую версию автоматически; вручную: Actions → Run workflow. `ci.yml` (в том числе e2e) работает на PR и на push в `main` параллельно с деплоем и не блокирует его.

Откат: Actions → выбрать успешный старый запуск → Re-run all jobs (задеплоится старый коммит), либо `git revert` и push. Отключить сайт: Settings → Pages / удалить репозиторий.

## 4. Оговорки

- `sw.js` и остальные файлы на GitHub Pages кэшируются (`Cache-Control: max-age=600`), настроить заголовки нельзя. Обновления приложения доезжают с задержкой до 10 минут; затем новая версия подхватывается (`autoUpdate`) после закрытия и повторного открытия.
- Репозиторий публичный: виден весь код, документация (`docs/`), вся история коммитов, включая имя и email автора коммитов (сейчас git user `dvm`, email берётся из git config). Если email личный и его не хочется светить, до первого push настроить `git config user.email "<id>+<логин>@users.noreply.github.com"`; уже сделанные коммиты потребуют переписи истории, это стоит решить до первого push. Удалённая публичная история может остаться в форках и кэшах.
- Данные пользователя хранятся только на устройстве (IndexedDB), на сервер ничего не уходит. Словарь `words.json` входит в бандл и публичен.
- Все проекты `*.github.io` владельца делят один origin (`<логин>.github.io`); IndexedDB и localStorage общие для разных репозиториев с одним логином. Конфликтов ключей с другими сайтами владельца на этом домене стоит избегать.
- iPhone: версия во вкладке Safari и установленная на экран Домой имеют раздельное хранилище.
- Превью-деплоев для PR нет: одна версия сайта (production).
- Свой домен не нужен; при его появлении `base` станет `/`, а `VITE_BASE` в workflow придётся убрать.

## 5. Что нужно от владельца

Решения: подтвердить переименование ветки `master` в `main`; решить, какой email показывать в публичной истории (раздел 4); имя репозитория уже выбрано (`hayeren-app`).

Действия только владельца: создать аккаунт/репозиторий, включить Pages (Source: GitHub Actions), авторизовать push с Mac, выполнить первый push. Необратимо: публикация кода и истории, передача ссылки тестировщикам.
