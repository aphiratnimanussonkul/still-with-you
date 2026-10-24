# Still With You — Backend Contract v0.8

**Updated:** Oct 22, 2026  
**Status:** Canonical spec.  
**Supersedes:** [v0.7](./backend-contract-v0.7.md). **[v0.6](./backend-contract-v0.6.md) is cancelled** (never deployed; do not use `/quick-question` or `/persons/{id}/answers`).  
**Changes from v0.7:** family-tree people profile (gender, birth date + precision, computed age, bio, avatar); `person_relationships`; person PATCH/DELETE; steward person invites; GET people returns `{ people, relationships }`; public invite preview; invite create `url`; people events list; in-app notifications (`contribution_added`, `invite_accepted`)  
**Requirements v1.2 (AC-19..AC-27):** family steward, `archived_at` / `deletable_at`, 7-day permanent delete, `canManageEvent`, owner-only stories  
**References:** Domain Model v0.4 (Kret), Requirements v1.1 / v1.2, Kret media contract v0.5, Kret focus + quick questions spec, Kret family-tree decisions (locked 22 Oct 2026)

### Locked decisions (Kret, 22 Oct 2026)

These override earlier drafts of this revision. Implementers must follow this table, not prior chat wording.

| Topic | Decision |
|-------|----------|
| Gender | `female` \| `male` \| `other`, or JSON `null` (not specified). No other values. |
| Self-link | **400 `INVALID_RELATIONSHIP`**. There is **no** `SELF_RELATIONSHIP` code. |
| Parent cycle | **400 `INVALID_RELATIONSHIP`** (same code as self-link). A person cannot be a parent of their own ancestor. |
| Duplicate relationship | **409 `RELATIONSHIP_EXISTS`**. |
| Age | Not stored. API returns a computed integer `age` in `Asia/Bangkok` (or `null` when there is no `birth_date`). Year-precision age is labelled approximate **in the web only**; the API still returns that integer. |
| Invites | `POST /v1/people/{id}/invites` (steward only). Do **not** add `person_id` to family invite bodies. Create **201** includes `url = {first WEB_ORIGIN}/invites/{token}`. Store only a hash of the token; return the url once. `GET /v1/invites/{token}` is public (secret token, never id). `POST /v1/invites/{token}/accept` body `{}`, login required, single use, 7-day expiry; **200** `{ family_id, person_id }`. Expired, used, revoked, or unknown → **410 `INVITE_INVALID`**. Already-linked person → **409 `PERSON_ALREADY_LINKED`**. |
| People events | `GET /v1/people/{id}/events?cursor=` — family members only. Same visibility as `GET /v1/families/{id}/events` (archived visible only to the creator and the steward). |
| `birth_date_precision` | `'day'` \| `'year'`, default `'day'` (approved). Year-only dates are stored as `YYYY-01-01`. |
| Same-family edges | `person_relationships` uses composite FKs `(person_id, family_id)` and `(related_person_id, family_id)` → `people(id, family_id)` (requires unique `(id, family_id)` on `people`). |
| `avatar_media_id` | Must be `purpose = 'avatar'`, same family, and completed (`uploaded` or `ready`). Not completed → **409 `MEDIA_NOT_READY`**. Wrong purpose or family → **422 `UPLOAD_MISMATCH`** (existing media-mismatch 422; not a new code). |

## 1. Core Principles

- PostgreSQL with UUID v7 for IDs, `timestamptz` (UTC) for timestamps
- Use `story` field naming throughout DB and API (D5)
- Authorization checked at backend for every request: must be active FamilyMember first, then check permission matrix and role. Exception: `GET /v1/invites/{token}` is unauthenticated (the token is the secret) and is rate-limited per IP
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
- CORS allowlist: `WEB_ORIGIN` comma-separated browser origins (env-configurable, no `*`; dev default: `http://localhost:5173`). The **first** origin is also used for invite URLs: `{WEB_ORIGIN}/invites/{token}`

### 2.4 Row Level Security

- RLS **enabled** on every table
- **NO policies** for `anon` or `authenticated` roles (deny all)
- API connects using a **privileged service role** and is the only entry point
- Storage bucket is **private** (no direct access from frontend)

### 2.5 Family tree (NEW in v0.8)

- `people` is the family-tree node: `display_name` required; `family_name`, `gender`, `birth_date`, `bio`, `avatar_media_id`, `relation_label` optional
- `gender` is `female` \| `male` \| `other` or SQL/JSON `null` (not specified)
- Age is **not a column**. The API computes integer `age` in `Asia/Bangkok`
- `person_relationships` stores only `parent` and `spouse`. Children, siblings, and grandparents are derived
- The unused generic `relationships` table from v0.7 is replaced by `person_relationships`. The API never exposed the old table
- Person invites are `POST /v1/people/{id}/invites`. Family invites stay `{ email }` only
- Soft-deleted people keep stories/memories (name still shown; person link is not navigable). Live `person_facts` for that person are removed

## 3. Complete Schema (DDL)

