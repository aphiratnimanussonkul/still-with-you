-- v0.8 family tree: people profile, person_relationships, avatar purpose, person invites.
-- Idempotent: if-not-exists / exception handlers. RLS on; revoke anon/authenticated.

do $$ begin
  create type person_gender as enum ('female', 'male', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type birth_date_precision as enum ('day', 'year');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type relationship_type as enum ('parent', 'spouse');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type media_purpose as enum ('story', 'avatar');
exception when duplicate_object then null;
end $$;

-- People profile columns
alter table people add column if not exists family_name text;
alter table people add column if not exists gender person_gender;
alter table people add column if not exists birth_date_precision birth_date_precision not null default 'day';
alter table people add column if not exists bio text;
alter table people add column if not exists avatar_media_id uuid;
alter table people add column if not exists created_by_account_id uuid references accounts(id);
alter table people add column if not exists created_at timestamptz not null default now();
alter table people add column if not exists updated_at timestamptz not null default now();
alter table people add column if not exists deleted_at timestamptz;

update people p
set created_by_account_id = coalesce(
  (select f.created_by from families f where f.id = p.family_id),
  (select fm.account_id from family_members fm
    where fm.family_id = p.family_id and fm.left_at is null
    order by fm.joined_at
    limit 1)
)
where p.created_by_account_id is null;

alter table people alter column created_by_account_id set not null;

-- Replace global unique account_id with live per-family unique.
alter table people drop constraint if exists people_account_id_key;
drop index if exists people_account_id_key;

create unique index if not exists people_family_account_live
  on people (family_id, account_id)
  where account_id is not null and deleted_at is null;

create unique index if not exists people_id_family_id_key on people (id, family_id);

-- Media purpose (avatars). story_id stays null for avatars.
alter table media add column if not exists purpose media_purpose not null default 'story';
alter table media add column if not exists person_id uuid references people(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'people_avatar_media_id_fkey'
  ) then
    alter table people
      add constraint people_avatar_media_id_fkey
      foreign key (avatar_media_id) references media(id);
  end if;
end
$$;

create unique index if not exists media_person_avatar_live
  on media (person_id)
  where purpose = 'avatar' and deleted_at is null and person_id is not null;

-- Stored edges. Composite FKs keep both people in the same family.
create table if not exists person_relationships (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id),
  person_id uuid not null,
  related_person_id uuid not null,
  type relationship_type not null,
  created_by_account_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  unique (person_id, related_person_id, type),
  check (person_id <> related_person_id),
  foreign key (person_id, family_id) references people(id, family_id),
  foreign key (related_person_id, family_id) references people(id, family_id)
);

alter table person_relationships enable row level security;

create index if not exists idx_person_relationships_family
  on person_relationships (family_id);

-- Person invites (family invites keep person_id null).
alter table invites add column if not exists person_id uuid references people(id);

create unique index if not exists invites_person_pending
  on invites (person_id)
  where person_id is not null and status = 'pending';

-- Unused v0.7 generic relationships table (API never exposed it).
drop table if exists relationships;

alter table people enable row level security;
alter table media enable row level security;
alter table invites enable row level security;
alter table person_relationships enable row level security;

comment on table person_relationships is 'Stored family-tree edges: parent (directed) and spouse (undirected)';
comment on column people.gender is 'female | male | other; null = not specified';
comment on column people.birth_date_precision is 'day | year; year-only stored as YYYY-01-01';
comment on column media.purpose is 'story (default) | avatar; at most one live avatar per person';
comment on column invites.person_id is 'Set for POST /v1/people/{id}/invites; null for family invites';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table people from anon, authenticated;
    revoke all on table media from anon, authenticated;
    revoke all on table invites from anon, authenticated;
    revoke all on table person_relationships from anon, authenticated;
  end if;
end
$$;
