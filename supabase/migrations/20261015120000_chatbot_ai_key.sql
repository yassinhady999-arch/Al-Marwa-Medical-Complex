-- ============================================================================
-- AI KEY SAVED FROM «تدريب الشات بوت» (مفتاح الذكاء الاصطناعي من داخل النظام)
--
-- An admin pastes the Anthropic API key in the chatbot training page; the site
-- verifies it with Anthropic, fetches the models the account can use, and saves
-- both here. The key itself is never readable from the browser: the table has
-- no grants for anon/authenticated, and only the server (service role) reads it
-- to answer customers. Staff see the last characters and the model list only.
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
-- ============================================================================

create table if not exists public.chatbot_ai_credentials (
  id boolean primary key default true check (id),
  provider text not null default 'anthropic',
  api_key text not null,
  key_hint text not null,
  -- [{id, name, created_at}] as returned by Anthropic's models list, newest first.
  models jsonb not null default '[]'::jsonb check (jsonb_typeof(models) = 'array'),
  verified_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.chatbot_ai_credentials enable row level security;
revoke all on public.chatbot_ai_credentials from public, anon, authenticated;
grant all on public.chatbot_ai_credentials to service_role;
-- No policies on purpose: only the service role (the server) reads the key.

-- Keeps only {id, name, created_at} entries with a sane model id (at most 100).
create or replace function public.chatbot_ai_clean_models(_models jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m ->> 'id',
           'name', left(coalesce(nullif(m ->> 'name', ''), m ->> 'id'), 80),
           'created_at', m ->> 'created_at') order by ord), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(_models) = 'array' then _models else '[]'::jsonb end)
         with ordinality as e(m, ord)
   where jsonb_typeof(m) = 'object'
     and coalesce(m ->> 'id', '') ~ '^claude-[a-z0-9.-]{2,80}$'
     and ord <= 100;
$$;

-- Status for staff: never the key itself.
create or replace function public.get_chatbot_ai_key_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    else coalesce(
      (select jsonb_build_object('has_key', true, 'key_hint', c.key_hint, 'models', c.models,
                                 'verified_at', c.verified_at, 'provider', c.provider)
         from public.chatbot_ai_credentials c where c.id),
      jsonb_build_object('has_key', false, 'models', '[]'::jsonb))
  end;
$$;

create or replace function public.set_chatbot_ai_key(_key text, _models jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _k text := btrim(coalesce(_key, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: حفظ مفتاح الذكاء الاصطناعي متاح للمدير فقط';
  end if;
  if _k !~ '^sk-ant-[A-Za-z0-9_-]{20,250}$' then
    raise exception 'INVALID_KEY: صيغة المفتاح غير صحيحة، يبدأ مفتاح Anthropic بـ sk-ant-';
  end if;
  insert into public.chatbot_ai_credentials (id, api_key, key_hint, models, verified_at, updated_by, updated_at)
  values (true, _k, left(_k, 7) || '…' || right(_k, 4), public.chatbot_ai_clean_models(_models), now(), auth.uid(), now())
  on conflict (id) do update
    set api_key = excluded.api_key, key_hint = excluded.key_hint, models = excluded.models,
        verified_at = now(), updated_by = auth.uid(), updated_at = now();
  return public.get_chatbot_ai_key_info();
end; $$;

-- Refreshes the model list for the saved key (the server re-checked it with Anthropic).
create or replace function public.set_chatbot_ai_models(_models jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: متاح للمدير فقط';
  end if;
  update public.chatbot_ai_credentials
     set models = public.chatbot_ai_clean_models(_models), verified_at = now(),
         updated_by = auth.uid(), updated_at = now()
   where id;
  return public.get_chatbot_ai_key_info();
end; $$;

create or replace function public.clear_chatbot_ai_key()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: حذف مفتاح الذكاء الاصطناعي متاح للمدير فقط';
  end if;
  delete from public.chatbot_ai_credentials where id;
  return public.get_chatbot_ai_key_info();
end; $$;

revoke execute on function public.chatbot_ai_clean_models(jsonb) from public, anon;
revoke execute on function public.get_chatbot_ai_key_info() from public, anon;
revoke execute on function public.set_chatbot_ai_key(text, jsonb) from public, anon;
revoke execute on function public.set_chatbot_ai_models(jsonb) from public, anon;
revoke execute on function public.clear_chatbot_ai_key() from public, anon;
grant execute on function public.get_chatbot_ai_key_info() to authenticated, service_role;
grant execute on function public.set_chatbot_ai_key(text, jsonb) to authenticated, service_role;
grant execute on function public.set_chatbot_ai_models(jsonb) to authenticated, service_role;
grant execute on function public.clear_chatbot_ai_key() to authenticated, service_role;
grant execute on function public.chatbot_ai_clean_models(jsonb) to authenticated, service_role;
