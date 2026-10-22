-- Persist optional relation_label on people (web Family tree).
-- RLS stays on; no grants to anon/authenticated.

alter table people add column if not exists relation_label text;

alter table people enable row level security;

comment on column people.relation_label is 'Optional relation shown in the family tree (e.g. ยาย)';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table people from anon, authenticated;
  end if;
end
$$;
