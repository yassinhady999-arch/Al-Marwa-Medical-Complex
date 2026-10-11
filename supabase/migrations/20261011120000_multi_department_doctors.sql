-- ============================================================================
-- DOCTORS IN MORE THAN ONE DEPARTMENT (طبيب في أكثر من قسم)
--
-- A doctor can now work in several departments (e.g. internal medicine and
-- cupping). doctors.specialty_id stays the main department; doctor_specialties
-- lists every department the doctor takes bookings in. Booking forms, slot
-- search and the customer chatbot read both, so one person is one doctor row
-- and can never be double-booked across departments.
--
-- Also adds save_doctor(): one call that saves a doctor's details, departments
-- and weekly schedule together (used by the doctors page).
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
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
