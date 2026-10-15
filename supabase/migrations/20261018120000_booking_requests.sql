-- ============================================================================
-- BOOKING REQUESTS + WHATSAPP (طلب حجز ثم استكمال الحجز عبر واتساب)
--
-- The public booking form no longer books a slot. It records a booking request
-- (status pending_contact) in booking_form_submissions, then the patient opens
-- the clinic's WhatsApp with a ready-made message and sends it themselves.
-- It shows as a «حجز محتمل» in «الحجوزات» (and in «التقارير»), where staff follow up:
--   pending_contact → contacted → confirmed (books the real appointment)
--                              ↘ cancelled
-- A request is never an appointment until a staff member confirms it, so it
-- never shows in the calendar or in the appointment statistics.
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The clinic's WhatsApp number (الإعدادات ← بيانات العيادة). When it is empty the
--    clinic's phone number is used, so the button always reaches the clinic on WhatsApp.
-- ---------------------------------------------------------------------------
alter table public.clinic_settings add column if not exists whatsapp_number text;

-- ---------------------------------------------------------------------------
-- 2) Requests live in booking_form_submissions
-- ---------------------------------------------------------------------------
create sequence if not exists public.booking_request_number_seq;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'booking_form_submissions'
                    and column_name = 'status') then
    alter table public.booking_form_submissions
      add column status text not null default 'pending_contact';
    -- Before this change every submission booked an appointment straight away.
    update public.booking_form_submissions
       set status = case when appointment_id is not null then 'confirmed' else 'cancelled' end;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_form_submissions_status_check') then
    alter table public.booking_form_submissions add constraint booking_form_submissions_status_check
      check (status in ('pending_contact', 'contacted', 'confirmed', 'cancelled'));
  end if;
end $$;

alter table public.booking_form_submissions
  add column if not exists request_number text,
  add column if not exists request_key text,
  add column if not exists specialty_id uuid references public.specialties(id) on delete set null,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists doctor_id uuid references public.doctors(id) on delete set null,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null;

create or replace function public.booking_request_set_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.request_number is null or new.request_number = '' then
    new.request_number := 'REQ-' || to_char(now() at time zone 'Asia/Riyadh', 'YY') || '-' ||
      lpad(nextval('public.booking_request_number_seq')::text, 5, '0');
  end if;
  return new;
end; $$;
drop trigger if exists t_booking_request_number on public.booking_form_submissions;
create trigger t_booking_request_number before insert on public.booking_form_submissions
  for each row execute function public.booking_request_set_number();

-- Older rows get a number too, in the order they arrived.
update public.booking_form_submissions s
   set request_number = 'REQ-' || to_char(s.created_at at time zone 'Asia/Riyadh', 'YY') || '-' ||
         lpad(nextval('public.booking_request_number_seq')::text, 5, '0')
  from (select id from public.booking_form_submissions
         where request_number is null order by created_at) as o
 where s.id = o.id;

create unique index if not exists booking_form_submissions_request_number_key
  on public.booking_form_submissions(request_number);
create unique index if not exists booking_form_submissions_request_key_key
  on public.booking_form_submissions(request_key);
create index if not exists idx_booking_requests_status
  on public.booking_form_submissions(status, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Public form: what can be requested (no weekly schedule needed any more,
--    the clinic sets the time) + the clinic's WhatsApp number
-- ---------------------------------------------------------------------------
create or replace function public.get_public_booking_form(_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f record;
begin
  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then return null; end if;

  return jsonb_build_object(
    'id', f.id,
    'slug', f.slug,
    'title', f.title,
    'description', f.description,
    'fields', f.fields,
    'settings', f.settings,
    'clinic', (select jsonb_build_object('name', c.clinic_name, 'phone', c.phone, 'address', c.address,
                                         'city', c.city, 'logo_url', c.logo_url,
                                         'whatsapp', coalesce(nullif(btrim(c.whatsapp_number), ''),
                                                             nullif(btrim(c.phone), '')))
                 from public.clinic_settings c order by c.created_at limit 1),
    'specialties', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
                      from public.specialties s
                     where s.is_active and public.booking_form_allows_specialty(f.settings, s.id)),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'specialty_id', v.specialty_id,
                                                               'duration_minutes', v.duration_minutes, 'price', v.price,
                                                               'price_from', v.price_from,
                                                               'description', v.description) order by v.name), '[]'::jsonb)
                   from public.services v
                   left join public.specialties s on s.id = v.specialty_id
                  where v.is_active and (s.id is null or s.is_active)
                    and public.booking_form_allows_service(f.settings, v.id, v.specialty_id)),
    -- Doctors customers may ask for by name (hidden rows are requested by department).
    'doctors', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'specialty_id', d.specialty_id,
                                                              'specialty_ids', to_jsonb(public.doctor_specialty_ids(d.id)))
                                          order by d.name), '[]'::jsonb)
                  from public.doctors d
                 where d.status = 'active' and not d.hide_name
                   and public.booking_form_allows_doctor(f.settings, d.id))
  );
