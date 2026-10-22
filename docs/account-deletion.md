# Account Deletion Policy

## Overview

Account deletion is constrained to prevent orphaned families and ensure data integrity. The system enforces that at least one admin must exist in every family.

## Constraints

### 1. Last Admin Protection (When Other Members Exist)

An account **CANNOT** be deleted if it is the last admin of any family **that has other active members**. The deletion will fail with a clear error message.

If the account is the **sole member** of a family (last admin and last member), the family will be deleted along with the account via the purge path.

**Error Code:** `LAST_ADMIN`  
**HTTP Status:** 409 Conflict

**Error Response:**
```json
{
  "error": {
    "code": "LAST_ADMIN",
    "message": "Cannot delete account: you are the last admin of \"Smith Family\" which has other members. Promote another admin first."
  }
}
```

### 2. Automatic Purge (No Manual Steps Required)

Account deletion now **automatically purges everything** in one transaction:

- ✅ All contributions marked as purged, content hard-deleted
- ✅ Contribution revisions hard-deleted
- ✅ Media hard-deleted, blob ref_count decremented
- ✅ Blob file deletions enqueued to outbox for worker
- ✅ Audit log entries created (IDs only, no content)
- ✅ Families where account is sole member are deleted
- ✅ Account deleted with cascades

**No manual cleanup required** - the user does NOT need to purge contributions first.

### 3. Foreign Key Cascade Behavior

When an account is deleted (after passing the last-admin check), the following occurs:

| Table | FK Column | Behavior | Notes |
|-------|-----------|----------|-------|
| `families` | `created_by` | **SET NULL** | Family remains, creator is anonymized |
| `family_members` | `account_id` | **CASCADE** | Membership records deleted |
| `persons` | `account_id` | **SET NULL** | Person record preserved, account link removed |
| `events` | `creator_account_id` | **SET NULL** | Event preserved, creator anonymized |
| `contributions` | `owner_account_id` | **CASCADE** | Purged via deletion transaction |
| `invites` | `invited_by` | **SET NULL** | Invite preserved, inviter anonymized |
| `audit_logs` | `actor_account_id` | **SET NULL** | Audit trail preserved, actor anonymized |
| `notifications` | `account_id` | **CASCADE** | User's notifications deleted |
| `idempotency_keys` | `account_id` | **CASCADE** | User's idempotency keys deleted |

### 4. Contribution Purge Process

**Decision:** Contributions are **automatically purged** during account deletion.

The deletion transaction:
1. Fetches all user's contributions
2. For each contribution:
   - Gets all media attachments
   - Decrements blob `ref_count` for each blob
   - Enqueues blob file deletion to `outbox` for worker
   - Hard-deletes media records
   - Hard-deletes revision history
   - Marks contribution as `purged` with `story = NULL`
   - Writes audit log (contribution ID only, no content)
3. Deletes families where user is sole member
4. Deletes account (cascades handle the rest)
5. Final audit log entry (actor will be NULL after deletion)

## Implementation

### Database Constraints

```sql
-- Add check constraint for last admin (enforced via trigger)
-- Foreign key behaviors:
alter table families 
  alter column created_by 
  set default null; -- Allow NULL after SET NULL

alter table contributions
  drop constraint contributions_owner_account_id_fkey,
  add constraint contributions_owner_account_id_fkey
    foreign key (owner_account_id)
    references accounts(id)
    on delete restrict;
```

### API Endpoint

```
DELETE /v1/me/account
```

**Implementation Steps:**

1. Start transaction
2. For each family where user is active member:
   - If user is admin, check if other active members exist
   - If yes and no other admins, **block** with 409 LAST_ADMIN
   - If user is sole member, mark family for deletion
3. Purge all user's contributions:
   - Get all media, decrement blob ref_count
   - Enqueue blob deletions to outbox
   - Hard-delete media and revisions
   - Mark contributions as purged (story = NULL)
   - Write audit logs (IDs only)
4. Delete families where user was sole member
5. Delete account (cascades handle notifications, keys, etc.)
6. Write final audit log (actor will be NULL)
7. Commit transaction

### User Flow

1. **User initiates deletion** → System checks last-admin constraint
2. **If last admin with other members** → 409 error, must promote another admin first
3. **If sole member** → Family deleted automatically
4. **Final confirmation** → Explain contributions will be purged, data lost
5. **Confirmed** → Everything purged in one transaction, user logged out

## Future Considerations

### Soft Deletion Option

Instead of hard deletion, implement account deactivation:
- Set `deactivated_at` timestamp
- Prevent login but preserve all data
- Allow reactivation within grace period (e.g., 30 days)
- Auto-purge after grace period

### Data Export

Before deletion, offer data export:
- Download all contributions as JSON/PDF
- Include media files
- Generate family tree visualization
- Export audit trail

### Transfer Ownership

Allow transferring contribution ownership:
- Select another family member as new owner
- Preserve original creator in metadata
- Useful when leaving a family but wanting to preserve contributions

## Testing

Test cases must cover:
- ✅ Last admin with other members → blocked (409 LAST_ADMIN)
- ✅ Sole member (last admin, no other members) → family deleted
- ✅ Contributions automatically purged
- ✅ Blob ref_count decremented
- ✅ Blob deletions enqueued to outbox
- ✅ Audit logs created with IDs only (no content)
- ✅ Foreign key cascade behavior
- ✅ Transaction rollback on error
- ✅ Multiple families handled correctly
