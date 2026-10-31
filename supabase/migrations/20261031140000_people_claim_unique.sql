-- Person claim uniqueness (POST /v1/people/{id}/claim).
-- An account may be linked in multiple families, so account_id is not globally unique.
-- Race safety for "one account per person" is UPDATE … WHERE account_id IS NULL
-- (0 rows => 409 PERSON_ALREADY_CLAIMED).
-- people_family_account_live: unique (family_id, account_id) among live claimed people.
-- API maps 23505 on this constraint to 409 ACCOUNT_ALREADY_LINKED.
-- Idempotent. RLS unchanged; API role still bypasses RLS.

drop index if exists people_account_id_key;

create unique index if not exists people_family_account_live
  on people (family_id, account_id)
  where deleted_at is null and account_id is not null;
