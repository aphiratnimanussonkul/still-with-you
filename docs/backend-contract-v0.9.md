# Still With You — Backend Contract v0.9

**Updated:** Oct 27, 2026  
**Status:** Canonical spec.  
**Supersedes:** [v0.8](./backend-contract-v0.8.md). **[v0.6](./backend-contract-v0.6.md) is cancelled** (never deployed; do not use `/quick-question` or `/persons/{id}/answers`).  
**Changes from v0.8:** archived events (`status = 'archived'`) are visible to and restorable by `events.creator_account_id` only. Stewards, other members, and contributors (including of their own stories) get **404 NOT_FOUND**. `memory_count`, home `recent_memories`, `GET /v1/people/{id}/events`, event detail, contributions, and media signed URLs follow that rule. Notifications that link to an archived event keep the row but return `payload.event_title: null` (nullable; no other event content) for anyone who cannot see the event. Matching RLS SELECT policies are in `20261027160000_archived_event_visibility.sql` (file-only; the API still uses a privileged role that bypasses RLS). Required optimistic concurrency on `PATCH /v1/events/{id}` via `events.version`. GET already returned `version`. Body `version` is required (integer, same value as GET): atomic `UPDATE … WHERE id AND version`; mismatch is **409 `EVENT_EDIT_CONFLICT`** with `details.current_version` (no editor name). Missing `version` is **400 `VALIDATION_ERROR`** with `field: "version"`. Event responses include `creator_display_name` (`string | null`): current `accounts.display_name` of `creator_account_id` (same source as contribution `owner_display_name`); `null` if unresolved. Not added to 409 details. Migration `20261027140000_events_version.sql` is file-only until applied. Worker-generated image variants (sharp) replace Supabase Storage transforms. `MEDIA_IMAGE_TRANSFORMS` is removed. New `avatar_placeholder` / `cover_placeholder` / `full_url`, plus a sibling `*_expires_at` (ISO 8601) for every signed URL. Card cover is 256×256 (was 128). Migration `20261027120000_media_variants.sql` is file-only until applied. `POST /v1/families/{id}/people` (with or without inline relationship), `PATCH` / `DELETE /v1/people/{id}`, `POST /v1/families/{id}/relationships`, and `DELETE /v1/relationships/{id}` are family steward (`family_members.role = 'admin'`) only. Non-steward members → **403 FORBIDDEN**. Non-member / missing still **404**. Steward deleting a linked person still **409 `PERSON_LINKED`**. No `version` on people. Creating a third live parent is **422 `TOO_MANY_PARENTS`**. No relationship PATCH.  

**Changes from v0.7 (carried in v0.8):** family-tree people profile (gender, birth date + precision, computed age, bio, avatar); `person_relationships`; person PATCH/DELETE; steward person invites; GET people returns `{ people, relationships }`; public invite preview; invite create `url`; people events list; in-app notifications (`contribution_added`, `invite_accepted`)  
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
| Parent cap | Creating a `parent` edge that would give the child (`related_person_id`) more than **2** live parents → **422 `TOO_MANY_PARENTS`**. Checked on create only (`POST /v1/families/{id}/relationships` and inline `parent_of`/`child_of` on `POST /v1/families/{id}/people`). Both paths take `pg_advisory_xact_lock` keyed on the child person id inside the transaction before counting parents, so concurrent creates cannot exceed 2. Existing over-limit rows stay and **GET still lists them**. No relationship PATCH. |
| Person writes | `POST /v1/families/{id}/people`, `PATCH /v1/people/{id}`, and `DELETE /v1/people/{id}` are family steward (`family_members.role = 'admin'`) only. Non-steward members → **403 FORBIDDEN**. Non-member / missing → **404**. Steward deleting a linked person → **409 `PERSON_LINKED`**. |
| Relationship writes | `POST /v1/families/{id}/people` (with or without inline relationship), `POST /v1/families/{id}/relationships`, and `DELETE /v1/relationships/{id}` are family steward (`family_members.role = 'admin'`) only. Edge creator and other members → **403 FORBIDDEN**. Non-member / missing → **404**. |
| Age | Not stored. API returns a computed integer `age` in `Asia/Bangkok` (or `null` when there is no `birth_date`). Year-precision age is labelled approximate **in the web only**; the API still returns that integer. |
| Invites | `POST /v1/people/{id}/invites` (steward only). Do **not** add `person_id` to family invite bodies. Create **201** includes `url = {first WEB_ORIGIN}/invites/{token}`. Store only a hash of the token; return the url once. `GET /v1/invites/{token}` is public (secret token, never id). `POST /v1/invites/{token}/accept` body `{}`, login required, single use, 7-day expiry; **200** `{ family_id, person_id }`. Expired, used, revoked, or unknown → **410 `INVITE_INVALID`**. Already-linked person → **409 `PERSON_ALREADY_LINKED`**. |
| People events | `GET /v1/people/{id}/events?cursor=` — family members only. Same visibility as `GET /v1/families/{id}/events` (archived visible only to `creator_account_id`). |
| `birth_date_precision` | `'day'` \| `'year'`, default `'day'` (approved). Year-only dates are stored as `YYYY-01-01`. |
| Same-family edges | `person_relationships` uses composite FKs `(person_id, family_id)` and `(related_person_id, family_id)` → `people(id, family_id)` (requires unique `(id, family_id)` on `people`). |
| `avatar_media_id` | Must be `purpose = 'avatar'`, same family, and completed (`uploaded` or `ready`). Not completed → **409 `MEDIA_NOT_READY`**. Wrong purpose or family → **422 `UPLOAD_MISMATCH`** (existing media-mismatch 422; not a new code). |