```sql
-- Enums
create type event_status as enum ('active','archived','deleted');
create type contribution_status as enum ('published','trashed','purged');
create type media_status as enum ('pending','uploaded','ready','failed');
create type trash_reason as enum ('owner','event_deleted');
create type member_role as enum ('member', 'admin');
create type question_answer_type as enum ('text', 'choice');
create type person_gender as enum ('female', 'male', 'other');
create type birth_date_precision as enum ('day', 'year');
create type relationship_type as enum ('parent', 'spouse');
create type media_purpose as enum ('story', 'avatar');

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
  family_name text,
  relation_label text, -- display label (e.g. ยาย); not a graph edge
  gender person_gender, -- null = not specified
  birth_date date,
  birth_date_precision birth_date_precision not null default 'day',
  death_date date,
  bio text, -- <= 2000 characters after trim
  avatar_media_id uuid, -- FK added after media
  account_id uuid references accounts(id), -- nullable; linked login
  created_by_account_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz -- soft delete
);

-- One live linked account per family. The same account may link in another family.
create unique index people_family_account_live
  on people (family_id, account_id)
  where account_id is not null and deleted_at is null;

-- Composite unique so other tables can FK both id and family_id (same pattern as focus_people / person_facts).
create unique index people_id_family_id_key on people (id, family_id);

-- Stored edges only. Children / siblings / grandparents are derived.
-- Both ends must belong to the same family: composite FKs, not person-id-only FKs.
create table person_relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  person_id uuid not null,
  related_person_id uuid not null,
  type relationship_type not null,
  created_by_account_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  unique (person_id, related_person_id, type),
  check (person_id <> related_person_id),
  foreign key (person_id, family_id) references people(id, family_id),
  foreign key (related_person_id, family_id) references people(id, family_id)
);

-- parent: person_id is a parent of related_person_id (directed)
-- spouse: undirected; store one row per pair (canonical person_id < related_person_id)
-- no self-link (check person_id <> related_person_id)
-- the v0.7 generic `relationships` table is unused and is dropped/replaced in the v0.8 migration

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
  family_id uuid not null references families(id),
  uploader_account_id uuid not null references accounts(id),
  story_id uuid references contributions(id) on delete set null, -- null for avatars
  person_id uuid references people(id), -- set when purpose = avatar is attached
  purpose media_purpose not null default 'story',
  storage_key text unique not null, -- {family_id}/{media_id}
  content_type text not null,
  size_bytes bigint not null,
  width int,
  height int,
  thumb_key text,
  status media_status not null default 'pending',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table people
  add constraint people_avatar_media_id_fkey
  foreign key (avatar_media_id) references media(id);

-- At most one live avatar attached per person
create unique index media_person_avatar_live
  on media (person_id)
  where purpose = 'avatar' and deleted_at is null and person_id is not null;

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

create table invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  email text not null,
  role member_role not null default 'member',
  invited_by uuid not null references accounts(id),
  person_id uuid references people(id), -- set for person invites; null for family invites
  status text not null default 'pending',
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table focus_people (
  account_id uuid not null references accounts(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  position int not null,
  created_at timestamptz not null default now(),
  primary key (account_id, family_id, person_id),
  foreign key (person_id, family_id) references people(id, family_id) on delete cascade
);

create table question_bank (
  id uuid primary key,
  key text not null unique,
  text_th text not null,
  category text not null,
  answer_type question_answer_type not null default 'text',
  choices jsonb,
  active boolean not null default true,
  sort int not null
);

create table person_facts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  question_id uuid not null references question_bank(id),
  author_account_id uuid not null references accounts(id) on delete cascade,
  answer_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index uq_person_facts_live
  on person_facts (person_id, question_id, author_account_id)
  where deleted_at is null;

create table question_skips (
  account_id uuid not null references accounts(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  question_id uuid not null references question_bank(id),
  skipped_at timestamptz not null default now(),
  primary key (account_id, person_id, question_id)
);

-- Trigger to prevent demoting/removing last admin
-- Trigger to make family creator first admin
-- (Implementation in migration files)
```

## 4. API Endpoints (REST, JSON)

**Auth:** `Authorization: Bearer <supabase_access_token>` on every path except `GET /health`  
**Idempotency:** Mutations that create data require `Idempotency-Key` header  
**Unknown route:** authenticated request to a path that is not registered → **404** `{ "error": { "code": "NOT_FOUND", "message": "Route not found" } }`

v0.6 paths **`/quick-question`** and **`/persons/{id}/answers`** are not implemented. Use `/v1/families/{id}/home`, `/v1/families/{id}/focus`, `/v1/people/{id}/facts`, `/v1/people/{id}/facts/skip`, `/v1/facts/{id}`.

`GET /health` (no `/v1` prefix, no auth) returns `{ "status": "ok", "timestamp": "…" }`.

