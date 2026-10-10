-- D-026 · Auth moves from Supabase Auth to Auth.js (Google only).
-- The app owns its user table; the Next.js server mints HS256 JWTs (sub = app.users.id,
-- role = authenticated) so auth.uid() and every existing RLS policy keep working unchanged.
--
-- app.users.id = uuid v5('google:<google sub>', namespace 31416000-cb73-4bfe-806a-00976aed3fee)
-- computed in apps/web/lib/auth/identity.ts.

create table app.users (
  id                  uuid primary key,
  email               text,
  name                text,
  image               text,
  provider            text not null default 'google',
  provider_account_id text,
  created_at          timestamptz not null default now(),
  last_login_at       timestamptz not null default now()
);
comment on table app.users is
  'App users (Auth.js). id = uuid v5 of "<provider>:<provider_account_id>"; matches auth.uid() of server-minted JWTs.';
create index users_provider_account_idx on app.users (provider, provider_account_id);

alter table app.users enable row level security;
create policy users_self_select on app.users for select to authenticated
  using (id = (select auth.uid()));
create policy users_self_update on app.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on app.users from anon, authenticated;
grant select on app.users to authenticated;
grant update (name, image) on app.users to authenticated;  -- id/email/provider only via ensure_app_user

-- Carry over any legacy Supabase Auth owners so the FK swap below cannot fail on existing rows.
insert into app.users (id, email, name, provider, provider_account_id, created_at, last_login_at)
select u.id, u.email, u.raw_user_meta_data->>'name', 'supabase', u.id::text, u.created_at,
       coalesce(u.last_sign_in_at, u.created_at)
  from auth.users u
 where exists (select 1 from app.fields f where f.user_id = u.id)
on conflict (id) do nothing;

-- Repoint field ownership from auth.users to app.users.
alter table app.fields drop constraint if exists fields_user_id_fkey;
alter table app.fields
  add constraint fields_user_id_fkey foreign key (user_id) references app.users (id) on delete cascade;

-- Upsert the caller's own row (identity from the JWT, never from arguments). Called by the server
-- right after Google sign-in, before any field insert.
create or replace function public.ensure_app_user(
  p_email text,
  p_name text,
  p_image text,
  p_provider_account_id text
)
returns app.users
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row app.users;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into app.users as u (id, email, name, image, provider, provider_account_id, last_login_at)
  values (v_uid, p_email, p_name, p_image, 'google', p_provider_account_id, now())
  on conflict (id) do update
    set email               = coalesce(excluded.email, u.email),
        name                = coalesce(excluded.name, u.name),
        image               = coalesce(excluded.image, u.image),
        provider_account_id = coalesce(excluded.provider_account_id, u.provider_account_id),
        last_login_at       = now()
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.ensure_app_user(text, text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_app_user(text, text, text, text) to authenticated;