## 1. Core Principles

- PostgreSQL with UUID v7 for IDs, `timestamptz` (UTC) for timestamps
- Use `story` field naming throughout DB and API (D5)
- Authorization checked at backend for every request: must be active FamilyMember first, then check permission matrix and role. Exception: `GET /v1/invites/{token}` is unauthenticated (the token is the secret) and is rate-limited per IP
- Row Level Security (RLS) enabled on all tables. `anon`/`authenticated` remain revoked. SELECT policies on `events`, `event_people`, `contributions`, and `media` match creator-only archived visibility (`20261027160000_archived_event_visibility.sql`, file-only until applied). The API connects with a privileged role that **bypasses RLS** and must enforce the same rule in application code.
- Private storage bucket with signed URLs. Each signed URL has a sibling `*_expires_at` (ISO 8601). Story `media[].url` / `thumb_url` / `full_url` expire in **5 min** (`MEDIA_READ_TTL_SECONDS`). `avatar_url`, `cover_url`, `photo_url`, and avatar/cover `full_url` expire in **1 hour** (`MEDIA_AVATAR_COVER_TTL_SECONDS` = 3600). Clients should refetch the parent resource on **403** or at `*_expires_at`. Thumbnails are **files in Storage** (not Storage image transforms). `MEDIA_IMAGE_TRANSFORMS` is gone.
- 404 for cross-family access and for archived events the caller did not create (stewards included); 403 FORBIDDEN when resource exists but action not permitted

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
-- Stewards or the event creator may edit and archive *active* events (canManageEvent).
-- Only creator_account_id can see or unarchive an archived event (stewards included → 404).
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
- `anon` / `authenticated` **revoked** (no GRANTs)
- SELECT policies (file-only migration `20261027160000_archived_event_visibility.sql`): family members may read **active** events; **archived** events (and their contributions / story media) only when `creator_account_id` is the current account. No INSERT/UPDATE/DELETE policies.
- API connects using a **privileged service role** that bypasses RLS and is the only entry point; it must apply the same filters in application code
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
| POST | `/v1/families/{id}/people` | Create person (`{ person, relationship }`) (steward only) |
| GET | `/v1/people/{id}` | One person (member of that family) |
| PATCH | `/v1/people/{id}` | Update person (steward only) |
| DELETE | `/v1/people/{id}` | Soft-delete person (steward only) |
| POST | `/v1/people/{id}/invites` | Steward person invite. **201** includes `url` |
| GET | `/v1/people/{id}/events` | Events linked to this person (`?cursor=`). Family members only |
| POST | `/v1/families/{id}/relationships` | Create `parent` or `spouse` (steward only) |
| DELETE | `/v1/relationships/{id}` | Delete a stored edge (steward only) |
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
| GET | `/families/{fid}/events?cursor=` | Member | Active for all members; archived only for `creator_account_id` |
| GET | `/people/{id}/events?cursor=` | Member of that person's family | Events linked via `event_people`. Same archived visibility as family events. `{ events, next_cursor }` |
| GET | `/events/{id}` | Per matrix | Archived: **404 NOT_FOUND** unless `creator_account_id` (stewards included) |
| PATCH | `/events/{id}` | `canManageEvent` | Core fields and `person_ids` (replace `event_people` in the same transaction). Every `person_id` must belong to the event's family. Archived and caller is not the creator → **404**. Body `version` is **required** (integer, same value as GET). Atomic `UPDATE … WHERE id AND version`; on mismatch **409 `EVENT_EDIT_CONFLICT`** with `error.details.current_version` only (no editor name). Missing `version` → **400 `VALIDATION_ERROR`** `field: "version"`. Successful PATCH returns the new `version`. |
| POST | `/events/{id}/archive` | `canManageEvent` | Sets `archived_at = now()` (re-archive overwrites). No auto-delete job. Re-archive of someone else's event → **404** (caller cannot see it) |
| POST | `/events/{id}/unarchive` | Event creator | Restore: `status=active`, `archived_at=null`. Steward / member / contributor → **404** |
| POST | `/events/{id}/delete` | `canManageEvent` after the event is visible | Permanent delete (AC-19). Confirm text exactly `ลบเรื่องนี้` after trim. Archived event the caller did not create → **404** |

Event responses include integer `version` (starts at **1**, incremented on every successful update). They also include `creator_display_name` (string or `null`): the current `accounts.display_name` of `events.creator_account_id` (same source as contribution `owner_display_name`). `null` if it cannot be resolved. **409 `EVENT_EDIT_CONFLICT` `details` do not include an editor name.** They also include `archived_at` and `deletable_at` (`archived_at + 7 days`, ISO 8601 UTC). Both archive timestamps are `null` when the event is not archived. Responses include `paused` (`true` iff `status = 'archived'`), `cover_url`, `cover_url_expires_at`, `cover_placeholder`, `full_url`, and `full_url_expires_at`. Cover is the first completed photo of the earliest published story (or all of those image fields `null` when there is no image). URLs are derived on every response and are not stored. TTL is **1 hour** (`MEDIA_AVATAR_COVER_TTL_SECONDS`) for both `cover_url` and `full_url`.

