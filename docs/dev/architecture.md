# Архитектура (этап 1 MVP)

Код в `app/src`. Слои сверху вниз зависят только от нижних.

- `domain/` — чистые функции без React и хранилища: даты (`dates`), SRS Лейтнера (`srs`), очередь сессий (`queue`), состояние сессии (`session`), подсчёты и серия (`stats`, `streak`), «Тема выучена» (`celebration`), маршруты (`router`), склонения и текст (`plural`, `text`). Покрыты unit-тестами рядом (`*.test.ts`).
- `data/` — встроенный словарь (`content.ts` импортирует `docs/content/words.json` через алиас `@content`) и справочник алфавита.
- `storage/` — интерфейс `Repository` и две реализации: IndexedDB (`indexedDbRepository`, БД `hayeren` v1) и в памяти (`memoryRepository`: тесты и запасной вариант, когда IndexedDB недоступна, тогда `persistent = false` и показывается баннер B1).
- `store/` — `AppStore`: состояние в памяти + запись в Repository; `useAppState` для React.
- `ui/`, `screens/`, `styles/` — компоненты, экраны (S01–S07, S04b), CSS на токенах ui-kit. Роутинг: hash (`#/путь`), `router.ts`.
- `features.ts` — флаги этапов 2 и 3 (свои наборы, резервная копия).

## Модель данных (под синхронизацию, фича 003)

У изменяемых записей есть `updatedAt` и `deletedAt` (мягкое удаление; `load()` отдаёт только живые). Прогресс отдельно от слов.

| Хранилище | Ключ | Содержимое |
|---|---|---|
| `settings` | `settings` | режим `beginner`/`reader` (нет записи = первый запуск) |
| `progress` | `wordId` | `box`, `dueDate`, `lastReviewed`, `correct`, `wrong` |
| `days` | `date` (ГГГГ-ММ-ДД, локальная) | `answered` (серия), `newStarted`, `bonusNew` (дневной лимит новых) |
| `celebrations` | `topicId` | `pending` / `celebrated` (экран «Тема выучена») |
| `userSets`, `userWords` | UUID / `u-<UUID>` | этап 2: свои наборы и слова (схема и CRUD готовы, UI нет) |
| `meta` | `key` | задел под этап 3 |

«Сбросить прогресс» мягко удаляет `progress`, `days`, `celebrations`; настройки и свои слова остаются.

## Даты
«Сегодня» = локальная дата устройства (`toDateKey`). `AppStore.refreshToday()` вызывается при возврате в приложение и в полночь.

## Как добавлять этапы
Этап 2: включить `FEATURES.userSets`, реализовать `MySetsSection` и экраны набора/добавления, писать через `Repository.putUserSet/putUserWords`; логика очередей и каталога уже принимает свои наборы (`buildCatalog`, `SessionTarget` `set`). Этап 3: `FEATURES.backup`, значение даты копии в `meta`.