### 4.0 Route catalog

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | No auth |
| GET | `/v1/me` | Current account |
| PATCH | `/v1/me/consent` | Marketing consent |
| GET | `/v1/me/trash` | Caller's restorable trashed stories |
| GET | `/v1/me/notifications` | Caller's notifications (`?cursor=`), `{ notifications, next_cursor, unread_count }` |
| POST | `/v1/notifications/{id}/read` | Mark one notification read (owner only; others **404**) |
| DELETE | `/v1/me` | Account deletion |
| GET | `/v1/families` | Families the caller belongs to |
| POST | `/v1/families` | Create family; creator is first steward |
| GET | `/v1/families/{id}` | Family details |
| GET | `/v1/families/{id}/members` | Active members `{ members: […] }` |
| PATCH | `/v1/families/{id}/members/{accountId}` | Steward role change |
| PATCH | `/v1/families/{id}/members/{accountId}/role` | Same as above |
| DELETE | `/v1/families/{id}/members/{accountId}` | Remove member |
| POST | `/v1/families/{id}/leave` | Leave family |
| POST | `/v1/families/{id}/invites` | Steward family invite `{ email }` only — no `person_id`. **201** includes `url` |
| GET | `/v1/families/{id}/invites` | Pending invites (steward) |
| GET | `/v1/invites/{token}` | Public preview (no login). Secret token, never id |
| POST | `/v1/invites/{token}/accept` | Accept invite. Body `{}`. Login required. **200** `{ family_id, person_id }` |
| DELETE | `/v1/invites/{id}` | Revoke invite |
| GET | `/v1/families/{id}/people` | `{ people: […], relationships: […] }` (v0.8 adds `relationships`) |
| POST | `/v1/families/{id}/people` | Create person (`{ person, relationship }`) |
| GET | `/v1/people/{id}` | One person (member of that family) |
| PATCH | `/v1/people/{id}` | Update person |
| DELETE | `/v1/people/{id}` | Soft-delete person |
| POST | `/v1/people/{id}/invites` | Steward person invite. **201** includes `url` |
| GET | `/v1/people/{id}/events` | Events linked to this person (`?cursor=`). Family members only |
| POST | `/v1/families/{id}/relationships` | Create `parent` or `spouse` |
| DELETE | `/v1/relationships/{id}` | Delete a stored edge |
| POST | `/v1/families/{id}/events` | Create event + first story |
| GET | `/v1/families/{id}/events` | List events |
| GET | `/v1/events/{id}` | Event |
| PATCH | `/v1/events/{id}` | `canManageEvent` |
| POST | `/v1/events/{id}/archive` | `canManageEvent` |
| POST | `/v1/events/{id}/unarchive` | `canManageEvent` |
| POST | `/v1/events/{id}/delete` | Permanent delete |
| GET | `/v1/events/{id}/contributions` | Published stories on the event |
| POST | `/v1/events/{id}/contributions` | Add story |
| GET | `/v1/contributions/{id}` | One story |
| PATCH | `/v1/contributions/{id}` | Owner only |
| POST | `/v1/contributions/{id}/trash` | Owner only |
| POST | `/v1/contributions/{id}/restore` | Owner only |
| DELETE | `/v1/contributions/{id}` | Purge (owner only) |
| POST | `/v1/families/{id}/media/uploads` | Signed upload; optional `purpose: "avatar"` |
| POST | `/v1/media/{id}/complete` | Complete upload |
| GET | `/v1/families/{id}/focus` | `{ items: […] }` |
| PUT | `/v1/families/{id}/focus` | `{ person_ids: [] }` |
| GET | `/v1/families/{id}/home` | `{ focus, quick_question, recent_memories }` |
| POST | `/v1/people/{id}/facts` | Create answer |
| POST | `/v1/people/{id}/facts/skip` | **204** |
| GET | `/v1/people/{id}/facts` | `{ groups: […] }` |
| PATCH | `/v1/facts/{id}` | Author only |
| DELETE | `/v1/facts/{id}` | Author or steward |

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
| GET | `/v1/families` | Authenticated | Families the caller currently belongs to `{ families: […] }` |
| POST | `/v1/families` | Authenticated | Create family (creator becomes first admin) |
| GET | `/v1/families/{fid}` | Family member | Get family details |
| GET | `/v1/families/{fid}/members` | Family member | `{ members: [{ account_id, family_id, role, display_name, joined_at }] }`. Non-member → **404 NOT_FOUND** |
| POST | `/v1/families/{fid}/invites` | Admin only | Invite new member (403 if not admin). Body `{ email }` only — do **not** send `person_id`. To invite someone onto a tree person, use `POST /v1/people/{id}/invites`. **201** includes `url = {first WEB_ORIGIN}/invites/{token}`. Store only `token_hash`. 7-day expiry |
| GET | `/v1/families/{fid}/invites` | Admin only | Pending invites |
| GET | `/v1/invites/{token}` | **No login** | Public preview. Path uses the secret token, never the invite id. Response `{ family_name, inviter_display_name, person_display_name, expires_at }` only (`person_display_name` is `null` for family invites). Per-IP rate limit (`INVITE_PREVIEW_RATE_LIMIT_MAX`). Expired, used, revoked, or unknown → **410 `INVITE_INVALID`** |
| POST | `/v1/invites/{token}/accept` | Invitee (login, email match) | Body `{}`. Single use, 7-day expiry. **200** `{ family_id, person_id }` (`person_id` is `null` for family invites). Expired, used, revoked, unknown, or email mismatch → **410 `INVITE_INVALID`**. Already-linked person → **409 `PERSON_ALREADY_LINKED`** |
| PATCH | `/v1/families/{fid}/members/{aid}` | Steward only | Same as `/role` |
| PATCH | `/v1/families/{id}/members/{accountId}/role` | Steward only | Change role (AC-25). Self-demote allowed |
| DELETE | `/v1/families/{fid}/members/{aid}` | Steward only | Remove member (cannot remove last admin) |
| POST | `/v1/families/{fid}/leave` | Family member | Leave (or delete family if sole member) |

```json
// POST /v1/families/{fid}/invites
{
  "email": "user@example.com"
}

// 201
{
  "id": "…",
  "email": "user@example.com",
  "url": "http://localhost:5173/invites/…",
  "expires_at": "2026-10-29T00:00:00.000Z"
}

// GET /v1/invites/{token} — 200 (no Authorization)
{
  "family_name": "บ้านเรา",
  "inviter_display_name": "Steward",
  "person_display_name": null,
  "expires_at": "2026-10-29T00:00:00.000Z"
}

// POST /v1/invites/{token}/accept
{}

// 200
{
  "family_id": "…",
  "person_id": null
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
| POST | `/families/{fid}/events` | Member | Atomic create: event + first contribution + `event_people` + audit. **`story` required**. Optional `media_ids`. `person_ids` must belong to the family |
| GET | `/families/{fid}/events?cursor=` | Member | Active for all members; archived only for creator or steward |
| GET | `/people/{id}/events?cursor=` | Member of that person's family | Events linked via `event_people`. Same archived visibility as family events. `{ events, next_cursor }` |
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

### 4.3b People (family tree — NEW in v0.8)

Any **active family member** may create a person. The **creator** (`created_by_account_id`) or a **steward** may edit or soft-delete. A **linked account** (`people.account_id` = caller) may edit their own profile (not delete it). Soft-deleted people are omitted from list/get (person link is not navigable). Stories and memories that mention them are kept and still show the name. Live `person_facts` for that person are removed. `focus_people` rows for that person are removed. Stored `person_relationships` rows that include that person are removed.

`relation_label` remains an optional display string (e.g. ยาย). It is **not** a graph edge.

#### Person object

`age` is computed, never stored. Timezone is **`Asia/Bangkok`**.

- Living (`is_living = true`):
  - No `birth_date` → `age` is `null`
  - `birth_date_precision = 'day'` → whole years from `birth_date` to today in Bangkok
  - `birth_date_precision = 'year'` → whole years using calendar year only (stored date is `YYYY-01-01`). The API still returns that integer. The **web** labels it as approximate; the API does **not** add an `approximate` flag
- Deceased (`is_living = false`): `age` is age at death when both `birth_date` and `death_date` are set; otherwise `null`
- Future `birth_date` (Bangkok today) is rejected on write

`invite_status` is computed, not stored:

| Value | When |
|-------|------|
| `linked` | `account_id` is not null |
| `pending` | `account_id` is null and a pending person-invite exists for this person |
| `none` | otherwise |

```json
{
  "id": "…",
  "family_id": "…",
  "display_name": "ยายสมศรี",
  "name": "ยายสมศรี",
  "family_name": "นิมานัส",
  "relation_label": "ยาย",
  "gender": "female",
  "birth_date": "1942-01-01",
  "birth_date_precision": "year",
  "is_living": true,
  "death_date": null,
  "death_date_precision": null,
  "age": 84,
  "bio": "ชอบทำขนมไทย",
  "avatar_media_id": "…",
  "avatar_url": "https://…",
  "account_id": null,
  "invite_status": "none",
  "created_by_account_id": "…",
  "created_at": "2026-10-22T00:00:00.000Z",
  "updated_at": "2026-10-22T00:00:00.000Z",
  "deleted_at": null
}
```

`name` is the same string as `display_name` (v0.7 alias, kept so the current web client keeps working). `gender` is `"female"` \| `"male"` \| `"other"` or `null`. `avatar_url` is a signed read URL (5 min) or `null`. Soft-deleted rows are never returned.

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/v1/families/{id}/people` | Member | `{ "people": […], "relationships": […] }`. Live people only, `display_name` ascending. Non-member or missing family → **404 NOT_FOUND** |
| POST | `/v1/families/{id}/people` | Member | Create. **201** `{ "person": …, "relationship": … \| null }` |
| GET | `/v1/people/{id}` | Member of that family | Same person object. Missing, other family, or soft-deleted → **404 NOT_FOUND** |
| GET | `/v1/people/{id}/events?cursor=` | Member of that family | Events linked via `event_people`. Active for all members; archived only for the event creator or steward (same as `GET /v1/families/{id}/events`). `{ events, next_cursor }`. Missing / other family / soft-deleted person → **404 NOT_FOUND** |
| PATCH | `/v1/people/{id}` | Creator, steward, or linked account | Partial update. **200** person |
| DELETE | `/v1/people/{id}` | Creator or steward | Soft-delete (`deleted_at = now()`). **204**. Linked person (`account_id` not null) → **409 PERSON_LINKED** |

