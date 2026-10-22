-- Additive migration for already-deployed databases.
-- Safe to re-run. Fresh installs already have this column in the squashed initial schema.
alter table events add column if not exists archived_at timestamptz;
