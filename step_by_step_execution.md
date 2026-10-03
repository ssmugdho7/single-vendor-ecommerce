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

## Phase 5 — CarryBee delivery integration

Scope: close a gap Phase 2 left open (no shipping address was ever
collected), then add a delivery flow mirroring Phase 4's payment flow
almost exactly — a swappable courier contract with a fake driver,
triggered automatically (queued) when an order is paid, with a
`pickup_pending → in_transit → delivered/failed` lifecycle.

### 5.1 Shipping address (prerequisite gap)

```bash
php artisan make:migration add_shipping_details_to_orders_table --no-interaction
php artisan make:request CheckoutRequest --no-interaction
```
Added `recipient_name`, `recipient_phone`, `shipping_address` to
`orders` and `Order::$fillable`. `CheckoutController::store()` now
type-hints `CheckoutRequest` (previously a plain `Request` with no
validation at all) requiring all three. `OrderFactory` got matching
fake defaults so every existing factory-built order stays valid
without every test needing to pass them explicitly.

Updated `tests/Feature/CheckoutTest.php`'s existing requests to
include a valid shipping payload (via a small `validShippingPayload()`
helper) so they keep testing what they were testing — cart/stock logic
— rather than incidentally 422ing on the newly-required fields; added
one new test asserting the validation itself.

### 5.2 `deliveries` + gateway abstraction

```bash
php artisan make:model Delivery -mf --no-interaction
php artisan make:enum DeliveryStatus --no-interaction
```
`deliveries`: `order_id` (FK **unique** — one shipment per order,
cascadeOnDelete), `provider`, `tracking_id` (unique), `status` (backed
`App\DeliveryStatus`: `PickupPending`/`InTransit`/`Delivered`/`Failed`),
`raw_response` (diagnostics only, not in `DeliveryResource`).
`Delivery belongsTo Order`; `Order hasOne Delivery`.

`App\Contracts\DeliveryProviderContract` deliberately mirrors
`PaymentGatewayContract`'s shape — `createShipment(Order): array` and
`verify(array): array` — since a courier aggregator's integration
shape (get a tracking reference, later verify a status webhook) is
structurally the same problem as a payment gateway's (get a
transaction reference, later verify a payment webhook).
`App\DeliveryProviders\FakeDeliveryProvider` generates a
`CARRYBEE-{uuid}` tracking id; `verify()` passes through whatever
status it's given. Bound in `AppServiceProvider::register()` via
`config('services.delivery.driver')` (env `DELIVERY_PROVIDER_DRIVER`,
default `fake`), same swap-later story as the payment gateway.

### 5.3 Single mutation point + order status

```bash
php artisan make:job CreateDeliveryShipment --no-interaction
```
`App\Services\DeliveryService::createShipment(Order): Delivery` —
idempotent, but **not** via `$order->delivery` (a cached relation that
goes stale the moment this same method creates the row without
updating that cache) — instead queries `Delivery::where('order_id',
...)->first()` fresh each call. This was a real bug caught by
`tests/Feature/DeliveryTest.php`'s "running the job twice" test: two
job instances built from the *same* in-memory `$order` object (as
happens when a test — or a queue worker reusing a job's deserialized
payload across a retry — calls the job twice) both saw the stale
`null`-cached relation and both tried to insert, hitting the `deliveries.order_id`
unique constraint. Querying fresh avoids trusting a cache that the
very same method invalidated.

On success, sets `Order.status = 'shipped'`.
`handleStatusUpdate(array): Delivery` mirrors
`PaymentService::handleCallback()`: resolves the gateway, `verify()`s,
locks the `Delivery` row, no-ops if already terminal
(`Delivered`/`Failed`), otherwise updates `Delivery.status` and — only
on a terminal outcome — `Order.status` (`delivered`/`delivery_failed`).
`in_transit` updates `Delivery.status` only; `Order.status` stays
`shipped` until a terminal outcome arrives, so the granular
in-progress detail lives on `Delivery`, not duplicated onto `Order`.

**Trigger**: `PaymentService::handleCallback()` now dispatches
`CreateDeliveryShipment::dispatch($order)` right alongside
`SendOrderConfirmation` — both fired as independent side effects of
the same successful-payment event, no manual admin "dispatch" step.

### 5.4 Controllers + routes

```bash
php artisan make:controller Api/DeliveryCallbackController --no-interaction
php artisan make:controller Api/FakeDeliveryController --no-interaction
```
`POST /api/deliveries/callback` (public — a courier's webhook can't
carry a Sanctum token) → `DeliveryService::handleStatusUpdate()`.
`POST /api/deliveries/fake/{tracking}/{transit,deliver,fail}` (public)
— what a test client calls to simulate CarryBee's webhook.

