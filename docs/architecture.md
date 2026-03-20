# Architecture Overview (v1)

## Platform Style
- Multi-tenant SaaS (shared schema)
- `tenant_id` based data isolation
- Modular monolith backend (NestJS modules)
- Mobile-first clients (React Native)
- Web admin clients (React + Vite)

## Backend Modules
- `auth`: identity and token lifecycle
- `tenant`: tenant lifecycle and settings
- `branch`: franchise and branch hierarchy
- `staff`: user/staff profile and workload data
- `service-catalog`: services, durations, prices
- `appointment`: booking lifecycle and status flow
- `prisma`: database client and lifecycle hooks
- `cache`: cache abstraction and adapter wiring

## Request Guards
- Tenant context middleware reads `x-tenant-id`.
- Public exceptions: `/` and `/health`.
- Tenant-scoped routes reject missing tenant header.

## Data Boundaries
- Core data is shared for beauty and health domains.
- Vertical-specific fields should be added via extension tables.
- Every tenant-owned table contains `tenant_id`.

## Cache Design
- `CachePort` defines adapter contract.
- `MemoryCacheAdapter` is default adapter.
- Service layer consumes cache through dependency injection.
- Invalidation happens on write/update events.