end; $$;

-- What the patient sees after sending, and what goes into the WhatsApp message.
create or replace function public.booking_request_confirmation(_request_id uuid, _duplicate boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'request_number', r.request_number,
    'status', r.status,
    'created_at', r.created_at,
    'patient_name', (select a ->> 'value' from jsonb_array_elements(r.answers) a where a ->> 'type' = 'full_name' limit 1),
    'phone', (select a ->> 'value' from jsonb_array_elements(r.answers) a where a ->> 'type' = 'phone' limit 1),
    'specialty_name', s.name,
    'service_name', v.name,
    'doctor_name', case when d.hide_name then null else d.name end,
    'success_message', f.settings ->> 'success_message',
    'clinic_whatsapp', (select coalesce(nullif(btrim(c.whatsapp_number), ''), nullif(btrim(c.phone), ''))
                          from public.clinic_settings c order by c.created_at limit 1),
    'clinic_phone', (select c.phone from public.clinic_settings c order by c.created_at limit 1),
    'duplicate', _duplicate)
  from public.booking_form_submissions r
  left join public.booking_forms f on f.id = r.form_id
  left join public.specialties s on s.id = r.specialty_id
  left join public.services v on v.id = r.service_id
  left join public.doctors d on d.id = r.doctor_id
  where r.id = _request_id;
$$;

