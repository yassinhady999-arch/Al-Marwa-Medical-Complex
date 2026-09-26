-- ============================================================================
--  ClinicFlow Hub — إعادة ضبط شاملة + بيانات تجريبية لشهرين (سبتمبر + أكتوبر)
--  شغّله في: Supabase Dashboard -> SQL Editor -> New query -> Run
--
--  ⚠️ تحذير مهم قبل التشغيل:
--  هذا السكربت يحذف نهائيًا وبلا رجعة كل بيانات العيادة التشغيلية الحالية:
--    المرضى، الأطباء، التخصصات، الخدمات، جداول الدوام، المواعيد، المحادثات،
--    الرسائل، سجلات الأتمتة، أحداث التكامل، والإشعارات.
--  لا يلمس: حسابك وتسجيل دخولك (profiles/user_roles)، صلاحيات الموظفين
--  (staff_permissions)، سجل النشاط (activity_logs)، ولا إعدادات العيادة
--  (clinic_settings) — فلن تُسجَّل خروجك ولا تفقد صلاحياتك.
--
--  بعدها يضيف بيانات تجريبية واقعية الشكل (أسماء وأرقام هواتف سعودية حقيقية
--  الصيغة، لكنها بيانات مصنّعة بالكامل وليست لأشخاص حقيقيين):
--    ٧ تخصصات، ٧ أطباء بجداول دوام، ١٥ خدمة، ٥٠ مريض، ~٢٠ محادثة واتساب،
--    مواعيد موزّعة على شهرين كاملين (من ٢٠٢٦-٠٩-٠١ إلى ٢٠٢٦-١٠-٣١) بحالات
--    واقعية بحسب التاريخ: الماضي = مكتمل/ملغي/لم يحضر، اليوم = حالات متنوعة،
--    القادم = بانتظار تأكيد/مؤكد. بالإضافة لسجلات أتمتة وتكامل متنوعة.
--
--  آمن التشغيل من ناحية القيود (لا يخالف تحقق ساعات العمل/التعارض)، لكنه
--  غير آمن لإعادة التشغيل المتكررة بمعنى "تراكمي" — كل تشغيل يحذف ما قبله
--  من جديد ويعيد التوليد بأرقام/تواريخ عشوائية مختلفة، وهذا هو المقصود.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) حذف كل البيانات التشغيلية الحالية (بترتيب يحترم المفاتيح الأجنبية)
-- ----------------------------------------------------------------------------
truncate table
  public.automation_logs,
  public.integration_events,
  public.notifications,
  public.appointment_status_history,
  public.messages,
  public.conversations,
  public.appointments,
  public.doctor_schedules,
  public.doctors,
  public.services,
  public.specialties,
  public.patients
cascade;

-- ----------------------------------------------------------------------------
-- 2) التخصصات
-- ----------------------------------------------------------------------------
insert into public.specialties (name, description) values
 ('طب الأسنان', 'تشخيص وعلاج الأسنان واللثة'),
 ('الجلدية', 'أمراض الجلد والتجميل'),
 ('طب الأطفال', 'رعاية صحة الأطفال'),
 ('الباطنية', 'الأمراض الباطنية للبالغين'),
 ('العظام', 'إصابات وأمراض العظام والمفاصل'),
 ('طب عام', 'الفحوصات والاستشارات العامة'),
 ('العيون', 'فحص وعلاج أمراض العيون');

