Next.js (App Router) frontend for the single-vendor e-commerce project —
see the repo root `README.md` for full setup instructions, and
`../step_by_step_execution.md` / `../NOTES.md` for how this was built and why.

## Getting started

```bash
cp .env.example .env.local
npm install
npm run dev
```

Requires the Laravel API (`../backend`) running at `NEXT_PUBLIC_API_URL`
(`.env.local`, defaults to `http://localhost:8000/api`).

## Structure

- `src/app/(storefront)/*` — the customer-facing storefront (no URL
  prefix): browsing, auth, cart, checkout, order tracking.
- `src/app/admin/*` — the admin panel: catalog CRUD, stock adjustments,
  order management.
- `src/lib/auth/` — client-side Sanctum-token auth (see `NOTES.md`'s
  "Frontend architecture" section for why there are two separate token
  spaces).
- `src/components/ui/` — shadcn/ui primitives (this project's style,
  `base-nova`, is built on `@base-ui/react`, not Radix).
