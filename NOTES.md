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

**Phase 5 additions**: `orders` gained `recipient_name`,
`recipient_phone`, `shipping_address` — a gap Phase 2 left open (no
courier can deliver without an address, and none had been collected
anywhere). Collected directly on the checkout request rather than a
saved address book, since there's no multi-address requirement.
`deliveries` (`order_id` unique FK — one shipment per order, `provider`,
`tracking_id` unique, `status`, `raw_response` diagnostics) mirrors
Phase 4's `payments` shape.

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
- As of Phase 5, `orders.status` can also be `shipped`, `delivered`, or
  `delivery_failed`. A shipment's `in_transit` state only updates
  `Delivery.status` — `Order.status` stays `shipped` until a terminal
  delivery outcome (`delivered`/`failed`) arrives; the granular
  in-progress detail lives on `Delivery`, not duplicated onto `Order`.
- There's no retry/re-dispatch for a `delivery_failed` order (e.g. a
  failed delivery attempt that should be re-attempted) — out of scope,
  same as the lack of a refund flow for payments.

## Frontend architecture

Built in one pass covering both the customer storefront and the admin
panel (Next.js App Router, TanStack Query, shadcn/ui). Key decisions:

- **Everything is client-rendered** (`"use client"` + TanStack Query),
  including the public catalog — one consistent data-fetching pattern
  end to end rather than mixing Server Components' `fetch()` with client
  queries. Trade-off: no SSR/SEO benefit for the catalog, accepted for
  this scope.
- **Two independent auth spaces**, mirroring the backend's `/api/*` vs
  `/api/admin/*` split: a `storefront_token` and an `admin_token`, each
  in `localStorage` (not cookies — the backend uses Sanctum bearer
  tokens, not session cookies). Built via one generic
  `createAuthContext()` factory
  (`frontend/src/lib/auth/create-auth-context.tsx`) instantiated twice
  (`customer-auth.tsx`, `admin-auth.tsx`) — real reuse (identical
  login/me/logout shape, different endpoints/storage key).
- **One axios instance** (`frontend/src/lib/api-client.ts`) picks the
  right token by checking whether the request path starts with
  `/admin`, rather than maintaining two client instances. A 401
  response clears that token and hard-redirects to the matching login
  page.
- **The fake-payment page lives on the frontend**, not the backend.
  `FakePaymentGateway::initiate()` (backend) returns a `gateway_url`
  pointing at a non-renderable API path; the frontend ignores it and
  navigates to its own `/checkout/pay/[transaction]` page instead, which
  calls the backend's existing `fake/{transaction}/pay|cancel` endpoints
  directly. A real gateway integration would actually use `gateway_url`
  for a true external redirect — this is exactly the seam where "fake"
  and "real" differ, by design.
- **The admin product edit form has no `stock_quantity` field.** The
  backend's `UpdateProductRequest` still technically accepts one
  (bypassing the Phase 3 ledger — see "Known limitations"), but the UI
  only exposes stock changes through the dedicated stock-movements page,
  so an admin can't silently desync the ledger through the edit screen.
  The *create* form does include initial stock, since there's no prior
  ledger entry to bypass for a product that doesn't exist yet.
- **No react-hook-form/zod.** Forms are small (3-6 fields); plain
  controlled inputs plus the backend's own 422 messages rendered inline
  were enough, and this avoids adding dependencies beyond what Phase 0
  already installed.
- **shadcn's installed style (`base-nova`) is built on Base UI, not
  Radix** — e.g. `Button` has no `asChild` prop, instead taking a
  `render={<Link .../>}` prop for polymorphism. Also: Phase 0 had only
  run `shadcn init` far enough to write `components.json`, never
  actually generating the CSS theme tokens (`--primary`, `--border`,
  etc.) into `globals.css` — every shadcn component would have rendered
  unstyled until `shadcn init -d --force --yes` was re-run here to lay
  those down.
- Confirmed via `php artisan tinker` before relying on it: a
  `DeliveryResource::make($this->whenLoaded('delivery'))` where the
  `hasOne` relation is loaded-but-empty serializes as a clean JSON
  `null`, not an all-null-fields object — so the frontend's
  `delivery: Delivery | null` type and `if (order.delivery)` checks are
  correct as written, no backend fix needed.