```json
// PATCH /v1/events/{id} — version required
{ "title": "หัวข้อใหม่", "version": 1 }

// 200 — new version
{ "id": "…", "title": "หัวข้อใหม่", "version": 2 }

// 400 VALIDATION_ERROR — missing version
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "version is required",
    "field": "version"
  }
}

// 409 EVENT_EDIT_CONFLICT — stale version; no editor name
{
  "error": {
    "code": "EVENT_EDIT_CONFLICT",
    "message": "Event was modified by another edit",
    "details": { "current_version": 2 }
  }
}
```

The worker (sharp, once after upload completes) writes Storage variants. `cover_url` is a signed URL of the matching variant: home `recent_memories` uses **cover_card 256×256 cover**; event/memory detail (and other event responses) uses **cover_detail 684×400 cover**. `full_url` is the long-edge-≤2048 WebP (JPEG fallback). `cover_placeholder` is a `data:image/webp;base64,…` LQIP (WebP payload ≤ 1KB). It is `null` when there is no image **or** when variants are not ready yet. `cover_url` and `full_url` are `null` only when there is no image at all. While variants are pending, they fall back to the original object's signed URL (same 1 hour TTL). Each signed URL has a sibling `*_expires_at` (ISO 8601); `null` when the URL is `null`. Clients should refetch on **403** or at expiry.

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

Only a **family steward** (`family_members.role = 'admin'`) may create, edit, or soft-delete a person (`POST /v1/families/{id}/people` with or without an inline relationship, `PATCH /v1/people/{id}`, `DELETE /v1/people/{id}`). Other members → **403 FORBIDDEN**. Non-member / missing family → **404 NOT_FOUND**. Steward deleting a linked person (`account_id` set) → **409 `PERSON_LINKED`**. Soft-deleted people are omitted from list/get (person link is not navigable). Stories and memories that mention them are kept and still show the name. Live `person_facts` for that person are removed. `focus_people` rows for that person are removed. Stored `person_relationships` rows that include that person are removed.

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
  "avatar_url_expires_at": "2026-10-27T10:34:00.000Z",
  "avatar_placeholder": "data:image/webp;base64,…",
  "full_url": "https://…",
  "full_url_expires_at": "2026-10-27T10:34:00.000Z",
  "memory_count": 2,
  "account_id": null,
  "invite_status": "none",
  "created_by_account_id": "…",
  "created_at": "2026-10-22T00:00:00.000Z",
  "updated_at": "2026-10-22T00:00:00.000Z",
  "deleted_at": null
}
```

`name` is always present and is the same string as `display_name` (v0.7 alias, kept so the current web client keeps working). `gender` is `"female"` \| `"male"` \| `"other"` or `null`. `avatar_url` is derived on every response from `avatar_media_id` (never stored): a signed read URL (**1 hour**, `MEDIA_AVATAR_COVER_TTL_SECONDS`) of the **300×300 cover WebP** when the media exists, `purpose = 'avatar'`, and status is `uploaded` or `ready`; otherwise `null`. `avatar_url` and `full_url` are `null` only when there is no image at all (no completed avatar media). While the avatar/full variants are pending, those URLs fall back to the original object's signed URL (same 1 hour TTL). `avatar_placeholder` is a `data:image/webp;base64,…` LQIP (WebP payload ≤ 1KB) when the avatar variant exists; it is `null` when there is no image **or** variants are not ready yet. `full_url` is the long-edge-≤2048 variant (same TTL and fallback). Each signed URL has a sibling `avatar_url_expires_at` / `full_url_expires_at` (ISO 8601); `null` when the URL is `null`. Clients should refetch the person (or home/focus) on **403** or at expiry. `memory_count` is the number of non-deleted events linked to that person with the same visibility as `GET /v1/people/{id}/events` (computed in the list query; archived counts **only for the event creator**). Soft-deleted rows are never returned.

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/v1/families/{id}/people` | Member | `{ "people": […], "relationships": […] }`. Live people only, `display_name` ascending. Non-member or missing family → **404 NOT_FOUND** |
| POST | `/v1/families/{id}/people` | Family steward (`role = 'admin'`) | Create, with or without inline relationship. **201** `{ "person": …, "relationship": … \| null }`. Member → **403 FORBIDDEN**. Non-member / missing family → **404** |
| GET | `/v1/people/{id}` | Member of that family | Same person object. Missing, other family, or soft-deleted → **404 NOT_FOUND** |
| GET | `/v1/people/{id}/events?cursor=` | Member of that family | Events linked via `event_people`. Active for all members; archived only for `creator_account_id` (same as `GET /v1/families/{id}/events`). `{ events, next_cursor }`. Missing / other family / soft-deleted person → **404 NOT_FOUND** |
| PATCH | `/v1/people/{id}` | Family steward (`role = 'admin'`) | Partial update. **200** person. Non-steward members → **403 FORBIDDEN**. Non-member / missing → **404**. No `version` |
| DELETE | `/v1/people/{id}` | Family steward (`role = 'admin'`) | Soft-delete (`deleted_at = now()`). **204**. Non-steward members → **403 FORBIDDEN**. Non-member / missing → **404**. Linked person (`account_id` not null) → **409 PERSON_LINKED** (steward) |

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

