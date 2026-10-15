-- ============================================================================
-- بيانات مجمع المروة السيل الطبي: الأقسام، الأطباء ومواعيدهم، الخدمات والأسعار،
-- نموذج الحجز، والشات بوت
--
-- شغّله في Supabase SQL Editor بعد ملفات الترحيل
--   supabase/migrations/20261011120000_multi_department_doctors.sql
--   supabase/migrations/20261014120000_price_from_hidden_names_slots.sql
--
-- • أول تشغيل: يستبدل بيانات العرض التجريبية (أقسام/أطباء/خدمات العرض) ببيانات
--   المجمع. ما له مواعيد مسجلة يُوقف ولا يُحذف، والمرضى والمواعيد لا تُمس أبدًا.
-- • التشغيل مرة أخرى آمن: يحدّث بيانات المجمع فقط، ولا يغيّر جدول عمل أو مدة خدمة
--   عدّلتموها، ولا سعرًا وضعتموه لخدمة كانت «السعر عند الاستفسار».
-- • الخدمة بسعر 0 تظهر للعملاء «السعر عند الاستفسار»، و«يبدأ من» تظهر قبل أسعار الأسنان.
-- • الحجامة والطب العام يُحجزان باسم القسم فقط (بدون ذكر اسم الحجّام أو الطبيب).
-- ============================================================================

-- One chatbot menu choice (kinds: text | services | doctors | hours | contact | booking | link).
create or replace function pg_temp.menu_node(
  _id text, _label text, _kind text, _reply text,
  _specialty uuid default null, _children jsonb default '[]'::jsonb
) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('id', _id, 'label', _label, 'kind', _kind,
                                              'reply', _reply, 'specialty_id', _specialty))
         || jsonb_build_object('children', _children);
$$;

-- A button that opens a link (WhatsApp chat, map…).
create or replace function pg_temp.link_node(_id text, _label text, _reply text, _url text, _url_label text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', _id, 'label', _label, 'kind', 'link', 'reply', _reply,
                            'url', _url, 'url_label', _url_label, 'children', '[]'::jsonb);
$$;

do $seed$
declare
  r record;
  _id uuid;
  _spec uuid;
  _spec_ids uuid[];
  _slot jsonb;
  _day int;
  _first_run boolean;
  _keep_specs uuid[] := '{}';
  _keep_doctors uuid[] := '{}';
  _keep_services uuid[] := '{}';
  _form uuid;
  _children jsonb;
  _departments jsonb := '[]'::jsonb;
  _menu jsonb;
  _dept record;

  -- Phone numbers from the complex's posters. Booking goes through the form, never WhatsApp.
  _phone_main text := '0566684827';
  _tel_main text := 'tel:0566684827';
  _tel_kids text := 'tel:0532822242';

  -- Hours exactly as the complex sent them, with their notes.
  _h_doaa text := 'د. دعاء طاهر: من 2 م حتى 10 م يوميًا ما عدا الجمعة — بالحجز المسبق';
  _h_hind text := 'د. هند عماد: من 9 ص حتى 12 ظ، ومن 4 م حتى 10 م';
  _h_raheeq text := 'د. رحيق يوسف: من 9 ص حتى 11 ظ، ومن 4 م حتى 11 م';
  _h_hani text := 'د. هاني سلامه: من 3 م حتى 10 م — الرجاء التواصل قبل الحضور لحجز موعد';
  _h_gp text := 'الطبيب العام متواجد من 9 ص حتى 12 ليلًا';
  _h_cup_w text := 'الحجامة النسائية: من 9 ص حتى 12 ظ، ومن 4 م حتى 11 م';
  _h_cup_m text := 'الحجامة الرجالية: من 9 ص حتى 12 ليلًا';
  _all_hours text;

  _policies text := E'• نرجو الالتزام بالموعد المحدد.\n'
                    || E'• الاعتذار عن الموعد يكون قبل الموعد بيوم على الأقل.\n'
                    || E'• الحجامة: الصيام ساعتين قبل الجلسة.\n'
                    || E'• عيادة الأسنان (د. دعاء طاهر) بالحجز المسبق.\n'
                    || '• عيادة الباطنية (د. هاني سلامه): الرجاء التواصل قبل الحضور لحجز موعد.';
  _cupping_note text := E'تعليمات قبل الحجامة 🩸\n'
                        || E'• الصيام عن الطعام ساعتين قبل موعد الحجامة.\n'
                        || E'• الحضور في الموعد المحدد.\n'
                        || '• أخبر الأخصائي بأي أمراض مزمنة أو أدوية تتناولها.';
  _visit_prices text := E'أسعار الكشف:\n• الأسنان: 45 ريال\n• الباطنية: 55 ريال\n• الطب العام: 45 ريال\n'
                        || E'• النساء والولادة: 55 ريال\n• الأخصائية النفسية: 200 ريال';
  _cupping_prices text := E'🩸 أسعار الحجامة\n\n👨 قسم الرجال:\n• 9 كاسات: 139 ريال\n• 12 كاسة: 149 ريال\n'
                          || E'• 15 كاسة: 199 ريال\n• 18 كاسة: 249 ريال\n• 21 كاسة: 299 ريال\n\n'
                          || E'👩 قسم الحريم:\n• 9 كاسات: 149 ريال\n• 12 كاسة: 199 ريال\n• 15 كاسة: 249 ريال\n'
                          || E'• 18 كاسة: 299 ريال\n\n🏡 الحجامة المنزلية: 300 ريال';
  _attention text := E'🎯 تدريبات الانتباه والتركيز للأطفال\n'
                     || E'برامج متخصصة لتنمية مهارات الانتباه بإشراف أخصائيين نفسيين مؤهلين:\n'
                     || E'• 6 جلسات فردية: 999 ريال (جلسة 45 دقيقة + متابعة أسبوعية)\n'
                     || E'• 10 جلسات فردية: 1299 ريال — الأكثر طلبًا (جلسة 45 دقيقة + تقييم مجاني قبل البدء)\n'
                     || E'• 15 جلسة فردية: 1999 ريال (جلسة 45 دقيقة + خطة علاجية شاملة وتقرير نهائي)\n\n'
                     || 'مميزات البرنامج: برنامج فردي مصمم حسب احتياج الطفل، أساليب علاجية حديثة ومعتمدة، متابعة دورية وتقرير تقدم مفصل.';
  _autism text := E'🧩 جلسات فردية لأطفال التوحد\n'
                  || E'بإشراف أخصائي نفسي مؤهل:\n'
                  || E'• الباقة الأولى — 6 جلسات فردية: 999 ريال (متابعة دورية وتقييم التقدم)\n'
                  || E'• الباقة الثانية — 10 جلسات فردية: 1399 ريال (جلسات فردية + متابعة وتقييم التقدم)\n'
                  || E'• الباقة الثالثة — 15 جلسة فردية: 2299 ريال (جلسات فردية + متابعة وتقييم التقدم)\n\n'
                  || 'المميزات: تنمية مهارات الانتباه والتركيز، تقييم عن طريق برنامج ABILS، إعداد خطة تربوية فردية مناسبة للطفل، متابعة وتقييم مستمر للتقدم.';
  _numbers text := E'📞 رقم المجمع: 0566684827\n'
                   || '📞 جلسات الأطفال (الانتباه والتوحد): 0532822242';