-- ----------------------------------------------------------------------------
-- 3) الأطباء (كل طبيب مرتبط بتخصص واحد أعلاه)
-- ----------------------------------------------------------------------------
insert into public.doctors (name, phone, email, specialty_id, bio, status)
select v.name, v.phone, v.email, s.id, v.bio, v.status
from (values
  ('د. خالد الغامدي', '+966501112233', 'khalid.ghamdi@clinic.sa', 'طب الأسنان', 'استشاري طب وجراحة الأسنان، خبرة ١٢ سنة.', 'active'),
  ('د. منى السالم',   '+966502223344', 'mona.salem@clinic.sa',    'الجلدية',    'أخصائية جلدية وتجميل، خبرة ٨ سنوات.', 'active'),
  ('د. فهد الزهراني', '+966503334455', 'fahad.zahrani@clinic.sa', 'طب الأطفال', 'استشاري طب أطفال، خبرة ١٠ سنوات.', 'active'),
  ('د. عمر الحازمي',  '+966504445566', 'omar.hazmi@clinic.sa',    'الباطنية',   'أخصائي باطنية عامة، خبرة ٩ سنوات.', 'active'),
  ('د. سعود القحطاني','+966505556677', 'saud.qahtani@clinic.sa',  'العظام',     'استشاري جراحة عظام ومفاصل، خبرة ١٤ سنة.', 'active'),
  ('د. ريم العتيبي',  '+966506667788', 'reem.otaibi@clinic.sa',   'طب عام',     'أخصائية طب عام واستشارات أولية.', 'active'),
  ('د. تركي الدوسري', '+966507778899', 'turki.dosari@clinic.sa',  'العيون',     'استشاري طب وجراحة العيون، خبرة ١١ سنة.', 'suspended')
) as v(name, phone, email, spec, bio, status)
join public.specialties s on s.name = v.spec;

-- جداول دوام: كل طبيب يعمل السبت-الخميس (يوم الجمعة عطلة)، ٩ص-٥م باستراحة ١-١:٣٠
insert into public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, break_start, break_end)
select d.id, dow, '09:00', '17:00', '13:00', '13:30'
from public.doctors d, unnest(array[0,1,2,3,4,6]) as dow;

-- ----------------------------------------------------------------------------
-- 4) الخدمات (خدمتان تقريبًا لكل تخصص)
-- ----------------------------------------------------------------------------
insert into public.services (name, specialty_id, duration_minutes, price, description)
select v.name, s.id, v.dur, v.price, v.descr
from (values
 ('كشف أسنان', 'طب الأسنان', 30, 150.00, 'كشف وتشخيص أولي'),
 ('تنظيف أسنان', 'طب الأسنان', 45, 300.00, 'تنظيف وتلميع'),
 ('حشو أسنان', 'طب الأسنان', 40, 250.00, 'حشوة تجميلية'),
 ('كشف جلدية', 'الجلدية', 30, 200.00, 'كشف جلدي عام'),
 ('جلسة ليزر', 'الجلدية', 45, 500.00, 'جلسة إزالة بالليزر'),
 ('فحص أطفال دوري', 'طب الأطفال', 30, 180.00, 'فحص نمو دوري'),
 ('تطعيمات', 'طب الأطفال', 20, 120.00, 'تطعيم حسب الجدول'),
 ('استشارة باطنية', 'الباطنية', 30, 220.00, 'كشف وتشخيص باطني'),
 ('متابعة تحاليل', 'الباطنية', 20, 150.00, 'مراجعة نتائج ومتابعة'),
 ('كشف عظام', 'العظام', 30, 220.00, 'كشف وتشخيص عظام ومفاصل'),
 ('جلسة علاج طبيعي', 'العظام', 45, 280.00, 'جلسة تأهيل وعلاج طبيعي'),
 ('استشارة عامة', 'طب عام', 20, 100.00, 'استشارة طبية عامة'),
 ('متابعة', 'طب عام', 15, 80.00, 'زيارة متابعة'),
 ('كشف نظر', 'العيون', 30, 180.00, 'فحص شامل للعيون'),
 ('قياس نظارة', 'العيون', 20, 120.00, 'قياس مقاس النظر')
) as v(name, spec, dur, price, descr)
join public.specialties s on s.name = v.spec;