// PATCH /v1/people/{id} — all fields optional. Steward only; no version.
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
- Optional inline `relationship: { kind: parent_of \| child_of \| spouse_of, person_id }` on create maps to a `person_relationships` `parent` / `spouse` row in the same transaction (failure rolls back the person). Person create (with or without this field) is **steward-only**. Target not in this family → **400 `INVALID_INPUT`** `field: "relationship.person_id"`. Errors reuse **400 `INVALID_RELATIONSHIP`** / **409 `RELATIONSHIP_EXISTS`**. A `parent_of` / `child_of` that would give the child more than 2 live parents → **422 `TOO_MANY_PARENTS`** (person row is rolled back)
- `birth_date_precision` not `day` \| `year` → **400 `INVALID_INPUT`** `field: "birth_date_precision"`
- Year-only: client may send `birth_date` as `YYYY-01-01` or `YYYY`; stored as `YYYY-01-01` with `birth_date_precision = 'year'`
- `bio` longer than 2000 after trim → **400 `INVALID_INPUT`** `field: "bio"`
- `avatar_media_id` (optional; `null` clears). The media row must have `purpose = 'avatar'`, belong to the same family, and be completed (`status` is `uploaded` or `ready`). Limit **1** live avatar per person (replace detaches/soft-deletes the previous). Errors reuse existing media codes:
  - not completed (`pending` / `failed`) → **409 `MEDIA_NOT_READY`** with `details.media_ids: [avatar_media_id]`
  - wrong `purpose` or different family → **422 `UPLOAD_MISMATCH`** `field: "avatar_media_id"`
  - unknown / deleted / attached to another person → **400 `INVALID_INPUT`** `field: "avatar_media_id"`

### 4.3c Relationships (NEW in v0.8)

Stored types are **`parent`** and **`spouse`** only. Children = reverse of `parent`. Siblings = other children of the same parent. Grandparents = parents of parents. Do not store those as rows. There is **no** relationship PATCH.

