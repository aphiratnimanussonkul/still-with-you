-- v0.5 signed-URL photo uploads. Replaces the unused blob-junction media table.
-- Idempotent: safe to re-run. Does not drop the v0.5 table if it already exists.

drop trigger if exists media_ref_count on media;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media' and column_name = 'blob_id'
  ) then
    drop table media;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'media'
  ) then
    drop type if exists media_status;
  end if;
end
$$;

do $$ begin
  create type media_status as enum ('pending', 'uploaded', 'ready', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists media (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id),
  uploader_account_id uuid not null references accounts(id),
  story_id uuid references contributions(id) on delete set null,
  storage_key text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  width int,
  height int,
  thumb_key text,
  status media_status not null default 'pending',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table media enable row level security;

create index if not exists idx_media_family on media(family_id);
create index if not exists idx_media_story on media(story_id) where deleted_at is null;
create index if not exists idx_media_uploader on media(uploader_account_id);
create index if not exists idx_media_cleanup on media(status, created_at)
  where deleted_at is null and story_id is null;

comment on table media is 'Story photos uploaded via signed URLs; story_id is the contribution';
comment on column media.storage_key is '{family_id}/{media_id}';
comment on column media.status is 'pending | uploaded | ready | failed';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table media from anon, authenticated;
  end if;
end
$$;
