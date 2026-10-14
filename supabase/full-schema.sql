-- ============================================================================
--  ClinicFlow Hub — COMPLETE DATABASE SCHEMA (single script)
--  Paste this whole file into:  Supabase Dashboard -> SQL Editor -> New query -> Run
--
--  Safe to run once on a brand-new, empty Supabase project.
--  It creates every table, enum, function, trigger, RLS policy, RPC and seed row.
--  The FIRST account you sign up afterwards automatically becomes Owner.
--
--  After running: in Authentication -> Sign In / Providers -> Email, turn OFF
--  "Confirm email" (or use a real inbox) so you can log in immediately.
-- ============================================================================

create extension if not exists pgcrypto;



-- ============================================================================
-- 1) BASE SCHEMA — enums, tables, functions, triggers, RLS, seed data
-- (from migration 20260825145241_76a03d36-ca73-43b6-8c3f-f70e71bf1d2b.sql)
-- ============================================================================

-- ========== ENUMS ==========
create type public.app_role as enum ('owner','admin','receptionist','doctor','viewer');
create type public.appointment_status as enum ('pending','confirmed','checked_in','in_progress','completed','cancelled','no_show','rescheduled');
create type public.booking_source as enum ('whatsapp','website','phone','manual','referral');
create type public.conversation_status as enum ('active','waiting_patient','human_support','appointment_created','closed');
create type public.message_direction as enum ('inbound','outbound');
create type public.sender_type as enum ('patient','ai','human','system');
create type public.message_type as enum ('text','image','audio','document','location','interactive');
create type public.gender_type as enum ('male','female');
create type public.event_status as enum ('pending','processing','delivered','failed');

-- ========== UTIL ==========
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.normalize_sa_phone(p text)
returns text language plpgsql immutable set search_path = public as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if left(d,4) = '9660' then d := '966' || substring(d from 5); end if;
  if left(d,3) = '966' then return '+' || d; end if;
  if left(d,1) = '0' then return '+966' || substring(d from 2); end if;
  if left(d,1) = '5' and length(d) = 9 then return '+966' || d; end if;
  return '+' || d;
end; $$;

-- ========== ROLES ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('owner','admin','receptionist')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('owner','admin')
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email);
  select count(*) into cnt from public.user_roles;
  insert into public.user_roles (user_id, role)
  values (new.id, case when cnt = 0 then 'owner'::app_role else 'receptionist'::app_role end);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create policy "staff read profiles" on public.profiles for select to authenticated using (true);
create policy "self update profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admin manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read roles" on public.user_roles for select to authenticated using (true);

-- ========== CLINIC SETTINGS ==========
create table public.clinic_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null default 'عيادتي',
  logo_url text,
  phone text,
  email text,
  address text,
  city text,
  timezone text not null default 'Asia/Riyadh',
  currency text not null default 'SAR',
  working_hours jsonb not null default '{}'::jsonb,
  n8n_webhook_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clinic_settings to authenticated;
grant all on public.clinic_settings to service_role;
alter table public.clinic_settings enable row level security;
create policy "staff read settings" on public.clinic_settings for select to authenticated using (true);
create policy "admin write settings" on public.clinic_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger t_clinic_settings_upd before update on public.clinic_settings for each row execute function public.update_updated_at_column();

-- ========== SPECIALTIES ==========
create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.specialties to authenticated;
grant all on public.specialties to service_role;
alter table public.specialties enable row level security;
create policy "staff read specialties" on public.specialties for select to authenticated using (true);
create policy "admin write specialties" on public.specialties for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger t_specialties_upd before update on public.specialties for each row execute function public.update_updated_at_column();

-- ========== DOCTORS ==========
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  specialty_id uuid references public.specialties(id) on delete set null,
  bio text,
  avatar_url text,
  status text not null default 'active',
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.doctors to authenticated;
grant all on public.doctors to service_role;
alter table public.doctors enable row level security;
create policy "staff read doctors" on public.doctors for select to authenticated using (true);
create policy "admin write doctors" on public.doctors for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index idx_doctors_specialty on public.doctors(specialty_id);
create trigger t_doctors_upd before update on public.doctors for each row execute function public.update_updated_at_column();

-- ========== SERVICES ==========
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  specialty_id uuid references public.specialties(id) on delete set null,
  duration_minutes int not null default 30 check (duration_minutes between 5 and 480),
  price numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;
create policy "staff read services" on public.services for select to authenticated using (true);
create policy "admin write services" on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index idx_services_specialty on public.services(specialty_id);
create trigger t_services_upd before update on public.services for each row execute function public.update_updated_at_column();

-- ========== DOCTOR SCHEDULES ==========
create table public.doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null default '09:00',
  end_time time not null default '17:00',
  break_start time,
  break_end time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, day_of_week)
);
grant select, insert, update, delete on public.doctor_schedules to authenticated;
grant all on public.doctor_schedules to service_role;
alter table public.doctor_schedules enable row level security;
create policy "staff read schedules" on public.doctor_schedules for select to authenticated using (true);
create policy "staff write schedules" on public.doctor_schedules for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_doctor_schedules_doctor on public.doctor_schedules(doctor_id);
create trigger t_doctor_schedules_upd before update on public.doctor_schedules for each row execute function public.update_updated_at_column();

-- ========== PATIENTS ==========
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  normalized_phone text not null,
  whatsapp_number text,
  email text,
  gender gender_type,
  date_of_birth date,
  city text,
  district text,
  address text,
  source booking_source not null default 'manual',
  notes text,
  first_contact_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_phone)
);
grant select, insert, update, delete on public.patients to authenticated;
grant all on public.patients to service_role;
alter table public.patients enable row level security;
create policy "staff read patients" on public.patients for select to authenticated using (true);
create policy "staff write patients" on public.patients for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_patients_normalized_phone on public.patients(normalized_phone);
create index idx_patients_phone on public.patients(phone);
create index idx_patients_created_at on public.patients(created_at);
create trigger t_patients_upd before update on public.patients for each row execute function public.update_updated_at_column();

create or replace function public.patients_set_normalized()
returns trigger language plpgsql set search_path = public as $$
begin
  new.normalized_phone := public.normalize_sa_phone(new.phone);
  if new.whatsapp_number is null then new.whatsapp_number := new.normalized_phone; end if;
  return new;
end; $$;
create trigger t_patients_norm before insert or update of phone on public.patients
for each row execute function public.patients_set_normalized();

-- ========== CONVERSATIONS ==========
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  external_conversation_id text unique,
  channel text not null default 'whatsapp',
  status conversation_status not null default 'active',
  assigned_to uuid references auth.users(id) on delete set null,
  unread_count int not null default 0,
  last_message_preview text,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "staff read conversations" on public.conversations for select to authenticated using (true);
create policy "staff write conversations" on public.conversations for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_conversations_patient on public.conversations(patient_id);
create index idx_conversations_last_msg on public.conversations(last_message_at desc);
create trigger t_conversations_upd before update on public.conversations for each row execute function public.update_updated_at_column();

-- ========== MESSAGES ==========
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  direction message_direction not null,
  sender_type sender_type not null default 'patient',
  message_type message_type not null default 'text',
  content text,
  external_message_id text unique,
  status text not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "staff read messages" on public.messages for select to authenticated using (true);
create policy "staff write messages" on public.messages for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_messages_conversation on public.messages(conversation_id, created_at);
create index idx_messages_external on public.messages(external_message_id);
create index idx_messages_created on public.messages(created_at);

create or replace function public.messages_touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(coalesce(new.content,''), 160),
         unread_count = case when new.direction = 'inbound' then unread_count + 1 else unread_count end
   where id = new.conversation_id;
  if new.direction = 'inbound' and new.patient_id is not null then
    update public.patients set last_contact_at = new.created_at where id = new.patient_id;
  end if;
  return new;
end; $$;
create trigger t_messages_touch after insert on public.messages
for each row execute function public.messages_touch_conversation();

