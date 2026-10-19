# DevOps: Hayeren

Веб-приложение (PWA) для изучения армянских слов. Стек: TypeScript + React 19 + Vite 8, PWA через `vite-plugin-pwa`, Vitest + Testing Library (unit), Playwright (e2e), ESLint + Prettier. Шрифты (Noto Sans Armenian 400/700, Noto Serif Armenian 400/700, Noto Serif 700) подключены через `@fontsource/*` в `main.tsx`, поэтому сеть для них не нужна и они работают офлайн.

## Требования

- Node.js 22 или новее (в CI используется 22; локально проверено на 26).
- npm (идёт вместе с Node).

macOS: `brew install node`.

## Запуск локально

Все команды выполняются из папки `app/`:

```bash
cd app
npm install                       # зависимости
npx playwright install chromium   # один раз: браузер для e2e (~100 МБ)
npm run dev                       # dev-сервер: http://localhost:5173
```

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер с HMR |
| `npm run build` | проверка типов (`tsc -b`) и production-сборка в `app/dist/`, включая service worker и манифест |
| `npm run icons` | перегенерирует иконки из `docs/design/icon.svg` в `app/public/` (Chromium из Playwright) |
| `npm run preview` | раздаёт собранный `dist/` (http://localhost:4173) |
| `npm test` | unit-тесты Vitest (jsdom), один прогон |
| `npm run test:watch` | Vitest в режиме наблюдения |
| `npm run test:e2e` | Playwright: сам собирает проект, поднимает `preview` на порту 4173 и гоняет `e2e/` в Chromium |
| `npm run lint` | ESLint |
| `npm run format` | Prettier: форматирует все файлы |
| `npm run format:check` | Prettier: только проверка (используется в CI) |

PWA (service worker, офлайн) работает только в production-сборке: `npm run build && npm run preview`. В `dev` service worker не регистрируется.

## Структура

```
.
├── .github/workflows/ci.yml   # CI (GitHub Actions)
├── .gitignore
├── docs/                      # продуктовая документация; docs/devops/ — этот файл
└── app/                       # веб-приложение
    ├── index.html             # точка входа, lang="ru", title "Hayeren"
    ├── public/                # статика как есть: иконки (генерируются `npm run icons`)
    ├── scripts/generate-icons.mjs  # рендер icon.svg в PNG/ICO
    ├── src/
    │   ├── main.tsx           # монтирование React, подключение шрифтов и стилей
    │   ├── App.tsx            # корневой компонент (заглушка)
    │   ├── App.test.tsx       # пример unit-теста
    │   ├── index.css          # глобальные стили
    │   └── test/setup.ts      # настройка Vitest (jest-dom матчеры)
    ├── e2e/smoke.spec.ts      # smoke-тест Playwright: страница открывается
    ├── vite.config.ts         # Vite + PWA-манифест + настройки Vitest
    ├── playwright.config.ts
    ├── eslint.config.js       # flat config: TS, react-hooks, react-refresh, prettier
    ├── .prettierrc.json
    ├── .env.example           # шаблон переменных окружения (сейчас пустой)
    └── tsconfig*.json
```

Unit-тесты лежат рядом с кодом как `*.test.ts(x)`, e2e-тесты лежат в `app/e2e/*.spec.ts`.

## PWA

Манифест задан в `app/vite.config.ts`: name/short_name `Hayeren`, `lang: ru`, `display: standalone`, `theme_color` `#7E1727`, `background_color` `#F4E7CB`, `registerType: autoUpdate` (новая версия подхватывается автоматически). В `index.html` два `meta theme-color`: `#7E1727` для светлой схемы и `#4A1019` для тёмной. Workbox кэширует js/css/html/svg/png/ico/woff/woff2: приложение, иконки и шрифты работают офлайн (проверено по `dist/sw.js`: в precache попадают woff/woff2 Noto Serif Armenian 400/700, Noto Serif 700, Noto Sans Armenian и все иконки; всего 59 записей, около 880 КиБ, в основном из-за subsets шрифтов).

### Иконки

Источник: `docs/design/icon.svg` (его меняет дизайнер). `npm run icons` (скрипт `app/scripts/generate-icons.mjs`) рендерит его и кладёт в `app/public/`: `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png` (180), `favicon-32x32.png`, `favicon-48x48.png`, `favicon.ico` (32+48), `favicon.svg` (копия). Maskable совпадает с обычной 512: по ui-kit (раздел 9) рисунок целиком в безопасной зоне 80%, фон залит до краёв. Сгенерированные файлы лежат в git; после изменения icon.svg запустите `npm run icons` и закоммитьте результат.

## Переменные окружения и секреты

Секреты не коммитим: `.env` и `.env.*` в `.gitignore`, в репозиторий попадает только `app/.env.example`. Переменные, доступные клиентскому коду, должны начинаться с `VITE_` и попадают в бандл, поэтому секреты туда класть нельзя. В MVP бэкенда и переменных нет.

## CI

Файл `.github/workflows/ci.yml` (GitHub Actions) срабатывает на push в `main` и на каждый pull request. Все шаги выполняются в `app/`:

1. `npm ci` (кэш npm по `app/package-lock.json`)
2. `npm run lint`
3. `npm run format:check`
4. `npm test`
5. `npm run build`
6. `npx playwright install --with-deps chromium` и `npm run test:e2e`
7. если что-то упало, отчёт Playwright загружается как артефакт

Workflow пока только лежит в репозитории: удалённого репозитория нет, и CI ни разу не запускался.

## Деплой

Пока не настроен. Кандидаты из PRODUCT.md: GitHub Pages, Netlify, Vercel. Для Netlify/Vercel достаточно указать base directory `app`, команду `npm run build` и папку публикации `dist`. Для GitHub Pages на подпути `/<repo>/` придётся задать `base` в `vite.config.ts` и поменять `start_url`/`scope` в манифесте. Выбор хостинга остаётся за владельцем продукта.

## Позже: Capacitor

Обёртка в iOS/Android через Capacitor будет добавлена в `app/` (`npx cap init`, `webDir: dist`). Нативные папки `android/` и `ios/` появятся там же, а их build-артефакты уже внесены в `.gitignore`.
