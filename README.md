# Appointment Platform

Multi-tenant reservation SaaS platform (beauty + healthcare) with:
- NestJS backend + Prisma + PostgreSQL
- React web admin panel
- Seeded fake data
- Password-protected Swagger

## Requirements
- Node.js `22+`
- PostgreSQL running locally

## Environment
Backend env file: `apps/api/.env`

Example:

```env
DATABASE_URL="postgresql://appointment:appointment@localhost:5432/appointment?schema=public"
SWAGGER_USER="admin"
SWAGGER_PASS="StrongSwaggerPass123!"
```

## One-Time Setup

Install dependencies at project root:

```bash
npm install
```

Run migrations + seed fake data:

```bash
npm run bootstrap
```

## Run (Single Command)

Start both backend and frontend together:

```bash
npm run dev
```

This starts:
- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:5174`

## Swagger (Password Protected)

Swagger URL:

```text
http://127.0.0.1:3000/swagger
```

Login with:
- username: `SWAGGER_USER`
- password: `SWAGGER_PASS`

If env vars are missing, defaults are:
- user: `admin`
- pass: `ChangeMe123!`

## Useful Commands

```bash
npm run db:deploy
npm run db:seed
npm run build
```
