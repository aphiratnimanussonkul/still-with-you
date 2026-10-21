# PR #1 Review Fixes - Complete History

## Round 3 (Commit f71285e Re-Review) ✅ COMPLETE

All additional re-review findings addressed:

### 1. ✅ Migration Squash & Idempotency
**Issue:** Migrations failed on second run due to missing guards  
**Fix:**
- **Squashed all migrations into ONE clean file:** `supabase/migrations/20261021000000_initial_schema.sql`
- Used `create extension if not exists` for extensions
- Wrapped `CREATE TYPE` in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null END $$;`
- Used `CREATE TABLE IF NOT EXISTS` for all tables
- Used `DROP TRIGGER IF EXISTS` before creating triggers
- Used `CREATE OR REPLACE FUNCTION` for all functions
- Storage bucket uses `ON CONFLICT (id) DO NOTHING`
- **Tested:** Can run cleanly twice via `supabase db reset` then re-apply with psql

### 2. ✅ Final Table Names
**Issue:** Some tables still had incorrect singular/plural naming  
**Fix:** Applied exact names from spec to migration, Drizzle schema, and all code:
- `people` (not persons/peoples) ✅
- `media` (singular, not medias) ✅
- `outbox` (singular, not outboxes) ✅
- `event_people` (not event_persons) ✅
- `audit_log` (singular, not audit_logs) ✅
- Other plurals: `accounts`, `families`, `family_members`, `relationships`, `events`, `contributions`, `blobs`, `contribution_revisions`, `notifications`, `idempotency_keys`, `invites` ✅

### 3. ✅ Last-Admin Logic for Sole Members
**Issue:** Last-admin guard blocked even when user was sole member  
**Fix:**
- Updated `check_last_admin()` function to count other active members first
- If zero other members (sole member), allows the operation
- If other members exist, then checks if any other admins remain
- Only blocks if other members exist AND no other admins
- Uses `SELECT ... FOR UPDATE` on families for race safety
- Applied to: account deletion, member removal, self-leave, role demotion

### 4. ✅ Error Code Mapping (LAST_ADMIN)
**Issue:** Database error `CANNOT_REMOVE_LAST_ADMIN` not mapped to proper API code  
**Fix:**
- Removed old `CANNOT_REMOVE_LAST_ADMIN` (403)
- Added `LAST_ADMIN` error code (HTTP 409 Conflict)
- Error handler catches database exception and returns 409 with LAST_ADMIN code
- Updated all documentation and contracts

### 5. ✅ Invite Accept Concurrency Safety
**Issue:** Invite accept used SELECT then UPDATE (race condition)  
**Fix:**
- Single atomic UPDATE: `UPDATE invites SET status='accepted' WHERE token_hash=$1 AND status='pending' RETURNING *`
- Only one request can succeed in marking invite as accepted
- Email comparison is case-insensitive: `invite.email.toLowerCase() === user.email.toLowerCase()`
- Database uses `citext` type for `invites.email` column
- If email mismatch, reverts invite status back to pending

### 6. ✅ Worker Invite Expiration
**Issue:** No periodic sweep to mark expired invites  
**Fix:**
- Added postgres connection to worker
- `expireInvites()` function runs every 5 minutes
- SQL: `UPDATE invites SET status='expired' WHERE status='pending' AND expires_at < NOW()`
- Runs immediately on startup, then every 5 minutes

### 7. ✅ Account Deletion Comprehensive Purge
**Issue:** Account deletion was documented but not implemented  
**Fix:** Implemented `DELETE /v1/me` in new `apps/api/src/routes/account-deletion.ts`
- **Last-admin check:** For each family where user is active member:
  - If user is admin AND other active members exist AND no other admins → block with 409 LAST_ADMIN
  - If user is sole member → family will be deleted
- **Contribution purge (single transaction):**
  - For each user's contribution:
    - Gets all media attachments
    - Decrements blob `ref_count` for each blob (main and blurred)
    - Enqueues blob deletion to `outbox` for worker
    - Hard-deletes media records
    - Hard-deletes revision history
    - Marks contribution as `purged` with `story = NULL`
    - Writes audit log (contribution ID only, no content)
  - Deletes families where user is sole member
  - Deletes account (cascades handle notifications, keys, etc.)
  - Final audit log (actor will be NULL after)
- **Everything in ONE atomic transaction**

### 8. ✅ Documentation Updates
**Files updated:**
- `docs/account-deletion.md` - New purge logic and last-admin rules
- `docs/backend-contract-v0.4.md` - Updated error codes and table names
- `REVIEW-FIXES.md` - This file

### Deferred Items (TODO in PR)

Per reviewer instruction, these first-round items can be documented as TODO:

1. **First-login race condition:** Handle account creation race when multiple clients login simultaneously
2. **JWKS test keys:** Add mock JWKS endpoint for testing without real Supabase connection
3. **Consent_at tracking:** Consider tracking initial consent timestamp separately from updates
4. **Docker compose:** Add full local dev stack with postgres/supabase in docker-compose.yml

---

## Round 2 (Post-Initial Implementation)

**Account Deletion Decision**

Documented in `docs/account-deletion.md`:

**Constraints:**
1. **Block** deletion if user is last admin with other active members
   - Return 409 CONFLICT
   - Error code: `LAST_ADMIN`
   - User must promote another admin first

2. **Allow & purge** deletion automatically
   - All contributions marked as purged (content cleared)
   - Blob ref_count decremented, deletions enqueued
   - Families where user is sole member are deleted
   - Everything in one transaction

**FK Cascade Behavior:**
- `families.created_by` → SET NULL (family preserved, creator anonymized)
- `family_members.account_id` → CASCADE (memberships deleted)
- `people.account_id` → SET NULL (person preserved, link removed)
- `events.creator_account_id` → SET NULL (event preserved, creator anonymized)
- `contributions.owner_account_id` → CASCADE (purged via deletion transaction)
- `invites.invited_by` → SET NULL (invite preserved, inviter anonymized)
- `audit_log.actor_account_id` → SET NULL (audit preserved, actor anonymized)
- `notifications.account_id` → CASCADE (user's notifications deleted)
- `idempotency_keys.account_id` → CASCADE (user's keys deleted)

---

## Round 1 (Initial Review Fixes)

All blocking issues from the initial review were resolved:

### Blocking Issues Fixed

1. ✅ **Member Removal Bypasses Last-Admin Guard**
   - Updated `check_last_admin()` trigger to fire on `left_at` changes
   - Added `POST /v1/families/:fid/leave` endpoint for self-leave
   - Trigger covers DELETE, role demotion, AND member removal via left_at

2. ✅ **Guard Not Race-Safe**
   - Added `SELECT * FROM families WHERE id = :fid FOR UPDATE` before counting admins
   - Locks the family row to prevent race conditions

3. ✅ **View Bypasses RLS**
   - Added `WITH (security_invoker = true)` to view definition
   - Added `REVOKE ALL ON ai_eligible_contributions FROM anon, authenticated`

4. ✅ **Non-Admin Returns ADMIN_REQUIRED Instead of FORBIDDEN**
   - Changed all `ADMIN_REQUIRED` error codes to `FORBIDDEN` where appropriate
   - Matches v0.4 spec exactly

5. ✅ **Missing Contribution Immutability Trigger**
   - Added `prevent_origin_event_change()` BEFORE UPDATE trigger
   - Added `validate_contribution_state()` trigger for trashed/published state consistency

6. ✅ **Non-Idempotent Migrations**
   - Initially added IF NOT EXISTS/DROP IF EXISTS (now squashed into one file)
   - All migrations safe to run multiple times

7. ✅ **Dockerfile Production Issues**
   - Added `COPY pnpm-lock.yaml ./` to production stage
   - Added `RUN chown -R node:node /app` and `USER node`

8. ✅ **Singular Table Names**
   - Updated all tables to use proper plural/singular naming (finalized in Round 3)

9. ✅ **Missing Invite Flow**
   - Created `invites` table with status (pending/accepted/revoked/expired)
   - Added secure token generation with SHA-256 hash
   - Implemented full invite endpoints
   - 7-day expiration with auto-expire by worker

### Non-Blocking Improvements (Also Applied)

1. ✅ **CORS:** Removed `credentials:true`, added startup check for WEB_ORIGIN
2. ✅ **Account upsert:** `INSERT ... ON CONFLICT DO NOTHING` then SELECT
3. ✅ **Consent timestamp:** Only updates `marketing_consent_at` when value changes
4. ✅ **Caddy:** Removed HSTS preload, simplified config
5. ✅ **Compose:** Removed `version:`, added healthchecks
6. ✅ **Version bumps:** Update triggers increment `version`
7. ✅ **Tests:** Updated for plural tables and invite flow

---

## Verification

✅ Migrations squashed into one idempotent file  
✅ All table names correct per spec  
✅ Contracts build successfully  
✅ API typecheck passes  
✅ Worker typecheck passes  
✅ Last-admin logic allows sole members  
✅ Account deletion implemented with comprehensive purge  
✅ Invite accept is concurrency-safe  
✅ Worker expires invites periodically  

## Files Changed (All Rounds)

- `supabase/migrations/20261021000000_initial_schema.sql` - **Complete squashed migration**
- `apps/api/src/lib/db/schema.ts` - Final table names
- `apps/api/src/lib/env.ts` - Production WEB_ORIGIN check
- `apps/api/src/plugins/auth.ts` - Account upsert
- `apps/api/src/plugins/error-handler.ts` - Database LAST_ADMIN error mapping
- `apps/api/src/routes/account.ts` - Consent logic
- `apps/api/src/routes/account-deletion.ts` - **NEW:** Comprehensive purge endpoint
- `apps/api/src/routes/family.ts` - Invite flow, self-leave, FORBIDDEN errors, atomic accept
- `apps/api/src/routes/index.ts` - Register account-deletion routes
- `apps/api/src/index.ts` - CORS config
- `apps/api/Dockerfile` - Lockfile, USER node
- `apps/worker/src/index.ts` - **NEW:** Invite expiration sweep
- `apps/worker/Dockerfile` - Lockfile, USER node
- `docker-compose.yml` - Healthchecks
- `Caddyfile` - Simplified
- `packages/contracts/src/errors.ts` - `LAST_ADMIN` error code
- `docs/account-deletion.md` - Updated with purge logic
- `docs/backend-contract-v0.4.md` - Updated error codes and table names
- All test files - Updated for final schema

## Status

✅ **Ready for review** - All re-review findings addressed, tested, and documented.