-- ----------------------------------------------------------------------------
-- 5) المرضى — ٥٠ مريضًا بأسماء سعودية واقعية وأرقام جوال بصيغة سعودية صحيحة
--    (الأسماء والأرقام مُصنَّعة بالكامل لأغراض العرض التجريبي فقط)
-- ----------------------------------------------------------------------------
do $$
declare
  first_m text[] := array['محمد','عبدالله','أحمد','خالد','سعود','فهد','تركي','ياسر','ماجد','سلطان','بندر','نايف','عبدالعزيز','فيصل','وليد','حسام','طلال','عمر','إبراهيم','عبدالرحمن'];
  first_f text[] := array['نورة','سارة','ريم','لمى','لطيفة','منيرة','هند','أمل','جواهر','العنود','رنا','دانة','غادة','مها','شهد','رهف','عبير','بشاير','ريان','أروى'];
  fam text[] := array['العتيبي','الغامدي','القحطاني','الدوسري','الشهري','الزهراني','المطيري','السبيعي','العنزي','الحربي','البقمي','الشمري','القرني','الجهني','العمري','الرشيدي','الخالدي','السلمي','الفيفي','الحازمي'];
  city_list text[] := array['الرياض','جدة','الدمام','مكة المكرمة','المدينة المنورة','الخبر','الطائف','بريدة','تبوك','خميس مشيط','حائل','نجران','جازان','أبها','ينبع'];
  carrier_digits text[] := array['0','3','4','5','6','8','9'];
  source_list booking_source[] := array['whatsapp','website','phone','manual','referral']::booking_source[];
  mcount int := 0;
  fcount int := 0;
  i int;
  nm text;
  ph text;
  gen gender_type;
begin
  for i in 1..50 loop
    if i % 2 = 1 then
      mcount := mcount + 1;
      gen := 'male'::gender_type;
      nm := first_m[((mcount - 1) % array_length(first_m, 1)) + 1] || ' ' || fam[((i - 1) % array_length(fam, 1)) + 1];
    else
      fcount := fcount + 1;
      gen := 'female'::gender_type;
      nm := first_f[((fcount - 1) % array_length(first_f, 1)) + 1] || ' ' || fam[((i - 1) % array_length(fam, 1)) + 1];
    end if;
    ph := '+9665' || carrier_digits[1 + floor(random() * array_length(carrier_digits, 1))::int]
          || lpad(floor(random() * 10000000)::text, 7, '0');
    insert into public.patients (full_name, phone, gender, city, source, first_contact_at, last_contact_at)
    values (
      nm, ph, gen,
      city_list[1 + floor(random() * array_length(city_list, 1))::int],
      source_list[1 + floor(random() * array_length(source_list, 1))::int],
      now() - (floor(random() * 60)::int || ' days')::interval,
      now() - (floor(random() * 5)::int || ' days')::interval
    )
    on conflict (normalized_phone) do nothing;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6) محادثات واتساب + رسائل (آخر ~٢٥ يومًا)
-- ----------------------------------------------------------------------------
do $$
declare
  patient_ids uuid[];
  conv_status conversation_status[] := array['active','waiting_patient','human_support','appointment_created','closed']::conversation_status[];
  previews text[] := array[
    'تمام، أشوفكم بكرة الساعة ٩',
    'من فضلك أرسل رقم الهوية لتأكيد الحجز',
    'أحتاج أكلم موظف بخصوص تغيير الموعد',
    'تم حجز موعدك، نراك قريبًا ✅',
    'شكرًا لكم',
    'هل يوجد موعد متاح هذا الأسبوع؟',
    'أبغى أستفسر عن سعر الكشف'
  ];
  first_msgs text[] := array[
    'السلام عليكم، أبغى أحجز موعد',
    'مرحبًا، هل يوجد مواعيد متاحة؟',
    'أحتاج أعرف تفاصيل الخدمة والسعر',
    'أبغى أأجل موعدي لو سمحتوا'
  ];
  i int;
  conv_id uuid;
  pat_id uuid;
  started timestamptz;
  n_msgs int;
  j int;
  msg_time timestamptz;