-- ========== APPOINTMENTS ==========
create sequence public.appointment_number_seq;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  appointment_number text not null unique,
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  specialty_id uuid references public.specialties(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status appointment_status not null default 'pending',
  source booking_source not null default 'manual',
  price numeric(10,2) default 0,
  notes text,
  idempotency_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;
create policy "staff read appointments" on public.appointments for select to authenticated using (true);
create policy "staff write appointments" on public.appointments for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_appointments_date on public.appointments(appointment_date);
create index idx_appointments_doctor on public.appointments(doctor_id, appointment_date);
create index idx_appointments_patient on public.appointments(patient_id);
create index idx_appointments_status on public.appointments(status);
create index idx_appointments_created on public.appointments(created_at);
create trigger t_appointments_upd before update on public.appointments for each row execute function public.update_updated_at_column();

create or replace function public.appointments_set_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.appointment_number is null or new.appointment_number = '' then
    new.appointment_number := 'APT-' || to_char(now() at time zone 'Asia/Riyadh','YY') || '-' ||
      lpad(nextval('public.appointment_number_seq')::text, 6, '0');
  end if;
  return new;
end; $$;
create trigger t_appointments_number before insert on public.appointments
for each row execute function public.appointments_set_number();

-- double booking + working hours guard
create or replace function public.appointments_validate()
returns trigger language plpgsql set search_path = public as $$
declare sch record; dow int;
begin
  if new.doctor_id is not null then
    dow := extract(dow from new.appointment_date)::int;
    select * into sch from public.doctor_schedules
      where doctor_id = new.doctor_id and day_of_week = dow and is_active = true;
    if not found then
      raise exception 'DOCTOR_NOT_WORKING: الطبيب لا يعمل في هذا اليوم';
    end if;
    if new.start_time < sch.start_time or new.end_time > sch.end_time then
      raise exception 'OUTSIDE_WORKING_HOURS: الوقت خارج ساعات عمل الطبيب';
    end if;
    if sch.break_start is not null and sch.break_end is not null
       and new.start_time < sch.break_end and new.end_time > sch.break_start then
      raise exception 'DURING_BREAK: الوقت يقع ضمن فترة الاستراحة';
    end if;
    if exists (
      select 1 from public.appointments a
      where a.doctor_id = new.doctor_id
        and a.appointment_date = new.appointment_date
        and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and a.status not in ('cancelled','no_show','rescheduled')
        and a.start_time < new.end_time and a.end_time > new.start_time
    ) then
      raise exception 'DOUBLE_BOOKING: يوجد موعد آخر لنفس الطبيب في هذا الوقت';
    end if;
  end if;
  return new;
end; $$;
create trigger t_appointments_validate before insert or update of doctor_id, appointment_date, start_time, end_time, status
on public.appointments for each row
when (new.status not in ('cancelled','no_show','rescheduled'))
execute function public.appointments_validate();

-- ========== STATUS HISTORY ==========
create table public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  old_status appointment_status,
  new_status appointment_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert on public.appointment_status_history to authenticated;
grant all on public.appointment_status_history to service_role;
alter table public.appointment_status_history enable row level security;
create policy "staff read history" on public.appointment_status_history for select to authenticated using (true);
create policy "staff insert history" on public.appointment_status_history for insert to authenticated with check (public.can_write());
create index idx_status_history_appt on public.appointment_status_history(appointment_id, created_at);

-- ========== INTEGRATION EVENTS ==========
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status event_status not null default 'pending',
  attempts int not null default 0,
  processed_at timestamptz,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.integration_events to authenticated;
grant all on public.integration_events to service_role;
alter table public.integration_events enable row level security;
create policy "staff read events" on public.integration_events for select to authenticated using (true);
create policy "staff write events" on public.integration_events for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_events_status on public.integration_events(status, created_at desc);
create index idx_events_entity on public.integration_events(entity_type, entity_id);

create or replace function public.emit_event(_type text, _entity_type text, _entity_id uuid, _payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  insert into public.integration_events (event_type, entity_type, entity_id, payload)
  values (_type, _entity_type, _entity_id, coalesce(_payload,'{}'::jsonb))
  returning id into eid;
  return eid;
end; $$;

-- ========== NOTIFICATIONS ==========
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "staff read notifications" on public.notifications for select to authenticated using (true);
create policy "staff write notifications" on public.notifications for all to authenticated using (true) with check (true);
create index idx_notifications_created on public.notifications(created_at desc);

-- appointment side effects: events, history, notification
create or replace function public.appointments_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select full_name into pname from public.patients where id = new.patient_id;
  if tg_op = 'INSERT' then
    insert into public.appointment_status_history (appointment_id, new_status, changed_by)
      values (new.id, new.status, auth.uid());
    perform public.emit_event('appointment.created','appointment',new.id, to_jsonb(new));
    insert into public.notifications (type,title,message,entity_type,entity_id)
      values ('appointment.created','موعد جديد', coalesce(pname,'مريض') || ' — ' || new.appointment_number, 'appointment', new.id);
  elsif new.status is distinct from old.status then
    insert into public.appointment_status_history (appointment_id, old_status, new_status, changed_by)
      values (new.id, old.status, new.status, auth.uid());
    perform public.emit_event('appointment.' || new.status::text,'appointment',new.id, to_jsonb(new));
    insert into public.notifications (type,title,message,entity_type,entity_id)
      values ('appointment.' || new.status::text, 'تحديث حالة موعد', coalesce(pname,'مريض') || ' — ' || new.appointment_number, 'appointment', new.id);
  elsif new.appointment_date is distinct from old.appointment_date or new.start_time is distinct from old.start_time then
    perform public.emit_event('appointment.rescheduled','appointment',new.id, to_jsonb(new));
  end if;
  return new;
end; $$;
create trigger t_appointments_after after insert or update on public.appointments
for each row execute function public.appointments_after_change();

create or replace function public.patients_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.emit_event('patient.created','patient',new.id, to_jsonb(new));
  return new;
end; $$;
create trigger t_patients_after after insert on public.patients
for each row execute function public.patients_after_insert();

-- ========== AUTOMATION LOGS ==========
create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_name text not null,
  event_type text,
  status text not null default 'success',
  appointment_id uuid references public.appointments(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  execution_id text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.automation_logs to authenticated;
grant all on public.automation_logs to service_role;
alter table public.automation_logs enable row level security;
create policy "staff read logs" on public.automation_logs for select to authenticated using (true);
create policy "staff write logs" on public.automation_logs for all to authenticated using (public.can_write()) with check (public.can_write());
create index idx_automation_logs_created on public.automation_logs(created_at desc);

-- ========== AUDIT LOGS ==========
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "admin read audit" on public.audit_logs for select to authenticated using (public.is_admin());
create policy "staff insert audit" on public.audit_logs for insert to authenticated with check (true);
create index idx_audit_created on public.audit_logs(created_at desc);

-- ========== AVAILABILITY FUNCTION ==========
create or replace function public.get_available_slots(_doctor_id uuid, _date date, _duration int default 30)
returns table(slot_time time)
language plpgsql stable security definer set search_path = public as $$
declare sch record; cur time; dow int;
begin
  dow := extract(dow from _date)::int;
  select * into sch from public.doctor_schedules
    where doctor_id = _doctor_id and day_of_week = dow and is_active = true;
  if not found then return; end if;
  cur := sch.start_time;
  while cur + make_interval(mins => _duration) <= sch.end_time loop
    if not (sch.break_start is not null and sch.break_end is not null
            and cur < sch.break_end and cur + make_interval(mins => _duration) > sch.break_start)
       and not exists (
         select 1 from public.appointments a
         where a.doctor_id = _doctor_id and a.appointment_date = _date
           and a.status not in ('cancelled','no_show','rescheduled')
           and a.start_time < cur + make_interval(mins => _duration)
           and a.end_time > cur)
       and not (_date = (now() at time zone 'Asia/Riyadh')::date and cur <= (now() at time zone 'Asia/Riyadh')::time)
    then
      slot_time := cur; return next;
    end if;
    cur := cur + make_interval(mins => _duration);
  end loop;
end; $$;

-- ========== REALTIME ==========
alter table public.appointments replica identity full;
alter table public.messages replica identity full;
alter table public.conversations replica identity full;
alter table public.notifications replica identity full;
alter table public.integration_events replica identity full;
do $realtime$
declare t text;
begin
  foreach t in array array['appointments','messages','conversations','notifications','integration_events'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then raise notice 'realtime add % skipped: %', t, sqlerrm;
    end;
  end loop;
end $realtime$;

-- ========== SEED CONFIG ==========
insert into public.clinic_settings (clinic_name, city, working_hours)
values ('مركز الشفاء الطبي','الرياض',
'{"0":{"enabled":true,"start":"09:00","end":"21:00"},"1":{"enabled":true,"start":"09:00","end":"21:00"},"2":{"enabled":true,"start":"09:00","end":"21:00"},"3":{"enabled":true,"start":"09:00","end":"21:00"},"4":{"enabled":true,"start":"09:00","end":"21:00"},"5":{"enabled":false,"start":"09:00","end":"21:00"},"6":{"enabled":true,"start":"09:00","end":"21:00"}}'::jsonb);

insert into public.specialties (name, description) values
 ('طب الأسنان','تشخيص وعلاج الأسنان واللثة'),
 ('الجلدية','أمراض الجلد والتجميل'),
 ('طب الأطفال','رعاية صحة الأطفال'),
 ('الباطنية','الأمراض الباطنية للبالغين'),
 ('العظام','إصابات وأمراض العظام والمفاصل'),
 ('طب عام','الفحوصات والاستشارات العامة'),
 ('العيون','فحص وعلاج أمراض العيون');

insert into public.services (name, specialty_id, duration_minutes, price, description)
select v.name, s.id, v.dur, v.price, v.descr
from (values
 ('كشف أسنان','طب الأسنان',30,150.00,'كشف وتشخيص أولي'),
 ('تنظيف أسنان','طب الأسنان',45,300.00,'تنظيف وتلميع'),
 ('كشف جلدية','الجلدية',30,200.00,'كشف جلدي'),
 ('جلسة علاج','الجلدية',60,450.00,'جلسة علاجية'),
 ('استشارة','طب عام',20,100.00,'استشارة طبية عامة'),
 ('متابعة','طب عام',15,80.00,'زيارة متابعة'),
 ('فحص أطفال','طب الأطفال',30,180.00,'فحص دوري للأطفال')
) as v(name, spec, dur, price, descr)
join public.specialties s on s.name = v.spec;


-- ============================================================================
-- 2) user_roles admin write policies
-- (from migration 20260831054624_2e6b2732-7763-45d7-8ecb-d0bb6b24dd9f.sql)
-- ============================================================================

CREATE POLICY "admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin() AND user_id <> auth.uid()) WITH CHECK (public.is_admin() AND user_id <> auth.uid());
CREATE POLICY "admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin() AND user_id <> auth.uid());
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;


-- ============================================================================
-- 3) revoke EXECUTE on internal functions from anon/authenticated
-- (from migration 20260831054644_b152953a-1455-4f48-8878-865b6291878f.sql)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.appointments_after_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.appointments_set_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.appointments_validate() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_touch_conversation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.patients_after_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.patients_set_normalized() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_event(text, text, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_sa_phone(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_available_slots(uuid, date, integer) FROM anon;


-- ============================================================================
-- 4) revoke EXECUTE from PUBLIC + re-grant the safe helpers
-- (from migration 20260831054703_5eb10439-81b1-4adb-8e51-efcaf0ef1117.sql)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.appointments_after_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.messages_touch_conversation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.patients_after_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.emit_event(text, text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_write() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_available_slots(uuid, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_event(text, text, uuid, jsonb) TO service_role;


-- ============================================================================
-- 5) STAFF PERMISSIONS + ACTIVITY LOG (staff_permissions, activity_logs, log_activity RPC)
-- (from migration 20260904120000_staff_and_activity.sql)
-- ============================================================================

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
do $realtime$
begin
  begin
    alter publication supabase_realtime add table public.activity_logs;
  exception when others then raise notice 'realtime add activity_logs skipped: %', sqlerrm;
  end;
end $realtime$;

-- ============================================================================
-- 6) HUMAN HANDOFF (التدخل البشري): handoff columns + request/claim/reply/release RPCs
-- (from migration 20260926120000_human_handoff.sql)
-- ============================================================================

alter table public.conversations
  add column if not exists handoff_reason text,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_resolved_at timestamptz;

create index if not exists idx_conversations_handoff_queue
  on public.conversations(handoff_requested_at)
  where status = 'human_support';

-- n8n reads GET /events ordered by created_at. now() is the transaction start, so
-- two events emitted by one call (e.g. human_takeover + message.send) tied and
-- could reach the patient out of order; clock_timestamp() keeps emit order.
alter table public.integration_events alter column created_at set default clock_timestamp();

-- Shared payload for the handoff events n8n pulls from GET /events.
create or replace function public.handoff_event_payload(_conversation_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'conversation_id', c.id,
    'external_conversation_id', c.external_conversation_id,
    'channel', c.channel,
    'status', c.status,
    'bot_active', c.status <> 'human_support',
    'handoff_reason', c.handoff_reason,
    'assigned_to', c.assigned_to,
    'assigned_to_name', (select full_name from public.profiles where id = c.assigned_to),
    'patient_id', c.patient_id,
    'patient_name', p.full_name,
    'phone', p.phone,
    'whatsapp_number', coalesce(p.whatsapp_number, p.normalized_phone)
  )
  from public.conversations c
  left join public.patients p on p.id = c.patient_id
  where c.id = _conversation_id;
$$;

-- Put a conversation in the handoff queue and pause the AI.
-- Callable by staff with write access, and by the service role (n8n endpoints).
-- Returns false when the conversation was already waiting for / with a human.
create or replace function public.request_human_handoff(
  _conversation_id uuid,
  _reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _status public.conversation_status;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
  _patient text;
begin
  if auth.uid() is not null and not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;

  select status into _status from public.conversations where id = _conversation_id for update;
  if not found then
    raise exception 'NOT_FOUND: المحادثة غير موجودة';
  end if;

  if _status = 'human_support' then
    if _reason_clean is not null then
      update public.conversations
         set handoff_reason = coalesce(handoff_reason, _reason_clean)
       where id = _conversation_id;
    end if;
    return false;
  end if;

  update public.conversations
     set status = 'human_support',
         handoff_reason = _reason_clean,
         handoff_requested_at = now(),
         handoff_resolved_at = null,
         assigned_to = null
   where id = _conversation_id;

  perform public.emit_event('conversation.handoff_requested', 'conversation', _conversation_id,
    public.handoff_event_payload(_conversation_id));

  select p.full_name into _patient
    from public.conversations c join public.patients p on p.id = c.patient_id
   where c.id = _conversation_id;
  insert into public.notifications (type, title, message, entity_type, entity_id)
  values ('conversation.handoff_requested', 'طلب التحدث مع موظف',
          coalesce(_patient, 'مريض') || coalesce(' — ' || _reason_clean, ''),
          'conversation', _conversation_id);

  return true;
end; $$;

-- Current staff member takes over the conversation (AI stays paused).
create or replace function public.claim_conversation(_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _status public.conversation_status;
  _assigned uuid;
begin
  if not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;

  select status, assigned_to into _status, _assigned
    from public.conversations where id = _conversation_id for update;
  if not found then
    raise exception 'NOT_FOUND: المحادثة غير موجودة';
  end if;
  if _status = 'human_support' and _assigned = auth.uid() then
    return;
  end if;

  -- Taking over a conversation that was not in the queue starts a fresh handoff.
  update public.conversations
     set status = 'human_support',
         assigned_to = auth.uid(),
         handoff_requested_at = case when _status = 'human_support' then handoff_requested_at else now() end,
         handoff_reason = case when _status = 'human_support' then handoff_reason end,
         handoff_resolved_at = null,
         unread_count = 0
   where id = _conversation_id;

  perform public.emit_event('conversation.human_takeover', 'conversation', _conversation_id,
    public.handoff_event_payload(_conversation_id));
end; $$;

-- Staff reply. Stored as an outbound human message with status 'pending' and
-- queued as a `message.send` event for n8n to deliver over WhatsApp.
-- Replying to a conversation you have not claimed yet claims it first.
create or replace function public.send_human_reply(_conversation_id uuid, _content text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _text text := btrim(coalesce(_content, ''));
  _status public.conversation_status;
  _assigned uuid;
  _patient uuid;
  _name text;
  _msg uuid;
begin
  if not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;
  if _text = '' then
    raise exception 'EMPTY_MESSAGE: لا يمكن إرسال رسالة فارغة';
  end if;

  select status, assigned_to, patient_id into _status, _assigned, _patient
    from public.conversations where id = _conversation_id;
  if not found then
    raise exception 'NOT_FOUND: المحادثة غير موجودة';
  end if;
  if _status <> 'human_support' or _assigned is null then
    perform public.claim_conversation(_conversation_id);
  end if;

  select full_name into _name from public.profiles where id = auth.uid();

  insert into public.messages
    (conversation_id, patient_id, direction, sender_type, message_type, content, status, metadata)
  values
    (_conversation_id, _patient, 'outbound', 'human', 'text', _text, 'pending',
     jsonb_build_object('sent_by', auth.uid(), 'sent_by_name', coalesce(_name, '')))
  returning id into _msg;

  update public.conversations set unread_count = 0 where id = _conversation_id;

  perform public.emit_event('message.send', 'message', _msg,
    public.handoff_event_payload(_conversation_id)
      || jsonb_build_object('message_id', _msg, 'content', _text, 'sender_type', 'human',
                            'sent_by_name', coalesce(_name, '')));
  return _msg;
end; $$;

-- Hand the conversation back to the AI. Returns false if it was not in handoff.
create or replace function public.release_to_bot(_conversation_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;

  update public.conversations
     set status = 'active',
         assigned_to = null,
         handoff_resolved_at = now(),
         unread_count = 0
   where id = _conversation_id and status = 'human_support';
  if not found then
    return false;
  end if;

  perform public.emit_event('conversation.ai_resume', 'conversation', _conversation_id,
    public.handoff_event_payload(_conversation_id));
  return true;
end; $$;

revoke execute on function public.handoff_event_payload(uuid) from public, anon, authenticated;
revoke execute on function public.request_human_handoff(uuid, text) from public, anon;
revoke execute on function public.claim_conversation(uuid) from public, anon;
revoke execute on function public.send_human_reply(uuid, text) from public, anon;
revoke execute on function public.release_to_bot(uuid) from public, anon;
grant execute on function public.request_human_handoff(uuid, text) to authenticated, service_role;
grant execute on function public.claim_conversation(uuid) to authenticated;
grant execute on function public.send_human_reply(uuid, text) to authenticated;
grant execute on function public.release_to_bot(uuid) to authenticated;
grant execute on function public.handoff_event_payload(uuid) to service_role;

-- ============================================================================
-- 7) BOOKING FORMS (نماذج الحجز) + CUSTOMER CHATBOT (الشات بوت)
-- (from migration 20261003120000_booking_forms_and_chatbot.sql)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) One booking at a time per doctor+day
-- Same checks as before; the advisory lock makes two simultaneous bookings of
-- the same slot run one after the other, so the clash check below always sees
-- the first one and the second gets DOUBLE_BOOKING.
-- ---------------------------------------------------------------------------
create or replace function public.appointments_validate()
returns trigger language plpgsql set search_path = public as $$
declare sch record; dow int;
begin
  if new.doctor_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.doctor_id::text || '|' || new.appointment_date::text, 0));
    dow := extract(dow from new.appointment_date)::int;
    select * into sch from public.doctor_schedules
      where doctor_id = new.doctor_id and day_of_week = dow and is_active = true;
    if not found then
      raise exception 'DOCTOR_NOT_WORKING: الطبيب لا يعمل في هذا اليوم';
    end if;
    if new.start_time < sch.start_time or new.end_time > sch.end_time then
      raise exception 'OUTSIDE_WORKING_HOURS: الوقت خارج ساعات عمل الطبيب';
    end if;
    if sch.break_start is not null and sch.break_end is not null
       and new.start_time < sch.break_end and new.end_time > sch.break_start then
      raise exception 'DURING_BREAK: الوقت يقع ضمن فترة الاستراحة';
    end if;
    if exists (
      select 1 from public.appointments a
      where a.doctor_id = new.doctor_id
        and a.appointment_date = new.appointment_date
        and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and a.status not in ('cancelled','no_show','rescheduled')
        and a.start_time < new.end_time and a.end_time > new.start_time
    ) then
      raise exception 'DOUBLE_BOOKING: يوجد موعد آخر لنفس الطبيب في هذا الوقت';
    end if;
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 1) Booking forms
-- fields:   [{id, type, label, required, placeholder?, help?, options?}]
--           system types: full_name, phone, email, gender, date_of_birth, city,
--           notes, appointment; custom: text, textarea, number, select, radio,
--           checkbox, date.
-- settings: {specialty_ids: [], service_ids: [] (empty = all), choose_doctor,
--           booking_window_days, show_prices, success_message}
-- ---------------------------------------------------------------------------
create table if not exists public.booking_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text,
  is_active boolean not null default true,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.booking_forms to authenticated;
grant all on public.booking_forms to service_role;
alter table public.booking_forms enable row level security;
drop policy if exists "staff read booking forms" on public.booking_forms;
create policy "staff read booking forms" on public.booking_forms
  for select to authenticated using (true);
drop policy if exists "staff write booking forms" on public.booking_forms;
create policy "staff write booking forms" on public.booking_forms
  for all to authenticated using (public.can_write()) with check (public.can_write());
create or replace trigger t_booking_forms_upd before update on public.booking_forms
  for each row execute function public.update_updated_at_column();

create table if not exists public.booking_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.booking_forms(id) on delete set null,
  form_title text not null default '',
  appointment_id uuid references public.appointments(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  answers jsonb not null default '[]'::jsonb, -- [{field_id, label, type, value}]
  created_at timestamptz not null default now()
);
grant select, delete on public.booking_form_submissions to authenticated;
grant all on public.booking_form_submissions to service_role;
alter table public.booking_form_submissions enable row level security;
drop policy if exists "staff read form submissions" on public.booking_form_submissions;
create policy "staff read form submissions" on public.booking_form_submissions
  for select to authenticated using (true);
drop policy if exists "staff delete form submissions" on public.booking_form_submissions;
create policy "staff delete form submissions" on public.booking_form_submissions
  for delete to authenticated using (public.can_write());
create index if not exists idx_form_submissions_form
  on public.booking_form_submissions(form_id, created_at desc);

create or replace view public.booking_form_stats with (security_invoker = true) as
  select form_id, count(*)::int as submissions, max(created_at) as last_submission_at
    from public.booking_form_submissions
   where form_id is not null
   group by form_id;
grant select on public.booking_form_stats to authenticated;

-- Helpers: what a form's settings allow ("[]" or missing = everything).
create or replace function public.booking_form_id_list(_settings jsonb, _key text)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(_settings -> _key) = 'array' then _settings -> _key else '[]'::jsonb end;
$$;

create or replace function public.booking_form_allows_specialty(_settings jsonb, _specialty uuid)
returns boolean language sql immutable as $$
  select jsonb_array_length(public.booking_form_id_list(_settings, 'specialty_ids')) = 0
      or (_specialty is not null and public.booking_form_id_list(_settings, 'specialty_ids') ? _specialty::text);
$$;

create or replace function public.booking_form_allows_service(_settings jsonb, _service uuid, _specialty uuid)
returns boolean language sql immutable as $$
  select public.booking_form_allows_specialty(_settings, _specialty)
     and (jsonb_array_length(public.booking_form_id_list(_settings, 'service_ids')) = 0
          or public.booking_form_id_list(_settings, 'service_ids') ? _service::text);
$$;

create or replace function public.booking_form_window(_settings jsonb)
returns int language sql immutable as $$
  select least(greatest(case when (_settings ->> 'booking_window_days') ~ '^\d{1,3}$'
                             then (_settings ->> 'booking_window_days')::int else 21 end, 1), 60);
$$;

-- Active doctors a form can book, optionally narrowed to one specialty / doctor.
create or replace function public.booking_form_doctor_ids(_settings jsonb, _specialty uuid, _doctor uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id order by d.name), '{}'::uuid[])
    from public.doctors d
   where d.status = 'active'
     and public.booking_form_allows_specialty(_settings, d.specialty_id)
     and (_specialty is null or d.specialty_id = _specialty)
     and (_doctor is null or d.id = _doctor);
$$;

-- Public: everything the booking page needs to render the form.
create or replace function public.get_public_booking_form(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f record; _doctors jsonb;
begin
  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'specialty_id', d.specialty_id)
                            order by d.name), '[]'::jsonb)
    into _doctors
    from public.doctors d
   where d.status = 'active' and public.booking_form_allows_specialty(f.settings, d.specialty_id);

  return jsonb_build_object(
    'id', f.id,
    'slug', f.slug,
    'title', f.title,
    'description', f.description,
    'fields', f.fields,
    'settings', f.settings,
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'address', c.address,
                                         'city', c.city, 'logo_url', c.logo_url)
                 from public.clinic_settings c order by c.created_at limit 1),
    -- only specialties that someone can actually be booked with
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s
                     where s.is_active and public.booking_form_allows_specialty(f.settings, s.id)
                       and exists (select 1 from public.doctors d where d.status = 'active' and d.specialty_id = s.id)),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'specialty_id', v.specialty_id,
                                                               'duration_minutes', v.duration_minutes, 'price', v.price,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v
                  where v.is_active and public.booking_form_allows_service(f.settings, v.id, v.specialty_id)
                    and (v.specialty_id is null or exists (select 1 from public.doctors d
                                                            where d.status = 'active' and d.specialty_id = v.specialty_id))),
    'doctors', _doctors
  );
