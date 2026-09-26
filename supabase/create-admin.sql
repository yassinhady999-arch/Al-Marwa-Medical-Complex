-- ============================================================================
--  إنشاء حساب المدير / المالك الأول  —  ClinicFlow Hub
--  شغّله في:  Supabase Dashboard  ->  SQL Editor  ->  New query  ->  Run
--
--  غيّر الإيميل وكلمة المرور في أول سطرين قبل التشغيل.
--  آمن لإعادة التشغيل: لو الحساب موجود مسبقًا يتم فقط منحه دور المالك.
-- ============================================================================

do $$
declare
  v_email    text := 'admin@clinic.sa';          -- <<< غيّر الإيميل
  v_password text := 'CHANGE_ME';                -- <<< غيّر كلمة المرور (8 أحرف+)
  v_name     text := 'مدير النظام';
  v_uid      uuid;
begin
  if v_password = 'CHANGE_ME' then
    raise exception 'غيّر كلمة المرور في أعلى السكربت قبل التشغيل';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(v_email);

  -- 1) إنشاء المستخدم في نظام المصادقة (مؤكَّد الإيميل مباشرةً)
  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', lower(v_email),
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text, 'email',
      jsonb_build_object(
        'sub', v_uid::text, 'email', lower(v_email),
        'email_verified', true, 'phone_verified', false
      ),
      now(), now(), now()
    );
  end if;

  -- 2) ضمان وجود صف في profiles
  insert into public.profiles (id, full_name, email)
  values (v_uid, v_name, lower(v_email))
  on conflict (id) do update
    set full_name = excluded.full_name, email = excluded.email;

  -- 3) منح دور المالك حصريًا
  insert into public.user_roles (user_id, role)
  values (v_uid, 'owner')
  on conflict (user_id, role) do nothing;

  delete from public.user_roles where user_id = v_uid and role <> 'owner';

  raise notice 'جاهز — المالك: %  (id: %)', v_email, v_uid;
end $$;
