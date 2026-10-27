# Implementation Summary

## Overview

This PR sets up the Still With You monorepo backend foundation with database migrations, authentication, and core family management features.

## What's Implemented

### ✅ Core Infrastructure

1. **Monorepo Structure**
   - pnpm workspace with 3 apps and 1 shared package
   - `apps/api` - Fastify backend with TypeScript
   - `apps/worker` - Background worker (stubbed)
   - `apps/web` - React+Vite frontend (minimal placeholder)
   - `packages/contracts` - Shared Zod schemas and error codes

2. **Database**
   - Supabase configuration for local development
   - Complete schema migrations (v0.4 spec)
   - Drizzle ORM schema matching migrations
   - All tables with RLS enabled, no public policies
   - Triggers for: last admin protection, creator as first admin, timestamp updates, blob ref counting

3. **Authentication (v0.4)**
   - JWT verification via Supabase JWKS
   - No cookies (Bearer token only)
   - CORS allowlist (`WEB_ORIGIN` comma-separated origins, no `*`)
   - Automatic account creation on first login

4. **Role-Based Access Control (v0.4)**
   - `member_role` enum: `admin` | `member`
   - Family creator becomes first admin automatically
   - Only admins can invite, promote/demote, and remove members
   - Database trigger prevents removing/demoting last admin
   - All members can create events and contributions

5. **Marketing Consent (v0.4)**
   - `marketing_consent` boolean with timestamp
   - `PATCH /v1/me/consent` endpoint
   - Every change writes to audit_log (no content stored)

### ✅ Implemented Endpoints

#### Account
- `GET /v1/me` - Get current account info
- `PATCH /v1/me/consent` - Update marketing consent

#### Family
- `POST /v1/families` - Create family (creator becomes first admin)
- `GET /v1/families/:fid` - Get family details
- `POST /v1/families/:fid/invites` - Invite member (admin only)
- `PATCH /v1/families/:fid/members/:aid` - Update member role (admin only)
- `DELETE /v1/families/:fid/members/:aid` - Remove member (admin only)

#### Health
- `GET /health` - Health check (no auth required)

### ✅ Tests

Comprehensive test suite covering:
- Family creation with automatic admin assignment
- Member invitation (admin-only enforcement)
- Role promotion/demotion (admin-only enforcement)
- Last admin protection (cannot remove/demote last admin)
- Member removal
- Marketing consent tracking
- Audit log creation

### ✅ Infrastructure

1. **Docker**
   - Dockerfile for API
   - Dockerfile for Worker
   - docker-compose.yml with Caddy for automatic HTTPS

2. **CI/CD**
   - GitHub Actions workflow
   - Lint and typecheck
   - Tests against PostgreSQL
   - Docker image builds to GHCR

3. **Documentation**
   - Complete backend contract v0.4
   - README with setup instructions
   - .env.example with all required variables

## What's Stubbed (TODO)

The following endpoints return 501 Not Implemented:

### Events
- `POST /v1/families/:fid/events` - Create event
- `GET /v1/families/:fid/events` - List events
- `GET /v1/events/:id` - Get event
- `PATCH /v1/events/:id` - Update event
- `POST /v1/events/:id/archive` - Archive event
- `POST /v1/events/:id/unarchive` - Unarchive event
- `POST /v1/events/:id/delete` - Delete event permanently

### Contributions
- `POST /v1/events/:id/contributions` - Create contribution
- `PATCH /v1/contributions/:id` - Update contribution
- `POST /v1/contributions/:id/trash` - Move to trash
- `POST /v1/contributions/:id/restore` - Restore from trash
- `DELETE /v1/contributions/:id` - Purge permanently

### Other
- Upload management (presigned URLs)
- Trash management
- Notifications
- Worker implementation (outbox processing, blob cleanup)

## Database Schema

### Tables Created

