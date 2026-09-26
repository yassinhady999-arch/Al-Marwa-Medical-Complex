-- ============================================================================
--  بيانات تجريبية شاملة — ClinicFlow Hub
--  شغّله في: Supabase Dashboard -> SQL Editor -> New query -> Run
--  (بعد ما يكون supabase/full-schema.sql مُطبّق على المشروع)
--
--  يضيف: أطباء + جداول دوامهم + خدمات + ٩ مرضى + ٥ محادثات واتساب + رسائل +
--  ١٢ موعد تغطي كل الحالات والمصادر + سجلات أتمتة وأحداث تكامل متنوعة.
--
--  آمن لإعادة التشغيل: لو لقى مريض "أحمد المطيري" موجود يعتبر البيانات
--  مُضافة مسبقًا ويتوقف تلقائيًا من غير ما يكرّرها.
-- ============================================================================

do $$
declare
  sp_dental   uuid; sp_derma  uuid; sp_peds uuid; sp_internal uuid;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid;
  sv_check_teeth uuid; sv_clean_teeth uuid; sv_derma_consult uuid; sv_derma_session uuid; sv_peds_check uuid;
  p_ahmed uuid; p_sara uuid; p_khaled uuid; p_noura uuid; p_abdullah uuid;
  p_reem uuid; p_majed uuid; p_hind uuid; p_talal uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  today date := current_date;
  next0 date; next1 date; next2 date; next3 date;