```json
// POST /v1/families/{id}/people
{
  "display_name": "ยายสมศรี",
  "family_name": "นิมานัส",
  "relation_label": "ยาย",
  "gender": "female",
  "birth_date": "1942-01-01",
  "birth_date_precision": "year",
  "is_living": true,
  "death_date": null,
  "death_date_precision": null,
  "relation_label": "ยาย",
  "bio": "ชอบทำขนมไทย",
  "avatar_media_id": null,
  "relationship": { "kind": "parent_of", "person_id": "…" }
}

// PATCH /v1/people/{id} — all fields optional
{
  "display_name": "ยายสมศรี",
  "family_name": "นิมานัส",
  "relation_label": "ยาย",
  "gender": null,
  "birth_date": "1942-03-12",
  "birth_date_precision": "day",
  "is_living": false,
  "death_date": "2020-01-01",
  "death_date_precision": "year",
  "bio": "…",
  "avatar_media_id": "…"
}
```

Create still accepts v0.7 `{ "name": "…" }` as an alias of `display_name`. Response always includes both.

Validation:

- Missing/blank `display_name` (or `name`) → **400 `NAME_REQUIRED`** with `field` matching the key the client sent (`display_name` or `name`)
- `gender` not `female` \| `male` \| `other` \| `null` → **400 `INVALID_INPUT`** `field: "gender"`
- `birth_date` in the future (Asia/Bangkok) → **400 `INVALID_BIRTH_DATE`** `field: "birth_date"`
- If `death_date` is set, `is_living` must be `false`; `death_date` must be `>= birth_date` and `<=` today (Asia/Bangkok); `death_date_precision` is required iff `death_date` is set (`null` otherwise). Deceased may omit `death_date`. Otherwise **400 `INVALID_DEATH_DATE`**
- Optional inline `relationship: { kind: parent_of \| child_of \| spouse_of, person_id }` on create maps to a `person_relationships` `parent` / `spouse` row in the same transaction (failure rolls back the person). Errors reuse **400 `INVALID_RELATIONSHIP`** / **409 `RELATIONSHIP_EXISTS`**
- `birth_date_precision` not `day` \| `year` → **400 `INVALID_INPUT`** `field: "birth_date_precision"`
- Year-only: client may send `birth_date` as `YYYY-01-01` or `YYYY`; stored as `YYYY-01-01` with `birth_date_precision = 'year'`
- `bio` longer than 2000 after trim → **400 `INVALID_INPUT`** `field: "bio"`
- `avatar_media_id` (optional; `null` clears). The media row must have `purpose = 'avatar'`, belong to the same family, and be completed (`status` is `uploaded` or `ready`). Limit **1** live avatar per person (replace detaches/soft-deletes the previous). Errors reuse existing media codes:
  - not completed (`pending` / `failed`) → **409 `MEDIA_NOT_READY`** with `details.media_ids: [avatar_media_id]`
  - wrong `purpose` or different family → **422 `UPLOAD_MISMATCH`** `field: "avatar_media_id"`
  - unknown / deleted / attached to another person → **400 `INVALID_INPUT`** `field: "avatar_media_id"`

### 4.3c Relationships (NEW in v0.8)

Stored types are **`parent`** and **`spouse`** only. Children = reverse of `parent`. Siblings = other children of the same parent. Grandparents = parents of parents. Do not store those as rows.

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/v1/families/{id}/relationships` | Member | Both people must be live in this family. **201** relationship |
| DELETE | `/v1/relationships/{id}` | Steward, or the member who created the edge | **204**. Missing / other family → **404 NOT_FOUND** |

`GET /v1/families/{id}/people` includes the family's live edges:

```json
{
  "people": [ { "id": "…", "display_name": "…", "name": "…", "gender": "female", "age": 84 } ],
  "relationships": [
    {
      "id": "…",
      "family_id": "…",
      "person_id": "…",
      "related_person_id": "…",
      "type": "parent",
      "created_by_account_id": "…",
      "created_at": "2026-10-22T00:00:00.000Z"
    }
  ]
}
```

Each element of `people` is the person object in §4.3b. `relationships` lists live stored edges only (`parent` and `spouse`).

```json
// POST /v1/families/{id}/relationships
// parent: person_id is a parent of related_person_id
// spouse: undirected; server stores one row with person_id < related_person_id
{
  "person_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "related_person_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "type": "parent"
}
```

Relationship errors (locked):

| Case | HTTP | Code |
|------|------|------|
| `person_id` = `related_person_id` (self-link, any type) | **400** | `INVALID_RELATIONSHIP` |
| Parent cycle: a person cannot be a parent of their own ancestor | **400** | `INVALID_RELATIONSHIP` |
| Same stored edge already exists, including the reverse spouse pair | **409** | `RELATIONSHIP_EXISTS` |
| `type` not `parent` \| `spouse` | **400** | `INVALID_INPUT` `field: "type"` |
| Either person missing, soft-deleted, or not in this family | **400** | `INVALID_INPUT` `field: "person_id"` or `"related_person_id"` |

There is **no** `SELF_RELATIONSHIP` code. Self-link and cycle share `INVALID_RELATIONSHIP`.

Example envelopes:

```json
// 400 — self-link or parent cycle
{
  "error": {
    "code": "INVALID_RELATIONSHIP",
    "message": "This relationship is not allowed"
  }
}

