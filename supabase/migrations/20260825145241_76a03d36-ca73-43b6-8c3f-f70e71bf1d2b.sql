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
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.integration_events;

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