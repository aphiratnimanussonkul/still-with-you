-- Initial schema for Still With You v0.4
-- Creates all tables, enums, indexes, triggers, and RLS policies

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create enums
create type event_status as enum ('active', 'archived', 'deleted');
create type contribution_status as enum ('published', 'trashed', 'purged');
create type trash_reason as enum ('owner', 'event_deleted');
create type member_role as enum ('member', 'admin');

-- Account table
create table account (
  id uuid primary key default uuid_generate_v4(),
  auth_id text unique not null,
  email text unique,
  display_name text not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table account enable row level security;

-- Family table
create table family (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid not null references account(id),
  created_at timestamptz not null default now()
);

alter table family enable row level security;

-- Family member table
create table family_member (
  family_id uuid references family(id),
  account_id uuid references account(id),
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (family_id, account_id)
);

alter table family_member enable row level security;

-- Create index for active members
create index idx_family_member_active on family_member(family_id, account_id) where left_at is null;

-- Person table
create table person (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references family(id),
  display_name text not null,
  birth_date date,
  death_date date,
  account_id uuid unique references account(id)
);

alter table person enable row level security;

-- Relationship table
create table relationship (
  family_id uuid not null references family(id),
  from_person_id uuid not null references person(id),
  to_person_id uuid not null references person(id),
  type text not null,
  primary key (from_person_id, to_person_id, type)
);

alter table relationship enable row level security;

-- Event table
create table event (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references family(id),
  creator_account_id uuid not null references account(id),
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

alter table event enable row level security;

create index idx_event_family_status on event(family_id, status);
create index idx_event_creator on event(creator_account_id);

-- Event person junction table
create table event_person (
  event_id uuid references event(id),
  person_id uuid references person(id),
  primary key (event_id, person_id)
);

alter table event_person enable row level security;

-- Contribution table
create table contribution (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references family(id),
  owner_account_id uuid not null references account(id),
  narrator_person_id uuid references person(id),
  event_id uuid references event(id) on delete set null,
  origin_event_id uuid not null references event(id),
  origin_event_title_snapshot text,
  story text,
  status contribution_status not null default 'published',
  trashed_at timestamptz,
  trash_reason trash_reason,
  derived_from_contribution_id uuid references contribution(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_story_required check (
    status = 'purged' or (story is not null and length(btrim(story)) > 0)
  )
);

alter table contribution enable row level security;

create index idx_contribution_owner_status on contribution(owner_account_id, status);
create index idx_contribution_event on contribution(event_id) where status = 'published';
create index idx_contribution_origin_event on contribution(origin_event_id);

-- Blob table for file storage
create table blob (
  id uuid primary key default uuid_generate_v4(),
  storage_key text unique not null,
  mime text not null,
  size_bytes bigint not null,
  sha256 text not null,
  ref_count int not null default 0 check (ref_count >= 0),
  created_at timestamptz not null default now()
);

alter table blob enable row level security;

create index idx_blob_ref_count_zero on blob(id) where ref_count = 0;

-- Media table
create table media (
  id uuid primary key default uuid_generate_v4(),
  contribution_id uuid not null references contribution(id),
  blob_id uuid not null references blob(id),
  blurred_blob_id uuid references blob(id),
  taken_by_person_id uuid references person(id),
  sort_order int not null
);

alter table media enable row level security;

create index idx_media_contribution on media(contribution_id);

-- Contribution revision history
create table contribution_revision (
  contribution_id uuid references contribution(id) on delete cascade,
  version int,
  story text not null,
  edited_by uuid not null references account(id),
  edited_at timestamptz not null default now(),
  primary key (contribution_id, version)
);

alter table contribution_revision enable row level security;

-- Audit log (no content stored)
create table audit_log (
  id bigserial primary key,
  actor_account_id uuid references account(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  at timestamptz not null default now()
);

alter table audit_log enable row level security;

create index idx_audit_log_actor on audit_log(actor_account_id);
create index idx_audit_log_target on audit_log(target_type, target_id);

-- Outbox for async processing
create table outbox (
  id bigserial primary key,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table outbox enable row level security;

create index idx_outbox_unsent on outbox(created_at) where sent_at is null;

-- Notification table
create table notification (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references account(id),
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table notification enable row level security;

create index idx_notification_account_unread on notification(account_id, created_at) where read_at is null;

-- Idempotency key table
create table idempotency_key (
  account_id uuid not null references account(id),
  key text not null,
  response jsonb,
  created_at timestamptz default now(),
  primary key (account_id, key)
);

alter table idempotency_key enable row level security;

-- Function to ensure at least one admin exists (race-safe with row lock)
create or replace function check_last_admin()
returns trigger as $$
declare
  family_row record;
  admin_count int;
begin
  -- When removing (left_at set), deleting, or demoting an admin
  if (TG_OP = 'DELETE' or 
      (TG_OP = 'UPDATE' and NEW.role = 'member' and OLD.role = 'admin') or
      (TG_OP = 'UPDATE' and NEW.left_at is not null and OLD.left_at is null and OLD.role = 'admin')) then
    
    -- Lock the family row to prevent race conditions
    select * into family_row 
    from family 
    where id = COALESCE(NEW.family_id, OLD.family_id)
    for update;
    
    -- Count remaining active admins (excluding the one being removed/demoted)
    select count(*) into admin_count
    from family_member
    where family_id = COALESCE(NEW.family_id, OLD.family_id)
      and role = 'admin'
      and left_at is null
      and account_id != OLD.account_id;
    
    -- Raise error if this is the last admin
    if admin_count = 0 then
      raise exception 'CANNOT_REMOVE_LAST_ADMIN: At least one admin must exist in the family';
    end if;
  end if;
  
  return COALESCE(NEW, OLD);
end;
$$ language plpgsql;

-- Trigger to prevent removing last admin
create trigger enforce_last_admin
  before update or delete on family_member
  for each row
  execute function check_last_admin();

-- Function to make family creator first admin
create or replace function set_creator_as_admin()
returns trigger as $$
begin
  insert into family_member (family_id, account_id, role)
  values (NEW.id, NEW.created_by, 'admin');
  return NEW;
end;
$$ language plpgsql;

-- Trigger to auto-add creator as admin
create trigger add_creator_as_admin
  after insert on family
  for each row
  execute function set_creator_as_admin();

-- Function to update event updated_at and bump version
create or replace function update_event_timestamp()
returns trigger as $$
begin
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  return NEW;
end;
$$ language plpgsql;

-- Trigger for event updates
create trigger update_event_timestamp
  before update on event
  for each row
  execute function update_event_timestamp();

-- Function to update contribution updated_at and bump version
create or replace function update_contribution_timestamp()
returns trigger as $$
begin
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  return NEW;
end;
$$ language plpgsql;

-- Trigger for contribution updates
create trigger update_contribution_timestamp
  before update on contribution
  for each row
  execute function update_contribution_timestamp();

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

-- Trigger to make origin_event_id immutable
create trigger prevent_origin_event_change
  before update on contribution
  for each row
  execute function prevent_origin_event_change();

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

-- Trigger to validate contribution state
create trigger validate_contribution_state
  before insert or update on contribution
  for each row
  execute function validate_contribution_state();

-- Function to update blob ref_count when media is added/removed
create or replace function update_blob_ref_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update blob set ref_count = ref_count + 1 where id = NEW.blob_id;
    if NEW.blurred_blob_id is not null then
      update blob set ref_count = ref_count + 1 where id = NEW.blurred_blob_id;
    end if;
  elsif TG_OP = 'DELETE' then
    update blob set ref_count = ref_count - 1 where id = OLD.blob_id;
    if OLD.blurred_blob_id is not null then
      update blob set ref_count = ref_count - 1 where id = OLD.blurred_blob_id;
    end if;
  end if;
  return COALESCE(NEW, OLD);
end;
$$ language plpgsql;

-- Trigger for media changes
create trigger media_ref_count
  after insert or delete on media
  for each row
  execute function update_blob_ref_count();

-- Create view for AI-eligible contributions (excludes trashed/purged)
-- Use security_invoker to respect RLS policies
create view ai_eligible_contributions 
with (security_invoker = true) as
select c.*
from contribution c
where c.status = 'published';

-- Revoke access from anon and authenticated roles
revoke all on ai_eligible_contributions from anon, authenticated;

-- Grant permissions to service role (this is what the API uses)
-- Note: In production, create a dedicated role instead of using postgres
grant usage on schema public to postgres;
grant all on all tables in schema public to postgres;
grant all on all sequences in schema public to postgres;

-- Comments for documentation
comment on table account is 'User accounts from Supabase Auth';
comment on table family is 'Family groups that organize memories';
comment on table family_member is 'Members of families with roles (admin/member)';
comment on column family_member.role is 'Admin can invite, promote/demote members; all can create events';
comment on table person is 'People in family tree, may or may not have accounts';
comment on table event is 'Memory events that group contributions';
comment on column event.status is 'active (normal), archived (hidden from others), deleted (tombstone)';
comment on table contribution is 'Individual stories with optional photos';
comment on column contribution.origin_event_id is 'Original event, never changes even if event_id becomes null';
comment on table blob is 'File storage references with ref counting';
comment on column blob.ref_count is 'Number of media entries referencing this blob';
comment on table audit_log is 'Audit trail without content (privacy)';
comment on table outbox is 'Async job queue for worker';
