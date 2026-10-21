-- Rename tables to plural form and add invites table
-- This migration is safe to run multiple times (idempotent)

-- Drop views and triggers first (they reference the tables)
drop view if exists ai_eligible_contributions cascade;
drop trigger if exists enforce_last_admin on family_member;
drop trigger if exists add_creator_as_admin on family;
drop trigger if exists update_event_timestamp on event;
drop trigger if exists update_contribution_timestamp on contribution;
drop trigger if exists prevent_origin_event_change on contribution;
drop trigger if exists validate_contribution_state on contribution;
drop trigger if exists media_ref_count on media;

-- Rename tables to plural
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'account') then
    alter table account rename to accounts;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'family') then
    alter table family rename to families;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'family_member') then
    alter table family_member rename to family_members;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'person') then
    alter table person rename to persons;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'relationship') then
    alter table relationship rename to relationships;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'event') then
    alter table event rename to events;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'event_person') then
    alter table event_person rename to event_persons;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'contribution') then
    alter table contribution rename to contributions;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'blob') then
    alter table blob rename to blobs;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'media') then
    alter table media rename to medias;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'contribution_revision') then
    alter table contribution_revision rename to contribution_revisions;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'audit_log') then
    alter table audit_log rename to audit_logs;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'outbox') then
    alter table outbox rename to outboxes;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'notification') then
    alter table notification rename to notifications;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'idempotency_key') then
    alter table idempotency_key rename to idempotency_keys;
  end if;
end $$;

-- Create invites table
create table if not exists invites (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id),
  email text not null,
  role member_role not null default 'member',
  invited_by uuid not null references accounts(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table invites enable row level security;

create index if not exists idx_invites_email_status on invites(email, status);
create index if not exists idx_invites_family on invites(family_id);
create index if not exists idx_invites_token on invites(token_hash);

-- Recreate triggers on renamed tables
create trigger enforce_last_admin
  before update or delete on family_members
  for each row
  execute function check_last_admin();

create trigger add_creator_as_admin
  after insert on families
  for each row
  execute function set_creator_as_admin();

create trigger update_event_timestamp
  before update on events
  for each row
  execute function update_event_timestamp();

create trigger update_contribution_timestamp
  before update on contributions
  for each row
  execute function update_contribution_timestamp();

create trigger prevent_origin_event_change
  before update on contributions
  for each row
  execute function prevent_origin_event_change();

create trigger validate_contribution_state
  before insert or update on contributions
  for each row
  execute function validate_contribution_state();

create trigger media_ref_count
  after insert or delete on medias
  for each row
  execute function update_blob_ref_count();

-- Recreate view with security_invoker
create or replace view ai_eligible_contributions 
with (security_invoker = true) as
select c.*
from contributions c
where c.status = 'published';

revoke all on ai_eligible_contributions from anon, authenticated;

-- Update function references to use plural table names
create or replace function set_creator_as_admin()
returns trigger as $$
begin
  insert into family_members (family_id, account_id, role)
  values (NEW.id, NEW.created_by, 'admin')
  on conflict do nothing;
  return NEW;
end;
$$ language plpgsql;

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
    from families 
    where id = COALESCE(NEW.family_id, OLD.family_id)
    for update;
    
    -- Count remaining active admins (excluding the one being removed/demoted)
    select count(*) into admin_count
    from family_members
    where family_id = COALESCE(NEW.family_id, OLD.family_id)
      and role = 'admin'
      and left_at is null
      and account_id != OLD.account_id;
    
    if admin_count = 0 then
      raise exception 'CANNOT_REMOVE_LAST_ADMIN: At least one admin must exist in the family';
    end if;
  end if;
  
  return COALESCE(NEW, OLD);
end;
$$ language plpgsql;

-- Update comments
comment on table accounts is 'User accounts from Supabase Auth';
comment on table families is 'Family groups that organize memories';
comment on table family_members is 'Members of families with roles (admin/member)';
comment on table invites is 'Pending family invitations';
comment on column family_members.role is 'Admin can invite, promote/demote members; all can create events';
comment on table persons is 'People in family tree, may or may not have accounts';
comment on table events is 'Memory events that group contributions';
comment on column events.status is 'active (normal), archived (hidden from others), deleted (tombstone)';
comment on table contributions is 'Individual stories with optional photos';
comment on column contributions.origin_event_id is 'Original event, never changes even if event_id becomes null';
comment on table blobs is 'File storage references with ref counting';
comment on column blobs.ref_count is 'Number of media entries referencing this blob';
comment on table audit_logs is 'Audit trail without content (privacy)';
comment on table outboxes is 'Async job queue for worker';
