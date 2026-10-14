-- ============================================================================
-- «يبدأ من» PRICES, HIDDEN PRACTITIONER NAMES, MIDNIGHT-SAFE SLOTS
--
-- • services.price_from: the price is a starting price («يبدأ من 99 ر.س»).
-- • doctors.hide_name: a bookable row customers never see by name (a cupping
--   section, "the general practitioner"). The chatbot doesn't list it and the
--   booking confirmation leaves the doctor line out.
-- • get_available_slots counts in minutes, so a shift ending at midnight
--   (23:59 / 24:00) no longer wraps past 00:00 and loops forever.
-- • The public booking form only offers departments, services and doctors
--   that have a weekly schedule (no more picking a department with no times).
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
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
