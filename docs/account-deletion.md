# Account Deletion Policy

## Overview

Account deletion is constrained to prevent orphaned families and ensure data integrity. The system enforces that at least one admin must exist in every family.

## Constraints

### 1. Last Admin Protection

An account **CANNOT** be deleted if it is the last admin of any family. The deletion will fail with a clear error message listing the affected families.

**Error Code:** `CANNOT_DELETE_LAST_ADMIN`  
**HTTP Status:** 403 Forbidden

**Error Response:**
```json
{
  "error": {
    "code": "CANNOT_DELETE_LAST_ADMIN",
    "message": "Cannot delete account that is the last admin of one or more families",
    "families": [
      {
        "id": "family-uuid-1",
        "name": "Smith Family"
      },
      {
        "id": "family-uuid-2",
        "name": "Johnson Family"
      }
    ]
  }
}
```

### 2. Required Actions Before Deletion

Before an account can be deleted, the user must:

1. **Transfer admin role** to another member in each family where they are the last admin, OR
2. **Leave the family** after promoting another member to admin

### 3. Foreign Key Cascade Behavior

When an account is deleted (after passing the last-admin check), the following occurs:

| Table | FK Column | Behavior | Notes |
|-------|-----------|----------|-------|
| `families` | `created_by` | **SET NULL** | Family remains, creator is anonymized |
| `family_members` | `account_id` | **CASCADE** | Membership records deleted |
| `persons` | `account_id` | **SET NULL** | Person record preserved, account link removed |
| `events` | `creator_account_id` | **SET NULL** | Event preserved, creator anonymized |
| `contributions` | `owner_account_id` | **RESTRICT** | Must handle contributions first |
| `invites` | `invited_by` | **SET NULL** | Invite preserved, inviter anonymized |
| `audit_logs` | `actor_account_id` | **SET NULL** | Audit trail preserved, actor anonymized |
| `notifications` | `account_id` | **CASCADE** | User's notifications deleted |
| `idempotency_keys` | `account_id` | **CASCADE** | User's idempotency keys deleted |

### 4. Contribution Handling

**Decision:** Contributions use **RESTRICT** on `owner_account_id`.

Before account deletion, the user must:
- Purge all their contributions (published and trashed)
- OR transfer ownership (future feature)

Attempting to delete an account with existing contributions will fail with:

**Error Code:** `ACCOUNT_HAS_CONTRIBUTIONS`  
**HTTP Status:** 403 Forbidden

```json
{
  "error": {
    "code": "ACCOUNT_HAS_CONTRIBUTIONS",
    "message": "Cannot delete account with existing contributions. Purge all contributions first.",
    "contribution_count": 42
  }
}
```

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

1. Check if user is last admin of any family
2. If yes, return 403 with list of affected families
3. Check if user has any contributions
4. If yes, return 403 with contribution count
5. Perform deletion with transaction:
   - Set left_at on all family memberships
   - Cascade delete notifications and idempotency keys
   - Set NULL on foreign keys where configured
   - Delete account record
6. Write audit log (actor_id will be NULL)
7. Invalidate all user's tokens

### User Flow

1. **User initiates deletion** → System checks constraints
2. **If last admin** → Show affected families, guide to promote another admin
3. **If has contributions** → Show count, offer bulk purge with confirmation
4. **All clear** → Final confirmation with explanation of what will be deleted
5. **Confirmed** → Account deleted, user logged out

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
- ✅ Last admin deletion blocked
- ✅ Last admin across multiple families
- ✅ Deletion with contributions blocked
- ✅ Successful deletion after cleanup
- ✅ Foreign key cascade behavior
- ✅ Audit log creation with NULL actor
- ✅ Token invalidation after deletion