-- ---------------------------------------------------------------------------
-- 4) Public: record a booking request (no appointment, no time slot)
-- _payload: {request_id, specialty_id?, service_id?, doctor_id?, answers: {field_id: value}}
-- ---------------------------------------------------------------------------
create or replace function public.submit_booking_request(_slug text, _payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f record;
  _answers jsonb := coalesce(_payload -> 'answers', '{}'::jsonb);
  _field jsonb;
  _type text;
  _label text;
  _val text;
  _name text; _phone text; _norm text; _email text; _gender text; _dob date; _city text;
  _snapshot jsonb := '[]'::jsonb;
  _today date := (now() at time zone 'Asia/Riyadh')::date;
  _service_req uuid; _specialty_req uuid; _doctor_req uuid;
  _service_id uuid; _specialty uuid; _doctor uuid;
  _patient_id uuid;
  _key text := 'request:' || coalesce(left(nullif(btrim(coalesce(_payload ->> 'request_id', '')), ''), 64),
                                       gen_random_uuid()::text);
  _request_id uuid;
begin
  if jsonb_typeof(_answers) <> 'object' then _answers := '{}'::jsonb; end if;

  select * into f from public.booking_forms where slug = _slug and is_active;
  if not found then
    raise exception 'FORM_UNAVAILABLE: هذا النموذج غير متاح حاليًا';
  end if;

  -- A resubmitted request (double tap, retry after a timeout) returns the one already saved.
  select id into _request_id from public.booking_form_submissions where request_key = _key;
  if _request_id is not null then
    return public.booking_request_confirmation(_request_id, true);
  end if;

  if (select count(*) from public.booking_form_submissions
       where form_id = f.id and created_at >= now() - interval '1 day') >= 500 then
    raise exception 'FORM_LIMIT: استقبل النموذج عددًا كبيرًا من الطلبات اليوم، حاول لاحقًا أو تواصل مع العيادة';
  end if;

  begin
    _service_req := nullif(_payload ->> 'service_id', '')::uuid;
    _specialty_req := nullif(_payload ->> 'specialty_id', '')::uuid;
    _doctor_req := nullif(_payload ->> 'doctor_id', '')::uuid;
  exception when others then
    raise exception 'INVALID_REQUEST: بيانات الطلب غير صحيحة';
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
      when 'full_name' then _name := left(_val, 120); _val := _name;
      when 'phone' then _phone := left(_val, 30); _val := _phone;
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
      else null;
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

  -- What is requested: a service (its department), or a department when it has no services.
  if _service_req is not null then
    select v.id, v.specialty_id into _service_id, _specialty
      from public.services v
      left join public.specialties s on s.id = v.specialty_id
     where v.id = _service_req and v.is_active and (s.id is null or s.is_active)
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
                left join public.specialties s on s.id = v.specialty_id
                where v.is_active and (s.id is null or s.is_active)
                  and public.booking_form_allows_service(f.settings, v.id, v.specialty_id)
                  and (_specialty is null or v.specialty_id = _specialty)) then
      raise exception 'INVALID_SERVICE: اختر الخدمة المطلوبة';
    end if;
  end if;

  -- A doctor asked for by name: active, shown to customers, and in that department.
  if _doctor_req is not null and coalesce(f.settings ->> 'choose_doctor', 'true') <> 'false' then
    select d.id into _doctor
      from public.doctors d
     where d.id = _doctor_req and d.status = 'active' and not d.hide_name
       and public.booking_form_allows_doctor(f.settings, d.id)
       and (_specialty is null or public.doctor_has_specialty(d.id, _specialty));
    if _doctor is null then
      raise exception 'INVALID_DOCTOR: الطبيب المختار غير متاح';
    end if;
  end if;

  -- Patient: one record per phone number. Fill in what we didn't know, never overwrite.
  select id into _patient_id from public.patients where normalized_phone = _norm;
  if _patient_id is null then
    begin
      insert into public.patients (full_name, phone, normalized_phone, email, gender, date_of_birth, city, source)
      values (_name, _phone, '', _email, _gender::public.gender_type, _dob, _city, 'website')
      returning id into _patient_id;
    exception when unique_violation then
      select id into _patient_id from public.patients where normalized_phone = _norm;
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

  -- The same open request sent again (e.g. after closing WhatsApp) is not a new one.
  select r.id into _request_id
    from public.booking_form_submissions r
   where r.patient_id = _patient_id and r.form_id = f.id and r.status = 'pending_contact'
     and r.service_id is not distinct from _service_id
     and r.specialty_id is not distinct from _specialty
     and r.doctor_id is not distinct from _doctor
     and r.created_at >= now() - interval '30 minutes'
   order by r.created_at desc limit 1;
  if _request_id is not null then
    return public.booking_request_confirmation(_request_id, true);
  end if;

  if (select count(*) from public.booking_form_submissions
       where patient_id = _patient_id and status in ('pending_contact', 'contacted')) >= 3 then
    raise exception 'TOO_MANY_REQUESTS: لديك ثلاثة طلبات حجز قيد المتابعة بالفعل، تواصل مع العيادة لاستكمالها';
  end if;

  begin
    insert into public.booking_form_submissions
      (form_id, form_title, patient_id, answers, status, request_key, specialty_id, service_id, doctor_id)
    values (f.id, f.title, _patient_id, _snapshot, 'pending_contact', _key, _specialty, _service_id, _doctor)
    returning id into _request_id;
  exception when unique_violation then
    -- The same request raced itself; hand back the one that won.
    select id into _request_id from public.booking_form_submissions where request_key = _key;
    if _request_id is null then raise; end if;
    return public.booking_request_confirmation(_request_id, true);
  end;

  insert into public.notifications (type, title, message, entity_type, entity_id)
  values ('booking_request.created', 'حجز محتمل جديد',
          _name || coalesce(' — ' || (select name from public.services where id = _service_id),
                            ' — ' || (select name from public.specialties where id = _specialty), '')
            || ' · طلب استكمال الحجز عبر واتساب',
          'booking_request', _request_id);

  return public.booking_request_confirmation(_request_id, false);
end; $$;

-- The old entry point now records a request too, so no page can book a slot on its own.
create or replace function public.submit_public_booking(_slug text, _payload jsonb)
returns jsonb language sql security definer set search_path = public as $$
  select public.submit_booking_request(_slug, _payload);
$$;

