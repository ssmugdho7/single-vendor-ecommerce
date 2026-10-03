# Single-Vendor E-Commerce Platform

Laravel 13 + PostgreSQL API backend, Next.js storefront/admin frontend.

> This README is being filled in as the project is built. See
> `step_by_step_execution.md` for the full build log with commands and code,
> and `NOTES.md` for architecture/decisions once those phases are complete.

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

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## 6. Payment configuration

*(documented once Phase 4 is built)*

## 7. CarryBee configuration

*(documented once Phase 5 is built)*

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
Seeds 1 admin, 30+ products, realistic inventory, and 100 orders spread over
the last 3 weeks with internally-consistent stock/order-status data.
