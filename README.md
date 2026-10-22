# Still With You

Private family memory PWA - a platform for families to preserve and share memories across generations.

## Project Structure

```
still-with-you/
├── apps/
│   ├── api/          # Fastify backend API
│   ├── web/          # React+Vite PWA (Thai-only)
│   └── worker/       # Background worker for async tasks
├── packages/
│   └── contracts/    # Shared TypeScript types and Zod schemas
├── supabase/         # Database migrations and config
└── docs/            # Documentation
```

## Tech Stack

- **Backend:** TypeScript, Fastify, Drizzle ORM, PostgreSQL
- **Frontend:** React, Vite, TypeScript, Tailwind v4, shadcn/ui, PWA
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Infrastructure:** Docker, Caddy (automatic HTTPS), GitHub Actions

## Features

### Implemented (v0.4)

- ✅ JWT authentication via Supabase JWKS
- ✅ Role-based access control (admin/member)
- ✅ Family creation with automatic admin assignment
- ✅ Member invitation and role management (admin only)
- ✅ Last admin protection (cannot remove/demote last admin)
- ✅ Marketing consent tracking with audit logging
- ✅ RLS enabled on all tables (API uses privileged role)
- ✅ Private storage bucket
- ✅ CORS allowlist
- ✅ Rate limiting

### Stubbed (TODO)

- Event management (CRUD, archive, 7-day permanent delete, family steward)
- Contribution management (create, edit, trash, restore, purge)
- Media uploads with signed URLs
- Trash management
- Notifications
- Worker implementation (outbox processing, blob cleanup)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker (optional, for local Supabase)
- Supabase CLI (for local development)

### Installation

```bash
# Install dependencies
pnpm install

# Start local Supabase
pnpm db:start

# Apply migrations
pnpm db:reset
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (keep secret!)
- `DATABASE_URL` - PostgreSQL connection string (app / local Supabase)
- `TEST_DATABASE_URL` - Dedicated `swy_test` database for tests (never `postgres` or a hosted URL)

### Development

```bash
# Start API development server
cd apps/api
pnpm dev

# Start worker (stub)
cd apps/worker
pnpm dev

# Start web (see apps/web/README.md)
cp apps/web/.env.example apps/web/.env
pnpm --filter @still-with-you/web dev
```

### Testing

Tests connect only to a dedicated `swy_test` database (via `TEST_DATABASE_URL`) and refuse to run against `postgres` or any hosted Supabase URL.

```bash
# After `pnpm db:start`, create the test database once and apply migrations:
psql postgresql://postgres:postgres@localhost:54322/postgres -c "CREATE DATABASE swy_test;"
for f in supabase/migrations/*.sql; do
  psql postgresql://postgres:postgres@localhost:54322/swy_test -f "$f"
done

# Run all tests (requires TEST_DATABASE_URL, see .env.example)
pnpm test

# Run tests for specific package
pnpm --filter @still-with-you/api test
```

### Building

```bash
# Build all packages and apps
pnpm build

# Build Docker images
docker-compose build
```

### Deployment

```bash
# Run with Docker Compose
docker-compose up -d
```

The API will be available at the domain specified in `DOMAIN` env var, with automatic HTTPS via Caddy.

The web PWA is built for Cloudflare Pages. Build settings, `VITE_*` env vars, and the SPA fallback are documented in [apps/web/README.md](apps/web/README.md).

## Database Schema

See [docs/backend-contract-v0.4.md](docs/backend-contract-v0.4.md) for the complete API contract and database schema.

### Key Tables

- `account` - User accounts (from Supabase Auth)
- `family` - Family groups
- `family_member` - Members with roles (admin/member)
- `person` - People in family tree
- `event` - Memory events
- `contribution` - Stories and photos
- `blob` - File storage references with ref counting
- `audit_log` - Audit trail (no content stored)

## API Endpoints

All endpoints require `Authorization: Bearer <token>` except `/health`.

### Account
- `GET /v1/me` - Get current account
- `PATCH /v1/me/consent` - Update marketing consent

### Family
- `GET /v1/families` - List families the caller belongs to
- `POST /v1/families` - Create family
- `GET /v1/families/:fid` - Get family
- `POST /v1/families/:fid/invites` - Invite member (admin only)
- `PATCH /v1/families/:fid/members/:aid` - Update member role (admin only)
- `DELETE /v1/families/:fid/members/:aid` - Remove member (admin only)

### Events
- `POST /v1/families/:fid/events` — `story` required
- `GET /v1/families/:fid/events`
- `GET /v1/events/:id`
- `PATCH /v1/events/:id` — creator or steward
- `POST /v1/events/:id/archive` — creator or steward; sets `archived_at`
- `POST /v1/events/:id/unarchive` — restore (`archived_at` null)
- `POST /v1/events/:id/delete` — confirm `ลบเรื่องนี้`, archived ≥ 7 days

### Contributions
- `POST /v1/events/:id/contributions`
- `PATCH /v1/contributions/:id`
- `POST /v1/contributions/:id/trash`
- `POST /v1/contributions/:id/restore`
- `DELETE /v1/contributions/:id`

## Security

- JWT verification via Supabase JWKS
- RLS enabled on all tables (no direct access)
- Private storage bucket (signed URLs only)
- CORS allowlist (`WEB_ORIGIN` comma-separated origins, no `*`)
- Rate limiting
- Audit logging (no content stored)
- Encrypted backups (30-day retention after purge)

## Contributing

This is a private family project. Please coordinate with the team before making changes.

## License

Private - All rights reserved