// 409 — duplicate
{
  "error": {
    "code": "RELATIONSHIP_EXISTS",
    "message": "This relationship already exists"
  }
}
```

Parent-cycle check: inserting `parent` (`person_id` P, `related_person_id` C) is rejected when C is already an ancestor of P (walking `parent` edges from P reaches C), including the two-cycle where C is already a parent of P.

### 4.3d Person invites (NEW in v0.8)

Family invites stay `POST /v1/families/{id}/invites` `{ "email" }` — **no** `person_id` on that body. Linking a login to a tree person is a separate steward-only route.

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/v1/people/{id}/invites` | Steward | Body `{ "email" }`. Person must be live and unlinked. **201** includes `person_id` and `url = {first WEB_ORIGIN}/invites/{token}`. Store only `token_hash`; return the url once. 7-day expiry |
| GET | `/v1/invites/{token}` | **No login** | Same public preview as family invites. `person_display_name` is the tree person's `display_name` |
| POST | `/v1/invites/{token}/accept` | Invitee (login, email match) | Body `{}`. Single use. When `invites.person_id` is set, the same transaction sets `people.account_id` if it is still null. **200** `{ family_id, person_id }` |

```json
// POST /v1/people/{id}/invites
{ "email": "user@example.com" }

// 201
{
  "id": "…",
  "family_id": "…",
  "person_id": "…",
  "email": "user@example.com",
  "status": "pending",
  "url": "http://localhost:5173/invites/…",
  "expires_at": "2026-11-05T00:00:00.000Z",
  "created_at": "2026-10-22T00:00:00.000Z"
}

// GET /v1/invites/{token} — 200 (no Authorization)
{
  "family_name": "บ้านเรา",
  "inviter_display_name": "Steward",
  "person_display_name": "ยาย",
  "expires_at": "2026-11-05T00:00:00.000Z"
}

// POST /v1/invites/{token}/accept
{}

// 200
{
  "family_id": "…",
  "person_id": "…"
}
```

Accept (one transaction):

1. Mark the invite accepted (email match, pending, not expired). Otherwise **410 `INVITE_INVALID`**
2. If `person_id` is set and that person is live with `account_id` null → set `people.account_id` to the accepting account (partial unique `(family_id, account_id)` must hold)
3. Add the account as a family member if not already an active member
4. Return `{ family_id, person_id }` (`person_id` is `null` for family invites)

Person-invite errors:

| Case | HTTP | Code |
|------|------|------|
| Caller is not a steward | **403** | `FORBIDDEN` |
| Person missing / other family | **404** | `NOT_FOUND` |
| Expired, used, revoked, unknown token, or email mismatch (preview or accept) | **410** | `INVITE_INVALID` |
| Person is soft-deleted (invite create, preview, or accept) | **410** | `INVITE_INVALID` |
| Person already has `account_id` (create, or accept when already linked to this or another account) | **409** | `PERSON_ALREADY_LINKED` |
| Accept would attach a second live person in this family to the same account | **409** | `PERSON_ALREADY_LINKED` |

```json
// 409
{
  "error": {
    "code": "PERSON_ALREADY_LINKED",
    "message": "This person is already linked to an account"
  }
}

// 410
{
  "error": {
    "code": "INVITE_INVALID",
    "message": "This invite is no longer valid"
  }
}

// 409 — DELETE /v1/people/{id} while account_id is set
{
  "error": {
    "code": "PERSON_LINKED",
    "message": "A linked person cannot be deleted"
  }
}
```

### 4.4 Contributions

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/events/{id}/contributions` | Event must exist and not be deleted. Caller must be an active family member; else **404 NOT_FOUND**. `{ contributions: […] }` using the contribution response (including `owner_display_name` and `media[]` with signed read URLs). Excludes `trashed`/`purged`. Order `created_at` ascending |
| POST | `/v1/events/{id}/contributions` | **`story` required** (AC-27). Optional `media_ids`. Event must be active. Video out of scope |
| GET | `/v1/contributions/{id}` | Member. Includes `media[]` with signed read URLs (5 min) when the story is published and the origin event is not archived |
| PATCH | `/v1/contributions/{id}` | **Owner only** (AC-24). Optional `media_ids` replaces the set; omitted ids are detached and soft-deleted |
| POST | `/v1/contributions/{id}/trash` | Owner only. Media stays attached but URLs are not issued |
| POST | `/v1/contributions/{id}/restore` | Owner only, origin not archived |
| DELETE | `/v1/contributions/{id}` | Purge (owner only). Deletes media rows and storage objects |

Story create/update `media_ids` (uuid[], default `[]`):
- Every id must be the same family, `purpose = 'story'` (not an avatar), `uploader_account_id` == story author, status `uploaded` or `ready`, and not attached to another story
- Unknown / foreign / avatar → **400 INVALID_INPUT** `field: "media_ids"`
- Not `uploaded`/`ready` → **409 MEDIA_NOT_READY** with `details.media_ids`
- More than `MEDIA_MAX_PER_CONTRIBUTION` (default 20) → **422 TOO_MANY_PHOTOS**

Reads: each story includes `media: [{ id, status, url, thumb_url, width, height, expires_at }]`. Signed read URLs (5 min) are issued only after confirming the requester is a current family member. `thumb_url` is null until status is `ready`. Trashed stories and archived events get no URLs.

### 4.5 Uploads

Config: `MEDIA_MAX_BYTES` default **20971520** (20MB), `MEDIA_MAX_PER_CONTRIBUTION` default **20**. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`. Private bucket `private-media`. Server uses `SWY_SUPABASE_SERVICE_ROLE_KEY`.

```http
POST /v1/families/{id}/media/uploads
{ "content_type": "image/jpeg", "size_bytes": 12345 }

201
{
  "media_id": "…",
  "upload_url": "https://…",   // signed PUT, 10 minutes
  "expires_at": "…",
  "max_bytes": 20971520,
  "max_per_story": 20
}
```