A child (`related_person_id` on a `parent` edge) may have at most **2** live parents. Live = the parent person is not soft-deleted. Creating a third → **422 `TOO_MANY_PARENTS`**. The check runs only on create. Both create paths take `pg_advisory_xact_lock` keyed on the child person id inside the transaction **before** counting that child's parents. Existing over-limit rows are left as-is and **GET still returns them**.

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/v1/families/{id}/relationships` | Family steward (`role = 'admin'`) | Both people must be live in this family. **201** relationship. Member / edge-creator → **403 FORBIDDEN**. Non-member / missing family → **404**. Third live parent → **422 `TOO_MANY_PARENTS`** |
| DELETE | `/v1/relationships/{id}` | Family steward (`role = 'admin'`) | **204**. Member and the member who created the edge → **403 FORBIDDEN**. Missing / other family → **404 NOT_FOUND** |

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
| Creating a `parent` edge that would give the child more than 2 live parents | **422** | `TOO_MANY_PARENTS` |
| Caller is a member but not a steward (`POST` / `DELETE`) | **403** | `FORBIDDEN` |
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
| GET | `/v1/events/{id}/contributions` | Same visibility as `GET /v1/events/{id}`. Archived and caller is not the event creator (steward, member, **contributor of their own story**) → **404 NOT_FOUND**. `{ contributions: […] }` using the contribution response (including `owner_display_name`, `author_id` = `owner_account_id`, `is_mine`, and `media[]` with signed read URLs). Excludes `trashed`/`purged`. Order `created_at` descending (newest first), then `id` descending |
| POST | `/v1/events/{id}/contributions` | **`story` required** (AC-27). Optional `media_ids`. Event must be active. Archived and caller is not the creator → **404**; creator of an archived event → **409 EVENT_NOT_ACTIVE**. Video out of scope |
| GET | `/v1/contributions/{id}` | Member, and the origin event must be visible. Archived origin and caller is not the event creator → **404** (including the story author). Includes `media[]` with signed read URLs (5 min) when the story is published and the origin event is not archived |
| PATCH | `/v1/contributions/{id}` | **Owner only** (AC-24) after origin visibility. Archived origin and caller is not the event creator → **404**. Optional `media_ids` replaces the set; omitted ids are detached and soft-deleted |
| POST | `/v1/contributions/{id}/trash` | Owner only after origin visibility. Archived origin and caller is not the event creator → **404**. Media stays attached but URLs are not issued |
| POST | `/v1/contributions/{id}/restore` | Owner only, origin not archived. Archived origin and caller is not the event creator → **404**; event creator → **409 SOURCE_ARCHIVED** |
| DELETE | `/v1/contributions/{id}` | Purge (owner only) after origin visibility. Archived origin and caller is not the event creator → **404**. Deletes media rows and storage objects |

Story create/update `media_ids` (uuid[], default `[]`):
- Every id must be the same family, `purpose = 'story'` (not an avatar), `uploader_account_id` == story author, status `uploaded` or `ready`, and not attached to another story
- Unknown / foreign / avatar → **400 INVALID_INPUT** `field: "media_ids"`
- Not `uploaded`/`ready` → **409 MEDIA_NOT_READY** with `details.media_ids`
- More than `MEDIA_MAX_PER_CONTRIBUTION` (default 20) → **422 TOO_MANY_PHOTOS**

Reads: each story includes `media: [{ id, status, url, url_expires_at, thumb_url, thumb_url_expires_at, full_url, full_url_expires_at, width, height, expires_at }]`. Signed read URLs (**5 min**, `MEDIA_READ_TTL_SECONDS`) are issued only after confirming the requester is a current family member. `url` is the original object. `thumb_url` is the **cover_card 256×256** variant (falls back to the original if that variant is not ready). `full_url` is the long-edge-≤2048 variant (same 5 min TTL and original-URL fallback). `expires_at` is the expiry of `url` (v0.8 name). `url_expires_at` is the same value, named to match the `*_expires_at` sibling convention. Each signed URL has a sibling `*_expires_at` (ISO 8601); `null` when that URL is `null`. Trashed stories and archived events get no URLs (`url` / `thumb_url` / `full_url` and their `*_expires_at` all `null`, including for the event creator). Non-owners never receive the contribution payload when the origin is archived. Clients should refetch the story on **403** or at expiry.

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

Uploader only. Server reads the object, checks actual size `== size_bytes` and `<= MEDIA_MAX_BYTES`, and detects type via magic bytes (does not trust `Content-Type`). Mismatch → delete object, status `failed`, **422 UPLOAD_MISMATCH**. Success → status `uploaded` and enqueue a worker job (`media_process`).

The worker runs **once** after complete, using **sharp**: `rotate()` (apply EXIF orientation), then re-encode **without** metadata (EXIF, GPS, ICC, XMP, IPTC stripped). It writes:

| Kind | Where | Size | Served as |
|------|--------|------|-----------|
| placeholder | `media.placeholder_webp` (data URL) | ~20px long edge, WebP payload **≤ 1KB** | `avatar_placeholder` / `cover_placeholder` |
| `avatar` | Storage `{family_id}/{media_id}/avatar.webp` | 300×300 cover | `avatar_url` |
| `cover_card` | Storage `…/cover_card.webp` | 256×256 cover | home `cover_url`, story `thumb_url` |
| `cover_detail` | Storage `…/cover_detail.webp` | 684×400 cover | event/memory-detail `cover_url` |
| `full` | Storage `…/full.webp` (or `.jpg`) | long edge ≤ 2048, inside, no upscale | `full_url` |

Original object is overwritten with the rotated, stripped re-encode on the **first** successful process. If a variant is not ready yet, `avatar_url` / `cover_url` / `full_url` / story `thumb_url` fall back to the original key and placeholders are `null`. Processing is idempotent: existing `media_variants` rows and a non-null placeholder are skipped. `pnpm --filter @still-with-you/worker backfill-media` walks existing `uploaded`/`ready` media the same way.

Worker also deletes `pending`/`uploaded` rows with `story_id` null and `person_id` null older than 24 hours (storage objects included, including variant keys), including unattached avatars. Permanent story purge and event permanent delete delete media rows, variant rows (cascade), and storage objects.

### 4.5b Image variants (NEW in v0.9)

Migration (file-only until applied): `supabase/migrations/20261027120000_media_variants.sql`

- `media.placeholder_webp text` — `data:image/webp;base64,…`. WebP bytes ≤ 1024. Null until generated.
- `media_variants (media_id, kind, storage_key, content_type, width, height, size_bytes)` with `kind` `avatar` \| `cover_card` \| `cover_detail` \| `full`. RLS enabled; `revoke all` from `anon` and `authenticated`.

There is **no** `MEDIA_IMAGE_TRANSFORMS` flag and **no** Storage `transform` query on signed URLs. `MEDIA_AVATAR_COVER_TTL_SECONDS` (3600) is unchanged.

#### Signed URLs, placeholders, expiry

Nullability:

- `avatar_placeholder` / `cover_placeholder` is **`null`** when there is no image, **or** when variants are not ready yet.
- `avatar_url`, `cover_url`, `photo_url`, and `full_url` are **`null` only when there is no image at all** (no completed `uploaded`/`ready` media, or the story/event hides URLs). While variants are pending they **fall back** to the original object's signed URL.

TTL (`full_url` follows its context):

| Signed URL | Sibling expiry (ISO 8601) | TTL |
|------------|---------------------------|-----|
| Person / focus `avatar_url` | `avatar_url_expires_at` | **1 hour** (`MEDIA_AVATAR_COVER_TTL_SECONDS`) |
| Focus `photo_url` (same URL as `avatar_url`) | `photo_url_expires_at` | **1 hour** |
| Event / home `cover_url` | `cover_url_expires_at` | **1 hour** |
| Person / focus / event `full_url` | `full_url_expires_at` | **1 hour** (avatar/cover context) |
| Story `media[].url` | `expires_at` and `url_expires_at` (same value) | **5 min** (`MEDIA_READ_TTL_SECONDS`) |
| Story `media[].thumb_url` | `thumb_url_expires_at` | **5 min** |
| Story `media[].full_url` | `full_url_expires_at` | **5 min** (story context) |

When a URL is `null`, its sibling `*_expires_at` is `null`.

**Client:** do not cache a signed URL past `*_expires_at`. If a signed GET returns **403** (expired or revoked) **or** the clock has reached `*_expires_at`, refetch the parent resource (person, event, story, home, or focus) to get new URLs.

#### Docker / runtime (Jack)

sharp is a **native** addon. Worker (and the API image, because `@still-with-you/image-variants` is a workspace dependency) must install it on **linuxmusl**.

- Base: `node:22-alpine` with `apk add --no-cache libc6-compat` (already in both Dockerfiles).
- `ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1` so install uses the prebuilt `@img/sharp-linuxmusl-x64` / `arm64` binary instead of compiling against system libvips.
- Root `package.json` sets `pnpm.onlyBuiltDependencies: ["sharp"]` so pnpm 10 runs sharp's install script.
- Production Docker stages copy `packages/image-variants/package.json` + `dist` and run `pnpm install --prod --frozen-lockfile` on alpine matching the target arch.
- HEIC decode needs libvips+libheif. The prebuilt musl binary may **not** decode HEIC; those jobs fail → `media.status = failed`. If HEIC in production is required, switch the worker image to Debian (`node:22-bookworm-slim`) or add `vips`/`libheif` and rebuild sharp against it. JPEG/PNG/WebP are the supported decode path on alpine.
- Do not run sharp on the API request path. Generation is worker-only (`media_process` outbox + `backfill-media`).
- After applying the migration, run `pnpm --filter @still-with-you/worker backfill-media` once against the app database (not from this PR agent). Safe to re-run.

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
| GET | `/v1/me/notifications?cursor=` | Authenticated | **Only the caller's** rows **for families they still belong to**. Newest first. `{ notifications, next_cursor, unread_count }`. `unread_count` uses the same membership filter (total unread, not the page size). For `contribution_added`, `event_title` is a **nullable string**. If `payload.event_id` is **archived** (or deleted) and the caller is not `creator_account_id`, the item is **kept** and **`event_title` is `null`** (no other event content; stored snapshot is unchanged; `event_id` and `family_id` stay). The event creator still receives the title |
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

// GET /v1/me/notifications — same row when the event is archived and the
// caller is not creator_account_id. Item is kept; event_title is null;
// no other event content is returned.
{
  "actor_display_name": "Member",
  "event_title": null,
  "event_id": "…",
  "family_id": "…"
}
```