end; $$;

-- Public: free slots for the next booking_window_days, per day.
-- _doctor_id null = any doctor (union of everyone who can take the booking).
create or replace function public.get_public_booking_availability(
  _slug text, _service_id uuid default null, _doctor_id uuid default null, _specialty_id uuid default null
) returns table(day date, slot_time time)
language plpgsql stable security definer set search_path = public as $$
declare
  f record;
  _duration int := 30;
  _spec uuid := _specialty_id;
  _doctors uuid[];
  _today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then return; end if;

  if _service_id is not null then
    select v.duration_minutes, v.specialty_id into _duration, _spec
      from public.services v
     where v.id = _service_id and v.is_active
       and public.booking_form_allows_service(f.settings, v.id, v.specialty_id);
    if not found then return; end if;
  elsif _spec is not null and not public.booking_form_allows_specialty(f.settings, _spec) then
    return;
  end if;

  _doctors := public.booking_form_doctor_ids(
    f.settings, _spec,
    case when coalesce(f.settings ->> 'choose_doctor', 'true') <> 'false' then _doctor_id end);
  if cardinality(_doctors) = 0 then return; end if;

  return query
    select distinct g.d::date, s.slot_time
      from generate_series(_today::timestamp,
                           (_today + public.booking_form_window(f.settings) - 1)::timestamp,
                           interval '1 day') as g(d)
     cross join unnest(_doctors) as doc(id)
     cross join lateral public.get_available_slots(doc.id, g.d::date, _duration) as s
     order by 1, 2;
