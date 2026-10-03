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

## Phase 2 — Storefront browsing + customer auth + cart/orders

Scope: browse the catalog without auth, register/log in as a customer,
build a cart, and check out into an order (status `pending_payment` —
no payment integration yet, that's Phase 4/5). Admin order
visibility/management is explicitly out of scope here.

### 2.1 Public catalog

```bash
php artisan make:controller Api/CategoryController --no-interaction
php artisan make:controller Api/ProductController --no-interaction
```
Top-level (non-`Admin`) controllers reusing the existing
`CategoryResource`/`ProductResource` as-is. `ProductController@index`
filters to `is_active = true`, supports `?category=<slug>` (via
`whereHas('category', ...)`) and `?search=<term>` (`LIKE` on name).
Both `show` actions bind by slug at the route level
(`{category:slug}`, `{product:slug}`) — Laravel's implicit slug
binding, no model changes needed; the existing admin routes keep
id-based binding untouched. `ProductController@show` 404s on an
inactive product even though the slug exists.

### 2.2 Customer auth

```bash
php artisan make:controller Api/AuthController --no-interaction
php artisan make:request RegisterRequest --no-interaction
php artisan make:request LoginRequest --no-interaction
```
Mirrors the Phase 1 admin pattern on the same `User`/`HasApiTokens`
infrastructure — a customer is just a `User` with `is_admin = false`
(the column's existing default), no model changes needed.
`register` creates the user and returns `{ user, token }` with a 201
(explicit `response()->json([...], 201)` — unlike `login`, there's no
Eloquent-model-backed resource here to auto-201 via
`wasRecentlyCreated`). `login`/`logout`/`me` mirror the admin versions
minus the `is_admin` check.

### 2.3 Cart

```bash
php artisan make:model Cart -mf --no-interaction
php artisan make:model CartItem -mf --no-interaction
```
`carts` (`user_id` unique FK), `cart_items` (`cart_id` + `product_id`
FKs, both cascade-delete, unique `(cart_id, product_id)` so adding an
already-present product increments quantity instead of duplicating a
row). `Cart::forUser(User $user)` (`firstOrCreate`) is shared by
`CartController` and `CheckoutController`.

**Gotcha**: Laravel's `JsonResource` auto-sets HTTP 201 whenever the
wrapped model's `wasRecentlyCreated` is true. Since `Cart::forUser()`
lazily creates the cart row on first touch, a plain `GET /api/cart` for
a brand-new user was returning 201 instead of 200 — the lazy insert is
an implementation detail the client never asked for. Fixed by resetting
`$cart->wasRecentlyCreated = false` at the end of `forUser()`.

`App\Http\Controllers\Api\CartController` (`auth:sanctum`): `show`,
`addItem` (`AddCartItemRequest`: product must exist and be active),
`updateItem`, `removeItem` — the latter two check
`$cartItem->cart_id === Cart::forUser($request->user())->id` before
acting, so a guessed `cartItem` id belonging to another user 404s
rather than leaking/mutating it.

### 2.4 Checkout + orders

```bash
php artisan make:model Order -mf --no-interaction
php artisan make:model OrderItem -mf --no-interaction
php artisan make:controller Api/CheckoutController --no-interaction
php artisan make:controller Api/OrderController --no-interaction
```
`orders` (`user_id`, `status` default `pending_payment`,
`total_amount`), `order_items` (`order_id` cascadeOnDelete,
`product_id` **nullOnDelete** — a historical line survives a deleted
product; `unit_price` snapshotted from `Product::price` at checkout
time, `quantity`).

`CheckoutController@store`: wraps in `DB::transaction()`, rejects an
empty cart (422), locks the cart's products (`lockForUpdate()`),
rejects if any line's quantity exceeds current `stock_quantity` (422,
names the product, no partial order), then creates the `Order` +
`OrderItem`s, decrements each product's `stock_quantity`, empties the
cart, and returns the order with an explicit 201.

`OrderController`: `index`/`show` scoped to
`$request->user()->orders()` — `show` 404s if the order belongs to
someone else.

### 2.5 Routes

Added to `routes/api.php` alongside the existing (untouched)
`/api/admin/*` block: public `GET /categories`, `GET
/categories/{category:slug}`, `GET /products`, `GET
/products/{product:slug}`, `POST /register`, `POST /login`; behind
`auth:sanctum`: `POST /logout`, `GET /me`, `GET /cart`, `POST
/cart/items`, `PATCH|DELETE /cart/items/{cartItem}`, `POST /checkout`,
`GET /orders`, `GET /orders/{order}`. Customer and admin controllers
share class basenames (`AuthController`, `CategoryController`,
`ProductController`), so the admin imports in `routes/api.php` are
aliased (`AdminAuthController`, etc.) to avoid collisions.

### 2.6 Tests

`tests/Feature/{AuthTest,CatalogTest,CartTest,CheckoutTest,OrderTest}.php`
— registration/login/logout, public browsing (filter/search/slug
lookup, inactive products excluded), cart mutation + cross-user
ownership rejection, checkout happy path + insufficient-stock rejection
(no partial order), order list/show scoped to the owner.

**Factory gotcha**: `CategoryFactory`/`ProductFactory` originally
computed `slug` directly from a factory-generated fake `name` inside
`definition()`. A test calling
`Category::factory()->create(['name' => 'Electronics'])` only
overrides the `name` key in the final attribute array — the `slug`
already baked into `definition()`'s return value (from the *fake*
name) survived untouched, so the row ended up named "Electronics" with
some unrelated random slug. Fixed by removing `slug` from both
factories entirely and letting `HasSlug`'s `creating` event (already
wired up, and no longer skipped during seeding since Phase 1 dropped
`WithoutModelEvents` from `DatabaseSeeder`) generate it from whatever
`name` the row ends up with.