begin
  select array_agg(id) into patient_ids from public.patients;

  for i in 1..20 loop
    pat_id := patient_ids[1 + floor(random() * array_length(patient_ids, 1))::int];
    started := now() - (floor(random() * 25)::int || ' days')::interval - (floor(random() * 12)::int || ' hours')::interval;

    insert into public.conversations (patient_id, channel, status, started_at, last_message_at, last_message_preview, unread_count)
    values (
      pat_id, 'whatsapp',
      conv_status[1 + floor(random() * array_length(conv_status, 1))::int],
      started, started,
      previews[1 + floor(random() * array_length(previews, 1))::int],
      floor(random() * 3)::int
    )
    returning id into conv_id;

    n_msgs := 1 + floor(random() * 4)::int;
    msg_time := started;
    for j in 1..n_msgs loop
      msg_time := msg_time + ((2 + floor(random() * 8)::int)::text || ' minutes')::interval;
      insert into public.messages (conversation_id, patient_id, direction, sender_type, content, created_at)
      values (
        conv_id, pat_id,
        (case when j % 2 = 1 then 'inbound' else 'outbound' end)::message_direction,
        (case when j % 2 = 1 then 'patient' else 'ai' end)::sender_type,
        case when j = 1 then first_msgs[1 + floor(random() * array_length(first_msgs, 1))::int]
             else previews[1 + floor(random() * array_length(previews, 1))::int] end,
        msg_time
      );
    end loop;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7) المواعيد — موزّعة على شهرين كاملين: ٢٠٢٦-٠٩-٠١ إلى ٢٠٢٦-١٠-٣١
--    الحالة تُحسب تلقائيًا بحسب التاريخ الفعلي وقت التشغيل مقابل تاريخ الموعد:
--    ماضٍ -> مكتمل/ملغي/لم يحضر غالبًا، اليوم -> حالات متنوعة، مستقبل -> بانتظار/مؤكد.
-- ----------------------------------------------------------------------------
do $$
declare
  range_start date := '2026-09-01';
  range_end   date := '2026-10-31';
  cur_date date;
  dow int;
  doc record;
  svc_id uuid;
  svc_dur int;
  svc_price numeric;
  patient_ids uuid[];
  slot_start time;
  slot_end time;
  n_slots int;
  k int;
  status_pick appointment_status;
  source_list booking_source[] := array['whatsapp','whatsapp','website','phone','manual','referral']::booking_source[];
  r double precision;
  gap interval := '15 minutes';
  total_inserted int := 0;
begin
  select array_agg(id) into patient_ids from public.patients;

  cur_date := range_start;
  while cur_date <= range_end loop
    dow := extract(dow from cur_date)::int;
    if dow <> 5 then -- الجمعة عطلة
      for doc in
        select d.id, d.specialty_id from public.doctors d where d.status = 'active'
      loop
        n_slots := floor(random() * 3)::int; -- 0..2 مواعيد لكل طبيب في اليوم
        slot_start := '09:00';

        for k in 1..n_slots loop
          select s.id, s.duration_minutes, s.price into svc_id, svc_dur, svc_price
          from public.services s
          where s.specialty_id = doc.specialty_id and s.is_active
          order by random() limit 1;

          if svc_id is null then
            select s.id, s.duration_minutes, s.price into svc_id, svc_dur, svc_price
            from public.services s where s.is_active order by random() limit 1;
          end if;

          exit when svc_id is null; -- لا توجد خدمات مُفعّلة على الإطلاق (احتياطي)

          -- تجاوز فترة الاستراحة ١-١:٣٠
          if slot_start >= time '13:00' and slot_start < time '13:30' then
            slot_start := time '13:30';
          end if;

          slot_end := slot_start + (svc_dur::text || ' minutes')::interval;
          exit when slot_end > time '17:00';

          if cur_date < current_date then
            r := random();
            status_pick := (case
              when r < 0.65 then 'completed'
              when r < 0.80 then 'cancelled'
              when r < 0.92 then 'no_show'
              else 'rescheduled'
            end)::appointment_status;
          elsif cur_date = current_date then
            r := random();
            status_pick := (case
              when r < 0.25 then 'completed'
              when r < 0.40 then 'checked_in'
              when r < 0.50 then 'in_progress'
              when r < 0.72 then 'confirmed'
              when r < 0.90 then 'pending'
              when r < 0.96 then 'cancelled'
              else 'no_show'
            end)::appointment_status;
          else
            r := random();
            status_pick := (case
              when r < 0.55 then 'confirmed'
              when r < 0.85 then 'pending'
              when r < 0.95 then 'cancelled'
              else 'rescheduled'
            end)::appointment_status;
          end if;

          insert into public.appointments
            (patient_id, doctor_id, specialty_id, service_id, appointment_date, start_time, end_time,
             status, source, price, idempotency_key)
          values (
            patient_ids[1 + floor(random() * array_length(patient_ids, 1))::int],
            doc.id, doc.specialty_id, svc_id, cur_date, slot_start, slot_end,
            status_pick,
            source_list[1 + floor(random() * array_length(source_list, 1))::int],
            svc_price,
            'seed-' || doc.id || '-' || cur_date || '-' || slot_start
          )
          on conflict (idempotency_key) do nothing;

          total_inserted := total_inserted + 1;
          slot_start := slot_end + gap;
        end loop;
      end loop;
    end if;
    cur_date := cur_date + 1;
  end loop;

  raise notice 'تم إدخال % موعدًا تقريبًا بين % و %', total_inserted, range_start, range_end;