### 5.5 Order/delivery visibility

Added `recipient_name`, `recipient_phone`, `shipping_address`, and a
`delivery` field (same `$this->when($this->relationLoaded('delivery'), ...)`
conditional pattern as `user`/`payments`) to `OrderResource`, backed by
a new `DeliveryResource`. Both `Api\OrderController` and
`Api\Admin\OrderController` eager-load `delivery` alongside their
existing eager-loads.

### 5.6 Tests

`tests/Feature/DeliveryTest.php` — a successful payment dispatches
`CreateDeliveryShipment`; running the job creates a `pickup_pending`
`Delivery` and sets `Order.status = 'shipped'`; running it twice
doesn't create a duplicate (the bug described in 5.3, fixed before
this test was green). `tests/Feature/DeliveryCallbackTest.php` — fake
`transit` updates `Delivery` only; fake `deliver`/`fail` set the
matching terminal `Order.status`; a callback after a terminal state is
a no-op; unknown `tracking_id` 404s. Extended
`tests/Feature/Admin/OrderTest.php`'s "view any order" test to confirm
`delivery` appears once loaded.

Verified end-to-end with `php artisan serve` + `curl` +
`php artisan queue:work`: checkout with a shipping address → pay →
both queued jobs ran → order showed `status: shipped` with a
`pickup_pending` delivery and a `success` payment → `POST
/deliveries/fake/{tracking}/deliver` → order showed `status:
delivered`, visible identically from both the customer's own order
view and the admin order view. Full suite:
`php artisan test --compact` → 82 passed. `vendor/bin/pint --dirty
--format agent` clean.

## Phase 6 — Next.js frontend (storefront + admin, one pass)

Scope: build the whole consumer-facing app against the now-complete
backend — customer storefront (browse, auth, cart, checkout, payment
simulation, order tracking) and admin panel (catalog CRUD, stock
ledger, order management) — in one pass, client-side auth with the
Sanctum token in `localStorage`, shadcn defaults for styling.

### 6.1 Fixing the shadcn setup left incomplete in Phase 0

Phase 0 ran `npx shadcn init -d --force --yes`, which wrote
`components.json` but — it turns out — never actually generated the
CSS theme tokens into `globals.css`. Running
`npx shadcn@latest add button input label textarea select card table
badge separator dialog alert-dialog sonner skeleton dropdown-menu
checkbox --yes` happily created 15 component files referencing
`bg-primary`, `border-input`, `bg-popover`, etc., none of which were
defined anywhere — every one would have rendered unstyled. Re-running
`npx shadcn@latest init -d --force --yes` (safe to re-run; it detected
the existing config) regenerated `globals.css` with the full
light/dark neutral palette (`--background`, `--primary`, `--border`,
`--ring`, …) and created the missing `src/lib/utils.ts` (`cn` helper).

**Discovered along the way**: this project's shadcn style
(`base-nova`) is built on `@base-ui/react`, not Radix — functionally
very similar (same `Root`/`Trigger`/`Content` component-composition
pattern) but with one API difference that broke the build: `Button`
has no `asChild` prop. Polymorphism instead uses a `render` prop:
`<Button render={<Link href="/checkout">Proceed to checkout</Link>} />`
rather than `<Button asChild><Link>...</Link></Button>`.

### 6.2 Shared infrastructure

- `frontend/.env.example` (new — a gap flagged all the way back in
  Phase 1's initial exploration) + `.env.local`:
  `NEXT_PUBLIC_API_URL=http://localhost:8000/api`.
- `src/types/index.ts` — TS interfaces matching every API Resource
  shape 1:1, plus a generic `Paginated<T>` for Laravel's paginator
  shape.
- `src/lib/api-client.ts` — one axios instance. Its request interceptor
  picks `storefront_token` or `admin_token` from `localStorage` based
  on whether the request path starts with `/admin`; its response
  interceptor clears that token and hard-redirects to the matching
  login page on a 401.
- `src/lib/auth/create-auth-context.tsx` — a generic factory (token
  storage, login/logout, "who am I" on mount) instantiated twice as
  `customer-auth.tsx`/`admin-auth.tsx`, differing only in storage key
  and endpoint paths.
- `src/lib/query-client.tsx` — `QueryClientProvider` wrapper, mounted
  in `src/app/layout.tsx` alongside shadcn's `<Toaster />` (sonner).
- `src/components/pagination.tsx`, `src/components/status-badge.tsx` —
  reused across every paginated list and every order/payment/delivery
  status display, respectively.
- `src/lib/form-errors.ts` — pulls Laravel's `{errors: {field: [...]}}`
  422 shape out of an axios error for inline field display.

**Gotcha**: `customer-auth.tsx`/`admin-auth.tsx` call the
`createAuthContext()` factory at module scope to produce their
exported `Provider`/`useAuth`. Since `create-auth-context.tsx` is
marked `"use client"`, Next's RSC bundler treats every one of its
exports as a client-only reference — calling one as a plain function
from a module that *isn't itself* marked `"use client"` (even though
that module is only ever used by client code) fails the build:
`Attempted to call createAuthContext() from the server but
createAuthContext is on the client.` Fixed by adding `"use client"` to
`customer-auth.tsx` and `admin-auth.tsx` too.

