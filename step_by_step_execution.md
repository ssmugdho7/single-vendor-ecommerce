# Step-by-Step Execution Log

This file is the build diary for this project. For every phase, it records the
actual commands run and the actual code written, with short inline notes on
*why*, so the whole implementation can be reconstructed and explained later.

Repo layout:
```
single-vendor-ecommerce/
├── backend/           Laravel 13 API
├── frontend/          Next.js storefront + admin
├── docker-compose.yml Postgres + Redis for local dev
└── step_by_step_execution.md  (this file)
```

---

## Phase 0 — Scaffolding

### 0.1 Postgres + Redis via Docker Compose

Rather than relying on locally-installed Postgres/Redis (which differ machine to
machine), both run as containers so `docker compose up -d` is the only
prerequisite after cloning.

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ecommerce
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: ecommerce
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce"]

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

volumes:
  postgres_data:
  redis_data:
```
Healthchecks exist so other tooling (or a future CI step) can wait for
"healthy" instead of guessing with a sleep.

Run:
```bash
docker compose up -d
```

### 0.2 Backend — Laravel 13

```bash
laravel new backend --no-interaction --git
```
This is the official Laravel installer (ships with Herd), equivalent to
`composer create-project laravel/laravel backend`. Confirmed version:
`php artisan --version` → `Laravel Framework 13.34.0`, PHP 8.4.23.

**Environment wiring** — `backend/.env` changed from the SQLite/file/database
defaults to Postgres + Redis for everything (DB, cache, queue, session):
```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=ecommerce
DB_USERNAME=ecommerce
DB_PASSWORD=ecommerce

SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
CACHE_STORE=redis
CACHE_PREFIX=ecommerce_cache
```
Using Redis for session + cache + queue from day one (instead of the
`database` driver Laravel defaults to) means we're exercising the same
architecture in local dev that we'd use in production, and it's one of the
"meaningfully use Redis/queues" requirements of the assignment.

Verified connectivity:
```bash
php artisan migrate --no-interaction      # ran default users/cache/jobs tables against Postgres
php artisan tinker --execute 'Redis::set("boot_check","ok"); echo Redis::get("boot_check");'
# → ok
```

**Laravel Boost** — the fresh Laravel 13 scaffold ships a `CLAUDE.md` that
asks an AI agent to install `laravel/boost` (official Laravel package for
AI-assisted development: gives the agent accurate, version-matched
guidelines and Artisan-centric conventions instead of guessing).
```bash
composer require laravel/boost --dev --no-interaction
php artisan boost:install --guidelines --no-interaction
```
This governs how code gets written for the rest of the project: always use
`php artisan make:*` generators, always pass `--no-interaction`, run
`vendor/bin/pint --dirty --format agent` after editing PHP, write Eloquent
API Resources for API responses, prefer feature tests with factories, etc.

### 0.3 Frontend — Next.js

```bash
npx create-next-app@latest frontend \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --no-turbopack
```
Flags explained:
- `--app` — App Router (not the legacy Pages Router).
- `--src-dir` — keeps app code under `src/` instead of the repo root.
- `--no-turbopack` — Turbopack is still marked experimental for production
  builds as of this Next.js version; staying on webpack avoids surprises
  for a project that needs to be reliably buildable by a reviewer.

**A local npm quirk worth noting**: this machine's global `~/.npmrc` sets
`allow-scripts=all`, which a security-conscious npm policy on this machine
rejects for ordinary (non-global) project installs — new installs failed
with `EALLOWSCRIPTS` until a project-local override was added. Laravel's own
scaffold already ships this same fix for its own `npm install`
(`backend/.npmrc`); the same override was added for the frontend:

`frontend/.npmrc`:
```
ignore-scripts=true
allow-scripts=false
audit=true
```

Added TanStack Query (server-state data fetching/caching on the frontend)
and axios (HTTP client):
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools axios
```

Added shadcn/ui (the component layer on top of Tailwind) as a local dev
dependency rather than letting `npx` fetch it fresh each time — this avoided
a separate instance of the same `EALLOWSCRIPTS` issue, since `npx`'s
temporary install cache doesn't read the project's local `.npmrc`:
```bash
npm install --save-dev shadcn@latest
npx shadcn init -d --force --yes
```

### 0.4 Known/accepted npm audit warning

`npm audit` reports high-severity advisories in `braces` (a transitive
dependency of `eslint-config-next` → `fast-glob`). This is a **build-time
lint tool dependency**, not a runtime/production package, and the
auto-fix downgrades `eslint-config-next` to a version incompatible with the
installed Next.js release. Left as-is; documented in `NOTES.md` as a known,
low-risk limitation.

---

## Phase 1 — Core data + admin auth

Scope: admin can log in via the API and manage a product catalog
(categories + products). Orders/cart, real inventory movements, and
customer auth are deferred to later phases. No frontend work in this
phase — backend API only, verified with feature tests.

### 1.1 Sanctum (token auth)

