-- Person claim uniqueness (POST /v1/people/{id}/claim).
-- Partial unique indexes:
--   people_account_id_key          — a person can only have one account (account_id not null)
--   people_family_account_live     — unique (family_id, account_id) among live claimed people
-- Idempotent. API maps 23505 by constraint name to PERSON_ALREADY_CLAIMED /
-- ACCOUNT_ALREADY_LINKED. RLS unchanged; API role still bypasses RLS.

create unique index if not exists people_account_id_key
  on people (account_id)
  where account_id is not null;

create unique index if not exists people_family_account_live
  on people (family_id, account_id)
  where deleted_at is null and account_id is not null;
