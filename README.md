# bablo

Личный бюджет: React + Vite, Dexie на устройстве, Supabase Auth и JSONB для облачного бюджета. Google — единственный облачный способ входа. Локальный бюджет выбирается отдельно на экране входа.

## Запуск

```sh
npm ci
cp .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Заполните `.env.local` локально. `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` — публичный URL и publishable key (`sb_publishable_`). **Никогда не ставьте secret/service_role в `VITE_*`.** `SUPABASE_SECRET_KEY` и `OPENAI_API_KEY` доступны только серверу. Модели задаются `OPENAI_MODEL`, `OPENAI_MODEL_ACCURATE`, `OPENAI_TRANSCRIBE_MODEL`.

Обычный `vite preview` обслуживает только клиент. API работает в `npm run dev` либо через собранный Worker на Sites. Статической публикации клиента недостаточно для облака и AI.

## Supabase

Подключён проект `bablo-eu`, `lqiuzaglpyhqecfffyru`, Frankfurt. Схема первоначальной установки сохранена в `supabase/schema.sql`; облачная миграция `20261005090435_budget_and_ai_limits` уже применена. Не выполняйте первоначальную установку повторно в существующем проекте.

Google provider включён; парольный и анонимный вход отключены. OAuth client хранится в Google Cloud, client secret — в настройке Google provider Supabase. Redirect URI Google: `https://lqiuzaglpyhqecfffyru.supabase.co/auth/v1/callback`.

В Supabase Auth разрешены `http://localhost:5174/auth/callback` и `https://bablo-budget.azgalord.chatgpt.site/auth/callback`. Site URL: `https://bablo-budget.azgalord.chatgpt.site`. При смене домена добавьте его точный HTTPS callback в URL Configuration. Вход использует PKCE; API проверяет `getClaims()` и выполняет SELECT/INSERT/UPDATE с JWT пользователя. Sites-заголовки владельца не определяют.

Таблица `budget_ledgers` хранит отдельный ledger v3 каждого пользователя. RLS допускает только владельца; анонимная роль не получает доступ. Обновление проверяет `user_id` и ожидаемую `revision` атомарно. Конфликт возвращает 409; клиент сохраняет локальный ввод, сравнивает записи и требует выбора для конфликтующих изменений. После потерянного ответа PUT клиент сначала проверяет серверную версию.

AI использует серверные атомарные лимиты: один активный запрос, 10 попыток/час и 30/сутки на пользователя, 100/сутки на приложение. Суточная граница — Asia/Bishkek. Secret используется только для RPC лимитов. Пользователь не может вызвать эти RPC напрямую. Попытки включают неверный AI-ввод; отказ лимита возвращает 429 и Retry-After.

Локальная база разделена по UUID пользователя. Выход отменяет запросы и очищает экран/черновики, сохранённая копия остаётся в отдельной базе устройства. Для общего устройства очищайте данные сайта. В облако синхронизируются финансовые таблицы; фото/аудио и локальные AI-задания остаются на устройстве. Полная резервная копия включает вложения и позволяет восстановить предыдущее состояние после импорта.

## Публикация

```sh
npm run lint:all
npm run test
npm run build
npm audit
```

Сборка создаёт `dist/client` и `dist/server/index.js` с Worker API; `dist/server/wrangler.json` задаёт ASSETS и nodejs_compat. `.openai/hosting.json` связывает приложение с существующим Sites. D1-связь сохранена, бюджет хранится в Supabase. Секреты задаются отдельно в серверном окружении Sites, не в манифесте и не в Git.

Публикуйте точный проверенный commit и архив сборки через Sites workflow. На новом HTTPS origin повторно проверьте Google-вход, приватность API, прямой RLS-доступ, запись/409, PWA и микрофон. Реальные мобильные устройства и Safari требуют отдельной проверки.

После первой облачной записи откат версии приложения должен сохранять Supabase источником бюджета. Не переключайте пользователей обратно на D1 или общую локальную базу. Сначала экспортируйте полную резервную копию; не удаляйте D1 при переключении.

Google Cloud OAuth настроен как In production / External, с базовыми scopes openid/email/profile. Homepage: `https://bablo-budget.azgalord.chatgpt.site`; privacy: `https://bablo-budget.azgalord.chatgpt.site/privacy`. Google client secret хранится в Supabase provider. Sites открыт для посещения экрана входа; финансовые API требуют JWT пользователя.