end; $$;

create or replace function public.booking_form_confirmation(_appointment_id uuid, _message text, _duplicate boolean)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'appointment_number', a.appointment_number,
    'date', a.appointment_date,
    'start_time', a.start_time,
    'end_time', a.end_time,
    'doctor_name', d.name,
    'service_name', v.name,
    'success_message', _message,
    'duplicate', _duplicate)
  from public.appointments a
  left join public.doctors d on d.id = a.doctor_id
  left join public.services v on v.id = a.service_id
  where a.id = _appointment_id;
$$;

-- Public: validate a submission, find/create the patient and book the slot.
-- _payload: {request_id, specialty_id?, service_id?, doctor_id?, date, time, answers: {field_id: value}}
create or replace function public.submit_public_booking(_slug text, _payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f record;
  _answers jsonb := coalesce(_payload -> 'answers', '{}'::jsonb);
  _field jsonb;
  _type text;
  _label text;
  _val text;
  _name text; _phone text; _norm text; _email text; _gender text; _dob date; _city text; _client_notes text;
  _extra text[] := '{}';
  _snapshot jsonb := '[]'::jsonb;
  _today date := (now() at time zone 'Asia/Riyadh')::date;
  _service_req uuid; _specialty_req uuid; _doctor_req uuid;
  _date date; _start time;
  _service_id uuid; _duration int := 30; _price numeric := 0; _specialty uuid;
  _candidates uuid[];
  _doctor uuid;
  _patient_id uuid; _patient_name text;
  _request text := nullif(btrim(coalesce(_payload ->> 'request_id', '')), '');
  _key text;
  _appointment_id uuid;
  _notes text;
begin
  if jsonb_typeof(_answers) <> 'object' then _answers := '{}'::jsonb; end if;

  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then
    raise exception 'FORM_UNAVAILABLE: هذا النموذج غير متاح حاليًا';
  end if;

  -- A resubmitted request (double tap, retry after a timeout) returns the booking it already made.
  _key := 'form:' || coalesce(left(_request, 64), gen_random_uuid()::text);
  select id into _appointment_id from public.appointments where idempotency_key = _key;
  if _appointment_id is not null then
    return public.booking_form_confirmation(_appointment_id, f.settings ->> 'success_message', true);
  end if;

  if (select count(*) from public.booking_form_submissions
       where form_id = f.id and created_at >= now() - interval '1 day') >= 500 then
    raise exception 'FORM_LIMIT: استقبل النموذج عددًا كبيرًا من الطلبات اليوم، حاول لاحقًا أو تواصل مع العيادة';
  end if;

  begin
    _service_req := nullif(_payload ->> 'service_id', '')::uuid;
    _specialty_req := nullif(_payload ->> 'specialty_id', '')::uuid;
    _doctor_req := nullif(_payload ->> 'doctor_id', '')::uuid;
    _date := nullif(_payload ->> 'date', '')::date;
    _start := nullif(_payload ->> 'time', '')::time;
  exception when others then
    raise exception 'INVALID_REQUEST: بيانات الحجز غير صحيحة';
  end;

  -- Answers, in the order the form asks them.
  for _field in select value from jsonb_array_elements(f.fields) loop
    _type := _field ->> 'type';
    continue when _type is null or _type = 'appointment' or coalesce(_field ->> 'id', '') = '';
    _label := coalesce(nullif(btrim(_field ->> 'label'), ''), _type);
    _val := nullif(btrim(coalesce(_answers ->> (_field ->> 'id'), '')), '');
    if _type = 'checkbox' and _val is distinct from 'true' then _val := null; end if;

    if _val is null then
      if coalesce(_field ->> 'required', 'false') = 'true' or _type in ('full_name', 'phone') then
        raise exception 'REQUIRED_FIELD: يرجى تعبئة «%»', _label;
      end if;
      continue;
    end if;
    if length(_val) > 2000 then
      raise exception 'FIELD_TOO_LONG: «%» أطول من المسموح', _label;
    end if;
    if _type in ('select', 'radio') and jsonb_typeof(_field -> 'options') = 'array'
       and jsonb_array_length(_field -> 'options') > 0 and not ((_field -> 'options') ? _val) then
      raise exception 'INVALID_OPTION: اختر قيمة صحيحة في «%»', _label;
    end if;

    case _type
      when 'full_name' then _name := left(_val, 120);
      when 'phone' then _phone := left(_val, 30);
      when 'email' then
        if _val !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
          raise exception 'INVALID_EMAIL: البريد الإلكتروني غير صحيح';
        end if;
        _email := left(_val, 200);
      when 'gender' then
        if _val not in ('male', 'female') then
          raise exception 'INVALID_OPTION: اختر قيمة صحيحة في «%»', _label;
        end if;
        _gender := _val;
      when 'date_of_birth' then
        begin
          _dob := _val::date;
        exception when others then
          raise exception 'INVALID_DATE: تاريخ الميلاد غير صحيح';
        end;
        if _dob > _today or _dob < date '1900-01-01' then
          raise exception 'INVALID_DATE: تاريخ الميلاد غير صحيح';
        end if;
      when 'city' then _city := left(_val, 80);
      when 'notes' then _client_notes := _val;
      else
        _extra := _extra || (_label || ': ' || case when _type = 'checkbox' then 'نعم' else _val end);
    end case;
    _snapshot := _snapshot || jsonb_build_array(jsonb_build_object(
      'field_id', _field ->> 'id', 'label', _label, 'type', _type, 'value', _val));
  end loop;

  if _name is null or length(_name) < 2 then
    raise exception 'REQUIRED_FIELD: يرجى كتابة الاسم الكامل';
  end if;
  _norm := public.normalize_sa_phone(_phone);
  if _norm is null or length(_norm) < 10 or length(_norm) > 16 then
    raise exception 'INVALID_PHONE: رقم الجوال غير صحيح';
  end if;

  -- Slot.
  if _date is null or _start is null then
    raise exception 'INVALID_SLOT: اختر تاريخ ووقت الموعد';
  end if;
  if _date < _today or _date > _today + public.booking_form_window(f.settings) - 1 then
    raise exception 'OUT_OF_WINDOW: التاريخ المختار خارج فترة الحجز المتاحة';
  end if;

  if _service_req is not null then
    select v.id, v.duration_minutes, v.price, v.specialty_id
      into _service_id, _duration, _price, _specialty
      from public.services v
     where v.id = _service_req and v.is_active
       and public.booking_form_allows_service(f.settings, v.id, v.specialty_id);
    if _service_id is null then
      raise exception 'INVALID_SERVICE: الخدمة المختارة غير متاحة';
    end if;
  else
    if _specialty_req is not null then
      if not public.booking_form_allows_specialty(f.settings, _specialty_req)
         or not exists (select 1 from public.specialties where id = _specialty_req and is_active) then
        raise exception 'INVALID_SERVICE: التخصص المختار غير متاح';
      end if;
      _specialty := _specialty_req;
    end if;
    if exists (select 1 from public.services v
                where v.is_active and public.booking_form_allows_service(f.settings, v.id, v.specialty_id)
                  and (_specialty is null or v.specialty_id = _specialty)) then
      raise exception 'INVALID_SERVICE: اختر الخدمة المطلوبة';
    end if;
  end if;

  _candidates := public.booking_form_doctor_ids(
    f.settings, _specialty,
    case when coalesce(f.settings ->> 'choose_doctor', 'true') <> 'false' then _doctor_req end);
  if cardinality(_candidates) = 0 then
    raise exception 'INVALID_DOCTOR: الطبيب المختار غير متاح';
  end if;
  -- The least busy candidate who is free at that time (schedule, breaks, past times, other bookings).
  select c.id into _doctor
    from unnest(_candidates) with ordinality as c(id, ord)
   where exists (select 1 from public.get_available_slots(c.id, _date, _duration) s where s.slot_time = _start)
   order by (select count(*) from public.appointments a
              where a.doctor_id = c.id and a.appointment_date = _date
                and a.status not in ('cancelled', 'no_show', 'rescheduled')), c.ord
   limit 1;
  if _doctor is null then
    raise exception 'SLOT_TAKEN: هذا الموعد لم يعد متاحًا، اختر وقتًا آخر';
  end if;

  if (select count(*) from public.appointments a
        join public.patients p on p.id = a.patient_id
       where p.normalized_phone = _norm and a.appointment_date >= _today
         and a.status in ('pending', 'confirmed') and a.idempotency_key like 'form:%') >= 3 then
    raise exception 'TOO_MANY_BOOKINGS: لديك ثلاثة حجوزات قادمة بالفعل، تواصل مع العيادة إذا احتجت موعدًا إضافيًا';
  end if;

  -- Patient: one record per phone number. Fill in what we didn't know, never overwrite.
  select id, full_name into _patient_id, _patient_name from public.patients where normalized_phone = _norm;
  if _patient_id is null then
    begin
      insert into public.patients (full_name, phone, normalized_phone, email, gender, date_of_birth, city, source)
      values (_name, _phone, '', _email, _gender::public.gender_type, _dob, _city, 'website')
      returning id, full_name into _patient_id, _patient_name;
    exception when unique_violation then
      select id, full_name into _patient_id, _patient_name from public.patients where normalized_phone = _norm;
    end;
  else
    update public.patients
       set email = coalesce(email, _email),
           gender = coalesce(gender, _gender::public.gender_type),
           date_of_birth = coalesce(date_of_birth, _dob),
           city = coalesce(city, _city),
           last_contact_at = now()
     where id = _patient_id;
  end if;

  _notes := concat_ws(E'\n',
    'حجز عبر نموذج «' || f.title || '»',
    case when _patient_name is distinct from _name then 'الاسم في النموذج: ' || _name end,
    nullif(array_to_string(_extra, E'\n'), ''),
    case when _client_notes is not null then 'ملاحظات العميل: ' || _client_notes end);

  begin
    insert into public.appointments (appointment_number, patient_id, doctor_id, service_id, specialty_id,
        appointment_date, start_time, end_time, status, source, price, notes, idempotency_key)
    values ('', _patient_id, _doctor, _service_id,
        coalesce(_specialty, (select specialty_id from public.doctors where id = _doctor)),
        _date, _start, _start + make_interval(mins => _duration), 'pending', 'website',
        coalesce(_price, 0), _notes, _key)
    returning id into _appointment_id;
  exception when unique_violation then
    -- The same request raced itself; hand back the booking that won.
    select id into _appointment_id from public.appointments where idempotency_key = _key;
    if _appointment_id is null then raise; end if;
    return public.booking_form_confirmation(_appointment_id, f.settings ->> 'success_message', true);
  end;

  insert into public.booking_form_submissions (form_id, form_title, appointment_id, patient_id, answers)
  values (f.id, f.title, _appointment_id, _patient_id, _snapshot);

  return public.booking_form_confirmation(_appointment_id, f.settings ->> 'success_message', false);
end; $$;

-- ---------------------------------------------------------------------------
-- 2) Customer chatbot (one bot per clinic)
-- menu: tree of choices [{id, label, kind, reply, url?, url_label?, specialty_id?, children: [...]}]
--       kind: text | services | doctors | hours | contact | booking | link
-- ---------------------------------------------------------------------------
create table if not exists public.chatbot_settings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  bot_name text not null default 'المساعد الآلي',
  welcome_message text not null default 'أهلًا بك 👋 كيف أقدر أساعدك اليوم؟',
  mode text not null default 'hybrid' check (mode in ('menu', 'ai', 'hybrid')),
  is_active boolean not null default true,
  menu jsonb not null default '[]'::jsonb check (jsonb_typeof(menu) = 'array'),
  fallback_message text not null default 'عذرًا، لم أجد إجابة دقيقة لسؤالك. اختر من القائمة أو تواصل مع العيادة مباشرة.',
  ai_model text not null default 'claude-opus-5-5',
  ai_instructions text not null default '',
  ai_daily_limit int not null default 300 check (ai_daily_limit between 0 and 100000),
  booking_form_id uuid references public.booking_forms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.chatbot_settings to authenticated;
