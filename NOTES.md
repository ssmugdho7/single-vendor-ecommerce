# Engineering Notes

This file documents the *why* behind the implementation: architecture
decisions, trade-offs, and known limitations. It is filled in phase by phase
alongside `step_by_step_execution.md` (which has the *what*/commands/code).

## Architecture decisions

### Infrastructure: Docker Compose for Postgres + Redis only
The app itself (Laravel, Next.js) runs natively on the host, not in
containers — this keeps `php artisan`/`npm run dev` fast with instant reload
during development. Only the stateful services (Postgres, Redis) run in
Docker, since those are the pieces that need to behave identically across
machines and are annoying to install/version-match natively.

### Redis for cache, session, and queue from the start
Laravel defaults new projects to `database` for all three. We switched to
Redis immediately rather than "upgrading later," since using Redis is one of
the assignment's explicit architecture requirements and we want the local
dev environment to be representative of the target architecture.

## Database design

**Phase 1 scope**: `categories` and `products` only. `users` gained a single
`is_admin` boolean rather than a `role` enum/table — there's no customer
registration/auth requirement yet, so a richer role system would be
speculative. Products belong to a category (`category_id` FK,
`cascadeOnDelete`); slugs on both models are server-generated (see
`app/Models/Concerns/HasSlug.php`) from `name` on create, de-duped with a
`-2`, `-3`, ... suffix if needed — never client-supplied.

**Phase 2 additions**: `carts`/`cart_items` (one cart per user, unique
`(cart_id, product_id)` so adding the same product again increments
quantity rather than duplicating a row) and `orders`/`order_items`.
`order_items.product_id` is nullable with `nullOnDelete` — unlike
`cart_items`, which cascade-deletes with its product, a historical order
line should survive a product being removed later; `unit_price` is
snapshotted at checkout time so later price changes don't rewrite history.
`users` needed no changes — a customer is just a `User` row with
`is_admin = false`, the column's existing default.

## Assumptions

- Admin auth is Sanctum **token**-based (`Authorization: Bearer <token>`),
  not SPA/cookie-based — the Next.js frontend isn't assumed to share a
  top-level domain with the API, and token auth needs no CORS/stateful-
  domain configuration.
- Phase 1 exposes only `/api/admin/*` CRUD for categories/products. There
  are no public (non-admin) read endpoints yet — those belong to whichever
  phase builds the storefront.
- `stock_quantity` on `products` is a plain on-hand integer count, not a
  reservation system — there's no cart-time hold. It's backed by a
  `stock_movements` audit ledger as of Phase 3 (see "Inventory strategy"
  below), but the counter itself is still the only thing checkout
  actually checks against.
- Product images are a single nullable `image_path` string, not a
  gallery/variants table — the simplest thing that satisfies "core data"
  without building an unrequested image-management feature.
- Checkout decrements `stock_quantity` synchronously inside the same
  transaction that creates the order (rows locked with `lockForUpdate()`
  to prevent a race under concurrent checkouts) — there's still no
  cart-time reservation/hold step (explicitly skipped, see "Inventory
  strategy").
- Order line items snapshot `unit_price` only, not the product's name —
  if a product is later renamed, historical orders show the new name via
  the (still-linked) product relation. Only deletion is guarded against
  (via `nullOnDelete`), not renaming.
- As of Phase 4, `orders.status` can also be `paid`. Admin cancellation
  (Phase 3) already only acts on `pending_payment`, so a `paid` order is
  correctly left uncancellable by that action as-is — a refund flow
  isn't built and isn't needed yet.
- A payment that fails/is cancelled doesn't change the order's status —
  it stays `pending_payment` so the customer can simply retry (a fresh
  `POST /orders/{id}/pay` creates a new `Payment` row; the failed one is
  left as a record, not deleted).

## Trade-offs
*(to be filled in as decisions are made)*

## Performance decisions
*(to be filled in as decisions are made)*

## Caching / queue / scheduler strategy

Phase 4 is the first thing to actually dispatch a job onto the Redis
queue set up in Phase 0: `App\Jobs\SendOrderConfirmation`, fired when a
payment succeeds. Its `handle()` just logs — there's no mail provider
configured — but it's a real queued job (`php artisan queue:work`
processes it off Redis, not inline), so swapping the log line for a
real `Mail::to(...)->send(...)` later is the only change needed.

