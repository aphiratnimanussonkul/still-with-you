-- Additive: events.version for PATCH optimistic concurrency.
-- Fresh installs already have this column in 20261021000000_initial_schema.sql.
-- Existing rows get 1 via DEFAULT. File-only until applied.
-- RLS on; revoke anon/authenticated.

alter table events add column if not exists version integer not null default 1;

alter table events enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table events from anon, authenticated;
  end if;
end
$$;