grant all on public.chatbot_settings to service_role;
alter table public.chatbot_settings enable row level security;
drop policy if exists "staff read chatbot" on public.chatbot_settings;
create policy "staff read chatbot" on public.chatbot_settings
  for select to authenticated using (true);
drop policy if exists "staff write chatbot" on public.chatbot_settings;
create policy "staff write chatbot" on public.chatbot_settings
  for all to authenticated using (public.can_write()) with check (public.can_write());
create or replace trigger t_chatbot_settings_upd before update on public.chatbot_settings
  for each row execute function public.update_updated_at_column();

-- The bot starts with a menu built only from live clinic data, so nothing it says is made up.
insert into public.chatbot_settings (bot_name, menu)
select coalesce('مساعد ' || (select clinic_name from public.clinic_settings order by created_at limit 1), 'المساعد الآلي'),
       '[
         {"id": "n_booking",  "label": "📅 حجز موعد",          "kind": "booking",  "reply": "يسعدنا خدمتك! احجز موعدك بسهولة من الرابط التالي:", "children": []},
         {"id": "n_services", "label": "💰 الخدمات والأسعار",  "kind": "services", "reply": "هذه خدماتنا وأسعارها:", "children": []},
         {"id": "n_doctors",  "label": "👨‍⚕️ الأطباء",            "kind": "doctors",  "reply": "تعرّف على أطبائنا:", "children": []},
         {"id": "n_hours",    "label": "🕘 مواعيد العمل",       "kind": "hours",    "reply": "مواعيد عمل العيادة:", "children": []},
         {"id": "n_contact",  "label": "📍 الموقع والتواصل",    "kind": "contact",  "reply": "يسعدنا تواصلك معنا:", "children": []}
       ]'::jsonb