begin
  _all_hours := E'🕘 مواعيد التواجد\n\n🦷 الأسنان\n• ' || _h_doaa || E'\n• ' || _h_hind
                || E'\n\n🤰 النساء والولادة\n• ' || _h_raheeq
                || E'\n\n🩺 الباطنية والجهاز الهضمي والسمنة\n• ' || _h_hani
                || E'\n\n👨‍⚕️ الطب العام: ' || _h_gp
                || E'\n\n🩸 ' || _h_cup_w || E'\n🩸 ' || _h_cup_m
                || E'\n\n🧠 الطب النفسي والتخاطب: تواصل معنا لمعرفة المواعيد.';

  -- First run = the complex's doctors aren't in the system yet.
  _first_run := not exists (select 1 from public.doctors where name in ('د. هاني سلامه', 'د. هاني سلامة'));

  -- --------------------------------------------------------------------------
  -- 1) الأقسام (old names are renamed so any existing history stays linked)
  -- --------------------------------------------------------------------------
  for r in select * from (values
    ('الأسنان', array['طب الأسنان', 'الاسنان'],
     'علاج وتجميل الأسنان للكبار والأطفال: تنظيف وتلميع وفلورايد، حشوات تجميلية، علاج عصب، تركيبات زركون وإيماكس، خلع، وتبييض.', true),
    ('الباطنية والجهاز الهضمي والسمنة', array['الباطنة العامة', 'الباطنية', 'الباطنة', 'الباطنه'],
     'الضغط والسكر، الكبد والجهاز الهضمي، الغدد الصماء، أمراض الدم، الكلى، الأورام، الروماتيزم، سوء التغذية وإنقاص الوزن.', true),
    ('النساء والولادة', array['النساء', 'أمراض النساء'],
     'متابعة الحمل والتبويض، علاج تأخر الإنجاب، ووسائل منع الحمل مثل تركيب وإزالة اللولب والشرائح.', true),
    ('الطب العام', array['طب عام'],
     'الكشف والاستشارات الطبية العامة، من 9 صباحًا حتى 12 ليلًا.', true),
    ('الطب النفسي', array['الطب النفسي والسلوكي'],
     'الأخصائية النفسية، العلاج النفسي والسلوكي، تدريبات الانتباه والتركيز للأطفال، وجلسات أطفال التوحد.', true),
    ('التخاطب', array['النطق والتخاطب'],
     'جلسات التخاطب وتعلم النطق، تنمية المهارات وتعديل السلوك.', true),
    ('الحجامة الرجالية', array['الحجامة الطبية', 'الحجامة', 'حجامة رجالية'],
     'قسم الرجال: حجامة رطبة وجافة ومتزحلقة، وقائية وعلاجية.', true),
    ('الحجامة النسائية', array['حجامة نسائية'],
     'قسم الحريم: حجامة رطبة وجافة ومتزحلقة، وقائية وعلاجية.', true),
    ('المختبر والأشعة', array['المختبر'],
     'التحاليل الطبية والأشعة التلفزيونية (السونار).', true),
    ('الزيارات المنزلية والتمريض', array['الزيارات المنزلية', 'التمريض'],
     'زيارات منزلية (أخصائي، طبيب عام، تمريض، حجامة منزلية)، المغذيات والإبر، وتسجيل التطعيمات.', true),
    -- Listed by the complex but no doctor was given yet: add the doctor, then activate it.
    ('طب الأطفال', array['الأطفال'],
     'رعاية صحة الأطفال.', false)
  ) as t(name, old_names, description, active) loop
    _id := null;
    select id into _id from public.specialties where name = r.name;
    if _id is null then
      select id into _id from public.specialties where name = any (r.old_names) order by created_at limit 1;
      if _id is not null then
        update public.specialties set name = r.name where id = _id;
      end if;
    end if;
    if _id is null then
      insert into public.specialties (name, description, is_active)
      values (r.name, r.description, r.active) returning id into _id;
    else
      update public.specialties set description = r.description, is_active = r.active where id = _id;
    end if;
    _keep_specs := _keep_specs || _id;
  end loop;

  -- --------------------------------------------------------------------------
  -- 2) الأطباء ومواعيد التواجد
  --    hide_name: booked under the department's name only (cupping, general practitioner).
  --    schedule: [{days, start, end, break?}] — only written when the doctor has none yet,
  --    so hours the clinic edits on the doctors page are never overwritten.
  -- --------------------------------------------------------------------------
  for r in select * from (values
    ('د. دعاء طاهر', array['دعاء طاهر'], array['الأسنان'],
     'تركيبات، علاج عصب، وحشوات. بالحجز المسبق.', false,
     '[{"days": [0, 1, 2, 3, 4, 6], "start": "14:00", "end": "22:00"}]'::jsonb),
    ('د. هند عماد', array['هند عماد'], array['الأسنان'],
     'تركيبات، علاج عصب، وحشوات للكبار والأطفال.', false,
     '[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "22:00", "break": ["12:00", "16:00"]}]'::jsonb),
    ('د. هاني سلامه', array['د. هاني سلامة', 'هاني سلامه', 'هاني سلامة'], array['الباطنية والجهاز الهضمي والسمنة'],
     'أخصائي أمراض الباطنة العامة: الضغط والسكر، الكبد والجهاز الهضمي، الغدد الصماء، أمراض الدم، الكلى، الأورام، الروماتيزم، سوء التغذية وإنقاص الوزن. الرجاء التواصل قبل الحضور لحجز موعد.', false,
     '[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "15:00", "end": "22:00"}]'::jsonb),
    ('د. رحيق يوسف', array['د. رحيق', 'رحيق يوسف'], array['النساء والولادة'],
     'أمراض النساء والولادة: متابعة الحمل والتبويض، تأخر الإنجاب، ووسائل منع الحمل.', false,
     '[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "23:00", "break": ["11:00", "16:00"]}]'::jsonb),
    ('هناء الشريف', array['أ. هناء الشريف'], array['الطب النفسي'],
     'أخصائية نفسية: العلاج النفسي والسلوكي، تدريبات الانتباه والتركيز، وجلسات أطفال التوحد.', false,
     '[]'::jsonb),
    ('صفية الأزوري', array['أ. صفية الأزوري'], array['التخاطب'],
     'أخصائي نطق وتخاطب.', false,
     '[]'::jsonb),
    ('الطبيب العام', array[]::text[], array['الطب العام'],
     null, true,
     '[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "23:59"}]'::jsonb),
    ('الحجامة النسائية', array[]::text[], array['الحجامة النسائية'],
     null, true,
     '[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "23:00", "break": ["12:00", "16:00"]}]'::jsonb),
    ('الحجامة الرجالية', array[]::text[], array['الحجامة الرجالية'],
     null, true,
     '[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "23:59"}]'::jsonb)
  ) as t(name, aliases, departments, bio, hide_name, schedule) loop
    _id := null;
    select id into _id from public.doctors
     where name = r.name or name = any (r.aliases) order by (name = r.name) desc, created_at limit 1;
    _spec_ids := array(select s.id from unnest(r.departments) with ordinality as u(name, ord)
                         join public.specialties s on s.name = u.name order by u.ord);
    if _id is null then
      insert into public.doctors (name, bio, status, specialty_id, hide_name)
      values (r.name, r.bio, 'active', _spec_ids[1], r.hide_name) returning id into _id;
    else
      update public.doctors
         set name = r.name, bio = r.bio, status = 'active', specialty_id = _spec_ids[1], hide_name = r.hide_name
       where id = _id;
    end if;
    delete from public.doctor_specialties where doctor_id = _id and specialty_id <> all (_spec_ids);
    insert into public.doctor_specialties (doctor_id, specialty_id)
    select _id, s.id from unnest(_spec_ids) as s(id) on conflict do nothing;

    if not exists (select 1 from public.doctor_schedules where doctor_id = _id) then
      for _slot in select value from jsonb_array_elements(r.schedule) loop
        for _day in select value::int from jsonb_array_elements_text(_slot -> 'days') loop
          insert into public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
          values (_id, _day, (_slot ->> 'start')::time, (_slot ->> 'end')::time,
                  (_slot -> 'break' ->> 0)::time, (_slot -> 'break' ->> 1)::time, true)
          on conflict (doctor_id, day_of_week) do nothing;
        end loop;
      end loop;
    end if;
    _keep_doctors := _keep_doctors || _id;
  end loop;

  -- Cupping is booked by section now, without naming the practitioner.
  update public.doctors set status = 'inactive'
   where name in ('د. محمد حجازي', 'محمد حجازي', 'د. سمر محمد', 'سمر محمد');

  -- --------------------------------------------------------------------------
  -- 3) الخدمات والأسعار (0 = السعر عند الاستفسار، from = «يبدأ من»)
  -- --------------------------------------------------------------------------
  for r in select * from (values
    -- الأسنان (أسعار البوستر «تبدأ من»)
    ('الأسنان', 'كشف أسنان', array[]::text[], 20, 45, false, 'كشف وتشخيص وخطة علاج.'),
    ('الأسنان', 'تنظيف الجير وتلميع الأسنان', array[]::text[], 30, 99, true, null),
    ('الأسنان', 'تنظيف وتلميع وفلورايد', array[]::text[], 45, 149, true, null),
    ('الأسنان', 'خلع سن لبني', array[]::text[], 20, 99, true, 'للأطفال.'),
    ('الأسنان', 'خلع ضرس عادي', array[]::text[], 30, 199, true, null),
    ('الأسنان', 'خلع ضرس العقل', array[]::text[], 60, 299, true, null),
    ('الأسنان', 'حشوة تجميلية سطح واحد', array[]::text[], 45, 149, true, null),
    ('الأسنان', 'حشوة تجميلية سطحين', array[]::text[], 60, 199, true, null),
    ('الأسنان', 'علاج عصب أمامي', array[]::text[], 60, 499, true, null),
    ('الأسنان', 'علاج عصب خلفي', array[]::text[], 90, 699, true, null),
    ('الأسنان', 'تركيبة زركون', array[]::text[], 60, 499, true, null),
    ('الأسنان', 'تركيبة إيماكس', array[]::text[], 60, 699, true, null),
    ('الأسنان', 'تبييض الأسنان', array[]::text[], 60, 0, false, null),
    ('الأسنان', 'تركيبات متحركة', array[]::text[], 45, 0, false, null),
    -- الباطنية
    ('الباطنية والجهاز الهضمي والسمنة', 'كشف باطنة', array[]::text[], 30, 55, false,
     'كشف أخصائي. الرجاء التواصل قبل الحضور لحجز موعد.'),
    -- النساء والولادة
    ('النساء والولادة', 'كشف نساء وولادة', array['كشف نساء'], 30, 55, false, 'كشف أخصائي.'),
    ('النساء والولادة', 'متابعة الحمل', array[]::text[], 30, 0, false, null),
    ('النساء والولادة', 'متابعة التبويض', array[]::text[], 30, 0, false, null),
    ('النساء والولادة', 'علاج تأخر الإنجاب', array[]::text[], 30, 0, false, null),
    ('النساء والولادة', 'تركيب اللولب', array[]::text[], 30, 0, false, null),
    ('النساء والولادة', 'إزالة اللولب', array[]::text[], 20, 0, false, null),
    ('النساء والولادة', 'تركيب الشريحة', array[]::text[], 30, 0, false, 'شريحة منع الحمل.'),
    ('النساء والولادة', 'إزالة الشريحة', array[]::text[], 30, 0, false, null),
    -- الطب العام
    ('الطب العام', 'كشف طب عام', array[]::text[], 20, 45, false, null),
    -- الطب النفسي
    ('الطب النفسي', 'كشف الأخصائية النفسية', array['استشارة نفسية'], 45, 200, false, null),
    ('الطب النفسي', 'تدريبات الانتباه والتركيز - 6 جلسات', array[]::text[], 45, 999, false,
     'برنامج فردي للأطفال بإشراف أخصائيين نفسيين: جلسة 45 دقيقة + متابعة أسبوعية.'),
    ('الطب النفسي', 'تدريبات الانتباه والتركيز - 10 جلسات', array[]::text[], 45, 1299, false,
     'الأكثر طلبًا: جلسة 45 دقيقة + تقييم مجاني قبل البدء.'),
    ('الطب النفسي', 'تدريبات الانتباه والتركيز - 15 جلسة', array[]::text[], 45, 1999, false,
     'جلسة 45 دقيقة + خطة علاجية شاملة وتقرير نهائي.'),
    ('الطب النفسي', 'جلسات أطفال التوحد - الباقة الأولى (6 جلسات)', array[]::text[], 45, 999, false,
     'جلسات فردية + متابعة دورية وتقييم التقدم.'),
    ('الطب النفسي', 'جلسات أطفال التوحد - الباقة الثانية (10 جلسات)', array[]::text[], 45, 1399, false,
     'جلسات فردية + متابعة وتقييم التقدم.'),
    ('الطب النفسي', 'جلسات أطفال التوحد - الباقة الثالثة (15 جلسة)', array[]::text[], 45, 2299, false,
     'جلسات فردية + متابعة وتقييم التقدم.'),
    ('الطب النفسي', 'جلسة علاج نفسي وسلوكي', array[]::text[], 45, 0, false, null),
    ('الطب النفسي', 'جلسة تأهيل نفسي', array[]::text[], 45, 0, false, null),
    ('الطب النفسي', 'الاختبارات والمقاييس النفسية للأطفال', array[]::text[], 60, 0, false, null),
    ('الطب النفسي', 'تنمية المهارات وتعديل السلوك', array[]::text[], 45, 0, false, null),
    -- التخاطب
    ('التخاطب', 'تقييم نطق وتخاطب', array[]::text[], 45, 0, false, 'جلسة تقييم مع أخصائي التخاطب.'),
    ('التخاطب', 'جلسة تخاطب وتعلم النطق', array[]::text[], 45, 0, false, null),
    ('التخاطب', 'جلسة تنمية مهارات وتعديل سلوك', array[]::text[], 45, 0, false, null),
    -- الحجامة (قسم الرجال)
    ('الحجامة الرجالية', 'حجامة رجالية 9 كاسات', array[]::text[], 30, 139, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة الرجالية', 'حجامة رجالية 12 كاسة', array[]::text[], 30, 149, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة الرجالية', 'حجامة رجالية 15 كاسة', array[]::text[], 30, 199, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة الرجالية', 'حجامة رجالية 18 كاسة', array[]::text[], 30, 249, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة الرجالية', 'حجامة رجالية 21 كاسة', array[]::text[], 30, 299, false, 'الصيام ساعتين قبل الجلسة.'),
    -- الحجامة (قسم الحريم)
    ('الحجامة النسائية', 'حجامة نسائية 9 كاسات', array[]::text[], 30, 149, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة النسائية', 'حجامة نسائية 12 كاسة', array[]::text[], 30, 199, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة النسائية', 'حجامة نسائية 15 كاسة', array[]::text[], 30, 249, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الحجامة النسائية', 'حجامة نسائية 18 كاسة', array[]::text[], 30, 299, false, 'الصيام ساعتين قبل الجلسة.'),
    -- المختبر والأشعة
    ('المختبر والأشعة', 'التحاليل الطبية', array[]::text[], 15, 0, false, 'تختلف الأسعار حسب نوع التحليل.'),
    ('المختبر والأشعة', 'الأشعة التلفزيونية (السونار)', array[]::text[], 20, 0, false, null),
    -- الزيارات المنزلية والتمريض
    ('الزيارات المنزلية والتمريض', 'زيارة منزلية - أخصائي', array[]::text[], 60, 250, false, null),
    ('الزيارات المنزلية والتمريض', 'زيارة منزلية - طبيب عام', array[]::text[], 60, 200, false, null),
    ('الزيارات المنزلية والتمريض', 'زيارة تمريض منزلية', array[]::text[], 60, 150, false, null),
    ('الزيارات المنزلية والتمريض', 'حجامة منزلية', array[]::text[], 60, 300, false, 'الصيام ساعتين قبل الجلسة.'),
    ('الزيارات المنزلية والتمريض', 'المغذيات الوريدية', array[]::text[], 30, 0, false, 'في المجمع أو في المنزل.'),
    ('الزيارات المنزلية والتمريض', 'الإبر والحقن', array[]::text[], 15, 0, false, 'في المجمع أو في المنزل.'),
    ('الزيارات المنزلية والتمريض', 'تسجيل التطعيمات', array[]::text[], 15, 0, false, 'تتوفر باقات.')
  ) as t(department, name, aliases, duration, price, price_from, description) loop
    _id := null;
    _spec := (select id from public.specialties where name = r.department);
    select id into _id from public.services
     where (name = r.name or name = any (r.aliases)) and specialty_id is not distinct from _spec
     order by (name = r.name) desc, created_at limit 1;
    if _id is null then
      insert into public.services (name, specialty_id, duration_minutes, price, price_from, description, is_active)
      values (r.name, _spec, r.duration, r.price, r.price_from, r.description, true) returning id into _id;
    else
      -- Durations and descriptions stay as the clinic set them; known prices always win.
      update public.services
         set name = r.name,
             price = case when r.price > 0 then r.price else price end,
             price_from = case when r.price > 0 then r.price_from else price_from end,
             is_active = true
       where id = _id;
    end if;
    _keep_services := _keep_services || _id;
  end loop;

  -- An earlier version of this script guessed 55 for the speech assessment; the price isn't known yet.
  update public.services set price = 0
   where name = 'تقييم نطق وتخاطب' and price = 55;

  -- Replaced by the itemised poster prices / the cupping sections.
  for r in select unnest(array['تنظيف الأسنان', 'تلميع الأسنان', 'حشوات الأسنان', 'علاج العصب', 'تركيبات ثابتة',
                               'خلع الأسنان', 'تطبيق الفلورايد', 'حجامة رطبة', 'حجامة جافة', 'حجامة متزحلقة']) as name loop
    delete from public.services v
     where v.name = r.name and v.id <> all (_keep_services)
       and not exists (select 1 from public.appointments a where a.service_id = v.id);
    update public.services set is_active = false where name = r.name and id <> all (_keep_services);
  end loop;

  -- --------------------------------------------------------------------------
  -- 4) أول تشغيل: إزالة بيانات العرض التجريبية (ما له مواعيد يُوقف فقط)
  -- --------------------------------------------------------------------------
  if _first_run then
    delete from public.services v
     where v.id <> all (_keep_services)
       and not exists (select 1 from public.appointments a where a.service_id = v.id);
    update public.services set is_active = false where id <> all (_keep_services);

    delete from public.doctors d
     where d.id <> all (_keep_doctors)
       and not exists (select 1 from public.appointments a where a.doctor_id = d.id);
    update public.doctors set status = 'inactive' where id <> all (_keep_doctors);

    delete from public.specialties s
     where s.id <> all (_keep_specs)
       and not exists (select 1 from public.appointments a where a.specialty_id = s.id)
       and not exists (select 1 from public.services v where v.specialty_id = s.id)
       and not exists (select 1 from public.doctors d where d.specialty_id = s.id);
    update public.specialties set is_active = false where id <> all (_keep_specs);

    -- Old test Q&A could contradict the complex's real answers; hide (not delete) it.
    update public.chatbot_knowledge set is_active = false where is_active;

    -- Clinic settings still on the demo values: drop the made-up city and hours.
    update public.clinic_settings
       set city = null, working_hours = '{}'::jsonb
     where clinic_name in ('مركز الشفاء الطبي', 'عيادتي');
  end if;

  -- The complex's name, number and address, unless the clinic already typed its own.
  update public.clinic_settings
     set clinic_name = 'مجمع المروة السيل الطبي'
   where clinic_name in ('مركز الشفاء الطبي', 'عيادتي', 'المجمع الطبي');
  update public.clinic_settings set phone = _phone_main where coalesce(btrim(phone), '') = '';
  update public.clinic_settings set city = 'مكة المكرمة' where coalesce(btrim(city), '') in ('', 'الرياض');
  update public.clinic_settings set address = 'حي الشرائع' where coalesce(btrim(address), '') = '';

  -- --------------------------------------------------------------------------
  -- 5) نموذج الحجز
  -- --------------------------------------------------------------------------
  select id into _form from public.booking_forms where title = 'حجز موعد في المجمع' order by created_at limit 1;
  if _form is null then
    insert into public.booking_forms (title, created_by) values ('حجز موعد في المجمع', null) returning id into _form;
  end if;
  update public.booking_forms set
    description = 'اختر القسم والخدمة، ثم أكمل طلبك عبر واتساب ليحدد لك المجمع الموعد المناسب.',
    is_active = true,
    fields = '[
      {"id": "full_name", "type": "full_name", "label": "الاسم الثلاثي", "required": true, "placeholder": "مثال: محمد أحمد علي"},
      {"id": "phone", "type": "phone", "label": "رقم الجوال", "required": true, "placeholder": "05xxxxxxxx"},
      {"id": "appointment", "type": "appointment", "label": "الخدمة المطلوبة", "required": true},
      {"id": "notes", "type": "notes", "label": "ملاحظات", "required": false, "placeholder": "أي معلومة تحب توصلها للطبيب"}
    ]'::jsonb,
    settings = jsonb_build_object(
      'specialty_ids', '[]'::jsonb,
      'service_ids', '[]'::jsonb,
      'choose_doctor', true,
      'booking_window_days', 14,
      'show_prices', true,
      'success_message', E'نرجو الالتزام بالموعد بعد تأكيده، والاعتذار قبل الموعد بيوم على الأقل.\n'
                         || 'للاستفسار: ' || _phone_main)
  where id = _form;

  -- --------------------------------------------------------------------------
  -- 6) قائمة الشات بوت
  --    A department gets a «احجز موعد» button only when someone in it has a weekly
  --    schedule; otherwise it points to WhatsApp. Re-run after adding schedules.
  -- --------------------------------------------------------------------------
  for _dept in select * from (values
    (1, 'dental', '🦷 الأسنان', 'الأسنان',
     'قسم الأسنان 🦷 للكبار والأطفال: تنظيف وتلميع وفلورايد، حشوات تجميلية، علاج عصب، تركيبات زركون وإيماكس، خلع، وتبييض.'
       || E'\n\n🕘 ' || _h_doaa || E'\n🕘 ' || _h_hind,
     'أسعار خدمات الأسنان (الأسعار تبدأ من):', true, _tel_main, '📞 اتصل للاستفسار'),
    (2, 'internal', '🩺 الباطنية والجهاز الهضمي والسمنة', 'الباطنية والجهاز الهضمي والسمنة',
     'عيادة الباطنية والجهاز الهضمي والسمنة 🩺 — د. هاني سلامه: الضغط والسكر، الكبد والجهاز الهضمي، الغدد الصماء، أمراض الدم، الكلى، الأورام، الروماتيزم، سوء التغذية وإنقاص الوزن.'
       || E'\n\n🕘 مواعيد العيادة من 3 م حتى 10 م\nالرجاء التواصل قبل الحضور لحجز موعد.\nالكشف 55 ريال.',
     'خدمات الباطنية:', true, _tel_main, '📞 اتصل للاستفسار'),
    (3, 'women', '🤰 النساء والولادة', 'النساء والولادة',
     'عيادة النساء والولادة 🤰 — د. رحيق يوسف: متابعة الحمل والتبويض، علاج تأخر الإنجاب، ووسائل منع الحمل مثل تركيب وإزالة اللولب والشرائح.'
       || E'\n\n🕘 مواعيد الدوام: من 9 ص حتى 11 ظ، ومن 4 م حتى 11 م\nالكشف 55 ريال.',
     'خدمات النساء والولادة:', true, _tel_main, '📞 اتصل للاستفسار'),
    (4, 'gp', '👨‍⚕️ الطب العام', 'الطب العام',
     E'الطب العام 👨‍⚕️\n' || _h_gp || E'.\nالكشف 45 ريال.',
     'خدمات الطب العام:', false, _tel_main, '📞 اتصل للاستفسار'),
    (6, 'psych', '🧠 الطب النفسي وجلسات الأطفال', 'الطب النفسي',
     E'الطب النفسي 🧠\n• كشف الأخصائية النفسية: 200 ريال\n• العلاج النفسي والسلوكي والتأهيل النفسي\n'
       || E'• تدريبات الانتباه والتركيز للأطفال\n• جلسات فردية لأطفال التوحد\n\nاختر لمعرفة التفاصيل 👇',
     'كل خدمات الطب النفسي وأسعارها:', false, _tel_kids, '📞 اتصل للحجز والاستفسار'),
    (7, 'speech', '🗣️ التخاطب', 'التخاطب',
     'التخاطب 🗣️ — صفية الأزوري، أخصائي نطق وتخاطب: جلسات تخاطب وتعلم النطق، تنمية المهارات وتعديل السلوك.',
     'خدمات التخاطب:', false, _tel_kids, '📞 اتصل للحجز والاستفسار'),
    (8, 'lab', '🔬 المختبر والأشعة', 'المختبر والأشعة',
     'المختبر والأشعة 🔬: التحاليل الطبية والأشعة التلفزيونية (السونار).',
     'خدمات المختبر والأشعة:', false, _tel_main, '📞 اتصل للاستفسار عن الأسعار'),
    (9, 'home', '🏠 الزيارات المنزلية والتمريض', 'الزيارات المنزلية والتمريض',
     'نصلك في منزلك 🏠: زيارة أخصائي أو طبيب عام أو تمريض، الحجامة المنزلية، المغذيات والإبر، وتسجيل التطعيمات.',
     'الزيارات المنزلية والتمريض:', false, _tel_main, '📞 اتصل لطلب زيارة منزلية')
  ) as t(ord, key, label, department, reply, services_intro, list_doctors, tel, tel_label) order by ord loop
    _spec := (select id from public.specialties where name = _dept.department);
    _children := jsonb_build_array(
      pg_temp.menu_node('n_dept_' || _dept.key || '_services', '💰 الخدمات والأسعار', 'services',
                        _dept.services_intro, _spec));
    if _dept.list_doctors then
      _children := _children || jsonb_build_array(
        pg_temp.menu_node('n_dept_' || _dept.key || '_doctors', '👨‍⚕️ الأطباء', 'doctors', 'الأطباء:', _spec));
    end if;
    if _dept.key = 'psych' then
      _children := jsonb_build_array(
                     pg_temp.menu_node('n_dept_psych_attention', '🎯 تدريبات الانتباه والتركيز', 'text', _attention),
                     pg_temp.menu_node('n_dept_psych_autism', '🧩 جلسات أطفال التوحد', 'text', _autism))
                   || _children;
    end if;
    -- Bookable online (someone has a schedule) → «احجز الآن»; otherwise a call button.
    if exists (select 1 from public.doctors d
                where d.status = 'active' and public.doctor_has_specialty(d.id, _spec)
                  and public.doctor_has_schedule(d.id)) then
      _children := _children || jsonb_build_array(
        pg_temp.menu_node('n_dept_' || _dept.key || '_book', '📅 احجز الآن', 'booking',
                          'احجز موعدك في ' || _dept.department || ' أونلاين 👇'));
    else
      _children := _children || jsonb_build_array(
        pg_temp.link_node('n_dept_' || _dept.key || '_call', _dept.tel_label,
                          'اتصل بنا وسنساعدك في الحجز:', _dept.tel, 'اتصال'));
    end if;
    _departments := _departments || jsonb_build_array(
      pg_temp.menu_node('n_dept_' || _dept.key, _dept.label, 'text', _dept.reply, null, _children));

    -- Cupping sits after general medicine: one entry with the two sections inside.
    if _dept.key = 'gp' then
      _departments := _departments || jsonb_build_array(
        pg_temp.menu_node('n_dept_cupping', '🩸 الحجامة', 'text',
          E'خير ما تداويتم به الحجامة 🩸\n'
            || E'حجامة رطبة وجافة ومتزحلقة، وقائية وعلاجية، بأيدي مختصين وأدوات آمنة ومعقمة.\n'
            || 'اختر القسم 👇',
          null,
          jsonb_build_array(
            pg_temp.menu_node('n_cup_women', '👩 الحجامة النسائية', 'text', '👩 ' || _h_cup_w, null,
              jsonb_build_array(
                pg_temp.menu_node('n_cup_women_prices', '💰 الأسعار', 'services', 'أسعار الحجامة النسائية:',
                                  (select id from public.specialties where name = 'الحجامة النسائية')),
                pg_temp.menu_node('n_cup_women_book', '📅 احجز الآن', 'booking', 'احجز موعد الحجامة النسائية أونلاين 👇'))),
            pg_temp.menu_node('n_cup_men', '👨 الحجامة الرجالية', 'text', '👨 ' || _h_cup_m, null,
              jsonb_build_array(
                pg_temp.menu_node('n_cup_men_prices', '💰 الأسعار', 'services', 'أسعار الحجامة الرجالية:',
                                  (select id from public.specialties where name = 'الحجامة الرجالية')),
                pg_temp.menu_node('n_cup_men_book', '📅 احجز الآن', 'booking', 'احجز موعد الحجامة الرجالية أونلاين 👇'))),
            pg_temp.menu_node('n_cup_rules', '⚠️ تعليمات قبل الحجامة', 'text', _cupping_note),
            pg_temp.menu_node('n_cup_home', '🏡 الحجامة المنزلية', 'text',
                              'نوفر الحجامة في المنزل بسعر 300 ريال. تواصل معنا لترتيب الموعد.', null,
                              jsonb_build_array(pg_temp.link_node('n_cup_home_call', '📞 اتصل لطلب حجامة منزلية',
                                                                  'اتصل بنا لترتيب الموعد:', _tel_main, 'اتصال'))))));
    end if;
  end loop;

  _menu := jsonb_build_array(
    pg_temp.menu_node('n_booking', '📅 حجز موعد', 'booking',
      E'يسعدنا خدمتك 🌷\nاختر القسم والخدمة من نموذج الحجز، ثم أكمل طلبك عبر واتساب ليحدد لك المجمع الموعد المناسب 👇'),
    pg_temp.menu_node('n_departments', '🏥 الأقسام والخدمات', 'text', 'اختر القسم 👇', null, _departments),
    pg_temp.menu_node('n_prices', '💰 الأسعار والعروض', 'text', 'اختر ما تريد معرفته 👇', null,
      jsonb_build_array(
        pg_temp.menu_node('n_prices_visit', '🩺 أسعار الكشف', 'text', _visit_prices),
        pg_temp.menu_node('n_prices_dental', '🦷 أسعار الأسنان', 'services', 'أسعار خدمات الأسنان (الأسعار تبدأ من):',
                          (select id from public.specialties where name = 'الأسنان')),
        pg_temp.menu_node('n_prices_cupping', '🩸 أسعار الحجامة', 'text', _cupping_prices),
        pg_temp.menu_node('n_prices_kids', '🧒 باقات جلسات الأطفال', 'text', 'اختر البرنامج 👇', null,
          jsonb_build_array(
            pg_temp.menu_node('n_prices_kids_attention', '🎯 تدريبات الانتباه والتركيز', 'text', _attention),
            pg_temp.menu_node('n_prices_kids_autism', '🧩 جلسات أطفال التوحد', 'text', _autism))),
        pg_temp.menu_node('n_prices_home', '🏠 أسعار الزيارات المنزلية', 'services', 'الزيارات المنزلية والتمريض:',
                          (select id from public.specialties where name = 'الزيارات المنزلية والتمريض')),
        pg_temp.menu_node('n_prices_all', '📋 كل الخدمات والأسعار', 'services', 'خدماتنا وأسعارها:'),
        pg_temp.menu_node('n_offers', '🎁 العروض والباقات', 'text',
          'لدينا عروض وباقات مميزة تتجدد باستمرار ✨ منها باقات جلسات الأطفال. تواصل معنا لمعرفة العروض الحالية.', null,
          jsonb_build_array(pg_temp.link_node('n_offers_call', '📞 اتصل للاستفسار عن العروض', 'اتصل بنا:',
                                              _tel_main, 'اتصال'))))),
    pg_temp.menu_node('n_doctors', '👨‍⚕️ أطباؤنا', 'doctors', 'تعرّف على أطبائنا:'),
    pg_temp.menu_node('n_hours', '🕘 مواعيد التواجد', 'text', _all_hours),
    pg_temp.menu_node('n_home', '🏠 الزيارات المنزلية', 'services', 'نصلك في منزلك 🏠',
      (select id from public.specialties where name = 'الزيارات المنزلية والتمريض'),
      jsonb_build_array(pg_temp.link_node('n_home_call', '📞 اتصل لطلب زيارة منزلية', 'اتصل بنا لترتيب الزيارة:',
                                          _tel_main, 'اتصال'))),
    pg_temp.menu_node('n_policies', '📋 تعليمات المجمع', 'text', _policies, null,
      jsonb_build_array(pg_temp.menu_node('n_policies_cupping', '🩸 تعليمات الحجامة', 'text', _cupping_note))),
    pg_temp.menu_node('n_contact', '📍 الموقع والتواصل', 'text',
      E'يسعدنا تواصلك معنا:\n' || _numbers || E'\n📍 مكة المكرمة — حي الشرائع',
      null,
      jsonb_build_array(
        pg_temp.link_node('n_contact_call', '📞 اتصل بنا', 'اتصل بنا:', _tel_main, 'اتصال'),
        pg_temp.menu_node('n_contact_book', '📅 احجز الآن', 'booking', 'احجز موعدك أونلاين 👇')))
  );

  -- --------------------------------------------------------------------------
  -- 7) إعدادات الشات بوت (mode, model and daily limit stay as the clinic set them)
  -- --------------------------------------------------------------------------
  insert into public.chatbot_settings (bot_name)
  select 'مساعد مجمع المروة' where not exists (select 1 from public.chatbot_settings);

  update public.chatbot_settings set
    bot_name = 'مساعد مجمع المروة',
    welcome_message = E'السلام عليكم ومرحبًا بك 🌷\n'
                      || E'أنا المساعد الآلي لمجمع المروة السيل الطبي، أساعدك في معرفة الأقسام والخدمات والأسعار ومواعيد الأطباء وحجز موعدك.\n'
                      || 'اختر ما تحتاجه من القائمة 👇',
    fallback_message = 'عذرًا، لم أجد إجابة دقيقة لسؤالك 🙏 اختر من القائمة، أو اتصل بنا على ' || _phone_main
                       || ' وسيرد عليك أحد موظفينا.',
    ai_instructions = E'أنت موظف خدمة العملاء في مجمع المروة السيل الطبي بمكة المكرمة (حي الشرائع). رد بلغة عربية بسيطة وودودة ومختصرة.\n'
      || E'- عند طلب الحجز: وجّه العميل لرابط الحجز (زر «احجز الآن») ليختار القسم والخدمة والوقت بنفسه. لا تقترح الحجز أو التواصل عبر الواتساب.\n'
      || E'- استخدم الأسعار الموجودة في بيانات الخدمات فقط. أسعار الأسنان «تبدأ من». إذا كان سعر الخدمة غير محدد فقل إن السعر عند الاستفسار واطلب التواصل، ولا تخمّن أي سعر.\n'
      || E'- لا تذكر أسماء أخصائيي الحجامة ولا اسم الطبيب العام: قل «الحجامة النسائية» أو «الحجامة الرجالية» و«الطبيب العام».\n'
      || E'- التزم بمواعيد التواجد المكتوبة في الأسئلة المعتمدة، مع تعليماتها: عيادة الأسنان (د. دعاء طاهر) بالحجز المسبق، وعيادة الباطنية: الرجاء التواصل قبل الحضور لحجز موعد.\n'
      || E'- للاستفسار بالاتصال: رقم المجمع 0566684827، وجلسات الأطفال 0532822242.\n'
      || E'- ذكّر بالتعليمات عند الحاجة: الالتزام بالموعد، الاعتذار قبل الموعد بيوم على الأقل، الصيام ساعتين قبل الحجامة.\n'
      || E'- لا تقدّم تشخيصًا أو وصفة علاج؛ انصح بالحجز مع القسم المناسب. في الحالات الطارئة انصح بالتوجه لأقرب طوارئ أو الاتصال بالإسعاف 997.',
    booking_form_id = _form,
    menu = _menu
  where id is not null;

  -- --------------------------------------------------------------------------
  -- 8) الأسئلة الشائعة (يرد منها البوت بدون نموذج ذكاء اصطناعي)
  -- --------------------------------------------------------------------------
  create temp table _faq (category text, question text, answer text) on commit drop;
  insert into _faq values
    ('حجز', 'كيف أحجز موعد؟',
     'احجز من زر «احجز الآن» في «حجز موعد»: اختر القسم والخدمة، ثم أكمل طلبك عبر واتساب ليحدد لك المجمع الموعد المناسب. وللاستفسار اتصل بنا على 0566684827.'),
    ('حجز', 'كيف ألغي أو أعتذر عن موعدي؟',
     'الاعتذار عن الموعد يكون قبل الموعد بيوم على الأقل، بالاتصال على 0566684827.'),
    ('حجز', 'هل يجب الحضور في الموعد المحدد؟',
     'نعم، نرجو الالتزام بالموعد المحدد حتى نخدمك بدون انتظار.'),
    ('حجز', 'هل أحتاج حجز مسبق؟',
     'عيادة الأسنان (د. دعاء طاهر) بالحجز المسبق، وعيادة الباطنية (د. هاني سلامه): الرجاء التواصل قبل الحضور لحجز موعد. ولباقي الأقسام يُفضّل الحجز المسبق لضمان موعدك.'),
    ('أسعار', 'كم سعر الكشف؟', _visit_prices),
    ('أسعار', 'كم سعر كشف الأسنان؟', 'كشف الأسنان 45 ريال.'),
    ('أسعار', 'أسعار الأسنان',
     E'أسعار الأسنان (تبدأ من):\n• تنظيف الجير وتلميع الأسنان: 99 ريال\n• تنظيف وتلميع وفلورايد: 149 ريال\n'
     || E'• خلع سن لبني: 99 ريال\n• خلع ضرس عادي: 199 ريال\n• خلع ضرس العقل: 299 ريال\n'
     || E'• حشوة تجميلية سطح واحد: 149 ريال\n• حشوة تجميلية سطحين: 199 ريال\n'
     || E'• علاج عصب أمامي: 499 ريال\n• علاج عصب خلفي: 699 ريال\n• تركيبة زركون: 499 ريال\n• تركيبة إيماكس: 699 ريال'),
    ('أسعار', 'سعر تنظيف الأسنان',
     'تنظيف الجير وتلميع الأسنان يبدأ من 99 ريال، وتنظيف وتلميع وفلورايد يبدأ من 149 ريال.'),
    ('أسعار', 'سعر خلع الضرس',
     'خلع سن لبني يبدأ من 99 ريال، خلع ضرس عادي يبدأ من 199 ريال، وخلع ضرس العقل يبدأ من 299 ريال.'),
    ('أسعار', 'سعر الحشوة التجميلية',
     'حشوة تجميلية سطح واحد تبدأ من 149 ريال، وحشوة سطحين تبدأ من 199 ريال.'),
    ('أسعار', 'سعر علاج العصب',
     'علاج عصب أمامي يبدأ من 499 ريال، وعلاج عصب خلفي يبدأ من 699 ريال.'),
    ('أسعار', 'سعر تركيبة الزركون والإيماكس',
     'تركيبة زركون تبدأ من 499 ريال، وتركيبة إيماكس تبدأ من 699 ريال.'),
    ('أسعار', 'كم سعر الحجامة؟', _cupping_prices),
    ('أسعار', 'كم سعر الزيارة المنزلية؟',
     E'الزيارات المنزلية:\n• زيارة أخصائي: 250 ريال\n• زيارة طبيب عام: 200 ريال\n• زيارة تمريض: 150 ريال\n• حجامة منزلية: 300 ريال'),
    ('أسعار', 'كم سعر الأخصائية النفسية؟', 'كشف الأخصائية النفسية 200 ريال.'),
    ('أسعار', 'تدريبات الانتباه والتركيز للأطفال', _attention),
    ('أسعار', 'جلسات أطفال التوحد', _autism),
    ('أسعار', 'هل يوجد عروض أو باقات؟',
     'نعم، لدينا عروض وباقات تتجدد باستمرار، منها باقات تدريبات الانتباه والتركيز وجلسات أطفال التوحد. تواصل معنا لمعرفة العروض الحالية.'),
    ('أسعار', 'كم سعر التحاليل والأشعة؟',
     'تختلف أسعار التحاليل والأشعة التلفزيونية حسب النوع، تواصل معنا على 0566684827 وسنرسل لك السعر.'),
    ('عام', 'مواعيد العمل والدوام', _all_hours),
    ('عام', 'مواعيد الحجامة', E'🩸 ' || _h_cup_w || E'\n🩸 ' || _h_cup_m),
    ('عام', 'مواعيد الحجامة النسائية', _h_cup_w || '.'),
    ('عام', 'مواعيد الحجامة الرجالية', _h_cup_m || '.'),
    ('عام', 'متى يتواجد الطبيب العام؟', _h_gp || '.'),
    ('عام', 'مواعيد عيادة الأسنان', E'• ' || _h_doaa || E'\n• ' || _h_hind),
    ('عام', 'مواعيد عيادة النساء والولادة', _h_raheeq || '.'),
    ('عام', 'مواعيد عيادة الباطنية', _h_hani || '.'),
    ('تحضير للزيارة', 'ما التعليمات قبل الحجامة؟',
     'الصيام عن الطعام ساعتين قبل موعد الحجامة، والحضور في الموعد، وإخبار الأخصائي بأي أمراض مزمنة أو أدوية تتناولها.'),
    ('عام', 'ما الأقسام الموجودة في المجمع؟',
     'الأسنان، الباطنية والجهاز الهضمي والسمنة، النساء والولادة، الطب العام، الحجامة (نسائية ورجالية)، الطب النفسي وجلسات الأطفال، التخاطب، المختبر والأشعة، والزيارات المنزلية والتمريض.'),
    ('عام', 'هل يوجد علاج أسنان للأطفال؟',
     'نعم، د. هند عماد تقدّم التركيبات وعلاج العصب والحشوات للكبار والأطفال، وخلع السن اللبني يبدأ من 99 ريال.'),
    ('عام', 'من أطباء الأسنان؟', 'د. دعاء طاهر ود. هند عماد.'),
    ('عام', 'علاج السمنة وإنقاص الوزن',
     'نعم، عيادة الباطنية والجهاز الهضمي والسمنة مع د. هاني سلامه: إنقاص الوزن وسوء التغذية. الكشف 55 ريال، والرجاء التواصل قبل الحضور لحجز موعد.'),
    ('عام', 'هل يوجد متابعة حمل؟',
     'نعم، عيادة النساء والولادة مع د. رحيق يوسف: متابعة الحمل والتبويض وعلاج تأخر الإنجاب. الكشف 55 ريال.'),
    ('عام', 'تركيب اللولب أو الشريحة',
     'نعم، عيادة النساء والولادة تقدّم تركيب وإزالة اللولب والشرائح.'),
    ('عام', 'هل يوجد أخصائي نفسي للأطفال؟',
     'نعم، الأخصائية النفسية هناء الشريف: تدريبات الانتباه والتركيز، جلسات أطفال التوحد، الاختبارات والمقاييس النفسية للأطفال، تنمية المهارات وتعديل السلوك. للحجز: 0532822242.'),
    ('عام', 'جلسات التخاطب وتأخر الكلام',
     'نعم، أخصائي النطق والتخاطب صفية الأزوري: جلسات تخاطب وتعلم النطق وتنمية المهارات وتعديل السلوك.'),
    ('عام', 'ما أنواع الحجامة؟',
     'الحجامة الرطبة والجافة والمتزحلقة، الوقائية والعلاجية، في قسمين: الحجامة النسائية والحجامة الرجالية، بأيدي مختصين وأدوات آمنة ومعقمة.'),
    ('عام', 'هل يوجد حجامة للنساء؟',
     E'نعم، قسم الحجامة النسائية:\n' || _h_cup_w || E'.\nالأسعار: 9 كاسات 149، 12 كاسة 199، 15 كاسة 249، 18 كاسة 299 ريال.'),
    ('عام', 'هل يوجد مختبر تحاليل؟', 'نعم، يوجد مختبر للتحاليل الطبية، وأشعة تلفزيونية (سونار).'),
    ('عام', 'هل يوجد أشعة تلفزيونية (سونار)؟',
     'نعم، تتوفر الأشعة التلفزيونية (السونار)، تواصل معنا لمعرفة السعر والموعد.'),
    ('عام', 'هل يوجد مغذيات وإبر؟', 'نعم، المغذيات الوريدية والإبر متوفرة في المجمع وفي المنزل.'),
    ('عام', 'هل يوجد تطعيمات؟', 'نعم، نقدّم تسجيل التطعيمات وتتوفر باقات، تواصل معنا للتفاصيل.'),
    ('عام', 'أين موقعكم؟', 'مجمع المروة السيل الطبي — مكة المكرمة، حي الشرائع.'),
    ('عام', 'أرقام التواصل', _numbers);

  delete from public.chatbot_knowledge k using _faq f where k.question = f.question;
  -- Questions an earlier version of this script used.
  delete from public.chatbot_knowledge where question in ('أرقام التواصل والواتساب');
  insert into public.chatbot_knowledge (category, question, answer, is_active)
  select category, question, answer, true from _faq;
end $seed$;

-- Quick check after running: departments, doctors and services now in the system.
select
  (select count(*) from public.specialties where is_active) as active_departments,
  (select count(*) from public.doctors where status = 'active') as active_doctors,
  (select count(*) from public.doctors d where status = 'active' and public.doctor_has_schedule(d.id)) as doctors_with_schedule,
  (select count(*) from public.services where is_active) as active_services,
  (select count(*) from public.services where is_active and price = 0) as services_price_on_request,
  (select count(*) from public.chatbot_knowledge where is_active) as faq_answers,
  (select slug from public.booking_forms where title = 'حجز موعد في المجمع' limit 1) as booking_form_slug;
