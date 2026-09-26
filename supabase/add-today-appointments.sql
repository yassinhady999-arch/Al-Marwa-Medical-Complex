-- ============================================================================
--  حجوزات وهمية بتاريخ اليوم — ClinicFlow Hub
--  شغّله في: Supabase Dashboard -> SQL Editor -> New query -> Run
--
--  يضيف ٦ مواعيد وهمية بتاريخ اليوم (يحسب "اليوم" وقت التشغيل الفعلي، فمهما
--  أجّلت التشغيل يوم تاني هيضيفها بتاريخ ذلك اليوم)، بحالات ومصادر متنوعة،
--  ومربوطة بطبيب فعليًا يعمل اليوم لو موجود عنده جدول دوام مناسب.
--
--  آمن لإعادة التشغيل في نفس اليوم — هيتخطى ما تمت إضافته بالفعل بدل ما يكرره.
-- ============================================================================

do $$
declare
  today date := current_date;
  dow int := extract(dow from today)::int;
  doc_id uuid;
  spec_id uuid;
  sh_start time;
  sh_end time;
  t1 time; t2 time; t3 time; t4 time; t5 time; t6 time;
  sv1 uuid; sv2 uuid; sv3 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  ph_prefix text := to_char(today, 'YYMMDD');
begin
  -- طبيب نشط يعمل فعليًا في يوم النهارده تحديدًا (لو مش موجود، تُنشأ المواعيد بدون طبيب)
  select d.id, d.specialty_id, ds.start_time, ds.end_time
    into doc_id, spec_id, sh_start, sh_end
  from public.doctors d
  join public.doctor_schedules ds on ds.doctor_id = d.id
  where d.status = 'active' and ds.day_of_week = dow and ds.is_active
  order by d.name
  limit 1;

  -- لو دوامه أقصر من ٥ ساعات، نتجاهل ربط الطبيب تجنّبًا لتعارض ساعات العمل
  if doc_id is not null and (sh_end - sh_start) < interval '5 hours' then
    doc_id := null;
    spec_id := null;
  end if;
  if doc_id is null then
    sh_start := '09:00'; -- قيمة افتراضية لحساب الأوقات فقط
  end if;

  t1 := sh_start;
  t2 := sh_start + interval '45 minutes';
  t3 := sh_start + interval '90 minutes';
  t4 := sh_start + interval '150 minutes';
  t5 := sh_start + interval '210 minutes';
  t6 := sh_start + interval '270 minutes';

  -- حتى ٣ خدمات فعلية موجودة لتنويع السعر والمدة (اختياري تمامًا)
  select id into sv1 from public.services where is_active order by created_at limit 1 offset 0;
  select id into sv2 from public.services where is_active order by created_at limit 1 offset 1;
  select id into sv3 from public.services where is_active order by created_at limit 1 offset 2;

  -- ٦ مرضى تجريبيين — أرقامهم مرتبطة بتاريخ اليوم فلن يتكرروا لو شغّلت السكربت
  -- تاني في نفس اليوم، وهيتولّد لهم أرقام جديدة تلقائيًا لو شغّلته يوم مختلف
  insert into public.patients (full_name, phone, source) values
    ('مريض تجريبي - ١', '05' || ph_prefix || '01', 'whatsapp'),
    ('مريض تجريبي - ٢', '05' || ph_prefix || '02', 'website'),
    ('مريض تجريبي - ٣', '05' || ph_prefix || '03', 'phone'),
    ('مريض تجريبي - ٤', '05' || ph_prefix || '04', 'manual'),
    ('مريض تجريبي - ٥', '05' || ph_prefix || '05', 'whatsapp'),
    ('مريض تجريبي - ٦', '05' || ph_prefix || '06', 'referral')
  on conflict (normalized_phone) do nothing;

  select id into p1 from public.patients where phone = '05' || ph_prefix || '01';
  select id into p2 from public.patients where phone = '05' || ph_prefix || '02';
  select id into p3 from public.patients where phone = '05' || ph_prefix || '03';
  select id into p4 from public.patients where phone = '05' || ph_prefix || '04';
  select id into p5 from public.patients where phone = '05' || ph_prefix || '05';
  select id into p6 from public.patients where phone = '05' || ph_prefix || '06';

  -- ٦ مواعيد بتاريخ اليوم تغطي حالات ومصادر متنوعة
  insert into public.appointments
    (patient_id, doctor_id, specialty_id, service_id, appointment_date, start_time, end_time, status, source, price, idempotency_key)
  values
    (p1, doc_id, spec_id, sv1, today, t1, t1 + interval '30 minutes', 'confirmed',   'whatsapp', 150, 'today-seed-' || today || '-1'),
    (p2, doc_id, spec_id, sv2, today, t2, t2 + interval '30 minutes', 'checked_in',  'website',  200, 'today-seed-' || today || '-2'),
    (p3, doc_id, spec_id, sv3, today, t3, t3 + interval '30 minutes', 'in_progress', 'phone',    180, 'today-seed-' || today || '-3'),
    (p4, doc_id, spec_id, sv1, today, t4, t4 + interval '30 minutes', 'completed',   'manual',   150, 'today-seed-' || today || '-4'),
    (p5, doc_id, spec_id, sv2, today, t5, t5 + interval '30 minutes', 'pending',     'whatsapp', 200, 'today-seed-' || today || '-5'),
    (p6, null,   spec_id, sv3, today, t6, t6 + interval '30 minutes', 'cancelled',   'referral', 180, 'today-seed-' || today || '-6')
  on conflict (idempotency_key) do nothing;

  raise notice 'تمت إضافة الحجوزات الوهمية بتاريخ %', today;
end $$;
