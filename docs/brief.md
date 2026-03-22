# Multi-Tenant Reservation Platform Brief (v1)

## Product Vision
Build a secure, scalable appointment platform that serves both beauty and healthcare businesses with one shared core. The system must support franchises, branches, and staff-level work tracking while remaining easy to extend for new verticals.

## Locked Technical Stack
- Frontend: React Native (Android/iOS)
- Web Admin: React + Vite (tenant/franchise operations panel)
- Backend: Node.js (NestJS)
- Database: PostgreSQL
- ORM and migrations: Prisma (`migrate dev` / `migrate deploy`)
- Multi-tenancy: Shared schema with strict `tenant_id` isolation

## Core Business Scope (MVP)
- Multi-tenant organization management
- Franchise (parent company) and branch management
- Staff management, schedules, and personal work tracking
- Service catalog with duration and pricing
- Reservation lifecycle (create, reschedule, cancel, complete, no-show)
- Customer/patient management
- Audit logs for critical changes
- Basic reporting for occupancy, staff load, and revenue indicators

### Restaurant vertical (RESTAURANT)
- Seating **areas** (e.g. garden, terrace) as bookable resources; guest API maps “staff” slot id to `RestaurantArea`.
- **Branch pricing days** (`BranchPricingDay`): optional per-date surcharge (% and/or fixed). No rule ⇒ guest pricing hint `hasRule: false` (list price only).
- Web: public `/reserve` flow; admin **Operations** + **assignment** list shows area name when staff is null.

## Multi-Tenant and Domain Boundaries
- Every tenant-scoped entity includes `tenant_id`.
- Tenant filtering is mandatory at service/repository boundaries.
- Shared core entities remain vertical-neutral.
- Vertical-specific data is stored in extension tables:
  - Beauty extensions (optional)
  - Healthcare extensions (optional)

## Security Baseline
- JWT access + refresh flow
- Password hashing and validation policy
- Role-based access control (`owner`, `admin`, `manager`, `staff`)
- Request validation at API boundary
- Audit logging for sensitive writes
- Forward-only migration workflow with traceable history

## Data and Migration Rules
- Migration-first development is mandatory.
- Schema changes must be done via Prisma migrations only.
- Production uses `prisma migrate deploy`; local uses `prisma migrate dev`.
- No ad-hoc manual schema changes in environments.
- Migration history table must remain intact and auditable.

## Cache Readiness
- Introduce a cache abstraction from day one.
- Start with in-memory adapter; keep Redis adapter-ready contract.
- Initial cache targets:
  - service catalog reads
  - branch settings
  - short-lived availability snapshots
- Use explicit invalidation on write flows.

## Initial Milestones
1. Publish canonical docs (brief, architecture, migration runbook).
2. Bootstrap monorepo and baseline tooling.
3. Build API skeleton with modular boundaries.
4. Implement first relational schema and run migration.
5. Add cache abstraction and in-memory adapter.
6. Scaffold mobile app feature boundaries.
7. Scaffold web admin panel feature boundaries.

## Non-Goals for MVP
- Full billing/invoicing automation
- Insurance workflows
- Complex dynamic pricing engine
- Separate database per tenant

## Success Criteria
- New tenant and branch can be created safely.
- Staff can manage schedules and reservations.
- Reservations are isolated by tenant and auditable.
- Migration command can build schema from scratch.
- Cache layer can be switched to Redis with minimal code change.
