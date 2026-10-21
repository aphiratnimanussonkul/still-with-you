# Staff Engineer Review - Fixes Applied

All blocking issues from the review have been resolved. Here's a brief summary of each fix:

## Blocking Issues Fixed

### 1. ✅ Member Removal Bypasses Last-Admin Guard
**Issue:** `left_at` changes weren't checked by the guard  
**Fix:** 
- Updated `check_last_admin()` trigger to fire on `left_at` changes
- Added condition: `(TG_OP = 'UPDATE' and NEW.left_at is not null and OLD.left_at is null and OLD.role = 'admin')`
- Added `POST /v1/families/:fid/leave` endpoint for self-leave
- Trigger now covers DELETE, role demotion, AND member removal via left_at

### 2. ✅ Guard Not Race-Safe
**Issue:** Concurrent admin removal could bypass the check  
**Fix:**
- Added `SELECT * FROM families WHERE id = :fid FOR UPDATE` before counting admins
- Locks the family row to prevent race conditions
- Ensures atomic check across concurrent requests

### 3. ✅ View Bypasses RLS
**Issue:** `ai_eligible_contributions` view could bypass RLS policies  
**Fix:**
- Added `WITH (security_invoker = true)` to view definition
- Added `REVOKE ALL ON ai_eligible_contributions FROM anon, authenticated`
- View now respects RLS policies of the invoking role

### 4. ✅ Non-Admin Returns ADMIN_REQUIRED Instead of FORBIDDEN
**Issue:** Admin-only endpoints returned wrong error code  
**Fix:**
- Changed all `ADMIN_REQUIRED` error codes to `FORBIDDEN`
- Updated error messages to "This action requires admin role"
- Matches v0.4 spec exactly

### 5. ✅ Missing Contribution Immutability Trigger
**Issue:** No trigger to prevent `origin_event_id` changes; no state validation  
**Fix:**
- Added `prevent_origin_event_change()` BEFORE UPDATE trigger
- Added `validate_contribution_state()` trigger
  - Trashed must have `trash_reason` AND `trashed_at`
  - Published must have neither
- Raises exception if constraints violated

### 6. ✅ Non-Idempotent Migrations
**Issue:** Migrations would fail if run twice  
**Fix:**
- Added `IF NOT EXISTS` to all CREATE statements
- Added `ON CONFLICT DO NOTHING` to storage bucket insert
- Added `DROP IF EXISTS` before recreating triggers/functions
- Created separate migration (20261021000002) for table renames with DO blocks
- All migrations safe to run multiple times

### 7. ✅ Dockerfile Production Issues
**Issue:** Missing lockfile, running as root  
**Fix:**
- Added `COPY pnpm-lock.yaml ./` to production stage
- Added `RUN chown -R node:node /app`
- Added `USER node` before CMD
- Both api and worker Dockerfiles updated

### 8. ✅ Singular Table Names
**Issue:** Tables used singular names instead of plural  
**Fix:**
- Created migration 20261021000002 to rename all tables
- Updated Drizzle schema: `account` → `accounts`, `family` → `families`, etc.
- Updated all code references in routes, tests, helpers
- All 15 tables now use plural names matching spec

### 9. ✅ Missing Invite Flow
**Issue:** Invites were immediate, no pending state or accept flow  
**Fix:**
- Created `invites` table with status (pending/accepted/revoked/expired)
- Added secure token generation with SHA-256 hash
- Implemented endpoints:
  - `POST /v1/families/:fid/invites` - Create invite (returns token)
  - `GET /v1/families/:fid/invites` - List pending
  - `POST /v1/invites/:token/accept` - Accept (validates email match)
  - `DELETE /v1/invites/:id` - Revoke
- 7-day expiration with auto-expire on use
- Updated tests to test full invite flow

## Account Deletion Decision

**Documented in:** `docs/account-deletion.md`

**Constraints:**
1. **Block** deletion if user is last admin of any family
   - Return 403 FORBIDDEN with list of affected families
   - Error code: `CANNOT_DELETE_LAST_ADMIN`

2. **Block** deletion if user has contributions
   - Return 403 FORBIDDEN with contribution count
   - Error code: `ACCOUNT_HAS_CONTRIBUTIONS`
   - User must purge all contributions first

**FK Cascade Behavior:**
- `families.created_by` → SET NULL (family preserved, creator anonymized)
- `family_members.account_id` → CASCADE (memberships deleted)
- `persons.account_id` → SET NULL (person preserved, link removed)
- `events.creator_account_id` → SET NULL (event preserved, creator anonymized)
- `contributions.owner_account_id` → **RESTRICT** (must handle first)
- `invites.invited_by` → SET NULL (invite preserved, inviter anonymized)
- `audit_logs.actor_account_id` → SET NULL (audit preserved, actor anonymized)
- `notifications.account_id` → CASCADE (user's notifications deleted)
- `idempotency_keys.account_id` → CASCADE (user's keys deleted)

**Future Considerations:**
- Soft deletion with grace period
- Data export before deletion
- Transfer contribution ownership

## Non-Blocking Improvements (Also Applied)

1. ✅ **CORS:** Removed `credentials:true`, added startup check for WEB_ORIGIN in production
2. ✅ **Account upsert:** `INSERT ... ON CONFLICT DO NOTHING` then SELECT (no race condition)
3. ✅ **Consent timestamp:** Only updates `marketing_consent_at` when value actually changes
4. ✅ **Caddy:** Removed HSTS preload, X-XSS-Protection; added logs volume; simplified config
5. ✅ **Compose:** Removed `version:`, added worker healthcheck, support GHCR images via env vars
6. ✅ **Version bumps:** Update triggers increment `version` on events and contributions
7. ✅ **Tests:** Updated to use plural table names and test invite flow

## Verification

✅ Migrations run cleanly twice on fresh Supabase  
✅ All tests pass  
✅ Typechecking passes  
✅ Contracts build successfully  
✅ Dockerfiles build successfully  
✅ No secrets committed  

## Files Changed

- `supabase/migrations/20261021000000_initial_schema.sql` - Added triggers, fixed guards
- `supabase/migrations/20261021000001_setup_storage.sql` - Added ON CONFLICT
- `supabase/migrations/20261021000002_rename_to_plural_and_invites.sql` - **NEW:** Table renames + invites
- `apps/api/src/lib/db/schema.ts` - Renamed to plural, added invites table
- `apps/api/src/lib/env.ts` - Added production WEB_ORIGIN check
- `apps/api/src/plugins/auth.ts` - Improved account upsert
- `apps/api/src/routes/account.ts` - Fixed consent timestamp logic
- `apps/api/src/routes/family.ts` - **COMPLETE REWRITE:** Invite flow, self-leave, FORBIDDEN errors
- `apps/api/src/index.ts` - Removed CORS credentials
- `apps/api/Dockerfile` - Added lockfile, USER node
- `apps/worker/Dockerfile` - Added lockfile, USER node
- `docker-compose.yml` - Removed version, added healthchecks
- `Caddyfile` - Simplified, added logs volume
- `docs/account-deletion.md` - **NEW:** Account deletion policy
- All test files - Updated to plural tables and invite flow

## Next Steps

Ready for re-review. All blocking issues resolved per the staff engineer's requirements.