Optional `purpose` (v0.8): `"story"` (default) or `"avatar"`. Avatar uploads use the same types/size limits, are **not** attached to a story (`story_id` stays null), and are attached by `avatar_media_id` on create/PATCH person. Limit **1** live avatar per person.

```http
POST /v1/families/{id}/media/uploads
{ "content_type": "image/jpeg", "size_bytes": 12345, "purpose": "avatar" }
```

Caller must be a family member. **415 UNSUPPORTED_TYPE**, **413 FILE_TOO_LARGE**. Unknown `purpose` → **400 INVALID_INPUT** `field: "purpose"`. Row is created with status `pending`.

```http
POST /v1/media/{media_id}/complete
```

Uploader only. Server reads the object, checks actual size `== size_bytes` and `<= MEDIA_MAX_BYTES`, and detects type via magic bytes (does not trust `Content-Type`). Mismatch → delete object, status `failed`, **422 UPLOAD_MISMATCH**. Success → status `uploaded` and enqueue a worker job to strip EXIF/GPS (re-encode) and write a thumbnail, then status `ready`.

Worker also deletes `pending`/`uploaded` rows with `story_id` null and `person_id` null older than 24 hours (storage objects included), including unattached avatars. Permanent story purge and event permanent delete delete media rows and storage objects.

### 4.6 Trash

```http
GET /v1/me/trash
```

Authenticated. Returns the caller's **own** `trashed` contributions that can still be restored: still an active member of that family, and the origin event is not `archived` (`POST /contributions/{id}/restore` would otherwise return **409 SOURCE_ARCHIVED**). Newest `trashed_at` first. Contributions have no restore-deadline column; none is returned.

```json
{
  "items": [
    {
      "id": "…",
      "story": "เรื่องที่ย้ายไปถังขยะ",
      "origin_event_title": "วันเกิดยาย",
      "family_name": "บ้านคุณยาย",
      "family_id": "…",
      "trashed_at": "2026-10-12T00:00:00.000Z"
    }
  ]
}
```

`POST /v1/contributions/{id}/restore` remains owner-only.

### 4.7 Notifications

In-app notifications. Rows live in `notifications` (`account_id`, `type`, `payload jsonb`, `created_at`, `read_at`). The table already exists (RLS on; `anon`/`authenticated` revoked). List uses `?cursor=` (newest `created_at`, then `id`).

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/v1/me/notifications?cursor=` | Authenticated | **Only the caller's** rows **for families they still belong to**. Newest first. `{ notifications, next_cursor, unread_count }`. `unread_count` uses the same membership filter (total unread, not the page size) |
| POST | `/v1/notifications/{id}/read` | Owner | Idempotent. **200** `{ id, type, payload, created_at, read_at }`. Already-read returns the same `read_at`. Missing, **non-uuid `{id}`**, or **another account's** notification → **404 `NOT_FOUND`** (not 403, never 500) |

```json
// GET /v1/me/notifications
{
  "notifications": [
    {
      "id": "…",
      "type": "contribution_added",
      "payload": {
        "actor_display_name": "Member",
        "event_title": "วันเกิดยาย",
        "event_id": "…",
        "family_id": "…"
      },
      "created_at": "2026-10-22T00:00:00.000Z",
      "read_at": null
    },
    {
      "id": "…",
      "type": "invite_accepted",
      "payload": {
        "actor_display_name": "Invitee",
        "family_name": "บ้านนิมานัส",
        "family_id": "…",
        "person_id": null,
        "person_display_name": null
      },
      "created_at": "2026-10-21T00:00:00.000Z",
      "read_at": null
    }
  ],
  "next_cursor": null,
  "unread_count": 2
}

// POST /v1/notifications/{id}/read — 200 (same item shape as GET)
{
  "id": "…",
  "type": "contribution_added",
  "payload": {
    "actor_display_name": "Member",
    "event_title": "วันเกิดยาย",
    "event_id": "…",
    "family_id": "…"
  },
  "created_at": "2026-10-22T00:00:00.000Z",
  "read_at": "2026-10-22T00:01:00.000Z"
}
```

Names are **snapshotted into `payload` at insert**. A later rename of the actor, event, family, or person does **not** change existing notifications. Do not insert if the recipient is not an **active** `family_members` row. List and `unread_count` omit notifications whose `payload.family_id` is a family the caller has left.

Types created by the API (keep this list small):

| `type` | When | GET `payload` |
|--------|------|----------------|
| `contribution_added` | Another member adds a contribution to an event you created. Creating an event (first story) does **not** notify. Self-contribute does **not** notify. Recipient must still be an active family member | `{ actor_display_name, event_title, event_id, family_id }` |
| `invite_accepted` | Someone accepts a family or person invite you sent. Recipient must still be an active family member | `{ actor_display_name, family_name, family_id, person_id, person_display_name }` (`person_id` / `person_display_name` are `null` when there is no person) |

### 4.8 Focus people (NEW in v0.5; canonical in v0.8)

Per-account, per-family. Max **10**. Empty set allowed. All routes require family membership → **403 FORBIDDEN**.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/families/{id}/focus` | `{ items: [{ person: { id, display_name }, photo_url, memory_count, position }] }`. `photo_url` is the person's avatar signed URL when one exists, otherwise `null`. `memory_count` is active (non-archived) events tagged with that person |
| PUT | `/v1/families/{id}/focus` | Body `{ person_ids: [] }` replaces the set. Array order becomes `position` (0-based). Duplicates or people not in the family → **400 INVALID_INPUT** `field: "person_ids"`. More than 10 → **422 TOO_MANY_FOCUS** |
| GET | `/v1/families/{id}/home` | `{ focus, quick_question, recent_memories }`. `recent_memories` is the latest 5 non-archived events in the family |

`quick_question` is `{ question_id, key, person: { id, display_name }, text }` or `null`. Picked among the caller's focus people, active questions, not already answered by the caller for that person, and not skipped by the caller in the last 30 days. `text` substitutes `{name}` / `{ชื่อ}` with the person's `display_name`. Null when there is no focus person or no eligible question.

### 4.9 Person facts / quick questions (NEW in v0.5; canonical in v0.8)

Seed: 20 questions from quick-questions-v0.1 (keys `q01`–`q20`, categories favorites / habits / skills / places / life / feelings). MVP `answer_type` is `text` only. Skipped questions are not re-offered for 30 days. All routes require family membership → **403 FORBIDDEN**.

