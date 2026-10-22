-- Still With You - Complete Schema (v0.4)
-- Idempotent: safe to run multiple times
-- Final table names: people, media, outbox, event_people, audit_log (singular per spec)

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "citext";

-- Create enums (idempotent)
do $$ begin
  create type event_status as enum ('active', 'archived', 'deleted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type contribution_status as enum ('published', 'trashed', 'purged');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type trash_reason as enum ('owner', 'event_deleted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type member_role as enum ('member', 'admin');
exception when duplicate_object then null;
end $$;

-- Accounts table
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  auth_id text unique not null,
  email citext unique,
  display_name text not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  consent_answered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;

-- Idempotent for databases created before consent_answered_at existed
alter table accounts add column if not exists consent_answered_at timestamptz;

-- Families table
create table if not exists families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table families enable row level security;

-- Family members table
create table if not exists family_members (
  family_id uuid references families(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (family_id, account_id)
);

alter table family_members enable row level security;

create index if not exists idx_family_member_active on family_members(family_id, account_id) where left_at is null;

-- People table
create table if not exists people (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  display_name text not null,
  birth_date date,
  death_date date,
  account_id uuid unique references accounts(id) on delete set null
);

alter table people enable row level security;

-- Relationships table
create table if not exists relationships (
  family_id uuid not null references families(id) on delete cascade,
  from_person_id uuid not null references people(id) on delete cascade,
  to_person_id uuid not null references people(id) on delete cascade,
  type text not null,
  primary key (from_person_id, to_person_id, type)
);

alter table relationships enable row level security;

-- Events table
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  creator_account_id uuid references accounts(id) on delete set null,
  title text,
  description text,
  occurred_from date,
  occurred_to date,
  date_precision text,
  location text,
  status event_status not null default 'active',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  constraint check_deleted_event check (
    status <> 'deleted' or (title is null and description is null and location is null)
  ),
  constraint check_active_event_has_title check (
    status = 'deleted' or (title is not null and length(btrim(title)) > 0)
  )
);

alter table events enable row level security;

-- Idempotent for databases created before archived_at existed
alter table events add column if not exists archived_at timestamptz;

create index if not exists idx_event_family_status on events(family_id, status);
create index if not exists idx_event_creator on events(creator_account_id);

-- Event people junction table
create table if not exists event_people (
  event_id uuid references events(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  primary key (event_id, person_id)
);

alter table event_people enable row level security;

-- Contributions table
create table if not exists contributions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  owner_account_id uuid references accounts(id) on delete cascade,
  narrator_person_id uuid references people(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  origin_event_id uuid not null references events(id),
  origin_event_title_snapshot text,
  story text,
  status contribution_status not null default 'published',
  trashed_at timestamptz,
  trash_reason trash_reason,
  derived_from_contribution_id uuid references contributions(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_story_required check (
    status = 'purged' or (story is not null and length(btrim(story)) > 0)
  )
);

alter table contributions enable row level security;

create index if not exists idx_contribution_owner_status on contributions(owner_account_id, status);
create index if not exists idx_contribution_event on contributions(event_id) where status = 'published';
create index if not exists idx_contribution_origin_event on contributions(origin_event_id);

-- Blobs table for file storage
create table if not exists blobs (
  id uuid primary key default uuid_generate_v4(),
  storage_key text unique not null,
  mime text not null,
  size_bytes bigint not null,
  sha256 text not null,
  ref_count int not null default 0 check (ref_count >= 0),
  created_at timestamptz not null default now()
);

alter table blobs enable row level security;

create index if not exists idx_blob_ref_count_zero on blobs(id) where ref_count = 0;

-- Media table
create table if not exists media (
  id uuid primary key default uuid_generate_v4(),
  contribution_id uuid not null references contributions(id) on delete cascade,
  blob_id uuid not null references blobs(id),
  blurred_blob_id uuid references blobs(id),
  taken_by_person_id uuid references people(id) on delete set null,
  sort_order int not null
);

alter table media enable row level security;

create index if not exists idx_media_contribution on media(contribution_id);

-- Contribution revisions history
create table if not exists contribution_revisions (
  contribution_id uuid references contributions(id) on delete cascade,
  version int,
  story text not null,
  edited_by uuid references accounts(id) on delete set null,
  edited_at timestamptz not null default now(),
  primary key (contribution_id, version)
);

alter table contribution_revisions enable row level security;

-- Audit log (singular per spec, no content stored)
create table if not exists audit_log (
  id bigserial primary key,
  actor_account_id uuid references accounts(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  at timestamptz not null default now()
);

alter table audit_log enable row level security;

create index if not exists idx_audit_log_actor on audit_log(actor_account_id);
create index if not exists idx_audit_log_target on audit_log(target_type, target_id);

-- Outbox for async processing (singular per spec)
create table if not exists outbox (
  id bigserial primary key,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table outbox enable row level security;

create index if not exists idx_outbox_unsent on outbox(created_at) where sent_at is null;

-- Notifications table
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table notifications enable row level security;

create index if not exists idx_notification_account_unread on notifications(account_id, created_at) where read_at is null;

-- Idempotency keys table
create table if not exists idempotency_keys (
  account_id uuid not null references accounts(id) on delete cascade,
  key text not null,
  response jsonb,
  created_at timestamptz default now(),
  primary key (account_id, key)
);

alter table idempotency_keys enable row level security;

-- Invites table
create table if not exists invites (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  email citext not null,
  role member_role not null default 'member',
  invited_by uuid references accounts(id) on delete set null,
  status text not null default 'pending',
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint check_invite_status check (status in ('pending', 'accepted', 'revoked', 'expired'))
);

alter table invites enable row level security;

create index if not exists idx_invites_email on invites(email);
create index if not exists idx_invites_family on invites(family_id);
create index if not exists idx_invites_token on invites(token_hash);

-- Functions and triggers

-- Function to check last admin (race-safe, allows sole member)
create or replace function check_last_admin()
returns trigger as $$
declare
  family_row record;
  admin_count int;
  total_active_members int;
begin
  -- When removing (left_at set), deleting, or demoting an admin
  if (TG_OP = 'DELETE' or 
      (TG_OP = 'UPDATE' and NEW.role = 'member' and OLD.role = 'admin') or
      (TG_OP = 'UPDATE' and NEW.left_at is not null and OLD.left_at is null and OLD.role = 'admin')) then
    
    -- Lock the family row to prevent race conditions
    select * into family_row 
    from families 
    where id = COALESCE(NEW.family_id, OLD.family_id)
    for update;
    
    -- Count remaining active members (excluding the one being removed/demoted)
    select count(*) into total_active_members
    from family_members
    where family_id = COALESCE(NEW.family_id, OLD.family_id)
      and left_at is null
      and account_id != OLD.account_id;
    
    -- For demotion (role change): ALWAYS block if no other admins, even for sole member
    if (TG_OP = 'UPDATE' and NEW.role = 'member' and OLD.role = 'admin') then
      -- Count remaining active admins (excluding the one being demoted)
      select count(*) into admin_count
      from family_members
      where family_id = COALESCE(NEW.family_id, OLD.family_id)
        and role = 'admin'
        and left_at is null
        and account_id != OLD.account_id;
      
      if admin_count = 0 then
        raise exception 'Cannot demote last admin' using errcode = 'P0L01';
      end if;
    -- For removal/leave: allow if sole member (family will be deleted via purge)
    else
      -- If this is the sole member, allow (family will be deleted via purge path)
      if total_active_members = 0 then
        return COALESCE(NEW, OLD);
      end if;
      
      -- Count remaining active admins (excluding the one being removed)
      select count(*) into admin_count
      from family_members
      where family_id = COALESCE(NEW.family_id, OLD.family_id)
        and role = 'admin'
        and left_at is null
        and account_id != OLD.account_id;
      
      -- If other members exist but no admins would remain, block
      if admin_count = 0 then
        raise exception 'Cannot remove last admin when other members exist' using errcode = 'P0L01';
      end if;
    end if;
  end if;
  
  return COALESCE(NEW, OLD);
end;
$$ language plpgsql;

-- Function to set creator as admin
create or replace function set_creator_as_admin()
returns trigger as $$
begin
  insert into family_members (family_id, account_id, role)
  values (NEW.id, NEW.created_by, 'admin')
  on conflict do nothing;
  return NEW;
end;
$$ language plpgsql;

-- Function to update event timestamp and bump version
create or replace function update_event_timestamp()
returns trigger as $$
begin
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  return NEW;
end;
$$ language plpgsql;

-- Function to update contribution timestamp and bump version
create or replace function update_contribution_timestamp()
returns trigger as $$
begin
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  return NEW;
end;
$$ language plpgsql;

-- Function to prevent origin_event_id changes
create or replace function prevent_origin_event_change()
returns trigger as $$
begin
  if NEW.origin_event_id != OLD.origin_event_id then
    raise exception 'origin_event_id cannot be changed after creation';
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Function to validate contribution state consistency
create or replace function validate_contribution_state()
returns trigger as $$
begin
  -- Trashed must have trash_reason and trashed_at
  if NEW.status = 'trashed' and (NEW.trash_reason is null or NEW.trashed_at is null) then
    raise exception 'Trashed contributions must have trash_reason and trashed_at';
  end if;
  
  -- Published must not have trash_reason or trashed_at
  if NEW.status = 'published' and (NEW.trash_reason is not null or NEW.trashed_at is not null) then
    raise exception 'Published contributions cannot have trash_reason or trashed_at';
  end if;
  
  return NEW;
end;
$$ language plpgsql;

-- Function to update blob ref_count
create or replace function update_blob_ref_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update blobs set ref_count = ref_count + 1 where id = NEW.blob_id;
    if NEW.blurred_blob_id is not null then
      update blobs set ref_count = ref_count + 1 where id = NEW.blurred_blob_id;
    end if;
  elsif TG_OP = 'DELETE' then
    update blobs set ref_count = ref_count - 1 where id = OLD.blob_id;
    if OLD.blurred_blob_id is not null then
      update blobs set ref_count = ref_count - 1 where id = OLD.blurred_blob_id;
    end if;
  end if;
  return COALESCE(NEW, OLD);
end;
$$ language plpgsql;

-- Create triggers (idempotent with drop if exists)
drop trigger if exists enforce_last_admin on family_members;
create trigger enforce_last_admin
  before update or delete on family_members
  for each row
  execute function check_last_admin();

drop trigger if exists add_creator_as_admin on families;
create trigger add_creator_as_admin
  after insert on families
  for each row
  execute function set_creator_as_admin();

drop trigger if exists update_event_timestamp on events;
create trigger update_event_timestamp
  before update on events
  for each row
  execute function update_event_timestamp();

drop trigger if exists update_contribution_timestamp on contributions;
create trigger update_contribution_timestamp
  before update on contributions
  for each row
  execute function update_contribution_timestamp();

drop trigger if exists prevent_origin_event_change on contributions;
create trigger prevent_origin_event_change
  before update on contributions
  for each row
  execute function prevent_origin_event_change();

drop trigger if exists validate_contribution_state on contributions;
create trigger validate_contribution_state
  before insert or update on contributions
  for each row
  execute function validate_contribution_state();

drop trigger if exists media_ref_count on media;
create trigger media_ref_count
  after insert or delete on media
  for each row
  execute function update_blob_ref_count();

-- Create view for AI-eligible contributions (security_invoker)
create or replace view ai_eligible_contributions 
with (security_invoker = true) as
select c.*
from contributions c
where c.status = 'published';

revoke all on ai_eligible_contributions from anon, authenticated;

-- Setup storage bucket (no-op when storage schema is absent, e.g. swy_test)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'private-media',
      'private-media',
      false,
      20971520,
      array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    )
    on conflict (id) do nothing;
  end if;
end
$$;

-- Comments
comment on table accounts is 'User accounts from Supabase Auth';
comment on table families is 'Family groups that organize memories';
comment on table family_members is 'Members of families with roles (admin/member)';
comment on column family_members.role is 'member or admin. admin is the family steward (no separate table); stewards can invite, change roles, and manage any event';
comment on table people is 'People in family tree, may or may not have accounts';
comment on table events is 'Memory events that group contributions';
comment on column events.status is 'active (normal), archived (hidden from others), deleted (tombstone)';
comment on table contributions is 'Individual stories with optional photos';
comment on column contributions.origin_event_id is 'Original event, never changes even if event_id becomes null';
comment on table blobs is 'File storage references with ref counting';
comment on column blobs.ref_count is 'Number of media entries referencing this blob';
comment on table audit_log is 'Audit trail without content (privacy)';
comment on table outbox is 'Async job queue for worker';
comment on table invites is 'Pending family invitations with secure tokens';

-- Revoke PostgREST role privileges. The API (service role) is the only access path.
-- Idempotent and a no-op when anon/authenticated are absent (vanilla Postgres).
-- Already applied manually to the live project.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;

    alter default privileges in schema public
      revoke all on tables from anon, authenticated;
    alter default privileges in schema public
      revoke all on sequences from anon, authenticated;
    alter default privileges in schema public
      revoke all on functions from anon, authenticated;

    if exists (select 1 from pg_roles where rolname = 'postgres') then
      alter default privileges for role postgres in schema public
        revoke all on tables from anon, authenticated;
      alter default privileges for role postgres in schema public
        revoke all on sequences from anon, authenticated;
      alter default privileges for role postgres in schema public
        revoke all on functions from anon, authenticated;
    end if;
  end if;
end
$$;
