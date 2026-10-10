-- D-032 · Email + password sign-up / sign-in (Auth.js Credentials). Google stays optional.
-- app.users.id for email accounts = uuid v5('email:<lower(email)>', same namespace as D-026).
-- Password hashes (scrypt, computed in Node) live in app.user_credentials, which no API role can
-- read: only the security-definer RPCs below, executable by service_role (Next.js server) only.

create table app.user_credentials (
  user_id         uuid primary key references app.users (id) on delete cascade,
  email           text not null,
  password_hash   text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint user_credentials_email_lower check (email = lower(email))
);
create unique index user_credentials_email_key on app.user_credentials (email);
comment on table app.user_credentials is
  'Email/password logins. password_hash = scrypt$N$r$p$salt$hash (apps/web/lib/auth/password.ts). Server-only.';

alter table app.user_credentials enable row level security;  -- no policies: deny all API roles
revoke all on app.user_credentials from public, anon, authenticated;

alter table app.users drop constraint if exists users_provider_check;
alter table app.users add constraint users_provider_check
  check (provider in ('google', 'email', 'dev', 'supabase', 'system'));

-- Lockout policy: 5 consecutive failures → locked for 15 minutes.
create or replace function public.auth_register(
  p_user_id uuid,
  p_email text,
  p_name text,
  p_password_hash text
)
returns text  -- 'ok' | 'email_taken'
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' or p_password_hash is null or p_password_hash not like 'scrypt$%' then
    raise exception 'invalid registration' using errcode = '22023';
  end if;
  if exists (select 1 from app.user_credentials c where c.email = v_email)
     or exists (select 1 from app.users u where u.id = p_user_id) then
    return 'email_taken';
  end if;
  insert into app.users (id, email, name, provider, provider_account_id, last_login_at)
  values (p_user_id, v_email, nullif(trim(p_name), ''), 'email', v_email, now());
  insert into app.user_credentials (user_id, email, password_hash)
  values (p_user_id, v_email, p_password_hash);
  return 'ok';
exception when unique_violation then
  return 'email_taken';
end $$;

create or replace function public.auth_credentials(p_email text)
returns table (user_id uuid, email text, name text, password_hash text, locked_until timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.user_id, c.email, u.name, c.password_hash, c.locked_until
    from app.user_credentials c
    join app.users u on u.id = c.user_id
   where c.email = lower(trim(p_email));
$$;

create or replace function public.auth_record_login(p_user_id uuid, p_success boolean)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if p_success then
    update app.user_credentials set failed_attempts = 0, locked_until = null, updated_at = now()
     where user_id = p_user_id;
    update app.users set last_login_at = now() where id = p_user_id;
  else
    update app.user_credentials
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
                               else locked_until end,
           updated_at = now()
     where user_id = p_user_id;
  end if;
end $$;

revoke all on function public.auth_register(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.auth_credentials(text) from public, anon, authenticated;
revoke all on function public.auth_record_login(uuid, boolean) from public, anon, authenticated;
grant execute on function public.auth_register(uuid, text, text, text) to service_role;
grant execute on function public.auth_credentials(text) to service_role;
grant execute on function public.auth_record_login(uuid, boolean) to service_role;
