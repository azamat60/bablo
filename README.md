# bablo

Личный бюджет в KGS. React 19, TypeScript, Vinext/Vite, Cloudflare Workers и Supabase. Google — единственный вход; регистрация происходит при первом входе. Демо открывается отдельно и не записывается в БД.

## Запуск

Node.js >=22.13. Создайте `.env.local` по `.env.example`, затем:

```sh
npm ci
npm run dev
```

Адрес: http://localhost:5173. Сохранение требует Supabase; ручной ввод не требует OpenAI. Финансовые ответы и авторизованные страницы не кэшируются service worker. PWA требует HTTPS либо localhost; офлайн-синхронизации пока нет.

## Supabase и Google

Создан проект **bablo-eu**, Frankfurt (`eu-central-1`), ref `lqiuzaglpyhqecfffyru`, организация `azamat60's Org`, Free. Старые проекты и D1 сохранены.

1. Примените `supabase/migrations/202610050001_budget.sql` к новому проекту. В указанном проекте миграция уже применена.
2. Задайте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Эти значения публичны. Runtime-конфигурация поступает через `/api/auth`; новые значения не требуют встраивания в клиентский bundle.
3. Задайте серверный `SUPABASE_SECRET_KEY` для AI-счётчиков. Он используется только в quota RPC, не для чтения/записи бюджетов. `OPENAI_API_KEY` тоже только серверный. Google secret хранится только в Supabase provider. Не отправляйте секреты в чат и не добавляйте в Git.
4. Google Cloud проект `bablo` (`causal-bus-510709-n3`) создан без биллинга. OAuth consent screen: External, минимальные scopes `openid email profile`. Настройка остановлена перед принятием Google API Services User Data Policy — нужно явное согласие владельца.
5. OAuth client: Web application. Google redirect URI: `https://lqiuzaglpyhqecfffyru.supabase.co/auth/v1/callback`. Origins: `http://localhost:5173` и фактический HTTPS origin Sites после публикации.
6. В Supabase Auth включите Google, внесите client ID/secret. Email и anonymous sign-ins должны быть выключены. Email уже выключен; anonymous изначально выключен. Добавьте точные callback URLs `http://localhost:5173/auth/callback` и `<SITE_ORIGIN>/auth/callback` в redirect allowlist. Не добавляйте широкие wildcard URLs.
7. После проверок переведите OAuth audience в production, чтобы вход работал для любого Google-пользователя по ссылке. Basic profile scopes не требуют дополнительных доступов Google.

Google-вход использует PKCE и cookie storage `@supabase/ssr`. Сервер вызывает `getClaims()`, игнорирует Sites-заголовки владельца. Новый аккаунт видит пустой бюджет с базовыми категориями; строка в БД создаётся при первой записи. При выходе/смене пользователя интерфейс размонтируется, запросы и запись отменяются, черновики очищаются.

Таблица `budget_ledgers`: UUID `user_id`, JSONB `state`, `revision`. RLS разрешает SELECT/INSERT/UPDATE только владельцу. UPDATE `user_id` не разрешён grants и дополнительно запрещён trigger. Анонимный доступ отсутствует. Запись выполняется с JWT пользователя и CAS по ревизии; конфликт — 409. Бюджет: до 10 000 операций, запрос до 3 000 000 UTF-8 байт. PostgreSQL дополнительно ограничивает размер JSONB text; превышение — 413. Сумма абсолютных тыйынов ограничена `Number.MAX_SAFE_INTEGER`.

После первой записи в Supabase откат интерфейса должен продолжать читать/писать Supabase. Нельзя выкатывать старый D1 writer: он создаст два независимых источника данных. D1 не удалять. Для отката поведения сохранить новые API/auth/storage modules, убрать только проблемные UI-изменения. Перед релизом сохранять совместимые версии API и БД; миграции удаления здесь отсутствуют.

## AI

OpenAI Responses API и Audio Transcriptions. Отправка начинается только после «Распознать»; исходный файл в приложении не хранится. `store: false` не является обещанием отсутствия хранения у провайдера.

Лимиты: 20 000 символов без обрезания, файл до 10 МБ, до 300 операций. Форматы клиента и сервера совпадают: PDF/XLSX/XLS/CSV/JPG/JPEG/PNG/WebP/WebM/M4A/MP4/MP3/WAV/OGG. Spreadsheet input OpenAI читает первые 1 000 строк каждого листа — нужно сверять полноту. Иностранная валюта не конвертируется. Дубли пересчитываются после редактирования и перед сохранением; явное подтверждение действует только для текущих даты/суммы/кошелька/направления/описания.