### 6.3 Storefront (route group `(storefront)`, no URL prefix)

`layout.tsx` wraps everything in `CustomerAuthProvider` + a `Navbar`
(login state, cart item count via the shared `['cart']` query key).
`page.tsx` **is** the product listing (no separate marketing
homepage) — category filter and search synced to URL search params
(`?category=&search=&page=`), so it's bookmarkable/shareable.
`products/[slug]/page.tsx`, `cart/page.tsx`, `checkout/page.tsx`
(shipping-address form + `POST /checkout`), `login/page.tsx`,
`register/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx` round
out the flow. `checkout/pay/[transaction]/page.tsx` is the fake-gateway
stand-in described in NOTES.md — "Simulate successful/failed payment"
buttons calling the backend's fake endpoints directly, since the
backend's own `gateway_url` points at a non-renderable API path.

Pages using `useSearchParams()` (`page.tsx`, `login/page.tsx`,
`orders/page.tsx`, `checkout/pay/[transaction]/page.tsx`) are wrapped
in `<Suspense>` — required by Next's App Router for any component
reading search params, or `next build` fails.

### 6.4 Admin panel (`/admin/*`)

`admin/layout.tsx` wraps everything in `AdminAuthProvider` +
`AdminGuard` (redirects to `/admin/login` unless an admin token is
present, skipping the redirect while already on that page) +
`AdminSidebar`. `admin/page.tsx` is a plain `redirect("/admin/products")`.
Categories and products each get a list page (table, delete via
`alert-dialog` confirm) and a shared create/edit form component.

The product form takes a `showStockQuantity` prop: `true` on
`products/new` (there's no prior ledger entry to bypass for a product
that doesn't exist yet), `false` on `products/[id]/edit` (stock changes
only ever happen through `products/[id]/stock`, which mirrors
`StoreStockMovementRequest`'s `type`/`quantity`/`new_quantity`/`note`
shape and lists the movement history table alongside the form).
`orders/page.tsx`/`orders/[id]/page.tsx` show every order
(`user.name`/`email` attached, unlike the customer's own view) with a
"Cancel order" action gated on `pending_payment`, matching the
backend's own guard.

### 6.5 Verification

`npm run build` surfaced three real type errors on the first pass
(the `asChild` issue above; a `string | null` vs `string | undefined`
mismatch from Base UI's `Select` `onValueChange` callback; a removed
`initialIsVisible` prop on a newer `ReactQueryDevtools`) — all fixed,
then a clean, fully-static-where-possible 20-route build. `npm run
lint` (`npx eslint .`) clean.

Confirmed CORS actually works rather than assuming it — there's no
`backend/config/cors.php` (Laravel 13's `HandleCors` middleware applies
framework defaults without one), so a real
`curl -H "Origin: http://localhost:3000" -I .../api/products` was run
to check for `Access-Control-Allow-Origin` in the response, not just
inferred from framework docs. Then, with `php artisan serve` and
`npm run dev` running together, every route (static and dynamic, using
real seeded IDs/slugs) was `curl`'d for a 200 and checked for
error-overlay markers in the HTML.

Also confirmed via `php artisan tinker` before relying on it:
`DeliveryResource::make($this->whenLoaded('delivery'))` on a
loaded-but-empty `hasOne` serializes as JSON `null`, not an
all-null-fields object — so the frontend's `delivery: Delivery | null`
typing and `if (order.delivery)` checks needed no defensive workaround.

**No browser/e2e tool was available in this session** — the above is
the most real verification these tools allow, but it is not a
substitute for actually clicking through the app, which hasn't been
done.
