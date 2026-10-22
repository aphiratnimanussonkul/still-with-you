# Still With You — Backend Contract v0.4

**Updated:** Oct 22, 2026  
**Changes from v0.3:** Role-based permissions, marketing consent, JWT auth via Supabase JWKS, RLS with privileged role  
**Requirements v1.2 (AC-19..AC-27):** family steward, `archived_at` / `deletable_at`, 7-day permanent delete, `canManageEvent`, owner-only stories  
**References:** Domain Model v0.4 (Kret), Requirements v1.1 / v1.2

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
-- family_members.role = 'admin' is the family steward. No separate table.
create type member_role as enum ('member', 'admin');

alter table family_members add column role member_role not null default 'member';

-- Family creator becomes first steward (admin) automatically (trigger)
-- Only stewards can invite members and promote/demote stewards
-- Last-steward rules (LAST_ADMIN 409) unchanged
-- All members can create events and contributions
-- Stewards or the event creator may edit/archive/restore/permanently delete events (canManageEvent)
```

### 2.2 Marketing Consent

```sql
alter table accounts add column email text unique;
alter table accounts add column marketing_consent boolean not null default false;
alter table accounts add column marketing_consent_at timestamptz;
alter table accounts add column if not exists consent_answered_at timestamptz;

-- Email comes from Google login
-- PATCH /v1/me/consent records the answer (true or false)
-- marketing_consent_at is the time the boolean last changed (stays null if the first answer is the default false)
-- consent_answered_at is set once, on the first PATCH, and is the first-use gate
-- Every change of marketing_consent writes to audit_log (no content stored)
```

### 2.3 Authentication Changes

- **No cookies** - Frontend sends `Authorization: Bearer <supabase_access_token>`
- API verifies JWT via Supabase JWKS endpoint: `https://{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
- SUPABASE_URL is configurable via environment variable
- CORS allowlist: `WEB_ORIGIN` comma-separated browser origins (env-configurable, no `*`; dev default: `http://localhost:5173`)

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

-- Core tables (plural names as in the live schema)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  auth_id text unique not null,
  email text unique,
  display_name text not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  consent_answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references accounts(id),
  created_at timestamptz not null default now()
);

create table family_members (
  family_id uuid references families(id),
  account_id uuid references accounts(id),
  role member_role not null default 'member', -- admin = family steward
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (family_id, account_id)
);

create table people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  display_name text not null,
  birth_date date,
  death_date date,
  account_id uuid unique references accounts(id)
);

create table relationships (
  family_id uuid not null references families(id),
  from_person_id uuid not null references people(id),
  to_person_id uuid not null references people(id),
  type text not null,
  primary key (from_person_id, to_person_id, type)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  creator_account_id uuid not null references accounts(id),
  title text,
  description text,
  occurred_from date,
  occurred_to date,
  date_precision text,
  location text,
  status event_status not null default 'active',
  archived_at timestamptz, -- set to now() on every archive (re-archive overwrites); null on restore
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (status <> 'deleted' or (title is null and description is null and location is null)),
  check (status = 'deleted' or (title is not null and length(btrim(title)) > 0))
);