begin
  if exists (select 1 from public.patients where full_name = 'أحمد المطيري') then
    raise notice 'بيانات تجريبية موجودة بالفعل — تم التخطي.';
    return;
  end if;

  -- ---------- التخصصات (لو موجودة من full-schema.sql هيتخطاها) ----------
  insert into public.specialties (name, description) values
    ('طب الأسنان','تشخيص وعلاج الأسنان واللثة'),
    ('الجلدية','أمراض الجلد والتجميل'),
    ('طب الأطفال','رعاية صحة الأطفال'),
    ('الباطنية','الأمراض الباطنية للبالغين')
  on conflict (name) do nothing;

  select id into sp_dental   from public.specialties where name = 'طب الأسنان';
  select id into sp_derma    from public.specialties where name = 'الجلدية';
  select id into sp_peds     from public.specialties where name = 'طب الأطفال';
  select id into sp_internal from public.specialties where name = 'الباطنية';

  -- ---------- الأطباء ----------
  insert into public.doctors (name, phone, email, specialty_id, status)
  values ('د. خالد الغامدي', '+966551110000', 'khaled@nukhba.sa', sp_dental, 'active')
  returning id into d1;

  insert into public.doctors (name, phone, email, specialty_id, status)
  values ('د. منى السالم', '+966552220000', 'mona@nukhba.sa', sp_derma, 'active')
  returning id into d2;

  insert into public.doctors (name, phone, email, specialty_id, status)
  values ('د. فهد الزهراني', '+966553330000', 'fahad@nukhba.sa', sp_peds, 'active')
  returning id into d3;

  insert into public.doctors (name, phone, email, specialty_id, status)
  values ('د. عمر الحازمي', null, null, sp_internal, 'inactive')
  returning id into d4;

  -- جداول الدوام — د.خالد يعمل كل أيام الأسبوع (يضمن ظهور مواعيد "اليوم" دائمًا مهما كان يوم التشغيل)
  insert into public.doctor_schedules (doctor_id, day_of_week, start_time, end_time) values
    (d1, 0, '09:00', '17:00'), (d1, 1, '09:00', '17:00'), (d1, 2, '09:00', '17:00'),
    (d1, 3, '09:00', '17:00'), (d1, 4, '09:00', '17:00'), (d1, 5, '09:00', '17:00'), (d1, 6, '09:00', '17:00'),
    (d2, 0, '09:00', '17:00'), (d2, 2, '09:00', '17:00'), (d2, 4, '09:00', '17:00'),
    (d3, 1, '09:00', '17:00'), (d3, 3, '09:00', '17:00'), (d3, 5, '09:00', '17:00');

  -- ---------- الخدمات ----------
  insert into public.services (name, description, specialty_id, duration_minutes, price)
  values ('كشف أسنان', 'فحص وتشخيص أولي', sp_dental, 30, 150) returning id into sv_check_teeth;
  insert into public.services (name, description, specialty_id, duration_minutes, price)
  values ('تنظيف أسنان', 'إزالة الجير وتلميع', sp_dental, 30, 120) returning id into sv_clean_teeth;
  insert into public.services (name, description, specialty_id, duration_minutes, price)
  values ('استشارة جلدية', null, sp_derma, 20, 200) returning id into sv_derma_consult;
  insert into public.services (name, description, specialty_id, duration_minutes, price)
  values ('جلسة علاج', 'جلسة علاجية بالليزر', sp_derma, 45, 300) returning id into sv_derma_session;
  insert into public.services (name, description, specialty_id, duration_minutes, price)
  values ('فحص أطفال', 'فحص عام ومتابعة النمو', sp_peds, 30, 250) returning id into sv_peds_check;

  -- ---------- المرضى ----------
  insert into public.patients (full_name, phone, gender, city, source) values ('أحمد المطيري','0501112233','male','الرياض','whatsapp') returning id into p_ahmed;
  insert into public.patients (full_name, phone, gender, city, source) values ('سارة العتيبي','0502223344','female','جدة','website') returning id into p_sara;
  insert into public.patients (full_name, phone, gender, city, source) values ('خالد الدوسري','0503334455','male','الرياض','phone') returning id into p_khaled;
  insert into public.patients (full_name, phone, gender, city, source) values ('نورة الحربي','0504445566','female','الدمام','whatsapp') returning id into p_noura;
  insert into public.patients (full_name, phone, gender, city, source) values ('عبدالله القحطاني','0505556677','male','الرياض','manual') returning id into p_abdullah;
  insert into public.patients (full_name, phone, gender, city, source) values ('ريم الشمري','0506667788','female','بريدة','whatsapp') returning id into p_reem;
  insert into public.patients (full_name, phone, gender, city, source) values ('ماجد العنزي','0507778899','male','حائل','referral') returning id into p_majed;
  insert into public.patients (full_name, phone, gender, city, source) values ('هند المالكي','0508889900','female','الطائف','website') returning id into p_hind;
  insert into public.patients (full_name, phone, gender, city, source) values ('طلال السبيعي','0511112233','male','الرياض','whatsapp') returning id into p_talal;

  -- ---------- المحادثات ----------
  insert into public.conversations (patient_id, status, unread_count, last_message_preview, last_message_at)
  values (p_ahmed, 'active', 2, 'تمام، أشوفكم بكرة الساعة ٩', now() - interval '12 minutes') returning id into c1;
  insert into public.conversations (patient_id, status, unread_count, last_message_preview, last_message_at)
  values (p_sara, 'waiting_patient', 0, 'من فضلك أرسل رقم الهوية لتأكيد الحجز', now() - interval '55 minutes') returning id into c2;
  insert into public.conversations (patient_id, status, unread_count, last_message_preview, last_message_at)
  values (p_khaled, 'human_support', 1, 'أحتاج أكلم موظف بخصوص تغيير الموعد', now() - interval '90 minutes') returning id into c3;
  insert into public.conversations (patient_id, status, unread_count, last_message_preview, last_message_at)
  values (p_noura, 'appointment_created', 0, 'تم حجز موعدك ✅', now() - interval '4 hours') returning id into c4;
  insert into public.conversations (patient_id, status, unread_count, last_message_preview, last_message_at)
  values (p_reem, 'closed', 0, 'شكرًا لكم', now() - interval '26 hours') returning id into c5;

  -- رسائل محادثة أحمد المطيري
  insert into public.messages (conversation_id, patient_id, direction, sender_type, content, created_at) values
    (c1, p_ahmed, 'inbound',  'patient', 'السلام عليكم، أبغى أحجز موعد كشف أسنان', now() - interval '40 minutes'),
    (c1, p_ahmed, 'outbound', 'ai',      'وعليكم السلام 👋 تفضّل باسمك الكامل ورقم جوالك.', now() - interval '39 minutes'),
    (c1, p_ahmed, 'inbound',  'patient', 'أحمد المطيري - 0501112233', now() - interval '37 minutes'),
    (c1, p_ahmed, 'outbound', 'ai',      'متاح لدينا اليوم الساعة ٩:٠٠ صباحًا. هل يناسبك؟', now() - interval '35 minutes'),
    (c1, p_ahmed, 'inbound',  'patient', 'نعم مناسب', now() - interval '20 minutes'),
    (c1, p_ahmed, 'outbound', 'human',   'تم تثبيت الموعد. بانتظارك 🌿', now() - interval '12 minutes');

  -- أقرب تاريخ قادم لكل يوم من أيام دوام الدكاترة الجزئيين
  next0 := today + ((0 - extract(dow from today)::int + 7) % 7);
  next1 := today + ((1 - extract(dow from today)::int + 7) % 7);
  next2 := today + ((2 - extract(dow from today)::int + 7) % 7);
  next3 := today + ((3 - extract(dow from today)::int + 7) % 7);

  -- ---------- المواعيد (تغطي كل الحالات الثمانية وكل مصادر الحجز الخمسة) ----------
  insert into public.appointments
    (patient_id, doctor_id, specialty_id, service_id, appointment_date, start_time, end_time, status, source, price, idempotency_key)
  values
    (p_ahmed,    d1,   sp_dental, sv_check_teeth,   today,       '09:00','09:30','confirmed',   'whatsapp', 150, 'seed-1'),
    (p_khaled,   d1,   sp_dental, sv_clean_teeth,   today,       '10:00','10:30','checked_in',  'phone',    120, 'seed-2'),
    (p_majed,    d1,   sp_dental, sv_check_teeth,   today,       '11:00','11:30','in_progress', 'referral', 150, 'seed-3'),
    (p_abdullah, d1,   sp_dental, sv_clean_teeth,   today,       '12:00','12:30','completed',   'manual',   120, 'seed-4'),
    (p_reem,     d1,   sp_dental, sv_check_teeth,   today,       '13:00','13:30','cancelled',   'whatsapp', 150, 'seed-5'),
    (p_hind,     null, sp_derma,  sv_derma_consult, today,       '14:00','14:20','pending',     'website',  200, 'seed-6'),
    (p_noura,    d1,   sp_dental, sv_check_teeth,   today + 1,   '09:30','10:00','rescheduled', 'whatsapp', 150, 'seed-7'),
    (p_sara,     d2,   sp_derma,  sv_derma_consult, next0,       '09:00','09:20','confirmed',   'website',  200, 'seed-8'),
    (p_reem,     d2,   sp_derma,  sv_derma_session, next2,       '10:00','10:45','completed',   'manual',   300, 'seed-9'),
    (p_noura,    d3,   sp_peds,   sv_peds_check,    next1,       '09:00','09:30','confirmed',   'whatsapp', 250, 'seed-10'),
    (p_hind,     d3,   sp_peds,   sv_peds_check,    next3,       '11:00','11:30','no_show',     'phone',    250, 'seed-11'),
    (p_talal,    d1,   sp_dental, sv_check_teeth,   today - 12,  '15:00','15:30','completed',   'whatsapp', 150, 'seed-12');

  -- ---------- سجل الأتمتة (n8n) ----------
  insert into public.automation_logs (workflow_name, event_type, status, patient_id, error_message) values
    ('whatsapp-inbound',     'message.received',     'success', p_ahmed, null),
    ('booking-flow',         'appointment.created',   'success', p_ahmed, null),
    ('reminder-24h',         'appointment.reminder',  'success', p_khaled, null),
    ('confirmation-sender',  'appointment.cancelled',  'failed', p_reem,  'HTTP 504 من بوابة واتساب');

  -- أحداث تكامل إضافية لتنويع الحالات في صفحة "الأتمتة والتكامل"
  -- (المواعيد والمرضى أعلاه ستُنشئ أحداثها التلقائية بالفعل عبر triggers الجاهزة)
  insert into public.integration_events (event_type, entity_type, status, attempts, error_message) values
    ('appointment.confirmed', 'appointment', 'delivered', 1, null),
    ('appointment.cancelled', 'appointment', 'failed', 3, 'n8n webhook timeout بعد 3 محاولات');

  raise notice 'تمت إضافة البيانات التجريبية: % أطباء، % مرضى، % مواعيد.', 4, 9, 12;
end $$;
