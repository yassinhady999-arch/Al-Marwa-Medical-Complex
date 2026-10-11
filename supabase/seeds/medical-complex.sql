-- ============================================================================
-- بيانات مجمع المروة السيل الطبي: الأقسام، الأطباء، الخدمات والأسعار، نموذج الحجز، والشات بوت
--
-- شغّله في Supabase SQL Editor بعد ملف الترحيل
--   supabase/migrations/20261011120000_multi_department_doctors.sql
--
-- • أول تشغيل: يستبدل بيانات العرض التجريبية (أقسام/أطباء/خدمات العرض) ببيانات
--   المجمع. ما له مواعيد مسجلة يُوقف ولا يُحذف، والمرضى والمواعيد لا تُمس أبدًا.
-- • التشغيل مرة أخرى آمن: يحدّث بيانات المجمع فقط ولا يلمس ما أضفتموه بعدها،
--   ولا يغيّر سعرًا عدّلتموه لخدمة كانت «السعر عند الاستفسار».
-- • الخدمة بسعر 0 تظهر للعملاء «السعر عند الاستفسار» حتى تضيفوا سعرها من صفحة الخدمات.
-- ============================================================================

-- Builds one chatbot menu choice (kinds: text | services | doctors | hours | contact | booking | link).
create or replace function pg_temp.menu_node(
  _id text, _label text, _kind text, _reply text,
  _specialty uuid default null, _children jsonb default '[]'::jsonb
) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('id', _id, 'label', _label, 'kind', _kind,
                                              'reply', _reply, 'specialty_id', _specialty))
         || jsonb_build_object('children', _children);
$$;

do $seed$
declare
  r record;
  _id uuid;
  _spec uuid;
  _spec_ids uuid[];
  _first_run boolean;
  _keep_specs uuid[] := '{}';
  _keep_doctors uuid[] := '{}';
  _keep_services uuid[] := '{}';
  _form uuid;
  _children jsonb;
  _departments jsonb := '[]'::jsonb;
  _home uuid;
  _cupping uuid;
  _menu jsonb;
  _policies text := E'• نرجو الالتزام بالموعد المحدد.\n'
                    || E'• الاعتذار عن الموعد يكون قبل الموعد بيوم على الأقل.\n'
                    || E'• الحجامة: الصيام ساعتين قبل الجلسة.';
  _cupping_note text := E'تعليمات قبل الحجامة 🩸\n'
                        || E'• الصيام عن الطعام ساعتين قبل موعد الحجامة.\n'
                        || E'• الحضور في الموعد المحدد.\n'
                        || E'• أخبر الأخصائي بأي أمراض مزمنة أو أدوية تتناولها.';