Canonical paths (no `/quick-question`, no `/persons/{id}/answers`):

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/people/{id}/facts` | `{ question_id, answer_text }`. Trimmed empty/missing → **400 ANSWER_REQUIRED** `field: "answer_text"`. Unknown or inactive question → **400 INVALID_INPUT** `field: "question_id"` only. Duplicate live answer by the same author → **409 ALREADY_ANSWERED** with `error.details.fact_id`. **201** fact |
| POST | `/v1/people/{id}/facts/skip` | `{ question_id }` → **204**. Upserts `skipped_at` |
| GET | `/v1/people/{id}/facts` | `{ groups: [{ question: { id, key, text }, answers: [{ id, answer_text, author: { account_id, display_name }, created_at, updated_at, can_edit, can_delete }] }] }` |
| PATCH | `/v1/facts/{id}` | `{ answer_text }`. Empty/missing → **400 ANSWER_REQUIRED**. Author only; steward **cannot** edit → **403 FORBIDDEN** |
| DELETE | `/v1/facts/{id}` | Soft delete (`deleted_at`). Author **or** family steward → **204**. Other members → **403** |

`can_edit` is true only for the author. `can_delete` is true for the author or a family steward (`family_members.role = 'admin'`). Soft-deleted rows are omitted from GET and do not block a new answer (partial unique index).

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
| 400 | `INVALID_INPUT` | Validation failed. `person_ids` not in the family uses `field: "person_ids"`. Unknown/inactive question uses `field: "question_id"`. Invalid `gender`, `bio`, `birth_date_precision`, relationship `type`, media `purpose`, or unknown `avatar_media_id` use the corresponding `field` |
| 400 | `NAME_REQUIRED` | Person `display_name` (or v0.7 alias `name`) missing or whitespace-only. `field` is `display_name` or `name` |
| 400 | `INVALID_BIRTH_DATE` | `birth_date` is in the future (Asia/Bangkok). `field: "birth_date"` |
| 400 | `INVALID_DEATH_DATE` | `death_date` is set while living, is before `birth_date`, is in the future (Asia/Bangkok), or `death_date_precision` does not match whether `death_date` is set |
| 400 | `INVALID_RELATIONSHIP` | Self-link (`person_id` = `related_person_id`) **or** parent cycle (a person cannot be a parent of their own ancestor). **No** `SELF_RELATIONSHIP` code |
| 400 | `ANSWER_REQUIRED` | Fact `answer_text` missing or whitespace-only. `field: "answer_text"` |
| 400 | `FILE_TYPE_NOT_ALLOWED` | Legacy file validation |
| 409 | `MEDIA_NOT_READY` | `media_ids` or `avatar_media_id` not yet `uploaded`/`ready`. `details.media_ids` lists them |
| 413 | `FILE_TOO_LARGE` | Declared `size_bytes` exceeds `MEDIA_MAX_BYTES` |
| 415 | `UNSUPPORTED_TYPE` | `content_type` is not jpeg/png/webp/heic |
| 422 | `UPLOAD_MISMATCH` | Object missing, size mismatch, or magic-bytes type mismatch on complete. Also: `avatar_media_id` has the wrong `purpose` or belongs to another family (`field: "avatar_media_id"`) |
| 422 | `TOO_MANY_PHOTOS` | More than `MEDIA_MAX_PER_CONTRIBUTION` photos on a story |
| 422 | `TOO_MANY_FOCUS` | More than 10 focus people for this account in this family |
| 401 | `UNAUTHENTICATED` | Token expired or invalid |
| 403 | `FORBIDDEN` | Action not permitted (including role change when caller is not a steward). Permanent delete: caller is neither creator nor steward (no dates) |
| 403 | `NOT_YET_DELETABLE` | Caller can manage the event, but the transactional claim failed (not archived, cooling not elapsed, or concurrent restore). `error.details` has `archived_at` and `deletable_at` |
| 404 | `NOT_FOUND` | Resource doesn't exist or user can't see it. Unknown registered-prefix path uses `message: "Route not found"` |
| 409 | `LAST_ADMIN` | Cannot remove/demote last admin when other members exist |
| 409 | `ALREADY_ANSWERED` | Caller already has a live fact for this person + question. `error.details.fact_id` |
| 409 | `RELATIONSHIP_EXISTS` | Duplicate stored edge (including the reverse spouse pair) |
| 409 | `PERSON_LINKED` | Soft-delete refused because `people.account_id` is set |
| 409 | `PERSON_ALREADY_LINKED` | Person already has an account, or accept would link a second live person in this family to the same account |
| 410 | `INVITE_INVALID` | Invite expired, used, revoked, unknown, email mismatch, or person is soft-deleted (preview, create, or accept) |
| 409 | `EVENT_NOT_ACTIVE` | Event must be active for this operation |
| 409 | `EVENT_NOT_ARCHIVED` | Event must be archived before deletion |
| 409 | `SOURCE_ARCHIVED` | Cannot restore when origin is archived |
| 409 | `SOURCE_NOT_DELETED` | Cannot create event from contributions whose origin isn't deleted |
| 409 | `VERSION_CONFLICT` | Someone else edited first (If-Match mismatch) |
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

## 7. Permission Matrix (v0.8)

All requests must be from an active FamilyMember, except `GET /v1/invites/{token}` (public; the token is the secret; rate-limited per IP).

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
| Create person | ✅ | ✅ | ✅ | ✅ |
| Edit person | creator, steward, or linked self | ✅ steward | linked self | ❌ |
| Soft-delete person | creator or steward; **409 PERSON_LINKED** if `account_id` set | ✅ same | ❌ (linked self cannot delete) | ❌ |
| Create relationship | ✅ | ✅ | ✅ | ✅ |
| Delete relationship | creator of the edge, or steward | ✅ | if creator of the edge | ❌ |
| Invite onto a person | if steward | ✅ `POST /v1/people/{id}/invites` | N/A | 403 |
| List a person's events | family member; archived only if event creator or steward | ✅ same | ✅ if member | ✅ if member |
| Set own focus people | ✅ | ✅ | ✅ | ✅ (own set only) |
| Answer / skip / edit own fact | ✅ | ✅ | own only | own only |
| Delete someone else's fact | ❌ | ✅ steward | own only | ❌ |

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

# CORS — first origin is also used for invite URLs: {WEB_ORIGIN}/invites/{token}
WEB_ORIGIN=http://localhost:5173,https://stillwithyou.nimanussonkul.work,https://still-with-you-5b1.pages.dev

# API
API_PORT=3000
API_HOST=0.0.0.0

# Storage
STORAGE_BUCKET=private-media
SWY_SUPABASE_SERVICE_ROLE_KEY=
MEDIA_MAX_BYTES=20971520
MEDIA_MAX_PER_CONTRIBUTION=20

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
INVITE_PREVIEW_RATE_LIMIT_MAX=20

# Session/JWT
JWT_ISSUER=${SUPABASE_URL}/auth/v1
JWKS_URI=${SUPABASE_URL}/auth/v1/.well-known/jwks.json
```