- **Actually verified in a real headless browser** (Playwright,
  installed as a scratch tool — not a project dependency), after first
  relying only on `npm run build` + `curl` smoke tests and *believing*
  no browser tool was available. A scripted walkthrough of both the
  full customer flow (register → browse → cart → checkout → simulated
  pay → watch the order reach `shipped` → admin advances delivery to
  `delivered` → customer sees it) and the admin flow (login → create
  category/product → restock → cancel/advance an order) caught two
  real bugs that `npm run build`, `eslint`, and the backend's 82 passing
  tests had all missed:
  1. Every `<Button render={<Link .../>} />` usage (polymorphic button
     rendering as a Next.js `Link`) logged a Base UI runtime warning —
     `Button` defaults to `nativeButton: true`, which expects the
     `render` target to be an actual `<button>`; needs
     `nativeButton={false}` whenever it's rendering an anchor instead.
     Fixed at all 6 call sites.
  2. `/checkout/pay/[transaction]/page.tsx` never invalidated the
     `['order', id]`/`['orders']` query cache after a simulated
     payment, so a user bouncing back to the order page could see a
     stale `pending_payment` badge until TanStack Query's own
     background refetch caught up. Fixed by invalidating explicitly on
     payment resolution, plus a short `refetchInterval` on the order
     detail pages (both customer and admin) while status is `paid`, so
     the `shipped` transition — which depends on a queued job, not the
     request/response cycle — shows up without a manual page refresh.

## Trade-offs

Recurring theme across every phase: ship the real shape of the problem
with a fake backing driver, rather than stubbing the shape itself.
Payments and delivery are each a two-method contract
(`initiate`/`verify`, `createShipment`/`verify`) with a `Fake*`
implementation — swapping in SSLCommerz/CarryBee later is additive
(new class + credentials), not a rewrite, because the *interface* was
designed against the real integration's needs (a reference id to track,
a webhook payload to verify) rather than against what was easy to fake.
The cost: nobody has verified the real gateways actually fit this
exact two-method shape, since no sandbox credentials were ever
available to try against.

Everywhere a "single mutation point" pattern appears
(`Product::adjustStock()`, `PaymentService::handleCallback()`,
`DeliveryService::createShipment()`/`handleStatusUpdate()`) the
trade-off is the same: one more layer of indirection (callers can't
just `Model::update()`) in exchange for a guarantee that an audit
trail or a status transition can't be bypassed accidentally. Worth it
here because every one of those methods has more than one caller.

The frontend is entirely client-rendered rather than mixing Server
Components for the public catalog with client components for
interactive bits — one consistent pattern, at the cost of no SSR/SEO
benefit for a storefront that would normally want it.

## Performance decisions

- Every order-bearing endpoint eager-loads its relations up front
  (`items.product.category`, `payments`, `delivery`, `user` where
  relevant) rather than letting `OrderResource` lazy-load per row —
  the N+1 that `OrderResource`'s `whenLoaded()` calls would otherwise
  produce across a paginated list is avoided at the query layer, not
  papered over by eager-loading only sometimes.
- Checkout and cancellation lock the specific product rows they touch
  (`Product::query()->whereIn('id', ...)->lockForUpdate()`) rather than
  locking the whole table or serializing checkout behind an
  application-level mutex — concurrent checkouts for *different*
  products never block each other.
- Pagination defaults to Laravel's standard `paginate()` (15/page)
  everywhere rather than returning unbounded collections, including on
  endpoints (categories, admin stock movements) where the current
  dataset is small enough that it wouldn't matter yet.
- No caching layer (Redis is used for sessions/queue/cache driver
  config, but no route/response actually caches anything). The catalog
  is the obvious candidate if this went further — it's read far more
  than it's written — but adding cache invalidation for a dataset this
  small isn't paying for itself yet.

## Caching / queue / scheduler strategy

Phase 4 is the first thing to actually dispatch a job onto the Redis
queue set up in Phase 0: `App\Jobs\SendOrderConfirmation`, fired when a
payment succeeds. Its `handle()` just logs — there's no mail provider
configured — but it's a real queued job (`php artisan queue:work`
processes it off Redis, not inline), so swapping the log line for a
real `Mail::to(...)->send(...)` later is the only change needed.

Phase 5 adds a second queued job on the same trigger:
`App\Jobs\CreateDeliveryShipment`, dispatched right alongside
`SendOrderConfirmation` in `PaymentService::handleCallback()`. Both
jobs running off the same successful-payment event is deliberate —
notifying the customer and booking the courier are independent
side effects that shouldn't block each other or the payment response
itself.

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

**Phase 5 — CarryBee (delivery).** Same shape as Phase 4, deliberately:
`App\Contracts\DeliveryProviderContract` has `createShipment(Order):
array` and `verify(array $payload): array`, mirroring
`PaymentGatewayContract`'s `initiate`/`verify`, with an
`App\DeliveryProviders\FakeDeliveryProvider` standing in for real
CarryBee credentials. `App\Services\DeliveryService` is the single
mutation point (mirrors `Product::adjustStock()` and
`PaymentService::handleCallback()`): `createShipment()` is idempotent
by querying `deliveries` directly for an existing row rather than
trusting `$order->delivery` — a retried queue job can reuse the same
in-memory `Order` instance, whose cached relation would still read
stale (null) from before the first run created the row. (This was a
real bug caught by a test that ran the job twice against the same
`Order` object — worth remembering as a general caution against
trusting a cached Eloquent relation across a method that just wrote to
it.) `handleStatusUpdate()` is a no-op once the delivery is in a
terminal state (`delivered`/`failed`), same idempotency rationale as
payments.

