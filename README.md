# Single-Vendor E-Commerce Platform

Laravel 13 + PostgreSQL API backend, Next.js storefront/admin frontend.

See `step_by_step_execution.md` for the full build log (commands and code,
phase by phase) and `NOTES.md` for the architecture decisions and known
limitations behind it.

## Stack

- **Backend**: Laravel 13, PHP 8.4, PostgreSQL, Redis
- **Frontend**: Next.js (App Router), TanStack Query, shadcn/ui, Tailwind CSS

## Prerequisites

- PHP 8.4+ and Composer
- Node.js 20+ and npm
- Docker (for Postgres + Redis)

## 1. Clone and start infrastructure

```bash
git clone <repo-url>
cd single-vendor-ecommerce
docker compose up -d   # Postgres on :5432, Redis on :6379
```

## 2. Backend setup

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

## 3. Queue worker

Background jobs (delivery dispatch to CarryBee, etc.) run through Redis-backed
queues and require a worker process:

```bash
cd backend
php artisan queue:work
```

## 4. Scheduler

Periodic tasks (e.g. polling delivery status) use Laravel's scheduler. In
local development, run:

```bash
cd backend
php artisan schedule:work
```

## 5. Frontend setup

Run this alongside the backend (step 2) and a queue worker (step 3) — the
frontend talks to the API at `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:8000/api`) and needs the queue running for payment
confirmation/delivery dispatch to actually happen.

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000
```

The storefront (`/`) and the admin panel (`/admin/login`) are separate
login spaces — see "Seeder / factory data" below for the seeded admin
account. Auth tokens are stored in the browser's `localStorage`
(`storefront_token` / `admin_token`), not cookies.

## 6. Payment configuration

Payments go through a swappable gateway behind `PAYMENT_GATEWAY_DRIVER`
(`backend/.env`, default `fake`) — no real credentials are required to
exercise the full flow end to end: `POST /api/orders/{id}/pay` returns a
`gateway_url`/`transaction_id`, and the frontend's
`/checkout/pay/[transaction]` page calls the fake gateway's
`pay`/`cancel` simulation endpoints directly. A real gateway (e.g.
SSLCommerz) would be added as a new `PaymentGatewayContract`
implementation plus real credentials — no controller/route changes.

## 7. CarryBee configuration

Deliveries work the same way, behind `DELIVERY_PROVIDER_DRIVER`
(default `fake`). A successful payment automatically queues shipment
creation; the fake provider's `/api/deliveries/fake/{tracking}/...`
endpoints simulate CarryBee's webhook reporting transit/delivered/failed.

## 8. Running tests

```bash
cd backend
php artisan test
```

## 9. Seeder / factory data

```bash
cd backend
php artisan migrate:fresh --seed
```
Seeds one admin (`admin@example.com` / `password`), 8 categories, and 40
products with randomized stock/pricing. Orders/payments/deliveries aren't
seeded — create them by actually using the storefront (register → browse
→ cart → checkout → pay → admin cancels/restocks as needed).
