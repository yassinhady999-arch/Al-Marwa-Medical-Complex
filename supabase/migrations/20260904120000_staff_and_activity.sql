-- ========== STAFF ACCESS PERMISSIONS ==========
-- One row per staff user. `sections` is a jsonb map of { "<section_key>": boolean }.
-- A missing key means "allowed" (opt-out model); an explicit false denies the section.
create table public.staff_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sections jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.staff_permissions to authenticated;
grant all on public.staff_permissions to service_role;
alter table public.staff_permissions enable row level security;
create policy "staff read own permissions" on public.staff_permissions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin manage permissions" on public.staff_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger t_staff_permissions_upd before update on public.staff_permissions
  for each row execute function public.update_updated_at_column();

-- ========== ACTIVITY LOG ==========
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  actor_email text,
  action text not null,            -- create | update | delete | status_change | login | logout | ...
  section text not null,           -- patients | appointments | doctors | staff | settings | ...
  entity_type text,
  entity_id uuid,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.activity_logs to authenticated;
grant all on public.activity_logs to service_role;
alter table public.activity_logs enable row level security;
create policy "admin read all activity" on public.activity_logs
  for select to authenticated using (public.is_admin());
create policy "self read activity" on public.activity_logs
  for select to authenticated using (user_id = auth.uid());
create policy "insert own activity" on public.activity_logs
  for insert to authenticated with check (user_id = auth.uid());
create index idx_activity_logs_created on public.activity_logs(created_at desc);
create index idx_activity_logs_user on public.activity_logs(user_id, created_at desc);
create index idx_activity_logs_section on public.activity_logs(section, created_at desc);

-- Log an action for the current user, snapshotting their profile name/email.
create or replace function public.log_activity(
  _action text,
  _section text,
  _description text default '',
  _entity_type text default null,
  _entity_id uuid default null,
  _metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
  _name text;
  _email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select full_name, email into _name, _email from public.profiles where id = auth.uid();
  insert into public.activity_logs
    (user_id, actor_name, actor_email, action, section, entity_type, entity_id, description, metadata)
  values
    (auth.uid(), coalesce(_name, ''), _email, _action, _section, _entity_type, _entity_id,
     coalesce(_description, ''), coalesce(_metadata, '{}'::jsonb))
  returning id into _id;
  return _id;
end; $$;

revoke execute on function public.log_activity(text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_activity(text, text, text, text, uuid, jsonb) to authenticated;

-- ========== REALTIME ==========
alter table public.activity_logs replica identity full;
alter publication supabase_realtime add table public.activity_logs;
