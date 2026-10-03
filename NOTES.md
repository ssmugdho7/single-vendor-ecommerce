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
- As of Phase 3, admins can list/view any order and cancel a
  `pending_payment` one (restoring stock). There's still no status other
  than `pending_payment`/`cancelled` — a `paid` transition and related
  admin actions are deferred to Phase 4/5's payment integration.

## Trade-offs
*(to be filled in as decisions are made)*

## Performance decisions
*(to be filled in as decisions are made)*

## Caching / queue / scheduler strategy
*(to be filled in as each is introduced)*

## Payment and CarryBee integration
*(to be filled in during Phase 4/5)*

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