Triggered automatically: `PaymentService::handleCallback()` dispatches
`CreateDeliveryShipment` alongside `SendOrderConfirmation` the moment
an order is marked `paid` — no manual admin "dispatch" step.

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

- `bootstrap/app.php` forces JSON error responses for every `api/*`
  request (`$exceptions->shouldRenderJsonWhen(...)`) from Phase 0
  onward, so a validation failure, a 404, or an unhandled exception
  always comes back as JSON the frontend can parse — never Laravel's
  HTML error page, even in debug mode.
- Validation errors are always Laravel's standard 422
  `{message, errors: {field: [...]}}}` shape (Form Requests throughout,
  never manual `response()->json(['error' => ...], 422)`), so the
  frontend's single `extractFieldErrors()`/`extractErrorMessage()`
  helpers (`frontend/src/lib/form-errors.ts`) work against every form
  in the app without per-endpoint special-casing.
- Business-rule failures that aren't field validation (checkout on an
  empty cart, insufficient stock, paying for an already-paid order,
  cancelling an already-cancelled order) are deliberately raised as
  `ValidationException::withMessages([...])` too, rather than a bespoke
  4xx shape — same reasoning: one error shape, one frontend handler.
- Ownership/authorization failures are 403/404 depending on whether the
  resource's existence is itself sensitive (e.g. a customer probing
  another customer's order ID gets 404, not "403: not yours" — doesn't
  confirm the order exists at all).

## Known limitations

- `App\Http\Requests\Admin\UpdateProductRequest` still technically
  accepts a raw `stock_quantity` field (left over from Phase 1, before
  the Phase 3 ledger existed) that would update the column directly,
  bypassing `Product::adjustStock()` and the `stock_movements` audit
  trail. The admin frontend's product edit form deliberately never
  sends this field, but the backend itself doesn't enforce that — a
  direct API call still could. Flagged, not fixed, since closing it is
  a backend validation change outside a frontend-only pass.
- Admin login returns the same generic validation error whether the
  password is wrong or the account exists but isn't an admin, to avoid
  leaking account existence — deliberate, not a bug.
- `npm audit` reports high-severity advisories in `braces`, a transitive
  dependency of `eslint-config-next` → `fast-glob`. This only affects the
  dev-time lint tooling, not any runtime/production code path. The suggested
  `npm audit fix --force` downgrades `eslint-config-next` to a version
  incompatible with the installed Next.js release, so it was left as-is.

## Production improvements

What this project deliberately left for later, roughly in the order a
real launch would need them:

1. **Real payment/delivery credentials.** `FakePaymentGateway`/
   `FakeDeliveryProvider` need real `SslcommerzPaymentGateway`/
   `CarryBeeDeliveryProvider` implementations of the same contracts,
   plus real webhook signature verification (`verify()` currently just
   trusts its input — fine for a self-contained fake, not for a real
   gateway's IPN).
2. **Refunds and delivery retry.** A `paid` order has no path back to
   a cancelled/refunded state, and a `delivery_failed` order has no
   re-dispatch action — both explicitly out of scope so far (see
   "Known limitations").
3. **Email/SMS, for real.** `SendOrderConfirmation` logs instead of
   sending; needs a real mail/SMS provider and probably a proper
   notification class instead of a one-off job.
4. **Product images.** `image_path` is a bare nullable string with no
   upload endpoint, storage disk, or CDN — admin would currently have
   to set it by hand via the API.
5. **Rate limiting beyond the framework default.** `throttle:api`
   applies globally; login/checkout specifically would want tighter,
   purpose-specific limits.
6. **Observability.** No structured logging, error tracking (Sentry et
   al.), or metrics beyond Laravel's default log channel — fine for
   local development, not for diagnosing a production incident.
7. **CORS explicitly configured** rather than relying on Laravel's
   unconfigured framework default (`allowed_origins: ['*']`) — fine for
   local dev against `localhost:3000`, but a real deployment should
   publish `config/cors.php` and scope it to the actual frontend
   origin.
8. **Horizontal scaling of the queue worker** — currently assumes one
   `queue:work` process; fine today, but `CreateDeliveryShipment` and
   `SendOrderConfirmation` have no particular ordering guarantee if run
   across multiple workers, which has never been tested.
9. **Real browser/E2E test coverage** committed to the repo (Playwright
   or similar) — verification so far is backend feature tests (82
   passing) plus manual browser walkthroughs run ad hoc during
   development, not a repeatable suite.