end $$;

-- ----------------------------------------------------------------------------
-- 8) سجلات الأتمتة والتكامل (تكميلية — إلى جانب ما يُنشئه النظام تلقائيًا
--    من appointment_status_history / notifications / integration_events عند
--    كل موعد جديد بفضل المُشغّلات الموجودة في قاعدة البيانات)
-- ----------------------------------------------------------------------------
do $$
declare
  workflow_names text[] := array['حجز-عبر-واتساب','تذكير-موعد','تأكيد-حجز','استعلام-توفر','متابعة-ما-بعد-الزيارة'];
  appt_ids uuid[];
  pat_ids uuid[];
  i int;
  r double precision;
  ts timestamptz;
begin
  select array_agg(id) into appt_ids from public.appointments;
  select array_agg(id) into pat_ids from public.patients;

  for i in 1..25 loop
    ts := now() - (floor(random() * 60)::int || ' days')::interval - (floor(random() * 24)::int || ' hours')::interval;
    r := random();
    insert into public.automation_logs
      (workflow_name, event_type, status, appointment_id, patient_id, execution_id, created_at, error_message)
    values (
      workflow_names[1 + floor(random() * array_length(workflow_names, 1))::int],
      'n8n.workflow.run',
      case when r < 0.85 then 'success' else 'failed' end,
      appt_ids[1 + floor(random() * array_length(appt_ids, 1))::int],
      pat_ids[1 + floor(random() * array_length(pat_ids, 1))::int],
      'exec-' || to_char(ts, 'YYYYMMDDHH24MISS') || '-' || i,
      ts,
      case when r < 0.85 then null else 'n8n webhook timeout بعد ٣ محاولات' end
    );
  end loop;
end $$;

-- تنويع حالات أحداث التكامل المُنشأة تلقائيًا (بعضها "تم التسليم" بدل "قيد المعالجة")
update public.integration_events
set status = 'delivered', processed_at = created_at + interval '2 minutes'
where id in (
  select id from public.integration_events order by random() limit (select count(*) / 2 from public.integration_events)
);

-- ============================================================================
-- تم. راجع: لوحة التشغيل، المواعيد، التقويم، المرضى، المحادثات، الأطباء،
-- التخصصات، الخدمات، التقارير، والأتمتة والتكامل — كل قسم يجب أن يكون مليئًا
-- ببيانات تمتد من سبتمبر إلى أكتوبر ٢٠٢٦.
-- ============================================================================