create table event_people (
  event_id uuid references events(id),
  person_id uuid references people(id),
  primary key (event_id, person_id)
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  owner_account_id uuid not null references accounts(id),
  narrator_person_id uuid references people(id),
  event_id uuid references events(id) on delete set null,
  origin_event_id uuid not null references events(id),
  origin_event_title_snapshot text,
  story text check (status = 'purged' or (story is not null and length(btrim(story)) > 0)),
  status contribution_status not null default 'published',
  trashed_at timestamptz,
  trash_reason trash_reason,
  derived_from_contribution_id uuid references contributions(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on contributions (owner_account_id, status);
create index on contributions (event_id) where status = 'published';

create table blobs (
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
  contribution_id uuid not null references contributions(id),
  blob_id uuid not null references blobs(id),
  blurred_blob_id uuid references blobs(id),
  taken_by_person_id uuid references people(id),
  sort_order int not null
);

create table contribution_revisions (
  contribution_id uuid references contributions(id) on delete cascade,
  version int,
  story text not null,
  edited_by uuid not null references accounts(id),
  edited_at timestamptz not null default now(),
  primary key (contribution_id, version)
);

create table audit_log (
  id bigserial primary key,
  actor_account_id uuid references accounts(id),
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

create table notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table idempotency_keys (
  account_id uuid not null references accounts(id),
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
| PATCH | `/v1/me/consent` | Authenticated | Record marketing consent answer (true or false); writes audit_log when the boolean changes |

```json
// PATCH /v1/me/consent
{ "marketing_consent": true }

// 200 — GET /v1/me and PATCH /v1/me/consent
{
  "id": "…",
  "email": "user@example.com",
  "display_name": "…",
  "marketing_consent": false,
  "marketing_consent_at": null,
  "consent_answered_at": "2026-10-22T00:00:00.000Z",
  "created_at": "2026-10-01T00:00:00.000Z"
}
```

`consent_answered_at` is null until the account has submitted PATCH `/v1/me/consent` (any boolean). First-use / the `/consent` gate is `consent_answered_at === null`, not `marketing_consent_at`. Declining (`false` when the default is already `false`) still stamps `consent_answered_at`. `marketing_consent_at` remains the time the boolean last changed.

### 4.2 Family & Members (NEW in v0.4)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/v1/families` | Authenticated | Create family (creator becomes first admin) |
| GET | `/v1/families/{fid}` | Family member | Get family details |
| POST | `/v1/families/{fid}/invites` | Admin only | Invite new member (403 if not admin) |
| PATCH | `/v1/families/{fid}/members/{aid}` | Steward only | Same as `/role` |
| PATCH | `/v1/families/{id}/members/{accountId}/role` | Steward only | Change role (AC-25). Self-demote allowed |
| DELETE | `/v1/families/{fid}/members/{aid}` | Steward only | Remove member (cannot remove last admin) |

```json
// POST /v1/families/{fid}/invites
{
  "email": "user@example.com"
}

// PATCH /v1/families/{id}/members/{accountId}/role
{ "role": "admin" }  // or "member"

// 200
{
  "account_id": "…",
  "family_id": "…",
  "role": "admin",
  "display_name": "…",
  "joined_at": "2026-10-22T00:00:00.000Z"
}
```

Role-change errors: **403 FORBIDDEN** (caller is not an admin/steward), **404 NOT_FOUND** (family or member missing), **409 LAST_ADMIN** (would leave the family with no steward). Self-demote is allowed when another steward remains.

### 4.3 Events

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/families/{fid}/events` | Member | Atomic create: event + first contribution + `event_people` + audit. **`story` required**. `person_ids` must belong to the family |
| GET | `/families/{fid}/events?cursor=` | Member | Active for all members; archived only for creator or steward |
| GET | `/events/{id}` | Per matrix | Archived: 404 unless creator or steward |
| PATCH | `/events/{id}` | `canManageEvent` | Core fields and `person_ids` (replace `event_people` in the same transaction). Every `person_id` must belong to the event's family |
| POST | `/events/{id}/archive` | `canManageEvent` | Sets `archived_at = now()` (re-archive overwrites). No auto-delete job |
| POST | `/events/{id}/unarchive` | `canManageEvent` | Restore: `status=active`, `archived_at=null` |
| POST | `/events/{id}/delete` | `canManageEvent` | Permanent delete (AC-19). Confirm text exactly `ลบเรื่องนี้` after trim |

Event responses include `archived_at` and `deletable_at` (`archived_at + 7 days`, ISO 8601 UTC). Both are `null` when the event is not archived.

```json
// POST /events/{id}/delete
{ "confirm_text": "ลบเรื่องนี้" }

// 403 NOT_YET_DELETABLE — caller can manage, but not archived or cooling not elapsed
{
  "error": {
    "code": "NOT_YET_DELETABLE",
    "message": "Event can be permanently deleted only after it has been archived for 7 days",
    "details": {
      "archived_at": "2026-10-01T00:00:00.000Z",
      "deletable_at": "2026-10-08T00:00:00.000Z"
    }
  }
}
```

Permission is checked first. Permanent delete then **claims** the row inside a transaction with the database clock:

```sql
UPDATE events SET … WHERE id = $1 AND status = 'archived' AND archived_at <= now() - interval '7 days' RETURNING *
```

No row claimed → **403 NOT_YET_DELETABLE** (re-read `archived_at` / `deletable_at`). Contributions are moved to trash only after a successful claim.

Permanent delete errors (AC-19):
1. Caller is neither creator nor steward → **403 FORBIDDEN** (no dates)
2. Caller can manage, but the claim fails (not archived, or `archived_at` less than 7 days ago, or a concurrent restore) → **403 NOT_YET_DELETABLE** with `error.details.archived_at` and `error.details.deletable_at` (`deletable_at` is `null` if not archived)
3. Confirm text is not exactly `ลบเรื่องนี้` after trim → **400 CONFIRM_TEXT_MISMATCH**

`person_ids` that are not in the family → **400 INVALID_INPUT** with `field: "person_ids"` (no separate error code).

### 4.4 Contributions

| Method | Path | Notes |
|--------|------|-------|
| POST | `/events/{id}/contributions` | **`story` required** (AC-27). Event must be active. Video out of scope |
| PATCH | `/contributions/{id}` | **Owner only** (AC-24). Steward cannot edit others' stories/media |
| POST | `/contributions/{id}/trash` | Owner only |
| POST | `/contributions/{id}/restore` | Owner only, origin not archived |
| DELETE | `/contributions/{id}` | Purge (owner only). Steward cannot delete others' contributions |

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
| 400 | `STORY_REQUIRED` | Story empty or whitespace only on create event or add-contribution (AC-27) |
| 400 | `CONFIRM_TEXT_MISMATCH` | Confirmation text is not exactly `ลบเรื่องนี้` after trim |
| 400 | `MIXED_ORIGIN_EVENTS` | Selected contributions from different origin events |
| 400 | `INVALID_INPUT` | Validation failed. `person_ids` not in the family uses `field: "person_ids"` |
| 400 | `FILE_TYPE_NOT_ALLOWED` / `TOO_MANY_PHOTOS` | File validation failed |
| 401 | `UNAUTHENTICATED` | Token expired or invalid |
| 403 | `FORBIDDEN` | Action not permitted (including role change when caller is not a steward). Permanent delete: caller is neither creator nor steward (no dates) |
| 403 | `NOT_YET_DELETABLE` | Caller can manage the event, but the transactional claim failed (not archived, cooling not elapsed, or concurrent restore). `error.details` has `archived_at` and `deletable_at` |
| 404 | `NOT_FOUND` | Resource doesn't exist or user can't see it |
| 409 | `LAST_ADMIN` | Cannot remove/demote last admin when other members exist |
| 409 | `EVENT_NOT_ACTIVE` | Event must be active for this operation |
| 409 | `EVENT_NOT_ARCHIVED` | Event must be archived before deletion |
| 409 | `SOURCE_ARCHIVED` | Cannot restore when origin is archived |
| 409 | `SOURCE_NOT_DELETED` | Cannot create event from contributions whose origin isn't deleted |
| 409 | `VERSION_CONFLICT` | Someone else edited first (If-Match mismatch) |
| 413 | `FILE_TOO_LARGE` | Upload exceeds size limit |
| 429 | `RATE_LIMITED` | Too many requests |

## 6. Security Checklist

- ✅ JWT validation via Supabase JWKS (configurable SUPABASE_URL)
- ✅ Access tokens via `Authorization: Bearer <supabase_access_token>` only (no cookies)
- ✅ Rate limiting per account and IP, especially for uploads and deletes
- ✅ Audit log for archive, delete, purge, consent changes (no content stored)
- ✅ Input validation with zod schemas
- ✅ RLS enabled on all tables, no policies for anon/authenticated
- ✅ API uses privileged service role only
- ✅ Private storage bucket, no direct frontend access
- ✅ CORS allowlist (`WEB_ORIGIN` comma-separated origins, no `*`)
- ✅ Encrypted backups, 30-day retention after purge

## 7. Permission Matrix (v0.4)

All requests must be from an active FamilyMember.

`canManageEvent` = event creator **OR** family steward (`family_members.role = 'admin'`). Used for editing core fields, archive, restore, and permanent delete (AC-23, AC-26).

| Action | Creator | Steward (admin) | Owner | Other member |
|--------|---------|-----------------|-------|--------------|
| Create event | ✅ | ✅ | ✅ | ✅ |
| View active event | ✅ | ✅ | ✅ | ✅ |
| View archived event | ✅ | ✅ | ❌ | ❌ |
| Edit event fields | ✅ `canManageEvent` | ✅ `canManageEvent` | ❌ | ❌ |
| Archive / restore event | ✅ | ✅ | ❌ | ❌ |
| Delete event permanently | ✅ after 7 days + `ลบเรื่องนี้`; else 403 `NOT_YET_DELETABLE` | ✅ same | ❌ | ❌ 403 `FORBIDDEN` (no dates) |
| Add contribution | ✅ (if active, story required) | ✅ | ✅ | ✅ |
| Edit/trash/purge contribution | own only | **cannot edit/delete others'** (AC-24) | own only | ❌ |
| **Invite / change role / remove** | if steward | ✅; last-admin → 409 | N/A | 403 |

## 8. Environment Variables

```bash
# Supabase
SUPABASE_URL=https://hazkqphgdkklsvkrhubg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
SUPABASE_ANON_KEY=sb_publishable_TODq1gSkK5bu8InyIJRtVQ_vB7u8zsZ

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# Tests — dedicated database only
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/swy_test

# CORS — comma-separated origin allowlist (no "*")
WEB_ORIGIN=http://localhost:5173,https://stillwithyou.nimanussonkul.work,https://still-with-you-5b1.pages.dev

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

## 9. Changes Summary (v0.3 → v0.4 / requirements v1.2)

### Added
- Role-based access control: `admin` is the family steward (no new table)
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
