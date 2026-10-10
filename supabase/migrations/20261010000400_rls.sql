-- SPEC §7.3 — RLS on every app.* table.
-- Owners: full access to own rows. Demo field (is_demo = true): read-only for everyone.
-- Users can never create/flip a demo field themselves (with check ... not is_demo).

alter table app.fields             enable row level security;
alter table app.field_practices    enable row level security;
alter table app.field_observations enable row level security;

-- ---------------------------------------------------------------- fields
create policy fields_owner_select on app.fields for select to authenticated
  using (user_id = (select auth.uid()));
create policy fields_owner_insert on app.fields for insert to authenticated
  with check (user_id = (select auth.uid()) and not is_demo);
create policy fields_owner_update on app.fields for update to authenticated
  using (user_id = (select auth.uid()) and not is_demo)
  with check (user_id = (select auth.uid()) and not is_demo);
create policy fields_owner_delete on app.fields for delete to authenticated
  using (user_id = (select auth.uid()) and not is_demo);
create policy fields_demo_read on app.fields for select to anon, authenticated
  using (is_demo);

-- helper: does the current user own this field? (security definer avoids RLS recursion
-- and keeps the child-table policies cheap)
create or replace function app.owns_field(p_field_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from app.fields f where f.id = p_field_id and f.user_id = (select auth.uid()));
$$;

create or replace function app.is_demo_field(p_field_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from app.fields f where f.id = p_field_id and f.is_demo);
$$;

revoke all on function app.owns_field(uuid), app.is_demo_field(uuid) from public;
grant execute on function app.owns_field(uuid), app.is_demo_field(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- field_practices
create policy practices_owner_all on app.field_practices for all to authenticated
  using (app.owns_field(field_id) and not app.is_demo_field(field_id))
  with check (app.owns_field(field_id) and not app.is_demo_field(field_id));
create policy practices_owner_select on app.field_practices for select to authenticated
  using (app.owns_field(field_id));
create policy practices_demo_read on app.field_practices for select to anon, authenticated
  using (app.is_demo_field(field_id));

-- ---------------------------------------------------------------- field_observations
create policy observations_owner_all on app.field_observations for all to authenticated
  using (app.owns_field(field_id) and not app.is_demo_field(field_id))
  with check (app.owns_field(field_id) and not app.is_demo_field(field_id));
create policy observations_owner_select on app.field_observations for select to authenticated
  using (app.owns_field(field_id));
create policy observations_demo_read on app.field_observations for select to anon, authenticated
  using (app.is_demo_field(field_id));