Серверный атомарный quota RPC: один активный запрос на пользователя, 10 попыток за календарный час, 30 за сутки пользователя, 100 за сутки приложения. День — Asia/Bishkek. Отклонение — 429 с `Retry-After`. Завершение освобождает lease; аварийное завершение — через 240 секунд. Неуспешные оплачиваемые попытки тоже считаются. Клиент: бюджет 15 секунд, AI 200 секунд, отмена при закрытии/выходе. Сервер ограничивает audio 60 секундами, Responses 120 секундами, весь upstream-процесс 185 секундами.

## Проверки

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npm audit --omit=dev
# При запущенном dev server:
node tests/api-integration.mjs
```

`tests/supabase-rls.sql` проверяет реальную БД в транзакции с ROLLBACK: два пользователя, анонимный клиент, чужое чтение/запись/присвоение, CAS и AI-лимиты. Выполнено в новом проекте; тестовые данные не сохраняются. Supabase security advisors: замечаний нет.

Unit-регрессии: поздний GET, 409 и сохранение черновика, потерянный ответ PUT, новая правка после неопределённого сохранения, редактирование дублей/дубли внутри импорта, иностранная валюта, UTF-8 размер/null, длинный текст, безопасные суммы, двойной запуск микрофона, закрытие до разрешения и во время записи, отказ разрешения, автостоп 60 секунд, истечение сессии/размонтирование.

HTTP-проверки: анонимные GET/PUT/AI, поддельные Sites headers, cross-origin PUT, `null` → 400, UTF-8 превышение → 413, неудачный callback → безопасный redirect. UI-проверки: 320/390 px без горизонтального переполнения, кнопки 44 px, 0,01 сом, переход из диаграммы после фильтра доходов.

### Остаток npm audit

После совместимых обновлений: полный набор **12** (8 high, 4 moderate), production dependencies **0**. Counts включают зависимые пакеты, а не 12 независимых уязвимостей.

- `braces@3.0.3` и цепочки `micromatch`/`fast-glob`/eslint/Vinext build plugins: stack exhaustion на глубоко вложенных glob patterns. Совместимого исправления `braces` на момент проверки нет. Шаблоны сборки/линтера не поступают из бюджетов или импортируемых файлов; доказанной эксплуатации публичного API нет. Development dependencies тоже участвуют в сборке сайта, поэтому production audit 0 сам по себе не доказывает безопасность bundle.
- Старый `esbuild` внутри `@esbuild-kit`/`drizzle-kit`: доступ к dev server с постороннего сайта. Этот server не запускается приложением; сохранённый D1 migration CLI не обслуживает HTTP. `npm audit fix --force` предлагает несовместимый downgrade `drizzle-kit`; он не применён.
- `fflate` закреплён совместимым override `0.7.5`. React/RSC `19.2.8`, Next/eslint-config-next `16.3.8`, Vinext `1.0.1`, Vite `8.3.2`, plugin-rsc `0.5.34`, Cloudflare plugin `1.62.5`, Wrangler `4.147.x` и workers-types `5.x` установлены согласованно.

### Условия публикации

До публичного выпуска нужны: завершение Google OAuth и server secrets; новый/повторный вход, отмена и смена аккаунта; API и прямые Supabase REST запросы с двумя реальными JWT; конкурентные запросы; успешный платный AI-вызов; реальный Safari/Chrome, микрофон/камера, PWA по HTTPS. SQL role-тесты не заменяют проверку реальных JWT. Пока эти условия не закрыты, публикация Sites и публичный доступ не выполняются.

## Структура

- `app/account-app.tsx`: Google-вход, выход, граница аккаунта/демо.
- `app/budget-app.tsx`: навигация и координация сценариев.
- `app/components/`: формы, импорт, аналитика.
- `lib/budget-sync.ts`, `hooks/use-budget.ts`: загрузка, CAS, восстановление и конфликты.
- `lib/import-review.ts`, `lib/import-input.ts`: дубли и общая валидация импорта.
- `lib/microphone.ts`: состояния и очистка записи.
- `lib/server.ts`, `lib/ai-quota.ts`: проверка личности, клиенты Supabase, серверные ключи/лимиты.
- `supabase/migrations/`: новая схема. `db/` и `drizzle/`: сохранённая прежняя D1-схема.

Следующий этап: переводы, полный backup/restore, управление категориями, обычный CSV/XLSX parser, повторяющиеся операции, расширенная аналитика, URL/даты/пагинация, мобильная перестановка блоков, история и офлайн-синхронизация.