where not exists (select 1 from public.chatbot_settings);

create table if not exists public.chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'عام',
  question text not null check (length(btrim(question)) between 1 and 500),
  answer text not null check (length(btrim(answer)) between 1 and 4000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.chatbot_knowledge to authenticated;
grant all on public.chatbot_knowledge to service_role;
alter table public.chatbot_knowledge enable row level security;
drop policy if exists "staff read knowledge" on public.chatbot_knowledge;
create policy "staff read knowledge" on public.chatbot_knowledge
  for select to authenticated using (true);
drop policy if exists "staff write knowledge" on public.chatbot_knowledge;
create policy "staff write knowledge" on public.chatbot_knowledge
  for all to authenticated using (public.can_write()) with check (public.can_write());
create or replace trigger t_chatbot_knowledge_upd before update on public.chatbot_knowledge
  for each row execute function public.update_updated_at_column();

-- Questions customers typed, so staff can see what the bot missed and teach it.
create table if not exists public.chatbot_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null default '',
  question text not null,
  answer text,
  source text not null default 'ai' check (source in ('ai', 'knowledge', 'fallback')),
  created_at timestamptz not null default now()
);
grant select, delete on public.chatbot_logs to authenticated;
grant all on public.chatbot_logs to service_role;
alter table public.chatbot_logs enable row level security;
drop policy if exists "staff read chatbot logs" on public.chatbot_logs;
create policy "staff read chatbot logs" on public.chatbot_logs
  for select to authenticated using (true);
drop policy if exists "staff delete chatbot logs" on public.chatbot_logs;
create policy "staff delete chatbot logs" on public.chatbot_logs
  for delete to authenticated using (public.can_write());
create index if not exists idx_chatbot_logs_created on public.chatbot_logs(created_at desc);

-- AI requests per day, capped by chatbot_settings.ai_daily_limit (protects the API bill).
create table if not exists public.chatbot_usage (
  day date primary key,
  ai_requests int not null default 0
);
grant select on public.chatbot_usage to authenticated;
grant all on public.chatbot_usage to service_role;
alter table public.chatbot_usage enable row level security;
drop policy if exists "staff read chatbot usage" on public.chatbot_usage;
create policy "staff read chatbot usage" on public.chatbot_usage
  for select to authenticated using (true);

-- Public: the bot's menu, knowledge and the clinic data its dynamic answers use.
create or replace function public.get_public_chatbot(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bot_name', b.bot_name,
    'welcome_message', b.welcome_message,
    'mode', b.mode,
    'menu', b.menu,
    'fallback_message', b.fallback_message,
    'booking_slug', (select f.slug from public.booking_forms f where f.id = b.booking_form_id and f.is_active),
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'email', c.email,
                                         'address', c.address, 'city', c.city, 'working_hours', c.working_hours)
                 from public.clinic_settings c order by c.created_at limit 1),
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s where s.is_active),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('name', v.name, 'price', v.price,
                                                               'duration_minutes', v.duration_minutes,
                                                               'specialty_id', v.specialty_id,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v where v.is_active),
    'doctors', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'specialty_id', d.specialty_id)
                                          order by d.name), '[]'::jsonb)
                  from public.doctors d where d.status = 'active'),
    'knowledge', (select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'question', k.question,
                                                                'answer', k.answer) order by k.created_at), '[]'::jsonb)
                    from public.chatbot_knowledge k where k.is_active)
  )
  from public.chatbot_settings b
  where b.slug = _slug and b.is_active;
$$;

-- Public (called by the chat API before each AI request): counts the request
-- against today's cap and hands back the model settings when allowed.
create or replace function public.consume_chatbot_ai_quota(_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b record;
  _today date := (now() at time zone 'Asia/Riyadh')::date;
  _used int;
begin
  select * into b from public.chatbot_settings where slug = _slug and is_active;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;
  if b.mode not in ('ai', 'hybrid') then
    return jsonb_build_object('allowed', false, 'reason', 'ai_disabled');
  end if;
  if b.ai_daily_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded');
  end if;

  insert into public.chatbot_usage as u (day, ai_requests) values (_today, 1)
  on conflict (day) do update set ai_requests = u.ai_requests + 1
    where u.ai_requests < b.ai_daily_limit
  returning u.ai_requests into _used;
  if _used is null then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded');
  end if;

  return jsonb_build_object('allowed', true, 'model', b.ai_model, 'instructions', b.ai_instructions);
end; $$;

-- Public: record one customer question and the bot's answer.
create or replace function public.log_chatbot_exchange(
  _slug text, _session text, _question text, _answer text, _source text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if _source not in ('ai', 'knowledge', 'fallback') or coalesce(btrim(_question), '') = '' then return; end if;
  if not exists (select 1 from public.chatbot_settings where slug = _slug and is_active) then return; end if;
  -- Bound what an anonymous caller can write.
  if (select count(*) from public.chatbot_logs where created_at >= now() - interval '1 day') >= 5000 then return; end if;
  insert into public.chatbot_logs (session_id, question, answer, source)
  values (left(coalesce(_session, ''), 64), left(btrim(_question), 1000), left(_answer, 4000), _source);
end; $$;

-- ---------------------------------------------------------------------------
-- 3) Permissions: only the public RPCs are callable without logging in.
-- ---------------------------------------------------------------------------
revoke execute on function public.booking_form_doctor_ids(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.booking_form_confirmation(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.get_public_booking_form(text) from public;
revoke execute on function public.get_public_booking_availability(text, uuid, uuid, uuid) from public;
revoke execute on function public.submit_public_booking(text, jsonb) from public;
revoke execute on function public.get_public_chatbot(text) from public;
revoke execute on function public.consume_chatbot_ai_quota(text) from public;
revoke execute on function public.log_chatbot_exchange(text, text, text, text, text) from public;
grant execute on function public.get_public_booking_form(text) to anon, authenticated, service_role;
grant execute on function public.get_public_booking_availability(text, uuid, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.submit_public_booking(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.get_public_chatbot(text) to anon, authenticated, service_role;
grant execute on function public.consume_chatbot_ai_quota(text) to anon, authenticated, service_role;
grant execute on function public.log_chatbot_exchange(text, text, text, text, text) to anon, authenticated, service_role;

do $realtime$
begin
  begin
    alter publication supabase_realtime add table public.booking_form_submissions;
  exception when others then raise notice 'realtime add booking_form_submissions skipped: %', sqlerrm;
  end;
end $realtime$;


-- ============================================================================
-- 8) DOCTORS IN MORE THAN ONE DEPARTMENT (doctor_specialties) + save_doctor RPC
-- (from migration 20261011120000_multi_department_doctors.sql)
-- ============================================================================
-- ---------------------------------------------------------------------------
-- 1) Departments per doctor
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_specialties (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (doctor_id, specialty_id)
);
grant select, insert, update, delete on public.doctor_specialties to authenticated;
grant all on public.doctor_specialties to service_role;
alter table public.doctor_specialties enable row level security;
drop policy if exists "staff read doctor specialties" on public.doctor_specialties;
create policy "staff read doctor specialties" on public.doctor_specialties
  for select to authenticated using (true);
drop policy if exists "admin write doctor specialties" on public.doctor_specialties;
create policy "admin write doctor specialties" on public.doctor_specialties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists idx_doctor_specialties_specialty on public.doctor_specialties(specialty_id);

-- Existing doctors keep their department.
insert into public.doctor_specialties (doctor_id, specialty_id)
select id, specialty_id from public.doctors where specialty_id is not null
on conflict do nothing;

-- Every department a doctor works in: the main one plus the extra ones.
create or replace function public.doctor_specialty_ids(_doctor uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    from (select specialty_id as id from public.doctors where id = _doctor and specialty_id is not null
          union
          select specialty_id from public.doctor_specialties where doctor_id = _doctor) as x;
$$;

create or replace function public.doctor_has_specialty(_doctor uuid, _specialty uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _specialty is not null
     and (exists (select 1 from public.doctors where id = _doctor and specialty_id = _specialty)
          or exists (select 1 from public.doctor_specialties where doctor_id = _doctor and specialty_id = _specialty));
$$;

-- A form limited to some departments can book a doctor who works in any of them.
create or replace function public.booking_form_allows_doctor(_settings jsonb, _doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select jsonb_array_length(public.booking_form_id_list(_settings, 'specialty_ids')) = 0
      or exists (select 1 from unnest(public.doctor_specialty_ids(_doctor)) as s(id)
                  where public.booking_form_id_list(_settings, 'specialty_ids') ? s.id::text);
$$;

-- ---------------------------------------------------------------------------
-- 2) Booking forms and the chatbot read every department of a doctor
-- ---------------------------------------------------------------------------
create or replace function public.booking_form_doctor_ids(_settings jsonb, _specialty uuid, _doctor uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id order by d.name), '{}'::uuid[])
    from public.doctors d
   where d.status = 'active'
     and public.booking_form_allows_doctor(_settings, d.id)
     and (_specialty is null or public.doctor_has_specialty(d.id, _specialty))
     and (_doctor is null or d.id = _doctor);
$$;

create or replace function public.get_public_booking_form(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f record; _doctors jsonb;
begin
  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'specialty_id', d.specialty_id,
                                               'specialty_ids', to_jsonb(public.doctor_specialty_ids(d.id)))
                            order by d.name), '[]'::jsonb)
    into _doctors
    from public.doctors d
   where d.status = 'active' and public.booking_form_allows_doctor(f.settings, d.id);

  return jsonb_build_object(
    'id', f.id,
    'slug', f.slug,
    'title', f.title,
    'description', f.description,
    'fields', f.fields,
    'settings', f.settings,
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'address', c.address,
                                         'city', c.city, 'logo_url', c.logo_url)
                 from public.clinic_settings c order by c.created_at limit 1),
    -- only departments that someone can actually be booked with
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s
                     where s.is_active and public.booking_form_allows_specialty(f.settings, s.id)
                       and exists (select 1 from public.doctors d
                                    where d.status = 'active' and public.doctor_has_specialty(d.id, s.id))),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'specialty_id', v.specialty_id,
                                                               'duration_minutes', v.duration_minutes, 'price', v.price,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v
                  where v.is_active and public.booking_form_allows_service(f.settings, v.id, v.specialty_id)
                    and (v.specialty_id is null or exists (select 1 from public.doctors d
                                                            where d.status = 'active'
                                                              and public.doctor_has_specialty(d.id, v.specialty_id)))),
    'doctors', _doctors
  );
