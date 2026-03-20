# Migration Runbook

## Principles
- Migration-first development is mandatory.
- All schema changes go through `prisma migrate`.
- Use forward-only migrations in shared environments.
- Keep migration history table untouched.

## Environment
- PostgreSQL must be running.
- `DATABASE_URL` in `apps/api/.env` must be valid.

## Local Commands
From `apps/api`:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

## CI/Production Commands
From `apps/api`:

```bash
npx prisma migrate deploy
npx prisma generate
```

## Useful Checks
From `apps/api`:

```bash
npx prisma migrate status
```

## Build Checks
From workspace root:

```bash
npm run build -w apps/api
npm run build -w apps/web
```

## Drift and Recovery Notes
- Never edit old migration SQL files after they are applied.
- For local-only mistakes, reset local DB and re-run migrations.
- For shared environments, create a new corrective migration.
