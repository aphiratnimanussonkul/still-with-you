-- Archived events: only events.creator_account_id can SELECT them (and their
-- contributions / story media). Stewards are not special. File-only until applied.
-- The API connects as a privileged role that bypasses RLS; these policies are
-- defense in depth for authenticated (PostgREST) if grants are ever added.
-- Idempotent. Skips policy creation when auth.uid() is absent (vanilla Postgres / swy_test).

alter table events enable row level security;
alter table event_people enable row level security;
alter table contributions enable row level security;
alter table media enable row level security;

do $$
begin
  if to_regprocedure('auth.uid()') is null then
    raise notice 'auth.uid() absent; skipping archived-visibility RLS policies';
    return;
  end if;

  execute $fn$
    create or replace function public.current_account_id()
    returns uuid
    language sql
    stable
    security definer
    set search_path = public
    as $body$
      select id from public.accounts where auth_id = auth.uid()::text
    $body$;
  $fn$;

  execute 'revoke all on function public.current_account_id() from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.current_account_id() to authenticated';
  end if;

  execute 'drop policy if exists events_select_visible on events';
  execute $p$
    create policy events_select_visible on events
    for select
    using (
      exists (
        select 1
        from family_members fm
        where fm.family_id = events.family_id
          and fm.account_id = public.current_account_id()
          and fm.left_at is null
      )
      and (
        status = 'active'
        or (
          status = 'archived'
          and creator_account_id = public.current_account_id()
        )
      )
    )
  $p$;

  execute 'drop policy if exists event_people_select_visible on event_people';
  execute $p$
    create policy event_people_select_visible on event_people
    for select
    using (
      exists (
        select 1
        from events e
        where e.id = event_people.event_id
          and exists (
            select 1
            from family_members fm
            where fm.family_id = e.family_id
              and fm.account_id = public.current_account_id()
              and fm.left_at is null
          )
          and (
            e.status = 'active'
            or (
              e.status = 'archived'
              and e.creator_account_id = public.current_account_id()
            )
          )
      )
    )
  $p$;

  execute 'drop policy if exists contributions_select_visible on contributions';
  execute $p$
    create policy contributions_select_visible on contributions
    for select
    using (
      exists (
        select 1
        from events e
        where e.id = contributions.origin_event_id
          and exists (
            select 1
            from family_members fm
            where fm.family_id = e.family_id
              and fm.account_id = public.current_account_id()
              and fm.left_at is null
          )
          and (
            e.status = 'active'
            or (
              e.status = 'archived'
              and e.creator_account_id = public.current_account_id()
            )
          )
      )
    )
  $p$;

  execute 'drop policy if exists media_select_visible on media';
  execute $p$
    create policy media_select_visible on media
    for select
    using (
      exists (
        select 1
        from family_members fm
        where fm.family_id = media.family_id
          and fm.account_id = public.current_account_id()
          and fm.left_at is null
      )
      and (
        media.purpose = 'avatar'
        or media.story_id is null
        or exists (
          select 1
          from contributions c
          join events e on e.id = c.origin_event_id
          where c.id = media.story_id
            and (
              e.status = 'active'
              or (
                e.status = 'archived'
                and e.creator_account_id = public.current_account_id()
              )
            )
        )
      )
    )
  $p$;
end
$$;