## Payment and CarryBee integration

**Phase 4 — payment.** Modeled on SSLCommerz (the standard Bangladeshi
hosted-checkout gateway — a reasonable guess given CarryBee, a
Bangladeshi courier aggregator, is already named for Phase 5), but
implemented behind `App\Contracts\PaymentGatewayContract` with an
`App\PaymentGateways\FakePaymentGateway` driver, since no real sandbox
credentials were available. The contract has exactly two methods —
`initiate(Order): array` (get a transaction id + a URL to send the
customer to) and `verify(array $payload): array` (normalize a
callback/IPN payload into a validity + status) — chosen to match the
shape every hosted-checkout gateway needs regardless of vendor, so
adding a real `SslcommerzPaymentGateway` later is a new class + the
`PAYMENT_GATEWAY_DRIVER` env var, not a rewrite of
`App\Services\PaymentService` or any controller.

**Single mutation point**, same pattern as Phase 3's
`Product::adjustStock()`: every payment-state change goes through
`PaymentService::handleCallback()`, which is **idempotent** — a
payment already resolved (not `pending`) short-circuits rather than
re-applying. This matters because real gateways routinely deliver the
same IPN more than once (retries on a slow 200 response, etc.), and
without the guard a duplicate would double-dispatch the confirmation
job.

The browser-redirect and server-to-server IPN concepts collapse into
one endpoint here (`POST /api/payments/callback`, public — a gateway
can't carry a Sanctum token) since the fake driver has no real
separate async delivery mechanism to simulate; a real gateway
integration would likely still route both through the same
`PaymentService::handleCallback()`, just from two different routes
with different payload shapes.

**Phase 5 — CarryBee (delivery)**: not yet started.

## Inventory strategy

`stock_quantity` on `products` remains the single source of truth for
"how much is available right now" (unchanged from Phase 2), but every
change to it is now also logged to `stock_movements`: `type` (`sale`,
`restock`, `correction`, `cancellation` — a backed `App\StockMovementType`
enum), a signed `quantity_change`, an optional `order_id` (set for
`sale`/`cancellation`, null for manual admin adjustments), and an
optional admin-supplied `note`.

**Single mutation point**: every call site that changes stock —
checkout's decrement, an admin's manual restock/correction, an order
cancellation's reversal — goes through `Product::adjustStock()` rather
than touching `stock_quantity` directly. This guarantees the ledger
can never drift out of sync with the counter, since there's exactly
one place where the two are written together.

`correction` (an admin setting stock to an absolute known value, e.g.
after a physical recount) and `restock` (adding a known quantity) are
the only two types an admin can trigger directly — `sale` and
`cancellation` only ever happen as a side effect of checkout/order
cancellation, never as a freeform type a client can pick.

Cart-time behavior is **unchanged** from Phase 2 — adding to a cart
does not reserve or hold stock. Stock is only authoritative-checked
and mutated at checkout, inside a transaction with `lockForUpdate()`
(already race-safe). A reservation-with-expiry system was considered
and explicitly skipped: it adds a background-expiry job and more
failure modes for a benefit (avoiding a checkout-time surprise) that
has no stated requirement behind it.

## Error handling
*(to be filled in as decisions are made)*

## Known limitations

- Admin login returns the same generic validation error whether the
  password is wrong or the account exists but isn't an admin, to avoid
  leaking account existence — deliberate, not a bug.
- `npm audit` reports high-severity advisories in `braces`, a transitive
  dependency of `eslint-config-next` → `fast-glob`. This only affects the
  dev-time lint tooling, not any runtime/production code path. The suggested
  `npm audit fix --force` downgrades `eslint-config-next` to a version
  incompatible with the installed Next.js release, so it was left as-is.

## Production improvements
*(to be filled in at the end)*