```bash
php artisan install:api --no-interaction
```
Creates `routes/api.php`, requires `laravel/sanctum`, publishes/runs the
`personal_access_tokens` migration, and wires `api:` into
`bootstrap/app.php`'s `withRouting()`. Added `Laravel\Sanctum\HasApiTokens`
to `app/Models/User.php`. Chose plain **token** auth (`Authorization:
Bearer <token>`) over Sanctum's SPA/cookie mode — no shared-domain/CORS/
stateful-domain config needed, simplest fit for a separately-hosted Next.js
frontend.

### 1.2 Admin flag

New migration adds `is_admin` boolean (default `false`) to `users`. Kept
boolean rather than a `role` enum/table since there's no customer-auth
requirement yet.

### 1.3 Data model

```bash
php artisan make:model Category -mf --no-interaction
php artisan make:model Product -mf --no-interaction
```
- `categories`: `name`, `slug` (unique), `description` (nullable).
- `products`: `category_id` (FK → categories, `cascadeOnDelete`), `name`,
  `slug` (unique), `description` (nullable), `price` (`decimal(10,2)`),
  `stock_quantity` (unsigned int, default 0), `is_active` (bool, default
  true), `image_path` (nullable string).
- `Category hasMany Product`, `Product belongsTo Category`.
- Slug generation: `app/Models/Concerns/HasSlug.php` — a `creating` model
  event that slugifies `name` and de-dupes (`foo`, `foo-2`, ...) against
  existing rows. Used by both models (real duplication, not a speculative
  abstraction). Factories set `slug` directly from `name` too, since
  `DatabaseSeeder` no longer uses `WithoutModelEvents` — removed that trait
  because it would otherwise skip the `creating` event during seeding.

### 1.4 Admin auth endpoints

`App\Http\Controllers\Api\Admin\AuthController`:
- `POST /api/admin/login` (`Admin\LoginRequest`) — looks up the user by
  email, checks the password hash **and** `is_admin`; same generic 422
  error either way (no account-existence leakage). Returns
  `{ user, token }` via `$user->createToken('admin-token')->plainTextToken`.
- `POST /api/admin/logout` — `$request->user()->currentAccessToken()->delete()`.
- `GET /api/admin/me` — returns the authenticated admin.

### 1.5 Admin-protected catalog CRUD

```bash
php artisan make:controller Api/Admin/CategoryController --api --model=Category --no-interaction
php artisan make:controller Api/Admin/ProductController --api --model=Product --no-interaction
php artisan make:middleware EnsureUserIsAdmin --no-interaction
```
`EnsureUserIsAdmin` aborts 403 unless `$request->user()?->is_admin`;
aliased as `admin` in `bootstrap/app.php`. Routes in `routes/api.php`:
```php
Route::prefix('admin')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware(['auth:sanctum', 'admin'])->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::apiResource('categories', CategoryController::class);
        Route::apiResource('products', ProductController::class);
    });
});
```
Validation via `Admin\{Store,Update}{Category,Product}Request` (e.g.
`category_id` must `exists:categories,id`, `price`/`stock_quantity` ≥ 0).
Responses shaped via `CategoryResource`/`ProductResource` (per the Boost
guideline to default to Eloquent API Resources); `ProductResource` nests
`category` when eager-loaded. No public (non-admin) read endpoints yet —
deliberately deferred to the storefront phase.

### 1.6 Seeders

`DatabaseSeeder` creates one admin (`admin@example.com` / `password`,
`is_admin = true`), then calls `CategorySeeder` (8 fixed categories) and
`ProductSeeder` (40 products via `ProductFactory::recycle(Category::all())`,
spread across those categories).

### 1.7 Tests

`tests/Feature/Admin/{AuthTest,CategoryTest,ProductTest}.php` — login
success/failure (wrong password, non-admin), logout revokes the token
(asserted via DB state — see note below), unauthenticated/non-admin
rejection (401/403) on every protected route, full CRUD happy paths,
validation failures (missing name, invalid `category_id`), and slug
auto-generation on create.

**Testing gotcha**: a test that logs in, logs out, then makes a *second*
authenticated HTTP call with the same (now-revoked) token inside one test
method will still see it succeed — Laravel's `RequestGuard` caches the
resolved user for the lifetime of the guard instance, which persists across
calls within a single test's container (this doesn't happen in production,
where each request is a fresh process). Fixed by asserting the DB effect
(`assertDatabaseCount('personal_access_tokens', 0)`) instead of a second
live request.

Verified end-to-end with `php artisan serve` + `curl`: login → bearer
token → `GET /api/admin/categories`/`products` return seeded data;
no-token request gets 401. Full suite: `php artisan test --compact` → 21
passed. `vendor/bin/pint --dirty --format agent` clean.

### 1.8 Hygiene

Fixed `backend/.env.example` to match the real `.env` (pgsql/redis for
DB/session/queue/cache) — it had drifted to Laravel's sqlite/database
stock defaults since Phase 0.