end; $$;

create or replace function public.get_public_chatbot(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bot_name', b.bot_name,
    'welcome_message', b.welcome_message,
    'mode', b.mode,
    'menu', b.menu,
    'fallback_message', b.fallback_message,
    'booking_slug', (select f.slug from public.booking_forms f where f.id = b.booking_form_id and f.is_active),
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'email', c.email,
                                         'address', c.address, 'city', c.city, 'working_hours', c.working_hours)
                 from public.clinic_settings c order by c.created_at limit 1),
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s where s.is_active),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('name', v.name, 'price', v.price,
                                                               'duration_minutes', v.duration_minutes,
                                                               'specialty_id', v.specialty_id,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v where v.is_active),
    'doctors', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'specialty_id', d.specialty_id,
                                                              'specialty_ids', to_jsonb(public.doctor_specialty_ids(d.id)),
                                                              'bio', d.bio)
                                          order by d.name), '[]'::jsonb)
                  from public.doctors d where d.status = 'active'),
    'knowledge', (select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'question', k.question,
                                                                'answer', k.answer) order by k.created_at), '[]'::jsonb)
                    from public.chatbot_knowledge k where k.is_active)
  )
  from public.chatbot_settings b
  where b.slug = _slug and b.is_active;
$$;

-- ---------------------------------------------------------------------------
-- 3) save_doctor: details + departments + weekly schedule in one transaction
-- _payload: {name, phone?, email?, bio?, status: active|inactive,
--            specialty_ids: [uuid, ...] (first = main department),
--            schedules: [{day_of_week 0-6, start_time, end_time, break_start?, break_end?}]}
-- Days missing from `schedules` become days off. Returns the doctor id.
-- ---------------------------------------------------------------------------
create or replace function public.save_doctor(_doctor_id uuid, _payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  _id uuid := _doctor_id;
  _name text := btrim(coalesce(_payload ->> 'name', ''));
  _status text := coalesce(nullif(_payload ->> 'status', ''), 'active');
  _specs uuid[];
  _primary uuid;
  _day jsonb;
  _dow int;
  _start time; _end time; _bstart time; _bend time;
  _days int[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: تعديل الأطباء متاح للمدير فقط';
  end if;
  if length(_name) < 2 or length(_name) > 120 then
    raise exception 'INVALID_NAME: اكتب اسم الطبيب';
  end if;
  if _status not in ('active', 'inactive') then
    raise exception 'INVALID_STATUS: حالة غير صحيحة';
  end if;

  begin
    select coalesce(array_agg(x.id order by x.ord), '{}'::uuid[]) into _specs
      from (select min(e.ord) as ord, e.value::uuid as id
              from jsonb_array_elements_text(coalesce(_payload -> 'specialty_ids', '[]'::jsonb))
                   with ordinality as e(value, ord)
             where e.value <> ''
             group by e.value::uuid) as x;
  exception when others then
    raise exception 'INVALID_SPECIALTY: قسم غير صحيح';
  end;
  if exists (select 1 from unnest(_specs) as s(id)
              where not exists (select 1 from public.specialties where id = s.id)) then
    raise exception 'INVALID_SPECIALTY: قسم غير موجود';
  end if;
  _primary := _specs[1];

  if _id is null then
    insert into public.doctors (name, phone, email, bio, status, specialty_id)
    values (_name, nullif(btrim(_payload ->> 'phone'), ''), nullif(btrim(_payload ->> 'email'), ''),
            nullif(btrim(_payload ->> 'bio'), ''), _status, _primary)
    returning id into _id;
  else
    update public.doctors
       set name = _name,
           phone = nullif(btrim(_payload ->> 'phone'), ''),
           email = nullif(btrim(_payload ->> 'email'), ''),
           bio = nullif(btrim(_payload ->> 'bio'), ''),
           status = _status,
           specialty_id = _primary
     where id = _id;
    if not found then
      raise exception 'NOT_FOUND: الطبيب غير موجود';
    end if;
  end if;

  delete from public.doctor_specialties where doctor_id = _id and specialty_id <> all (_specs);
  insert into public.doctor_specialties (doctor_id, specialty_id)
  select _id, s.id from unnest(_specs) as s(id)
  on conflict do nothing;

  if jsonb_typeof(_payload -> 'schedules') = 'array' then
    for _day in select value from jsonb_array_elements(_payload -> 'schedules') loop
      begin
        _dow := (_day ->> 'day_of_week')::int;
        _start := (_day ->> 'start_time')::time;
        _end := (_day ->> 'end_time')::time;
        _bstart := nullif(_day ->> 'break_start', '')::time;
        _bend := nullif(_day ->> 'break_end', '')::time;
      exception when others then
        raise exception 'INVALID_SCHEDULE: وقت غير صحيح في جدول العمل';
      end;
      if _dow is null or _dow not between 0 and 6 or _start is null or _end is null or _start >= _end then
        raise exception 'INVALID_SCHEDULE: وقت النهاية يجب أن يكون بعد وقت البداية';
      end if;
      if (_bstart is null) <> (_bend is null)
         or (_bstart is not null and (_bstart >= _bend or _bstart <= _start or _bend >= _end)) then
        raise exception 'INVALID_SCHEDULE: الاستراحة يجب أن تكون داخل وقت العمل';
      end if;
      _days := _days || _dow;
      insert into public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
      values (_id, _dow, _start, _end, _bstart, _bend, true)
      on conflict (doctor_id, day_of_week) do update
        set start_time = excluded.start_time, end_time = excluded.end_time,
            break_start = excluded.break_start, break_end = excluded.break_end, is_active = true;
    end loop;
    delete from public.doctor_schedules where doctor_id = _id and day_of_week <> all (_days);
  end if;

  return _id;
end; $$;

-- ---------------------------------------------------------------------------
-- 4) Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.doctor_specialty_ids(uuid) from public, anon, authenticated;
revoke execute on function public.doctor_has_specialty(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.booking_form_allows_doctor(jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.save_doctor(uuid, jsonb) from public, anon;
grant execute on function public.save_doctor(uuid, jsonb) to authenticated, service_role;


-- ============================================================================
-- 9) «يبدأ من» PRICES (services.price_from), HIDDEN NAMES (doctors.hide_name),
--    MIDNIGHT-SAFE SLOTS, BOOKING FORM OFFERS ONLY SCHEDULED DEPARTMENTS
-- (from migration 20261014120000_price_from_hidden_names_slots.sql)
-- ============================================================================
alter table public.services add column if not exists price_from boolean not null default false;
alter table public.doctors add column if not exists hide_name boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1) Slots in whole minutes; the last slot must end by 23:59 the same day.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(_doctor_id uuid, _date date, _duration int default 30)
returns table(slot_time time)
language plpgsql stable security definer set search_path = public as $$
declare
  sch record;
  _t int; _end int; _bstart int; _bend int; _now int;
  _today boolean := _date = (now() at time zone 'Asia/Riyadh')::date;
  _start_time time; _end_time time;
begin
  if _duration is null or _duration < 5 then return; end if;
  select * into sch from public.doctor_schedules
    where doctor_id = _doctor_id and day_of_week = extract(dow from _date)::int and is_active = true;
  if not found then return; end if;

  _t := extract(hour from sch.start_time)::int * 60 + extract(minute from sch.start_time)::int;
  _end := least(extract(hour from sch.end_time)::int * 60 + extract(minute from sch.end_time)::int, 1439);
  if sch.break_start is not null and sch.break_end is not null then
    _bstart := extract(hour from sch.break_start)::int * 60 + extract(minute from sch.break_start)::int;
    _bend := extract(hour from sch.break_end)::int * 60 + extract(minute from sch.break_end)::int;
  end if;
  _now := extract(hour from (now() at time zone 'Asia/Riyadh'))::int * 60
        + extract(minute from (now() at time zone 'Asia/Riyadh'))::int;

  while _t + _duration <= _end loop
    _start_time := make_time(_t / 60, _t % 60, 0);
    _end_time := make_time((_t + _duration) / 60, (_t + _duration) % 60, 0);
    if not (_bstart is not null and _t < _bend and _t + _duration > _bstart)
       and not (_today and _t <= _now)
       and not exists (
         select 1 from public.appointments a
          where a.doctor_id = _doctor_id and a.appointment_date = _date
            and a.status not in ('cancelled', 'no_show', 'rescheduled')
            and a.start_time < _end_time and a.end_time > _start_time)
    then
      slot_time := _start_time;
      return next;
    end if;
    _t := _t + _duration;
  end loop;
end; $$;

-- ---------------------------------------------------------------------------
-- 2) Public booking form: only what can actually be booked
-- ---------------------------------------------------------------------------
create or replace function public.doctor_has_schedule(_doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_schedules where doctor_id = _doctor and is_active);
$$;