-- ---------------------------------------------------------------------------
-- 5) Staff: follow up a request
-- ---------------------------------------------------------------------------
create or replace function public.set_booking_request_status(_request_id uuid, _status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.can_write() then
    raise exception 'NOT_ALLOWED: ليست لديك صلاحية تعديل الحجوزات المحتملة';
  end if;
  if _status not in ('pending_contact', 'contacted', 'cancelled') then
    raise exception 'INVALID_STATUS: لتأكيد الطلب حدّد موعده من «تأكيد الموعد»';
  end if;
  select * into r from public.booking_form_submissions where id = _request_id for update;
  if not found then
    raise exception 'NOT_FOUND: الطلب غير موجود';
  end if;
  if r.status = 'confirmed' then
    raise exception 'ALREADY_CONFIRMED: هذا الطلب تأكّد وأصبح موعدًا، عدّل الموعد نفسه من التقويم';
  end if;
  update public.booking_form_submissions
     set status = _status, status_changed_at = now(), status_changed_by = auth.uid()
   where id = _request_id;
  return jsonb_build_object('id', _request_id, 'status', _status);
end; $$;

-- Confirming = booking the agreed time. The usual checks (doctor's hours, breaks,
-- double booking) run on the new appointment; the request then points to it.
create or replace function public.confirm_booking_request(
  _request_id uuid, _doctor_id uuid, _service_id uuid, _date date, _time time
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  _patient_id uuid;
  _name text; _phone text; _norm text;
  _duration int := 30;
  _price numeric := 0;
  _specialty uuid;
  _appointment_id uuid;
  _number text;
  _extra text;
begin
  if not public.can_write() then
    raise exception 'NOT_ALLOWED: ليست لديك صلاحية تأكيد الحجوزات';
  end if;
  select * into r from public.booking_form_submissions where id = _request_id for update;
  if not found then
    raise exception 'NOT_FOUND: الطلب غير موجود';
  end if;
  if r.status = 'confirmed' and r.appointment_id is not null then
    select appointment_number into _number from public.appointments where id = r.appointment_id;
    return jsonb_build_object('appointment_id', r.appointment_id, 'appointment_number', _number, 'duplicate', true);
  end if;
  if _doctor_id is null or not exists (select 1 from public.doctors where id = _doctor_id and status = 'active') then
    raise exception 'INVALID_DOCTOR: اختر الطبيب';
  end if;
  if _date is null or _time is null then
    raise exception 'INVALID_SLOT: اختر تاريخ ووقت الموعد';
  end if;
  if _date < (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'INVALID_SLOT: التاريخ المختار في الماضي';
  end if;
  if _service_id is not null then
    select duration_minutes, price, specialty_id into _duration, _price, _specialty
      from public.services where id = _service_id;
    if not found then
      raise exception 'INVALID_SERVICE: الخدمة غير موجودة';
    end if;
  end if;

  -- The patient who sent it (recreated from the request if the record was deleted).
  _patient_id := r.patient_id;
  if _patient_id is null or not exists (select 1 from public.patients where id = _patient_id) then
    select a ->> 'value' into _name from jsonb_array_elements(r.answers) a where a ->> 'type' = 'full_name' limit 1;
    select a ->> 'value' into _phone from jsonb_array_elements(r.answers) a where a ->> 'type' = 'phone' limit 1;
    _norm := public.normalize_sa_phone(_phone);
    select id into _patient_id from public.patients where normalized_phone = _norm;
    if _patient_id is null then
      insert into public.patients (full_name, phone, normalized_phone, source)
      values (coalesce(_name, 'مريض'), _phone, '', 'website')
      returning id into _patient_id;
    end if;
  end if;

  select string_agg((a ->> 'label') || ': ' ||
           case when a ->> 'type' = 'checkbox' then 'نعم'
                when a ->> 'type' = 'gender' then case when a ->> 'value' = 'female' then 'أنثى' else 'ذكر' end
                else a ->> 'value' end, E'\n')
    into _extra
    from jsonb_array_elements(r.answers) a
   where a ->> 'type' not in ('full_name', 'phone');

  begin
    insert into public.appointments (appointment_number, patient_id, doctor_id, service_id, specialty_id,
        appointment_date, start_time, end_time, status, source, price, notes, idempotency_key)
    values ('', _patient_id, _doctor_id, _service_id,
        coalesce(_specialty, r.specialty_id, (select specialty_id from public.doctors where id = _doctor_id)),
        _date, _time, _time + make_interval(mins => coalesce(_duration, 30)), 'confirmed', 'website',
        coalesce(_price, 0),
        concat_ws(E'\n', 'من طلب الحجز ' || r.request_number || ' (نموذج «' || r.form_title || '»)', _extra),
        'request:' || r.id)
    returning id, appointment_number into _appointment_id, _number;
  exception when unique_violation then
    select id, appointment_number into _appointment_id, _number
      from public.appointments where idempotency_key = 'request:' || r.id;
    if _appointment_id is null then raise; end if;
  end;

  update public.booking_form_submissions
     set status = 'confirmed', appointment_id = _appointment_id,
         status_changed_at = now(), status_changed_by = auth.uid()
   where id = _request_id;
  return jsonb_build_object('appointment_id', _appointment_id, 'appointment_number', _number, 'duplicate', false);
end; $$;

-- ---------------------------------------------------------------------------
-- 6) Wording that promised picking a time (only where it was never edited)
-- ---------------------------------------------------------------------------
update public.booking_forms b
   set fields = (select jsonb_agg(case when x ->> 'type' = 'appointment'
                                         and x ->> 'label' in ('اختيار الموعد', 'الخدمة والموعد')
                                       then jsonb_set(x, '{label}', to_jsonb('الخدمة المطلوبة'::text))
                                       else x end order by ord)
                   from jsonb_array_elements(b.fields) with ordinality as e(x, ord))
 where exists (select 1 from jsonb_array_elements(b.fields) x
                where x ->> 'type' = 'appointment' and x ->> 'label' in ('اختيار الموعد', 'الخدمة والموعد'));

update public.booking_forms
   set description = 'اختر القسم والخدمة، ثم أكمل طلبك عبر واتساب ليحدد لك المجمع الموعد المناسب.'
 where description = 'اختر القسم والخدمة والوقت المناسب لك، وسنتواصل معك لتأكيد الموعد.';

update public.booking_forms
   set settings = jsonb_set(settings, '{success_message}',
         to_jsonb(replace(settings ->> 'success_message',
                          E'تم استلام حجزك بنجاح ✅ سنتواصل معك لتأكيد الموعد.\nنرجو الالتزام بالموعد،',
                          'نرجو الالتزام بالموعد بعد تأكيده،')))
 where settings ->> 'success_message' like E'تم استلام حجزك بنجاح ✅ سنتواصل معك لتأكيد الموعد.\nنرجو الالتزام بالموعد،%';

update public.chatbot_settings b
   set menu = (select jsonb_agg(case when x ->> 'id' = 'n_booking'
                                       and x ->> 'reply' = E'يسعدنا خدمتك 🌷\nاحجز موعدك أونلاين في أقل من دقيقة: اختر القسم والخدمة والوقت المناسب لك 👇'
                                     then jsonb_set(x, '{reply}', to_jsonb(E'يسعدنا خدمتك 🌷\nاختر القسم والخدمة من نموذج الحجز، ثم أكمل طلبك عبر واتساب ليحدد لك المجمع الموعد المناسب 👇'::text))
                                     else x end order by ord)
                 from jsonb_array_elements(b.menu) with ordinality as e(x, ord))
 where exists (select 1 from jsonb_array_elements(b.menu) x
                where x ->> 'id' = 'n_booking'
                  and x ->> 'reply' = E'يسعدنا خدمتك 🌷\nاحجز موعدك أونلاين في أقل من دقيقة: اختر القسم والخدمة والوقت المناسب لك 👇');

update public.chatbot_knowledge
   set answer = 'احجز من زر «احجز الآن» في «حجز موعد»: اختر القسم والخدمة، ثم أكمل طلبك عبر واتساب ليحدد لك المجمع الموعد المناسب. وللاستفسار اتصل بنا على 0566684827.'
 where answer = 'احجز موعدك أونلاين من زر «احجز الآن» في «حجز موعد»: اختر القسم والخدمة والوقت المناسب لك. وللاستفسار اتصل بنا على 0566684827.';

-- ---------------------------------------------------------------------------
-- 7) Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.booking_request_set_number() from public, anon, authenticated;
revoke execute on function public.booking_request_confirmation(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.submit_booking_request(text, jsonb) from public;
revoke execute on function public.set_booking_request_status(uuid, text) from public, anon;
revoke execute on function public.confirm_booking_request(uuid, uuid, uuid, date, time) from public, anon;
grant execute on function public.submit_booking_request(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.set_booking_request_status(uuid, text) to authenticated, service_role;
grant execute on function public.confirm_booking_request(uuid, uuid, uuid, date, time) to authenticated, service_role;