**JSON float gotcha**: a couple of test assertions originally expected
e.g. `75.0`/`20.0` for whole-number money totals. PHP's `json_encode`
drops the trailing `.0` for a float with no fractional part unless
`JSON_PRESERVE_ZERO_FRACTION` is passed (Laravel's JSON responses
don't pass it), so `json_decode` on the client/test side gets back a
plain int. Not an app bug — adjusted the affected assertions to expect
the int.

Verified end-to-end with `php artisan serve` + `curl`: register →
browse `/api/products` (no auth) → add to `/api/cart` → `POST
/api/checkout` (201, stock decremented) → order appears in `GET
/api/orders`. Full suite: `php artisan test --compact` → 50 passed.
`vendor/bin/pint --dirty --format agent` clean.

## Phase 3 — Inventory strategy

Scope: an audit ledger for every stock change, an admin endpoint to
restock/correct stock instead of blindly overwriting the counter, and
minimal admin order visibility + a cancel action that restores stock.
Cart-time behavior is unchanged (no reservation/hold step — checkout
remains the sole point of stock authority, already race-safe via
`lockForUpdate()`).

### 3.1 Ledger + single mutation point

```bash
php artisan make:model StockMovement -mf --no-interaction
php artisan make:enum StockMovementType --no-interaction
```
`make:enum` writes to `app/StockMovementType.php` (there's no
`app/Enums/` directory in this project, so the generator defaults to
the base `App` namespace — left as-is per the Boost guideline against
introducing new base folders without approval). Backed string enum:
`Sale`, `Restock`, `Correction`, `Cancellation`.

`stock_movements`: `product_id` (FK cascadeOnDelete), `order_id`
(nullable FK nullOnDelete — set for `sale`/`cancellation`, null for
manual adjustments), `type`, `quantity_change` (signed int), `note`
(nullable, admin-supplied).

Added `Product::adjustStock(int $delta, StockMovementType $type,
?Order $order = null, ?string $note = null)` — increments
`stock_quantity` by `$delta` (negative decrements) and creates the
matching `StockMovement` row. This is the **only** place
`stock_quantity` is ever written outside a migration, used by all
three call sites below, so the ledger can't drift from the counter.
`CheckoutController::store()`'s old
`$product->decrement('stock_quantity', $item->quantity)` became
`$product->adjustStock(-$item->quantity, StockMovementType::Sale, $order)`.

### 3.2 Admin stock adjustment + history

```bash
php artisan make:controller Api/Admin/StockMovementController --no-interaction
php artisan make:request Admin/StoreStockMovementRequest --no-interaction
php artisan make:resource StockMovementResource --no-interaction
```
`POST /api/admin/products/{product}/stock-movements` — body
`{ type: 'restock'|'correction', quantity?, new_quantity?, note? }`.
`restock` requires `quantity` (delta = +quantity); `correction`
requires `new_quantity` (delta = `new_quantity - current
stock_quantity`, can be negative) — validated with
`required_if:type,restock` / `required_if:type,correction`. Only these
two types are admin-triggerable here; `sale`/`cancellation` are never
accepted as client input. `GET .../stock-movements` lists the
product's history, newest first.

### 3.3 Admin order visibility + cancellation

```bash
php artisan make:controller Api/Admin/OrderController --no-interaction
```
`GET /api/admin/orders` / `GET /api/admin/orders/{order}` — unlike the
customer-facing `Api\OrderController`, no ownership restriction.
`PATCH /api/admin/orders/{order}/cancel` — 422 unless
`status === 'pending_payment'` (covers already-cancelled); otherwise,
in a `DB::transaction()`, restores stock via `adjustStock($item->quantity,
StockMovementType::Cancellation, $order, "Reversed for cancelled order
#{$order->id}")` for each item whose product still exists (an item
whose product was `nullOnDelete`'d has nothing to restore), then sets
`status = 'cancelled'`.

Reused the existing `OrderResource` (Boost: reuse before writing new)
for both the customer and admin views — added a `user` field gated on
`$this->when($this->relationLoaded('user'), ...)`, so it only appears
when the admin controller's eager-load of `user` is present; the
customer controller (which never loads `user`) is unaffected.

### 3.4 Routes

Added under the existing `/api/admin` group: `GET`/`POST
products/{product}/stock-movements`, `GET orders`, `GET
orders/{order}`, `PATCH orders/{order}/cancel`. Customer-facing and
admin controllers both have classes named `OrderController`, so the
admin import in `routes/api.php` is aliased (`AdminOrderController`),
same pattern as the Phase 2 `Auth`/`Category`/`ProductController`
aliases.

### 3.5 Tests

`tests/Feature/Admin/{StockMovementTest,OrderTest}.php` — restock/
correction happy paths and validation, movement history listing,
guest/non-admin rejection; admin list/show any order (not
ownership-scoped), cancellation restores stock and logs a
`cancellation` movement, cancelling an already-cancelled order is
rejected. Extended `tests/Feature/CheckoutTest.php` with one assertion
that a `sale` movement row exists after checkout.

Verified end-to-end with `php artisan serve` + `curl`: admin restocks
a product (`stock_quantity` increases, movement logged) → customer
registers, adds to cart, checks out (`sale` movement logged) → admin
cancels the order (`stock_quantity` restored, `cancellation` movement
logged, order shows the customer's name). Full suite:
`php artisan test --compact` → 64 passed. `vendor/bin/pint --dirty
--format agent` clean.

## Phase 4 — Payment integration

Scope: a payment flow modeled on SSLCommerz's hosted-checkout shape,
behind a swappable gateway contract with a fake driver (no real
sandbox credentials available), plus a queued confirmation job so the
Redis queue (set up in Phase 0, unused until now) actually runs
something.

### 4.1 `payments` + gateway abstraction

```bash
php artisan make:model Payment -mf --no-interaction
php artisan make:enum PaymentStatus --no-interaction
```
`payments`: `order_id` (FK cascadeOnDelete), `gateway` (string),
`transaction_id` (string, unique), `amount`, `status` (backed
`App\PaymentStatus`: `Pending`/`Success`/`Failed`), `raw_response`
(nullable json, the gateway's verification payload — diagnostics only,
not exposed via `PaymentResource`). `Payment belongsTo Order`; `Order
hasMany Payment` (a retried payment after a failure gets a new row).

`App\Contracts\PaymentGatewayContract` — two methods every
hosted-checkout gateway needs regardless of vendor: `initiate(Order):
array` (a transaction id + where to send the customer) and
`verify(array $payload): array` (normalize a callback/IPN payload into
a validity + status). `App\PaymentGateways\FakePaymentGateway`
implements it by pointing `gateway_url` at this app's own
`/api/payments/fake/{transaction}` simulation endpoints instead of a
real external page, and `verify()` just passes through whatever
status it's given (nothing to cryptographically check in a fake
world). Bound in `AppServiceProvider::register()` via a `match` on
`config('services.payment.driver')` (env `PAYMENT_GATEWAY_DRIVER`,
default `fake`) — swapping in a real `SslcommerzPaymentGateway` later
is a new class + a `match` arm + credentials, not a change to any
controller or route.

### 4.2 Single mutation point

`App\Services\PaymentService` — same pattern as Phase 3's
`Product::adjustStock()`:
- `initiate(Order $order): array` — 422s unless the order is
  `pending_payment`; creates a `pending` `Payment`, calls the gateway's
  `initiate()`, returns the payment + `gateway_url`.
- `handleCallback(array $payload): Payment` — resolves the gateway,
  `verify()`s the payload, looks up the `Payment` by `transaction_id`,
  locks it (`lockForUpdate`), and **idempotently** updates it: if the
  payment is no longer `pending` (already resolved by an earlier
  call), it's a no-op — this matters because a real gateway can
  deliver the same IPN more than once. On a valid success, also sets
  `Order.status = 'paid'` and dispatches
  `SendOrderConfirmation::dispatch($order)`. All inside
  `DB::transaction()`.

### 4.3 Controllers + routes

```bash
php artisan make:controller Api/PaymentController --no-interaction
php artisan make:controller Api/PaymentCallbackController --no-interaction
php artisan make:controller Api/FakePaymentController --no-interaction
php artisan make:job SendOrderConfirmation --no-interaction
```
- `POST /api/orders/{order}/pay` (`auth:sanctum`, 404 unless the order
  belongs to the authenticated user) → `PaymentController@store` →
  `PaymentService::initiate()`.
- `POST /api/payments/callback` (**public** — a gateway can't carry a
  Sanctum token) → `PaymentCallbackController@handle` →
  `PaymentService::handleCallback($request->all())`. Stands in for
  both a real gateway's browser-redirect and server-to-server IPN,
  which collapse into one endpoint here since the fake driver has no
  separate async delivery mechanism to simulate.
- `POST /api/payments/fake/{transaction}/pay` / `/cancel` (public) —
  what a test client calls to simulate completing/abandoning the fake
  hosted page; each just calls `PaymentService::handleCallback()`
  directly with `status: 'success'`/`'failed'`.

`App\Jobs\SendOrderConfirmation` (`ShouldQueue`) — `handle()` logs
(`Log::info`) rather than sending real mail (no provider configured),
but runs through the real Redis queue (`php artisan queue:work`), not
inline — swapping the log line for `Mail::send()` later is the only
change needed.

### 4.4 Order/payment visibility

Added a `payments` field to `OrderResource` using the same conditional
pattern as Phase 3's `user` field
(`$this->when($this->relationLoaded('payments'), ...)`) via a new
`PaymentResource`. Both the customer-facing `Api\OrderController` and
`Api\Admin\OrderController` now eager-load `payments` alongside their
existing eager-loads.

### 4.5 Tests

`tests/Feature/{PaymentTest,PaymentCallbackTest}.php` — initiate
happy path + ownership + status guards (can't pay for someone else's
order, or one that's already paid/cancelled); fake pay/cancel mark the
payment and order correctly and dispatch (or don't dispatch)
`SendOrderConfirmation` (`Queue::fake()` + `assertPushed`/
`assertNotPushed`); a duplicate callback for an already-resolved
transaction is a no-op (job only dispatched once); unknown
`transaction_id` 404s (`Payment::where(...)->firstOrFail()`). Extended
`tests/Feature/Admin/OrderTest.php`'s "view any order" test to confirm
`payments` appears once loaded.

Verified end-to-end with `php artisan serve` + `curl`: customer checks
out → `POST /orders/{id}/pay` (returns a `gateway_url` +
`transaction_id`) → `POST /payments/fake/{transaction}/pay` → order
shows `status: paid`; `php artisan queue:work --once` against the real
Redis queue actually ran `SendOrderConfirmation` and logged the
confirmation line. Full suite: `php artisan test --compact` → 73
passed. `vendor/bin/pint --dirty --format agent` clean.