Names are **snapshotted into `payload` at insert**. A later rename of the actor, event, family, or person does **not** change existing notifications. Do not insert if the recipient is not an **active** `family_members` row. List and `unread_count` omit notifications whose `payload.family_id` is a family the caller has left.

Types created by the API (keep this list small):

| `type` | When | GET `payload` |
|--------|------|----------------|
| `contribution_added` | Another member adds a contribution to an event you created. Creating an event (first story) does **not** notify. Self-contribute does **not** notify. Recipient must still be an active family member | `{ actor_display_name, event_title, event_id, family_id }`. `event_title` is `string \| null` (`null` when the event is archived/deleted and the caller is not its creator) |
| `invite_accepted` | Someone accepts a family or person invite you sent. Recipient must still be an active family member | `{ actor_display_name, family_name, family_id, person_id, person_display_name }` (`person_id` / `person_display_name` are `null` when there is no person) |

### 4.8 Focus people (NEW in v0.5; canonical in v0.8)

Per-account, per-family. Max **10**. Empty set allowed. All routes require family membership → **403 FORBIDDEN**.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/families/{id}/focus` | `{ items: [{ person: { id, display_name, name }, photo_url, photo_url_expires_at, avatar_url, avatar_url_expires_at, avatar_placeholder, full_url, full_url_expires_at, memory_count, position }] }`. `photo_url` and `avatar_url` are the same derived **300×300** avatar signed URL (1 hour) when one exists, otherwise `null`. `avatar_placeholder` / `full_url` match the person object (placeholder `null` until the variant is ready; URLs fall back to the original while pending). Each signed URL has a sibling `*_expires_at`. There is no `GET /v1/home`; member cards are this focus list (also nested under `GET /v1/families/{id}/home`). `memory_count` uses the same visibility as `GET /v1/people/{id}/events` |
| PUT | `/v1/families/{id}/focus` | Body `{ person_ids: [] }` replaces the set. Array order becomes `position` (0-based). Duplicates or people not in the family → **400 INVALID_INPUT** `field: "person_ids"`. More than 10 → **422 TOO_MANY_FOCUS** |
| GET | `/v1/families/{id}/home` | `{ focus, quick_question, recent_memories }`. `recent_memories` is the latest 5 **active** events in the family (archived excluded for everyone, including the creator; same event shape as GET event, including `creator_display_name`, `paused`, `cover_url`, `cover_url_expires_at`, `cover_placeholder`, `full_url`, `full_url_expires_at`). `focus[].memory_count` uses the same visibility as `GET /v1/people/{id}/events` (archived counts only for `creator_account_id`). Home `cover_url` is **cover_card 256×256**; event detail is **cover_detail 684×400** |

`quick_question` is `{ question_id, key, person: { id, display_name, name }, text }` or `null`. Picked among the caller's focus people, active questions, not already answered by the caller for that person, and not skipped by the caller in the last 30 days. `text` substitutes `{name}` / `{ชื่อ}` with the person's `display_name`. Null when there is no focus person or no eligible question.

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
| 400 | `VALIDATION_ERROR` | `PATCH /v1/events/{id}` omitted `version` (or `version` is not an integer). `error.field` is `"version"`. Existing `{ error: { code, message, field } }` envelope. |
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
| 422 | `TOO_MANY_PARENTS` | Creating a `parent` edge (including inline `parent_of` / `child_of`) that would give the child more than 2 live parents |
| 401 | `UNAUTHENTICATED` | Token expired or invalid |
| 403 | `FORBIDDEN` | Action not permitted (including role change, `POST /v1/families/{id}/people`, `PATCH`/`DELETE /v1/people/{id}`, `POST /v1/families/{id}/relationships`, and `DELETE /v1/relationships/{id}`, when caller is not a steward). Permanent delete: caller is neither creator nor steward (no dates) |
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
| 409 | `EVENT_EDIT_CONFLICT` | `PATCH /v1/events/{id}` sent `version` that did not match. `error.details.current_version` is the integer on the row. No editor name (pending a product decision). |
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
- ✅ RLS enabled on all tables; SELECT policies for creator-only archived visibility (file-only `20261027160000_archived_event_visibility.sql`); `anon`/`authenticated` still revoked
- ✅ API uses privileged service role only (bypasses RLS; application code enforces archived visibility)
- ✅ Private storage bucket, no direct frontend access
- ✅ CORS allowlist (`WEB_ORIGIN` comma-separated origins, no `*`)
- ✅ Encrypted backups, 30-day retention after purge

## 7. Permission Matrix (v0.9)

All requests must be from an active FamilyMember, except `GET /v1/invites/{token}` (public; the token is the secret; rate-limited per IP).

`canManageEvent` = event creator **OR** family steward (`family_members.role = 'admin'`). Used for editing core fields of an **active** event, archiving an **active** event, and permanent delete **after** the event is visible to the caller (AC-23, AC-26). Restore of an archived event is **creator only**.

| Action | Creator | Steward (admin) | Owner | Other member / contributor |
|--------|---------|-----------------|-------|--------------|
| Create event | ✅ | ✅ | ✅ | ✅ |
| View active event | ✅ | ✅ | ✅ | ✅ |
| View archived event | ✅ | ❌ **404** | ❌ **404** | ❌ **404** (including the contributor's own stories) |
| Edit event fields | ✅ `canManageEvent` | ✅ `canManageEvent` on **active** | ❌ | ❌ |
| Archive active event | ✅ | ✅ | ❌ | ❌ |
| Restore archived event | ✅ | ❌ **404** | ❌ **404** | ❌ **404** |
| Delete event permanently | ✅ after 7 days + `ลบเรื่องนี้`; else 403 `NOT_YET_DELETABLE` | ✅ same **only if they created it**; someone else's archived event → **404** | ❌ | ❌ 403 `FORBIDDEN` on active; **404** if archived |
| Add contribution | ✅ (if active, story required) | ✅ if active | ✅ if active | ✅ if active; archived → **404** |
| View / edit/trash/purge contribution on archived event | ✅ view all; edit own | ❌ **404** | ❌ **404** | ❌ **404** even for own story |
| Edit/trash/purge contribution on active event | own only | **cannot edit/delete others'** (AC-24) | own only | own only |
| **Invite / change role / remove** | if steward | ✅; last-admin → 409 | N/A | 403 |
| Create person | ❌ **403** (unless steward) | ✅ steward only | ❌ **403** | ❌ **403** |
| Edit person | ❌ **403** (unless steward) | ✅ steward only | ❌ **403** | ❌ **403** |
| Soft-delete person | ❌ **403** (unless steward); steward **409 PERSON_LINKED** if `account_id` set | ✅ steward only | ❌ **403** | ❌ **403** |
| Create relationship | ❌ **403** (unless steward) | ✅ steward only | ❌ **403** | ❌ **403** |
| Delete relationship | ❌ **403** (unless steward; edge creator included) | ✅ steward only | ❌ **403** | ❌ **403** |
| Invite onto a person | if steward | ✅ `POST /v1/people/{id}/invites` | N/A | 403 |
| List a person's events | family member; archived only if event creator | active only | active only | active only |
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

## 9. Changes Summary (v0.8 → v0.9)

### Added
- Required `version` on `PATCH /v1/events/{id}`. Atomic `UPDATE … WHERE id AND version`; mismatch → **409 `EVENT_EDIT_CONFLICT`** with `details.current_version` only (no editor name). Missing `version` → **400 `VALIDATION_ERROR`** `field: "version"`
- `creator_display_name` (`string | null`) on event responses (`GET /v1/events/{id}`, family events list, people events list, create/PATCH/archive/unarchive, home `recent_memories`). Current `accounts.display_name` of `creator_account_id` (same source as contribution `owner_display_name`); `null` if unresolved. Not added to 409 `EVENT_EDIT_CONFLICT` details.
- Migration `20261027140000_events_version.sql` (`events.version integer not null default 1`; existing rows get 1). File-only until applied. RLS on; anon/authenticated revoked
- Creator-only archived visibility: `GET /v1/events/{id}`, unarchive, contributions (including the contributor's own), `memory_count`, `GET /v1/people/{id}/events`, family event list. Non-creators (steward included) → **404 NOT_FOUND**
- Notification present-time `payload.event_title: null` (item kept; no other event content) when the linked event is archived and the caller is not the creator. `event_title` is nullable.
- File-only RLS SELECT policies `20261027160000_archived_event_visibility.sql` (not applied; API still bypasses RLS)
- Worker-generated Storage variants via sharp (`packages/image-variants`). `rotate()` then strip all metadata.
- `media.placeholder_webp` and `media_variants` (RLS on, anon/authenticated revoked). Migration `20261027120000_media_variants.sql` is file-only until applied.
- Person / focus: `avatar_placeholder`, `full_url`, `avatar_url_expires_at`, `full_url_expires_at`; focus also `photo_url_expires_at`
- Event / home `recent_memories`: `cover_placeholder`, `full_url`, `cover_url_expires_at`, `full_url_expires_at`
- Story `media[].full_url`, `url_expires_at`, `thumb_url_expires_at`, `full_url_expires_at` (`expires_at` still the expiry of `url`)
- Idempotent `pnpm --filter @still-with-you/worker backfill-media`
- **422 `TOO_MANY_PARENTS`** when creating a `parent` edge (including inline `parent_of` / `child_of` on person create) that would give the child more than 2 live parents. Existing over-limit rows are not rejected on GET

### Changed
- Successful event PATCH increments `version`. Omitting `version` is no longer last-write-wins.
- `POST /v1/families/{id}/people` (with or without inline relationship), `POST /v1/families/{id}/relationships`, and `DELETE /v1/relationships/{id}` are family steward (`family_members.role = 'admin'`) only. Edge creator and other members → **403 FORBIDDEN**. Non-member / missing still **404**. No relationship PATCH.
- Steward can still edit/archive **active** events they did not create; they cannot see, restore, or permanently delete someone else's **archived** event
- `PATCH` / `DELETE /v1/people/{id}` are family steward (`family_members.role = 'admin'`) only. Non-steward members → **403 FORBIDDEN**. Non-member / missing still **404**. Steward deleting a linked person still **409 `PERSON_LINKED`**. No `version` / optimistic concurrency on people.
- Home `recent_memories` remains active-only (archived excluded for everyone). `focus[].memory_count` no longer counts other people's archived events for stewards
- `avatar_url` is the 300×300 cover **file**, not a Storage transform
- Home `cover_url` is **256×256** (replaces 128)
- Event-detail `cover_url` is **684×400** as a file
- `*_placeholder` is `null` when there is no image or variants are not ready yet
- `avatar_url` / `cover_url` / `full_url` are `null` only when there is no image; pending variants fall back to the original signed URL
- `full_url` TTL follows context: avatar/cover **1 hour**, story media **5 min**
- Clients should refetch the parent resource on **403** or at `*_expires_at`
- Card cover size constant is `COVER_CARD_VARIANT` (256), not `COVER_CARD_TRANSFORM` (128)

### Removed
- `MEDIA_IMAGE_TRANSFORMS`
- Supabase Storage `transform` on `createSignedUrl` / test MemoryMediaStorage query params
- `AVATAR_TRANSFORM`, `COVER_CARD_TRANSFORM`, `COVER_DETAIL_TRANSFORM`

### Unchanged
- GET event (and create/archive/unarchive) already returned `version`
- Contribution PATCH is not compare-and-swap in this revision
- `VERSION_CONFLICT` (documented If-Match) remains unused
- `MEDIA_AVATAR_COVER_TTL_SECONDS` = 3600
- Story media read TTL 5 minutes

## 9a. Changes Summary (v0.7 → v0.8)

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
- `GET /v1/people/{id}/events?cursor=` (family members; archived only for `creator_account_id`)
- `GET /v1/me/notifications?cursor=` (`{ notifications, next_cursor, unread_count }`) and `POST /v1/notifications/{id}/read` (owner; other account or non-uuid `{id}` **404**). Types: `contribution_added` `{ actor_display_name, event_title, event_id, family_id }` (`event_title` nullable), `invite_accepted` `{ actor_display_name, family_name, family_id, person_id, person_display_name }`. Names snapshotted at insert. List/`unread_count` only families the caller still belongs to. Archived `event_id` keeps the row and returns `event_title: null` unless the caller is the event creator
- `GET /v1/families/{id}/people` returns `{ people, relationships }`
- Media `purpose` `story` \| `avatar` (avatar limit 1 per person)
- Person `memory_count` (same visibility as `GET /v1/people/{id}/events`, same-query count) and required `name`
- Person/focus `avatar_url` derived on every response from completed `purpose=avatar` media (URL is never stored). TTL 1 hour. (v0.9: 300×300 file variant, not a Storage transform)
- Event `paused` and `cover_url` (first completed photo of the earliest published story). TTL 1 hour. (v0.9: home 256×256 file, detail 684×400 file)
- Contribution `author_id` and `is_mine`; stories listed newest first
- Focus/home member cards include `avatar_url` and `person.name`
- `person_relationships` composite FKs onto `people(id, family_id)` so both ends are the same family
- Error codes: **400 `NAME_REQUIRED`**, **400 `INVALID_BIRTH_DATE`**, **400 `INVALID_DEATH_DATE`**, **400 `INVALID_RELATIONSHIP`** (self-link and parent cycle; no `SELF_RELATIONSHIP`), **409 `RELATIONSHIP_EXISTS`**, **409 `PERSON_LINKED`**, **409 `PERSON_ALREADY_LINKED`**, **410 `INVITE_INVALID`**. Avatar attach reuses **409 `MEDIA_NOT_READY`** (not completed) and **422 `UPLOAD_MISMATCH`** (wrong purpose or family)

### Changed
- Empty person name is **400 `NAME_REQUIRED`** (no longer `INVALID_INPUT` `field: "name"`)
- Soft-delete keeps stories/memories (name still shown; person GET is 404). Live `person_facts` for that person are removed
- The unused v0.7 generic `relationships` table is replaced by `person_relationships`

### Unchanged
- Members, trash, facts
- v0.6 remains cancelled

## 9b. Changes Summary (v0.5 → v0.7)

### Added
- `GET /v1/events/{id}/contributions` (`{ contributions: […] }`, published only, `created_at` desc, signed media URLs)
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
