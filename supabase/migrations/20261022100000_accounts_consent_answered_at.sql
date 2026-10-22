-- Additive migration for already-deployed databases.
-- Safe to re-run. Fresh installs already have this column in the squashed initial schema.
alter table accounts add column if not exists consent_answered_at timestamptz;

-- Rows that already recorded a marketing_consent change have answered.
update accounts
set consent_answered_at = marketing_consent_at
where consent_answered_at is null
  and marketing_consent_at is not null;
