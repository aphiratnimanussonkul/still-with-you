# Still With You — Backend Contract v0.4

**Updated:** Oct 21, 2026  
**Changes from v0.3:** Role-based permissions, marketing consent, JWT auth via Supabase JWKS, RLS with privileged role  
**References:** Domain Model v0.4 (Kret), Requirements v1.1

## 1. Core Principles

- PostgreSQL with UUID v7 for IDs, `timestamptz` (UTC) for timestamps
- Use `story` field naming throughout DB and API (D5)
- Authorization checked at backend for every request: must be active FamilyMember first, then check permission matrix and role
- Row Level Security (RLS) enabled on all tables with NO policies for anon/authenticated (deny all) - API uses privileged role
- Private storage bucket with signed URLs (5 min expiry)
- 404 for cross-family or archived event access; 403 FORBIDDEN when resource exists but action not permitted

## 2. Schema Changes (v0.4)

### 2.1 New Role System

```sql
-- family_members now has role enum
create type member_role as enum ('member', 'admin');

alter table family_member add column role member_role not null default 'member';

-- Family creator becomes first admin automatically (trigger)
-- Only admins can invite members and promote/demote admins
-- At least one admin must exist at all times (enforced by trigger)
-- All members can create events and contributions
```

### 2.2 Marketing Consent

```sql
alter table account add column email text unique;
alter table account add column marketing_consent boolean not null default false;
alter table account add column marketing_consent_at timestamptz;

-- Email comes from Google login
-- PATCH /v1/me/consent to change marketing_consent
-- Every change writes to audit_log (no content stored)
```

### 2.3 Authentication Changes

- **No cookies** - Frontend sends `Authorization: Bearer <supabase_access_token>`
- API verifies JWT via Supabase JWKS endpoint: `https://{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
- SUPABASE_URL is configurable via environment variable
- CORS allowlist: only the web origin (env-configurable, dev: `http://localhost:5173`)

### 2.4 Row Level Security

- RLS **enabled** on every table
- **NO policies** for `anon` or `authenticated` roles (deny all)
- API connects using a **privileged service role** and is the only entry point
- Storage bucket is **private** (no direct access from frontend)

## 3. Complete Schema (DDL)

```sql
-- Enums
create type event_status as enum ('active','archived','deleted');
create type contribution_status as enum ('published','trashed','purged');
create type media_status as enum ('attached');
create type trash_reason as enum ('owner','event_deleted');
create type member_role as enum ('member', 'admin');

-- Core tables
create table account (
  id uuid primary key default gen_random_uuid(),
  auth_id text unique not null,
  email text unique,
  display_name text not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table family (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references account(id),
  created_at timestamptz not null default now()
);

create table family_member (
  family_id uuid references family(id),
  account_id uuid references account(id),
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (family_id, account_id)
);

create table person (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family(id),
  display_name text not null,
  birth_date date,
  death_date date,
  account_id uuid unique references account(id)
);

create table relationship (
  family_id uuid not null references family(id),
  from_person_id uuid not null references person(id),
  to_person_id uuid not null references person(id),
  type text not null,
  primary key (from_person_id, to_person_id, type)
);

create table event (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family(id),
  creator_account_id uuid not null references account(id),
  title text,
  description text,
  occurred_from date,
  occurred_to date,
  date_precision text,
  location text,
  status event_status not null default 'active',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (status <> 'deleted' or (title is null and description is null and location is null)),
  check (status = 'deleted' or (title is not null and length(btrim(title)) > 0))
);

create table event_person (
  event_id uuid references event(id),
  person_id uuid references person(id),
  primary key (event_id, person_id)
);

create table contribution (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family(id),
  owner_account_id uuid not null references account(id),
  narrator_person_id uuid references person(id),
  event_id uuid references event(id) on delete set null,
  origin_event_id uuid not null references event(id),
  origin_event_title_snapshot text,
  story text check (status = 'purged' or (story is not null and length(btrim(story)) > 0)),
  status contribution_status not null default 'published',
  trashed_at timestamptz,
  trash_reason trash_reason,
  derived_from_contribution_id uuid references contribution(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on contribution (owner_account_id, status);
create index on contribution (event_id) where status = 'published';

create table blob (
  id uuid primary key default gen_random_uuid(),
  storage_key text unique not null,
  mime text not null,
  size_bytes bigint not null,
  sha256 text not null,
  ref_count int not null default 0 check (ref_count >= 0),
  created_at timestamptz not null default now()
);

create table media (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references contribution(id),
  blob_id uuid not null references blob(id),
  blurred_blob_id uuid references blob(id),
  taken_by_person_id uuid references person(id),
  sort_order int not null
);

create table contribution_revision (
  contribution_id uuid references contribution(id) on delete cascade,
  version int,
  story text not null,
  edited_by uuid not null references account(id),
  edited_at timestamptz not null default now(),
  primary key (contribution_id, version)
);

create table audit_log (
  id bigserial primary key,
  actor_account_id uuid references account(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  at timestamptz not null default now()
);

create table outbox (
  id bigserial primary key,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table notification (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id),
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table idempotency_key (
  account_id uuid not null references account(id),
  key text not null,
  response jsonb,
  created_at timestamptz default now(),
  primary key (account_id, key)
);

-- Trigger to prevent demoting/removing last admin
-- Trigger to make family creator first admin
-- (Implementation in migration files)
```

