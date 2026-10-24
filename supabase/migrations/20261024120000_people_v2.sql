-- People v2: is_living, death_date_precision, relation_label if missing.
-- death_date already exists. RLS on; no grants to anon/authenticated.
-- Idempotent: if-not-exists / exception handlers.

alter table people add column if not exists is_living boolean not null default true;
alter table people add column if not exists death_date_precision text;
alter table people add column if not exists relation_label text;

update people
set is_living = false
where death_date is not null and is_living is true;

update people
set death_date_precision = 'day'
where death_date is not null and death_date_precision is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'people_death_date_precision_check'
  ) then
    alter table people
      add constraint people_death_date_precision_check
      check (death_date_precision is null or death_date_precision in ('day', 'year'));
  end if;
end
$$;

alter table people enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table people from anon, authenticated;
  end if;
end
$$;