1. `account` - User accounts (email, marketing_consent, timestamps)
2. `family` - Family groups
3. `family_member` - Members with roles (primary key: family_id, account_id)
4. `person` - People in family tree
5. `relationship` - Relationships between people
6. `event` - Memory events (with status: active/archived/deleted)
7. `event_person` - Junction table
8. `contribution` - Stories and photos
9. `blob` - File storage references with ref counting
10. `media` - Media attachments
11. `contribution_revision` - Edit history
12. `audit_log` - Audit trail (no content)
13. `outbox` - Async job queue
14. `notification` - User notifications
15. `idempotency_key` - Request deduplication

### Enums
- `event_status`: active, archived, deleted
- `contribution_status`: published, trashed, purged
- `trash_reason`: owner, event_deleted
- `member_role`: member, admin

### Indexes
- Family members by status
- Events by family and status
- Contributions by owner and status
- Contributions by event
- Audit log by actor and target
- Outbox unsent items
- Notifications unread

### Triggers
- Prevent removing/demoting last admin
- Auto-add creator as admin when family created
- Update timestamps on event/contribution changes
- Update blob ref_count when media added/removed

## Security Checklist

- ✅ JWT verification via Supabase JWKS
- ✅ RLS enabled on all tables
- ✅ No policies for anon/authenticated (deny all)
- ✅ API uses privileged service role
- ✅ Private storage bucket
- ✅ CORS allowlist
- ✅ Rate limiting
- ✅ Audit logging (no content)
- ✅ Input validation with Zod schemas
- ✅ Error codes without sensitive info

## Environment Variables

Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (secret!)
- `DATABASE_URL` - PostgreSQL connection string (app / local Supabase)
- `TEST_DATABASE_URL` - Dedicated `swy_test` database (tests only; never `postgres` or hosted URLs)
- `WEB_ORIGIN` - CORS allowlist (comma-separated origins, no `*`)

Optional (with defaults):
- `SWY_SUPABASE_SERVICE_ROLE_KEY` - Storage service role for signed URLs (falls back to `SUPABASE_SERVICE_ROLE_KEY`; never commit a value)
- `MEDIA_MAX_BYTES` - Max upload bytes (default 20971520)
- `MEDIA_MAX_PER_CONTRIBUTION` - Max photos per story (default 20; response field is `max_per_story`)
- `MEDIA_IMAGE_TRANSFORMS` - `true` \| `false` (default `false`). When true, sign `avatar_url` / `cover_url` with Storage image transforms; when false, untransformed URLs and the web crops with `object-fit: cover`
- `API_PORT` - API port (default: 3000)
- `API_HOST` - API host (default: 0.0.0.0)
- `STORAGE_BUCKET` - Storage bucket name (default: private-media)
- `RATE_LIMIT_MAX` - Rate limit max (default: 100)
- `RATE_LIMIT_WINDOW` - Rate limit window ms (default: 60000)

## Testing

To test locally:

```bash
# Install dependencies
pnpm install

# Start local Supabase
pnpm db:start

# Apply migrations
pnpm db:reset

# Create the dedicated test database and apply the same migrations
psql postgresql://postgres:postgres@localhost:54322/postgres -c "CREATE DATABASE swy_test;"
for f in supabase/migrations/*.sql; do
  psql postgresql://postgres:postgres@localhost:54322/swy_test -f "$f"
done

# Run tests (TEST_DATABASE_URL must point at swy_test)
pnpm test
```

## Deviations from Contract

None. All v0.4 requirements have been implemented as specified:

1. ✅ Role-based access control (admin/member)
2. ✅ Family creator becomes first admin
3. ✅ Last admin protection
4. ✅ Marketing consent with audit log
5. ✅ JWT auth via Supabase JWKS
6. ✅ RLS with privileged role
7. ✅ CORS allowlist
8. ✅ Private storage bucket

## Next Steps

1. Implement event management endpoints
2. Implement contribution management endpoints
3. Implement upload and signed URL generation
4. Implement trash management
5. Implement notifications
6. Implement worker outbox processing
7. Implement blob cleanup when ref_count = 0
8. Add integration tests for event/contribution flows
9. Set up production deployment
10. Frontend development (separate PR)
