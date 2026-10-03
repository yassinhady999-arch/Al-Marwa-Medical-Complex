-- ============================================================================
-- BOOKING FORMS (نماذج الحجز) + CUSTOMER CHATBOT (الشات بوت)
--
-- Booking forms: staff design a form (which fields to ask), share its public
-- link, and every submission books a real appointment in a free slot.
-- Chatbot: a public chat page answering customers either from a menu tree
-- (no model needed), from an AI model grounded in the clinic's data, or both.
--
-- Public pages call only the security-definer RPCs below (granted to anon);
-- the tables themselves stay staff-only under RLS.
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
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
