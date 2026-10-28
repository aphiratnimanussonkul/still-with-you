-- v0.9 worker-generated image variants.
-- Placeholder WebP (≤1KB payload) lives on media; thumbnails + full live in media_variants + Storage.
-- Idempotent: safe to re-run. RLS on; no grants to anon/authenticated.
-- File-only in this PR: do not apply to production from the agent.

alter table media add column if not exists placeholder_webp text;

comment on column media.placeholder_webp is
  'data:image/webp;base64,... LQIP. WebP payload ≤ 1024 bytes. Null until the worker generates it.';

do $$ begin
  create type media_variant_kind as enum ('avatar', 'cover_card', 'cover_detail', 'full');
exception when duplicate_object then null;
end $$;

create table if not exists media_variants (
  media_id uuid not null references media(id) on delete cascade,
  kind media_variant_kind not null,
  storage_key text not null unique,
  content_type text not null,
  width int not null,
  height int not null,
  size_bytes int not null,
  created_at timestamptz not null default now(),
  primary key (media_id, kind)
);

alter table media_variants enable row level security;

create index if not exists idx_media_variants_media on media_variants(media_id);

comment on table media_variants is
  'Worker-generated Storage variants: avatar 300x300, cover_card 256x256, cover_detail 684x400, full long-edge ≤2048. All cover-crop except full (inside).';
comment on column media_variants.storage_key is '{family_id}/{media_id}/{kind}.webp (or .jpg for full JPEG fallback)';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table media_variants from anon, authenticated;
  end if;
end
$$;

alter table media enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table media from anon, authenticated;
  end if;
end
$$;