## 4. API Endpoints (REST, JSON, prefix `/v1`)

**Auth:** `Authorization: Bearer <supabase_access_token>` on all endpoints  
**Idempotency:** Mutations that create data require `Idempotency-Key` header

### 4.1 Account & Consent (NEW in v0.4)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/v1/me` | Authenticated | Get current account info |
| PATCH | `/v1/me/consent` | Authenticated | Update marketing_consent; writes audit_log |

```json
// PATCH /v1/me/consent
{
  "marketing_consent": true
}
```

### 4.2 Family & Members (NEW in v0.4)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/v1/families` | Authenticated | Create family (creator becomes first admin) |
| GET | `/v1/families/{fid}` | Family member | Get family details |
| POST | `/v1/families/{fid}/invites` | Admin only | Invite new member (403 if not admin) |
| PATCH | `/v1/families/{fid}/members/{aid}` | Admin only | Promote/demote member role (403 if not admin) |
| DELETE | `/v1/families/{fid}/members/{aid}` | Admin only | Remove member (cannot remove last admin) |

```json
// POST /v1/families/{fid}/invites
{
  "email": "user@example.com"
}

// PATCH /v1/families/{fid}/members/{aid}
{
  "role": "admin"  // or "member"
}
```

### 4.3 Events

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/families/{fid}/events` | Member | Create new or from trash with `source_contribution_ids` |
| GET | `/families/{fid}/events?cursor=` | Member | Only active + archived owned events |
| GET | `/events/{id}` | Per matrix | Archived: 404 for non-creator |
| PATCH | `/events/{id}` | Creator | Requires `If-Match: <version>` |
| POST | `/events/{id}/archive` | Creator | active → archived |
| POST | `/events/{id}/unarchive` | Creator | archived → active |
| POST | `/events/{id}/delete` | Creator | Requires `{ "confirm_text": "<event_title>" }`, only when archived |

### 4.4 Contributions

| Method | Path | Notes |
|--------|------|-------|
| POST | `/events/{id}/contributions` | `{ story, narrator_person_id?, media_upload_ids? }`, event must be active |
| PATCH | `/contributions/{id}` | Owner only, `If-Match: <version>`, stores revision |
| POST | `/contributions/{id}/trash` | Owner only, event active |
| POST | `/contributions/{id}/restore` | Owner only, origin active |
| DELETE | `/contributions/{id}` | Purge (owner only, works in any origin status) |

### 4.5 Uploads

1. `POST /v1/uploads` with `{ mime, size_bytes, sha256 }` → `{ upload_id, put_url }`
2. Client uploads to storage directly (presigned URL, 10 min expiry)
3. Attach with `media_upload_ids` when creating/editing contribution

Accepted: JPEG, PNG, HEIC, WebP up to 20MB, max 20 photos per contribution

### 4.6 Trash

```http
GET /v1/me/trash?origin_event_id=&cursor=
```

Returns contributions owned by current user, with visibility rules based on origin event status.

### 4.7 Notifications

```http
GET /v1/me/notifications
POST /v1/notifications/{id}/read
```

## 5. Error Format

```json
{
  "error": {
    "code": "STORY_REQUIRED",
    "message": "Story text is required and cannot be empty",
    "field": "story"
  }
}
```

### Error Codes

| HTTP | Code | When |
|------|------|------|
| 400 | `STORY_REQUIRED` | Story empty or whitespace only |
| 400 | `CONFIRM_TEXT_MISMATCH` | Confirmation text doesn't match |
| 400 | `MIXED_ORIGIN_EVENTS` | Selected contributions from different origin events |
| 400 | `FILE_TYPE_NOT_ALLOWED` / `TOO_MANY_PHOTOS` | File validation failed |
| 401 | `UNAUTHENTICATED` | Token expired or invalid |
| 403 | `FORBIDDEN` | Resource exists but action not permitted |
| 403 | `ADMIN_REQUIRED` | Action requires admin role |
| 403 | `CANNOT_REMOVE_LAST_ADMIN` | Cannot remove/demote the last admin |
| 404 | `NOT_FOUND` | Resource doesn't exist or user can't see it |
| 409 | `EVENT_NOT_ACTIVE` | Event must be active for this operation |
| 409 | `EVENT_NOT_ARCHIVED` | Event must be archived before deletion |
| 409 | `SOURCE_ARCHIVED` | Cannot restore when origin is archived |
| 409 | `SOURCE_NOT_DELETED` | Cannot create event from contributions whose origin isn't deleted |
| 409 | `VERSION_CONFLICT` | Someone else edited first (If-Match mismatch) |
| 413 | `FILE_TOO_LARGE` | Upload exceeds size limit |
| 429 | `RATE_LIMITED` | Too many requests |

## 6. Security Checklist

- ✅ JWT validation via Supabase JWKS (configurable SUPABASE_URL)
- ✅ Access tokens (15 min) + refresh tokens (rotate, httpOnly cookie for PWA)
- ✅ Rate limiting per account and IP, especially for uploads and deletes
- ✅ Audit log for archive, delete, purge, consent changes (no content stored)
- ✅ Input validation with zod schemas
- ✅ RLS enabled on all tables, no policies for anon/authenticated
- ✅ API uses privileged service role only
- ✅ Private storage bucket, no direct frontend access
- ✅ CORS allowlist (only WEB_ORIGIN)
- ✅ Encrypted backups, 30-day retention after purge

## 7. Permission Matrix (v0.4)

All requests must be from an active FamilyMember.

| Action | Creator | Owner | Other member | Non-admin |
|--------|---------|-------|--------------|-----------|
| Create event | ✅ | ✅ | ✅ | ✅ |
| View active event | ✅ | ✅ | ✅ | ✅ |
| View archived event | ✅ | ❌ | ❌ | ❌ |
| Edit event fields | ✅ | ❌ | ❌ | ❌ |
| Archive/unarchive event | ✅ | ❌ | ❌ | ❌ |
| Delete event permanently | ✅ (archived + confirm) | ❌ | ❌ | ❌ |
| Add contribution | ✅ (if active) | ✅ (if active) | ✅ (if active) | ✅ (if active) |
| Edit/trash own contribution | ✅ | ✅ | ❌ | ✅ |
| Restore own contribution | ✅ | ✅ | ❌ | ✅ |
| Purge own contribution | ✅ | ✅ | ❌ | ✅ |
| View own trash | ✅ | ✅ | ❌ | ✅ |
| Create event from trash | ✅ (own items) | ✅ (own items) | ❌ | ✅ |
| **Invite members** | **Admin only** | N/A | N/A | **403** |
| **Promote/demote admin** | **Admin only** | N/A | N/A | **403** |
| **Remove member** | **Admin only** | N/A | N/A | **403** |

## 8. Environment Variables

```bash
# Supabase
SUPABASE_URL=https://hazkqphgdkklsvkrhubg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
SUPABASE_ANON_KEY=sb_publishable_TODq1gSkK5bu8InyIJRtVQ_vB7u8zsZ

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# CORS
WEB_ORIGIN=http://localhost:5173

# API
API_PORT=3000
API_HOST=0.0.0.0

# Storage
STORAGE_BUCKET=private-media

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Session/JWT
JWT_ISSUER=${SUPABASE_URL}/auth/v1
JWKS_URI=${SUPABASE_URL}/auth/v1/.well-known/jwks.json
```

## 9. Changes Summary (v0.3 → v0.4)

### Added
- Role-based access control (admin/member)
- Family creator automatically becomes first admin
- Admin-only endpoints for invites and role management
- Last admin protection (trigger)
- Marketing consent tracking with audit log
- JWT authentication via Supabase JWKS
- RLS with NO policies (API uses privileged role only)
- CORS allowlist configuration
- Email field on accounts (from Google OAuth)

### Changed
- Authentication: No cookies, Bearer tokens only
- Authorization: Role checks on invite/member management
- Storage: Private bucket (no direct access)
- Database: RLS enabled everywhere, deny-all policies

### Removed
- Cookie-based authentication
- Direct frontend access to storage
- Public/anon database access