## 9. Changes Summary (v0.7 → v0.8)

### Added
- People profile fields: `family_name`, `gender` (`female` \| `male` \| `other` or `null`), `birth_date_precision` (`day` \| `year`, default `day`), `bio` (≤ 2000), `avatar_media_id`, `created_by_account_id`, `created_at`, `updated_at`, `deleted_at`
- Computed person `age` (integer, `Asia/Bangkok`; `null` without `birth_date`). Year-precision is labelled approximate in the web; the API still returns the integer
- Computed `invite_status`: `none` \| `pending` \| `linked`
- Partial unique `(family_id, account_id)` where `account_id is not null` and `deleted_at is null`
- `person_relationships` (`parent` \| `spouse`). Children, siblings, grandparents are derived
- `PATCH` / `DELETE /v1/people/{id}`
- `POST /v1/families/{id}/relationships`, `DELETE /v1/relationships/{id}`
- `POST /v1/people/{id}/invites` (steward). Family invite body stays `{ email }` only. Create **201** includes `url = {first WEB_ORIGIN}/invites/{token}`; store only `token_hash`
- `GET /v1/invites/{token}` public preview `{ family_name, inviter_display_name, person_display_name, expires_at }`, per-IP rate limit
- `POST /v1/invites/{token}/accept` body `{}` → **200** `{ family_id, person_id }`
- `GET /v1/people/{id}/events?cursor=` (family members; archived visibility matches family events)
- `GET /v1/me/notifications?cursor=` (`{ notifications, next_cursor, unread_count }`) and `POST /v1/notifications/{id}/read` (owner; other account or non-uuid `{id}` **404**). Types: `contribution_added` `{ actor_display_name, event_title, event_id, family_id }`, `invite_accepted` `{ actor_display_name, family_name, family_id, person_id, person_display_name }`. Names snapshotted at insert. List/`unread_count` only families the caller still belongs to
- `GET /v1/families/{id}/people` returns `{ people, relationships }`
- Media `purpose` `story` \| `avatar` (avatar limit 1 per person)
- `person_relationships` composite FKs onto `people(id, family_id)` so both ends are the same family
- Error codes: **400 `NAME_REQUIRED`**, **400 `INVALID_BIRTH_DATE`**, **400 `INVALID_DEATH_DATE`**, **400 `INVALID_RELATIONSHIP`** (self-link and parent cycle; no `SELF_RELATIONSHIP`), **409 `RELATIONSHIP_EXISTS`**, **409 `PERSON_LINKED`**, **409 `PERSON_ALREADY_LINKED`**, **410 `INVITE_INVALID`**. Avatar attach reuses **409 `MEDIA_NOT_READY`** (not completed) and **422 `UPLOAD_MISMATCH`** (wrong purpose or family)

### Changed
- Empty person name is **400 `NAME_REQUIRED`** (no longer `INVALID_INPUT` `field: "name"`)
- Soft-delete keeps stories/memories (name still shown; person GET is 404). Live `person_facts` for that person are removed
- The unused v0.7 generic `relationships` table is replaced by `person_relationships`

### Unchanged
- Members, events (except people-events list), contributions (except notifying the event creator), trash, focus, facts
- v0.6 remains cancelled

## 9b. Changes Summary (v0.5 → v0.7)

### Added
- `GET /v1/events/{id}/contributions` (`{ contributions: […] }`, published only, `created_at` asc, signed media URLs)
- `GET` / `POST /v1/families/{id}/people`, `GET /v1/people/{id}` (`relation_label` persisted)
- `GET /v1/families/{id}/members`
- `GET /v1/me/trash` (restorable own items; web list shape)
- Unknown-route **404 NOT_FOUND** envelope `{ error: { code: "NOT_FOUND", message: "Route not found" } }`
- **400 ANSWER_REQUIRED** for empty/missing fact `answer_text` (`INVALID_INPUT` remains for `question_id`)

### Unchanged (canonical; not v0.6)
- `GET /v1/families/{id}/home`, `GET`/`PUT /v1/families/{id}/focus`
- `GET`/`POST /v1/people/{id}/facts`, `POST /v1/people/{id}/facts/skip`
- `PATCH`/`DELETE /v1/facts/{id}`
- **409 ALREADY_ANSWERED** with `error.details.fact_id`
- **422 TOO_MANY_FOCUS**

### Cancelled
- v0.6 (`/quick-question`, `/persons/{id}/answers`) — see [backend-contract-v0.6.md](./backend-contract-v0.6.md)

## 9c. Changes Summary (v0.4 → v0.5)

### Added
- Signed-URL photo uploads (`POST /v1/families/{id}/media/uploads`, `POST /v1/media/{id}/complete`)
- `media` table with `pending|uploaded|ready|failed` and `story_id` (contribution)
- Optional `media_ids` on story create/update
- Worker EXIF strip / thumbnail / 24h orphan cleanup
- `focus_people` (max 10 per account per family; cascade on person delete)
- `question_bank` seeded with 20 quick questions (v0.1)
- `person_facts` with soft delete and live unique (person, question, author)
- `question_skips` (30-day suppression)
- `GET`/`PUT /v1/families/{id}/focus`, `GET /v1/families/{id}/home`
- `POST /v1/people/{id}/facts`, `POST /v1/people/{id}/facts/skip`, `GET /v1/people/{id}/facts`
- `PATCH`/`DELETE /v1/facts/{id}` (author edit; author or steward delete)
- Error codes `TOO_MANY_FOCUS`, `ALREADY_ANSWERED`

## 10. Changes Summary (v0.3 → v0.4 / requirements v1.2)

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