begin
  -- First run = the complex's doctors aren't in the system yet.
  _first_run := not exists (select 1 from public.doctors where name in ('د. هاني سلامه', 'د. هاني سلامة'));

  -- --------------------------------------------------------------------------
  -- 1) الأقسام (old demo names are renamed so any existing history stays linked)
  -- --------------------------------------------------------------------------
  for r in select * from (values
    ('الأسنان', array['طب الأسنان', 'الاسنان'],
     'علاج وتجميل الأسنان للكبار والأطفال: تنظيف وتلميع، حشوات، علاج عصب، تركيبات ثابتة ومتحركة، خلع، تبييض، وفلورايد.', true),
    ('الباطنة العامة', array['الباطنية', 'الباطنة', 'الباطنه'],
     'الضغط والسكر، الكبد والجهاز الهضمي، الصدرية والجهاز التنفسي، الغدد الصماء، أمراض الدم، الكلى، الأورام، الروماتيزم، سوء التغذية، إنقاص الوزن وأمراض السمنة، والتغذية العلاجية.', true),
    ('النساء', array['أمراض النساء', 'النساء والولادة'],
     'متابعة الحمل والتبويض، علاج تأخر الإنجاب، ووسائل منع الحمل مثل تركيب وإزالة اللولب والشرائح.', true),
    ('الطب العام', array['طب عام'],
     'الكشف والاستشارات الطبية العامة.', true),
    ('الطب النفسي', array['الطب النفسي والسلوكي'],
     'العلاج النفسي والسلوكي، التأهيل النفسي، الاختبارات والمقاييس النفسية للأطفال، تنمية المهارات وتعديل السلوك.', true),
    ('التخاطب', array['النطق والتخاطب'],
     'جلسات التخاطب وتعلم النطق، تنمية المهارات وتعديل السلوك.', true),
    ('الحجامة الطبية', array['الحجامة'],
     'الحجامة الرطبة والجافة والمتزحلقة، الوقائية والعلاجية.', true),
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
  -- 2) الأطباء والأخصائيون (first department = main one)
  -- --------------------------------------------------------------------------
  for r in select * from (values
    ('د. دعاء طاهر', array['دعاء طاهر'], array['الأسنان'],
     'طبيبة أسنان: تركيبات، علاج عصب، وحشوات.'),
    ('د. هند عماد', array['هند عماد'], array['الأسنان'],
     'طبيبة أسنان: تركيبات، علاج عصب، وحشوات للكبار والأطفال.'),
    ('د. هاني سلامه', array['د. هاني سلامة', 'هاني سلامه', 'هاني سلامة'], array['الباطنة العامة', 'الحجامة الطبية'],
     'باطنة عامة وصدرية، جهاز هضمي، كلى وكبد، غدد صماء، تغذية علاجية وأمراض السمنة. وأخصائي حجامة.'),
    ('د. رحيق يوسف', array['د. رحيق', 'رحيق يوسف'], array['النساء', 'الطب العام', 'الحجامة الطبية'],
     'أمراض النساء، والطب العام، والحجامة.'),
    ('هناء الشريف', array['أ. هناء الشريف'], array['الطب النفسي'],
     'أخصائي نفسي: العلاج النفسي والسلوكي، والاختبارات والمقاييس النفسية للأطفال.'),
    ('صفية الأزوري', array['أ. صفية الأزوري'], array['التخاطب'],
     'أخصائي نطق وتخاطب.'),
    ('د. محمد حجازي', array['محمد حجازي'], array['الحجامة الطبية'],
     'أخصائي حجامة.'),
    ('د. سمر محمد', array['سمر محمد'], array['الحجامة الطبية'],
     'أخصائي حجامة.')
  ) as t(name, aliases, departments, bio) loop
    _id := null;
    select id into _id from public.doctors
     where name = r.name or name = any (r.aliases) order by (name = r.name) desc, created_at limit 1;
    _spec_ids := array(select s.id from unnest(r.departments) with ordinality as u(name, ord)
                         join public.specialties s on s.name = u.name order by u.ord);
    if _id is null then
      insert into public.doctors (name, bio, status, specialty_id)
      values (r.name, r.bio, 'active', _spec_ids[1]) returning id into _id;
    else
      update public.doctors set name = r.name, bio = r.bio, status = 'active', specialty_id = _spec_ids[1]
       where id = _id;
    end if;
    delete from public.doctor_specialties where doctor_id = _id and specialty_id <> all (_spec_ids);
    insert into public.doctor_specialties (doctor_id, specialty_id)
    select _id, s.id from unnest(_spec_ids) as s(id) on conflict do nothing;
    _keep_doctors := _keep_doctors || _id;
  end loop;

  -- --------------------------------------------------------------------------
  -- 3) الخدمات والأسعار (0 = السعر عند الاستفسار)
  -- --------------------------------------------------------------------------
  for r in select * from (values
    -- الأسنان
    ('الأسنان', 'كشف أسنان', 20, 45, 'كشف وتشخيص وخطة علاج.'),
    ('الأسنان', 'تنظيف الأسنان', 30, 0, 'إزالة الجير والتصبغات.'),
    ('الأسنان', 'تلميع الأسنان', 30, 0, null),
    ('الأسنان', 'حشوات الأسنان', 45, 0, 'للكبار والأطفال.'),
    ('الأسنان', 'علاج العصب', 60, 0, 'للكبار والأطفال.'),
    ('الأسنان', 'تركيبات ثابتة', 45, 0, null),
    ('الأسنان', 'تركيبات متحركة', 45, 0, null),
    ('الأسنان', 'خلع الأسنان', 30, 0, null),
    ('الأسنان', 'تبييض الأسنان', 60, 0, null),
    ('الأسنان', 'تطبيق الفلورايد', 20, 0, 'لحماية الأسنان من التسوس.'),
    -- الباطنة العامة
    ('الباطنة العامة', 'كشف باطنة', 30, 55,
     'كشف أخصائي: الضغط والسكر، الكبد والجهاز الهضمي، الصدرية، الغدد الصماء، أمراض الدم، الكلى، الأورام، الروماتيزم، سوء التغذية، إنقاص الوزن والسمنة، والتغذية العلاجية.'),
    -- النساء
    ('النساء', 'كشف نساء', 30, 55, 'كشف أخصائي.'),
    ('النساء', 'متابعة الحمل', 30, 0, null),
    ('النساء', 'متابعة التبويض', 30, 0, null),
    ('النساء', 'علاج تأخر الإنجاب', 30, 0, null),
    ('النساء', 'تركيب اللولب', 30, 0, null),
    ('النساء', 'إزالة اللولب', 20, 0, null),
    ('النساء', 'تركيب الشريحة', 30, 0, 'شريحة منع الحمل.'),
    ('النساء', 'إزالة الشريحة', 30, 0, null),
    -- الطب العام
    ('الطب العام', 'كشف طب عام', 20, 45, null),
    -- الطب النفسي
    ('الطب النفسي', 'استشارة نفسية', 45, 55, 'جلسة تقييم مع الأخصائي النفسي.'),
    ('الطب النفسي', 'جلسة علاج نفسي وسلوكي', 45, 0, null),
    ('الطب النفسي', 'جلسة تأهيل نفسي', 45, 0, null),
    ('الطب النفسي', 'الاختبارات والمقاييس النفسية للأطفال', 60, 0, null),
    ('الطب النفسي', 'تنمية المهارات وتعديل السلوك', 45, 0, null),
    -- التخاطب
    ('التخاطب', 'تقييم نطق وتخاطب', 45, 55, 'جلسة تقييم مع أخصائي التخاطب.'),
    ('التخاطب', 'جلسة تخاطب وتعلم النطق', 45, 0, null),
    ('التخاطب', 'جلسة تنمية مهارات وتعديل سلوك', 45, 0, null),
    -- الحجامة الطبية
    ('الحجامة الطبية', 'حجامة رطبة', 30, 0, 'وقائية أو علاجية. الصيام ساعتين قبل الجلسة.'),
    ('الحجامة الطبية', 'حجامة جافة', 30, 0, 'وقائية أو علاجية. الصيام ساعتين قبل الجلسة.'),
    ('الحجامة الطبية', 'حجامة متزحلقة', 30, 0, 'وقائية أو علاجية. الصيام ساعتين قبل الجلسة.'),
    -- المختبر والأشعة
    ('المختبر والأشعة', 'التحاليل الطبية', 15, 0, 'تختلف الأسعار حسب نوع التحليل.'),
    ('المختبر والأشعة', 'الأشعة التلفزيونية (السونار)', 20, 0, null),
    -- الزيارات المنزلية والتمريض
    ('الزيارات المنزلية والتمريض', 'زيارة منزلية - أخصائي', 60, 250, null),
    ('الزيارات المنزلية والتمريض', 'زيارة منزلية - طبيب عام', 60, 200, null),
    ('الزيارات المنزلية والتمريض', 'زيارة تمريض منزلية', 60, 150, null),
    ('الزيارات المنزلية والتمريض', 'حجامة منزلية', 60, 300, 'الصيام ساعتين قبل الجلسة.'),
    ('الزيارات المنزلية والتمريض', 'المغذيات الوريدية', 30, 0, 'في المجمع أو في المنزل.'),
    ('الزيارات المنزلية والتمريض', 'الإبر والحقن', 15, 0, 'في المجمع أو في المنزل.'),
    ('الزيارات المنزلية والتمريض', 'تسجيل التطعيمات', 15, 0, 'تتوفر باقات.')
  ) as t(department, name, duration, price, description) loop
    _id := null;
    _spec := (select id from public.specialties where name = r.department);
    select id into _id from public.services
     where name = r.name and specialty_id is not distinct from _spec order by created_at limit 1;
    if _id is null then
      insert into public.services (name, specialty_id, duration_minutes, price, description, is_active)
      values (r.name, _spec, r.duration, r.price, r.description, true) returning id into _id;
    else
      -- Keep durations, descriptions and prices the clinic set itself; known prices always win.
      update public.services
         set price = case when r.price > 0 then r.price else price end, is_active = true
       where id = _id;
    end if;
    _keep_services := _keep_services || _id;
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

  -- The complex's name (from its logo), unless the clinic already typed its own.
  update public.clinic_settings
     set clinic_name = 'مجمع المروة السيل الطبي'
   where clinic_name in ('مركز الشفاء الطبي', 'عيادتي', 'المجمع الطبي');

  -- --------------------------------------------------------------------------
  -- 5) نموذج الحجز
  -- --------------------------------------------------------------------------
  select id into _form from public.booking_forms where title = 'حجز موعد في المجمع' order by created_at limit 1;
  if _form is null then
    insert into public.booking_forms (title, created_by) values ('حجز موعد في المجمع', null) returning id into _form;
  end if;
  update public.booking_forms set
    description = 'اختر القسم والخدمة والوقت المناسب لك، وسنتواصل معك لتأكيد الموعد.',
    is_active = true,
    fields = '[
      {"id": "full_name", "type": "full_name", "label": "الاسم الثلاثي", "required": true, "placeholder": "مثال: محمد أحمد علي"},
      {"id": "phone", "type": "phone", "label": "رقم الجوال (واتساب)", "required": true, "placeholder": "05xxxxxxxx"},
      {"id": "appointment", "type": "appointment", "label": "الخدمة والموعد", "required": true},
      {"id": "notes", "type": "notes", "label": "ملاحظات", "required": false, "placeholder": "أي معلومة تحب توصلها للطبيب"}
    ]'::jsonb,
    settings = jsonb_build_object(
      'specialty_ids', '[]'::jsonb,
      'service_ids', '[]'::jsonb,
      'choose_doctor', true,
      'booking_window_days', 14,
      'show_prices', true,
      'success_message', E'تم استلام حجزك بنجاح ✅ سنتواصل معك لتأكيد الموعد.\n'
                         || E'نرجو الالتزام بالموعد، والاعتذار قبل الموعد بيوم على الأقل.')
  where id = _form;

  -- --------------------------------------------------------------------------
  -- 6) قائمة الشات بوت
  -- --------------------------------------------------------------------------
  for r in select * from (values
    (1, 'dental', '🦷 الأسنان', 'الأسنان',
     'قسم الأسنان 🦷 للكبار والأطفال: تنظيف وتلميع، حشوات، علاج عصب، تركيبات ثابتة ومتحركة، خلع، تبييض، وفلورايد.', true),
    (2, 'internal', '🩺 الباطنة العامة', 'الباطنة العامة',
     'قسم الباطنة العامة 🩺: الضغط والسكر، الكبد والجهاز الهضمي، الصدرية والجهاز التنفسي، الغدد الصماء، أمراض الدم، الكلى، الأورام، الروماتيزم، سوء التغذية، إنقاص الوزن وأمراض السمنة، والتغذية العلاجية.', true),
    (3, 'women', '🤰 النساء', 'النساء',
     'قسم النساء 🤰: متابعة الحمل والتبويض، علاج تأخر الإنجاب، ووسائل منع الحمل مثل تركيب وإزالة اللولب والشرائح.', true),
    (4, 'gp', '👨‍⚕️ الطب العام', 'الطب العام',
     'الطب العام 👨‍⚕️: الكشف والاستشارات الطبية العامة.', true),
    (5, 'psych', '🧠 الطب النفسي', 'الطب النفسي',
     'الطب النفسي والسلوكي 🧠: العلاج النفسي والسلوكي، التأهيل النفسي، الاختبارات والمقاييس النفسية للأطفال، تنمية المهارات وتعديل السلوك.', true),
    (6, 'speech', '🗣️ التخاطب', 'التخاطب',
     'التخاطب 🗣️: جلسات تخاطب وتعلم النطق، تنمية المهارات وتعديل السلوك.', true),
    (7, 'cupping', '🩸 الحجامة الطبية', 'الحجامة الطبية',
     'الحجامة الطبية 🩸: الحجامة الرطبة والجافة والمتزحلقة، الوقائية والعلاجية.', true),
    (8, 'lab', '🔬 المختبر والأشعة', 'المختبر والأشعة',
     'المختبر والأشعة 🔬: التحاليل الطبية والأشعة التلفزيونية (السونار).', false),
    (9, 'home', '🏠 الزيارات المنزلية والتمريض', 'الزيارات المنزلية والتمريض',
     'نصلك في منزلك 🏠: زيارة أخصائي أو طبيب عام أو تمريض، الحجامة المنزلية، المغذيات والإبر، وتسجيل التطعيمات.', false)
  ) as t(ord, key, label, department, reply, bookable) order by ord loop
    _spec := (select id from public.specialties where name = r.department);
    _children := jsonb_build_array(
      pg_temp.menu_node('n_dept_' || r.key || '_services', '💰 الخدمات والأسعار', 'services',
                        'خدمات ' || r.department || ':', _spec));
    if r.bookable then
      _children := _children || jsonb_build_array(
        pg_temp.menu_node('n_dept_' || r.key || '_doctors', '👨‍⚕️ الأطباء', 'doctors', 'أطباء ' || r.department || ':', _spec));
    end if;
    if r.key = 'cupping' then
      _children := _children || jsonb_build_array(
        pg_temp.menu_node('n_dept_cupping_rules', '⚠️ تعليمات قبل الحجامة', 'text', _cupping_note),
        pg_temp.menu_node('n_dept_cupping_home', '🏡 الحجامة المنزلية', 'text',
                          'نوفر الحجامة في المنزل بسعر 300 ريال. تواصل معنا لترتيب الموعد.', null,
                          jsonb_build_array(pg_temp.menu_node('n_dept_cupping_home_contact', '📞 تواصل معنا', 'contact',
                                                              'يسعدنا تواصلك معنا:'))));
    end if;
    if r.bookable then
      _children := _children || jsonb_build_array(
        pg_temp.menu_node('n_dept_' || r.key || '_book', '📅 احجز موعد', 'booking',
                          'احجز موعدك في ' || r.department || ' من الرابط التالي:'));
    else
      _children := _children || jsonb_build_array(
        pg_temp.menu_node('n_dept_' || r.key || '_contact', '📞 تواصل معنا', 'contact',
                          'للاستفسار والحجز تواصل معنا:'));
    end if;
    _departments := _departments || jsonb_build_array(
      pg_temp.menu_node('n_dept_' || r.key, r.label, 'text', r.reply, null, _children));
  end loop;

  _home := (select id from public.specialties where name = 'الزيارات المنزلية والتمريض');
  _cupping := (select id from public.specialties where name = 'الحجامة الطبية');

  _menu := jsonb_build_array(
    pg_temp.menu_node('n_booking', '📅 حجز موعد', 'booking',
      'يسعدنا خدمتك 🌷 احجز موعدك من الرابط التالي، أو أرسل لنا اسمك الثلاثي والخدمة المطلوبة عبر الواتساب وسنرد عليك بالعروض والأيام والأوقات المتاحة.',
      null,
      jsonb_build_array(pg_temp.menu_node('n_booking_contact', '💬 الحجز بالاتصال أو الواتساب', 'contact',
                                          'أرسل لنا اسمك الثلاثي والخدمة المطلوبة:'))),
    pg_temp.menu_node('n_departments', '🏥 الأقسام والخدمات', 'text', 'اختر القسم 👇', null, _departments),
    pg_temp.menu_node('n_prices', '💰 الأسعار والعروض', 'text', 'اختر ما تريد معرفته 👇', null,
      jsonb_build_array(
        pg_temp.menu_node('n_prices_visit', '🩺 أسعار الكشف', 'text',
          E'أسعار الكشف:\n• كشف الأخصائي: 55 ريال\n• كشف الطبيب العام: 45 ريال\n• كشف الأسنان: 45 ريال'),
        pg_temp.menu_node('n_prices_all', '📋 كل الخدمات والأسعار', 'services', 'خدماتنا وأسعارها:'),
        pg_temp.menu_node('n_prices_home', '🏠 أسعار الزيارات المنزلية', 'services', 'الزيارات المنزلية والتمريض:', _home),
        pg_temp.menu_node('n_offers', '🎁 العروض والباقات', 'text',
          'لدينا عروض وباقات مميزة تتجدد باستمرار ✨ تواصل معنا لمعرفة العروض الحالية.', null,
          jsonb_build_array(pg_temp.menu_node('n_offers_contact', '📞 اسأل عن العروض', 'contact',
                                              'يسعدنا تواصلك معنا:'))))),
    pg_temp.menu_node('n_doctors', '👨‍⚕️ أطباؤنا', 'doctors', 'تعرّف على فريقنا الطبي:'),
    pg_temp.menu_node('n_home', '🏠 الزيارات المنزلية', 'services', 'نصلك في منزلك 🏠', _home,
      jsonb_build_array(pg_temp.menu_node('n_home_contact', '📞 اطلب زيارة منزلية', 'contact',
                                          'لطلب زيارة منزلية تواصل معنا:'))),
    pg_temp.menu_node('n_policies', '📋 تعليمات المجمع', 'text', _policies, null,
      jsonb_build_array(pg_temp.menu_node('n_policies_cupping', '🩸 تعليمات الحجامة', 'text', _cupping_note))),
    pg_temp.menu_node('n_hours', '🕘 مواعيد العمل', 'hours', 'مواعيد العمل:'),
    pg_temp.menu_node('n_contact', '📍 الموقع والتواصل', 'contact', 'يسعدنا تواصلك معنا:')
  );

  -- --------------------------------------------------------------------------
  -- 7) إعدادات الشات بوت (mode, model and daily limit stay as the clinic set them)
  -- --------------------------------------------------------------------------
  insert into public.chatbot_settings (bot_name)
  select 'مساعد مجمع المروة' where not exists (select 1 from public.chatbot_settings);

  update public.chatbot_settings set
    bot_name = 'مساعد مجمع المروة',
    welcome_message = E'السلام عليكم ومرحبًا بك 🌷\n'
                      || E'أنا المساعد الآلي لمجمع المروة السيل الطبي، أساعدك في معرفة الأقسام والخدمات والأسعار والأطباء وحجز موعدك.\n'
                      || 'اختر ما تحتاجه من القائمة 👇',
    fallback_message = 'عذرًا، لم أجد إجابة دقيقة لسؤالك 🙏 اختر من القائمة، أو تواصل معنا بالاتصال أو الواتساب وسيرد عليك أحد موظفينا.',
    ai_instructions = E'أنت موظف خدمة العملاء في مجمع المروة السيل الطبي. رد بلغة عربية بسيطة وودودة ومختصرة.\n'
      || E'- عند طلب الحجز: اطلب الاسم الثلاثي والخدمة المطلوبة، ثم أرسل رابط الحجز، أو اطلب التواصل عبر الواتساب ليُرد عليه بالعروض والأيام والأوقات المتاحة.\n'
      || E'- استخدم الأسعار الموجودة في بيانات الخدمات فقط. إذا كان سعر الخدمة 0 أو غير مذكور فقل إن السعر عند الاستفسار واطلب التواصل، ولا تخمّن أي سعر.\n'
      || E'- يوجد عروض وباقات تتجدد: وجّه العميل للتواصل لمعرفة العروض الحالية.\n'
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
     'تقدر تحجز من رابط الحجز، أو بالاتصال أو الواتساب: أرسل اسمك الثلاثي والخدمة المطلوبة، ونرد عليك بالعروض والأيام والأوقات المتاحة.'),
    ('حجز', 'كيف ألغي أو أعتذر عن موعدي؟',
     'الاعتذار عن الموعد يكون قبل الموعد بيوم على الأقل، بالاتصال أو الواتساب.'),
    ('حجز', 'هل يجب الحضور في الموعد المحدد؟',
     'نعم، نرجو الالتزام بالموعد المحدد حتى نخدمك بدون انتظار.'),
    ('أسعار', 'كم سعر الكشف؟',
     E'أسعار الكشف:\n• كشف الأخصائي: 55 ريال\n• كشف الطبيب العام: 45 ريال\n• كشف الأسنان: 45 ريال'),
    ('أسعار', 'كم سعر كشف الأسنان؟', 'كشف الأسنان 45 ريال.'),
    ('أسعار', 'كم سعر الزيارة المنزلية؟',
     E'الزيارات المنزلية:\n• زيارة أخصائي: 250 ريال\n• زيارة طبيب عام: 200 ريال\n• زيارة تمريض: 150 ريال\n• حجامة منزلية: 300 ريال'),
    ('أسعار', 'كم سعر الحجامة؟',
     'سعر الحجامة في المجمع حسب نوعها، تواصل معنا لمعرفة السعر والعروض. الحجامة المنزلية 300 ريال.'),
    ('أسعار', 'هل يوجد عروض أو باقات؟',
     'نعم، لدينا عروض وباقات تتجدد باستمرار، تواصل معنا لمعرفة العروض الحالية.'),
    ('أسعار', 'كم سعر التحاليل والأشعة؟',
     'تختلف أسعار التحاليل والأشعة التلفزيونية حسب النوع، تواصل معنا وسنرسل لك السعر.'),
    ('تحضير للزيارة', 'ما التعليمات قبل الحجامة؟',
     'الصيام عن الطعام ساعتين قبل موعد الحجامة، والحضور في الموعد، وإخبار الأخصائي بأي أمراض مزمنة أو أدوية تتناولها.'),
    ('عام', 'ما الأقسام الموجودة في المجمع؟',
     'الأسنان، الباطنة العامة، النساء، الطب العام، الطب النفسي، التخاطب، الحجامة الطبية، المختبر والأشعة، والزيارات المنزلية والتمريض.'),
    ('عام', 'هل يوجد علاج أسنان للأطفال؟',
     'نعم، د. هند عماد تقدّم التركيبات وعلاج العصب والحشوات للكبار والأطفال.'),
    ('عام', 'من أطباء الأسنان؟', 'د. دعاء طاهر ود. هند عماد.'),
    ('عام', 'علاج السمنة وإنقاص الوزن',
     'نعم، قسم الباطنة العامة مع د. هاني سلامه: إنقاص الوزن وأمراض السمنة والتغذية العلاجية.'),
    ('عام', 'هل يوجد متابعة حمل؟',
     'نعم، قسم النساء مع د. رحيق يوسف: متابعة الحمل والتبويض وعلاج تأخر الإنجاب.'),
    ('عام', 'تركيب اللولب أو الشريحة',
     'نعم، قسم النساء يقدّم تركيب وإزالة اللولب والشرائح.'),
    ('عام', 'هل يوجد أخصائي نفسي للأطفال؟',
     'نعم، الأخصائي النفسي هناء الشريف: الاختبارات والمقاييس النفسية للأطفال، تنمية المهارات وتعديل السلوك.'),
    ('عام', 'جلسات التخاطب وتأخر الكلام',
     'نعم، أخصائي النطق والتخاطب صفية الأزوري: جلسات تخاطب وتعلم النطق وتنمية المهارات وتعديل السلوك.'),
    ('عام', 'ما أنواع الحجامة؟',
     'الحجامة الرطبة والجافة والمتزحلقة، وقائية وعلاجية، مع د. هاني سلامه ود. رحيق يوسف ود. محمد حجازي ود. سمر محمد.'),
    ('عام', 'هل يوجد مختبر تحاليل؟', 'نعم، يوجد مختبر للتحاليل الطبية، وأشعة تلفزيونية (سونار).'),
    ('عام', 'هل يوجد أشعة تلفزيونية (سونار)؟',
     'نعم، تتوفر الأشعة التلفزيونية (السونار)، تواصل معنا لمعرفة السعر والموعد.'),
    ('عام', 'هل يوجد مغذيات وإبر؟', 'نعم، المغذيات الوريدية والإبر متوفرة في المجمع وفي المنزل.'),
    ('عام', 'هل يوجد تطعيمات؟', 'نعم، نقدّم تسجيل التطعيمات وتتوفر باقات، تواصل معنا للتفاصيل.');

  delete from public.chatbot_knowledge k using _faq f where k.question = f.question;
  insert into public.chatbot_knowledge (category, question, answer, is_active)
  select category, question, answer, true from _faq;
end $seed$;

-- Quick check after running: departments, doctors and services now in the system.
select
  (select count(*) from public.specialties where is_active) as active_departments,
  (select count(*) from public.doctors where status = 'active') as active_doctors,
  (select count(*) from public.services where is_active) as active_services,
  (select count(*) from public.services where is_active and price = 0) as services_price_on_request,
  (select count(*) from public.chatbot_knowledge where is_active) as faq_answers,
  (select slug from public.booking_forms where title = 'حجز موعد في المجمع' limit 1) as booking_form_slug;
