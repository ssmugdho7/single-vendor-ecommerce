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
  reservation/movement ledger — that's Phase 3's "Inventory strategy".
- Product images are a single nullable `image_path` string, not a
  gallery/variants table — the simplest thing that satisfies "core data"
  without building an unrequested image-management feature.
- Checkout decrements `stock_quantity` synchronously inside the same
  transaction that creates the order (rows locked with `lockForUpdate()`
  to prevent a race under concurrent checkouts) — there's no separate
  reservation/hold step yet. That's deliberately deferred to Phase 3's
  "Inventory strategy".
- Order line items snapshot `unit_price` only, not the product's name —
  if a product is later renamed, historical orders show the new name via
  the (still-linked) product relation. Only deletion is guarded against
  (via `nullOnDelete`), not renaming.
- Admin-side order visibility/management isn't built yet — there's no
  `/api/admin/orders`. It's deferred to whichever phase handles payment
  status transitions (Phase 4/5), rather than built speculatively now.

## Trade-offs
*(to be filled in as decisions are made)*

## Performance decisions
*(to be filled in as decisions are made)*

## Caching / queue / scheduler strategy
*(to be filled in as each is introduced)*

## Payment and CarryBee integration
*(to be filled in during Phase 4/5)*

## Inventory strategy
*(to be filled in during Phase 3)*

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