create or replace function public.get_public_booking_form(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f record; _doctors jsonb;
begin
  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then return null; end if;

  -- Doctors customers may pick by name (hidden rows are still booked as "any available").
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'specialty_id', d.specialty_id,
                                               'specialty_ids', to_jsonb(public.doctor_specialty_ids(d.id)))
                            order by d.name), '[]'::jsonb)
    into _doctors
    from public.doctors d
   where d.status = 'active' and not d.hide_name and public.doctor_has_schedule(d.id)
     and public.booking_form_allows_doctor(f.settings, d.id);

  return jsonb_build_object(
    'id', f.id,
    'slug', f.slug,
    'title', f.title,
    'description', f.description,
    'fields', f.fields,
    'settings', f.settings,
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'address', c.address,
                                         'city', c.city, 'logo_url', c.logo_url)
                 from public.clinic_settings c order by c.created_at limit 1),
    -- only departments that someone with a weekly schedule can be booked with
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s
                     where s.is_active and public.booking_form_allows_specialty(f.settings, s.id)
                       and exists (select 1 from public.doctors d
                                    where d.status = 'active' and public.doctor_has_specialty(d.id, s.id)
                                      and public.doctor_has_schedule(d.id))),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'specialty_id', v.specialty_id,
                                                               'duration_minutes', v.duration_minutes, 'price', v.price,
                                                               'price_from', v.price_from,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v
                  where v.is_active and public.booking_form_allows_service(f.settings, v.id, v.specialty_id)
                    and (v.specialty_id is null or exists (select 1 from public.doctors d
                                                            where d.status = 'active'
                                                              and public.doctor_has_specialty(d.id, v.specialty_id)
                                                              and public.doctor_has_schedule(d.id)))),
    'doctors', _doctors
  );
end; $$;

create or replace function public.booking_form_confirmation(_appointment_id uuid, _message text, _duplicate boolean)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'appointment_number', a.appointment_number,
    'date', a.appointment_date,
    'start_time', a.start_time,
    'end_time', a.end_time,
    'doctor_name', case when d.hide_name then null else d.name end,
    'service_name', v.name,
    'success_message', _message,
    'duplicate', _duplicate)
  from public.appointments a
  left join public.doctors d on d.id = a.doctor_id
  left join public.services v on v.id = a.service_id
  where a.id = _appointment_id;
$$;

-- ---------------------------------------------------------------------------
-- 3) Chatbot: starting prices, and no hidden names
-- ---------------------------------------------------------------------------
create or replace function public.get_public_chatbot(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bot_name', b.bot_name,
    'welcome_message', b.welcome_message,
    'mode', b.mode,
    'menu', b.menu,
    'fallback_message', b.fallback_message,
    'booking_slug', (select f.slug from public.booking_forms f where f.id = b.booking_form_id and f.is_active),
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'email', c.email,
                                         'address', c.address, 'city', c.city, 'working_hours', c.working_hours)
                 from public.clinic_settings c order by c.created_at limit 1),
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s where s.is_active),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('name', v.name, 'price', v.price,
                                                               'price_from', v.price_from,
                                                               'duration_minutes', v.duration_minutes,
                                                               'specialty_id', v.specialty_id,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v where v.is_active),
    'doctors', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'specialty_id', d.specialty_id,
                                                              'specialty_ids', to_jsonb(public.doctor_specialty_ids(d.id)),
                                                              'bio', d.bio)
                                          order by d.name), '[]'::jsonb)
                  from public.doctors d where d.status = 'active' and not d.hide_name),
    'knowledge', (select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'question', k.question,
                                                                'answer', k.answer) order by k.created_at), '[]'::jsonb)
                    from public.chatbot_knowledge k where k.is_active)
  )
  from public.chatbot_settings b
  where b.slug = _slug and b.is_active;
$$;

-- ---------------------------------------------------------------------------
-- 4) save_doctor also stores hide_name
-- ---------------------------------------------------------------------------
create or replace function public.save_doctor(_doctor_id uuid, _payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  _id uuid := _doctor_id;
  _name text := btrim(coalesce(_payload ->> 'name', ''));
  _status text := coalesce(nullif(_payload ->> 'status', ''), 'active');
  _hide boolean := coalesce(_payload ->> 'hide_name', 'false') = 'true';
  _specs uuid[];
  _primary uuid;
  _day jsonb;
  _dow int;
  _start time; _end time; _bstart time; _bend time;
  _days int[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: تعديل الأطباء متاح للمدير فقط';
  end if;
  if length(_name) < 2 or length(_name) > 120 then
    raise exception 'INVALID_NAME: اكتب اسم الطبيب';
  end if;
  if _status not in ('active', 'inactive') then
    raise exception 'INVALID_STATUS: حالة غير صحيحة';
  end if;

  begin
    select coalesce(array_agg(x.id order by x.ord), '{}'::uuid[]) into _specs
      from (select min(e.ord) as ord, e.value::uuid as id
              from jsonb_array_elements_text(coalesce(_payload -> 'specialty_ids', '[]'::jsonb))
                   with ordinality as e(value, ord)
             where e.value <> ''
             group by e.value::uuid) as x;
  exception when others then
    raise exception 'INVALID_SPECIALTY: قسم غير صحيح';
  end;
  if exists (select 1 from unnest(_specs) as s(id)
              where not exists (select 1 from public.specialties where id = s.id)) then
    raise exception 'INVALID_SPECIALTY: قسم غير موجود';
  end if;
  _primary := _specs[1];

  if _id is null then
    insert into public.doctors (name, phone, email, bio, status, specialty_id, hide_name)
    values (_name, nullif(btrim(_payload ->> 'phone'), ''), nullif(btrim(_payload ->> 'email'), ''),
            nullif(btrim(_payload ->> 'bio'), ''), _status, _primary, _hide)
    returning id into _id;
  else
    update public.doctors
       set name = _name,
           phone = nullif(btrim(_payload ->> 'phone'), ''),
           email = nullif(btrim(_payload ->> 'email'), ''),
           bio = nullif(btrim(_payload ->> 'bio'), ''),
           status = _status,
           specialty_id = _primary,
           hide_name = _hide
     where id = _id;
    if not found then
      raise exception 'NOT_FOUND: الطبيب غير موجود';
    end if;
  end if;

  delete from public.doctor_specialties where doctor_id = _id and specialty_id <> all (_specs);
  insert into public.doctor_specialties (doctor_id, specialty_id)
  select _id, s.id from unnest(_specs) as s(id)
  on conflict do nothing;

  if jsonb_typeof(_payload -> 'schedules') = 'array' then
    for _day in select value from jsonb_array_elements(_payload -> 'schedules') loop
      begin
        _dow := (_day ->> 'day_of_week')::int;
        _start := (_day ->> 'start_time')::time;
        _end := (_day ->> 'end_time')::time;
        _bstart := nullif(_day ->> 'break_start', '')::time;
        _bend := nullif(_day ->> 'break_end', '')::time;
      exception when others then
        raise exception 'INVALID_SCHEDULE: وقت غير صحيح في جدول العمل';
      end;
      if _dow is null or _dow not between 0 and 6 or _start is null or _end is null or _start >= _end then
        raise exception 'INVALID_SCHEDULE: وقت النهاية يجب أن يكون بعد وقت البداية';
      end if;
      if (_bstart is null) <> (_bend is null)
         or (_bstart is not null and (_bstart >= _bend or _bstart <= _start or _bend >= _end)) then
        raise exception 'INVALID_SCHEDULE: الاستراحة يجب أن تكون داخل وقت العمل';
      end if;
      _days := _days || _dow;
      insert into public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
      values (_id, _dow, _start, _end, _bstart, _bend, true)
      on conflict (doctor_id, day_of_week) do update
        set start_time = excluded.start_time, end_time = excluded.end_time,
            break_start = excluded.break_start, break_end = excluded.break_end, is_active = true;
    end loop;
    delete from public.doctor_schedules where doctor_id = _id and day_of_week <> all (_days);
  end if;

  return _id;
end; $$;

-- ---------------------------------------------------------------------------
-- 5) Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.doctor_has_schedule(uuid) from public, anon, authenticated;
revoke execute on function public.get_available_slots(uuid, date, integer) from anon;
revoke execute on function public.booking_form_confirmation(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.save_doctor(uuid, jsonb) from public, anon;
grant execute on function public.save_doctor(uuid, jsonb) to authenticated, service_role;
