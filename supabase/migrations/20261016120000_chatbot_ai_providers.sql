-- ============================================================================
-- ANY CHAT-MODEL PROVIDER FOR THE CHATBOT (أي مزود شات موديل وليس Anthropic فقط)
--
-- The saved AI key now records its provider (anthropic, openai, gemini, deepseek,
-- groq, mistral, openrouter, xai, or custom OpenAI-compatible with its own HTTPS
-- base URL). Saving a key also switches the bot's model to one the new account
-- has, so a provider change never leaves the bot on a model it can't call.
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
-- ============================================================================

alter table public.chatbot_ai_credentials add column if not exists base_url text;

-- Model ids differ by provider ("gpt-5", "models/gemini-2.5-flash", "openai/gpt-5", "x:y@z").
create or replace function public.chatbot_ai_clean_models(_models jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m ->> 'id',
           'name', left(coalesce(nullif(m ->> 'name', ''), m ->> 'id'), 120),
           'created_at', m ->> 'created_at') order by ord), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(_models) = 'array' then _models else '[]'::jsonb end)
         with ordinality as e(m, ord)
   where jsonb_typeof(m) = 'object'
     and coalesce(m ->> 'id', '') ~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,150}$'
     and ord <= 500;
$$;

create or replace function public.get_chatbot_ai_key_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    else coalesce(
      (select jsonb_build_object('has_key', true, 'key_hint', c.key_hint, 'models', c.models,
                                 'verified_at', c.verified_at, 'provider', c.provider,
                                 'base_url', c.base_url)
         from public.chatbot_ai_credentials c where c.id),
      jsonb_build_object('has_key', false, 'models', '[]'::jsonb))
  end;
$$;

-- When the bot's model isn't on the account any more, move it to _default_model.
create or replace function public.chatbot_ai_align_model(_default_model text)
returns void language sql security definer set search_path = public as $$
  update public.chatbot_settings b
     set ai_model = _default_model
   where _default_model is not null
     and _default_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,150}$'
     and exists (select 1 from public.chatbot_ai_credentials c where c.id
                   and jsonb_array_length(c.models) > 0
                   and not exists (select 1 from jsonb_array_elements(c.models) m
                                    where m ->> 'id' = b.ai_model));
$$;

-- The Anthropic-only version this replaces.
drop function if exists public.set_chatbot_ai_key(text, jsonb);

create or replace function public.set_chatbot_ai_key(
  _provider text, _key text, _models jsonb, _base_url text default null, _default_model text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _k text := btrim(coalesce(_key, ''));
  _p text := coalesce(nullif(btrim(_provider), ''), 'anthropic');
  _url text := nullif(btrim(coalesce(_base_url, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: حفظ مفتاح الذكاء الاصطناعي متاح للمدير فقط';
  end if;
  if _p not in ('anthropic', 'openai', 'gemini', 'deepseek', 'groq', 'mistral', 'openrouter', 'xai', 'custom') then
    raise exception 'INVALID_PROVIDER: مزود غير معروف';
  end if;
  if length(_k) < 8 or length(_k) > 400 or _k ~ '\s' then
    raise exception 'INVALID_KEY: صيغة المفتاح غير صحيحة';
  end if;
  if _p = 'anthropic' and _k !~ '^sk-ant-' then
    raise exception 'INVALID_KEY: مفتاح Anthropic يبدأ بـ sk-ant-';
  end if;
  if _p = 'custom' then
    if _url is null or _url !~ '^https://[^/\s]+' or length(_url) > 300 then
      raise exception 'INVALID_URL: اكتب رابط الخدمة ويبدأ بـ https://';
    end if;
  else
    _url := null;
  end if;

  insert into public.chatbot_ai_credentials (id, provider, api_key, key_hint, base_url, models, verified_at, updated_by, updated_at)
  values (true, _p, _k, left(_k, 6) || '…' || right(_k, 4), _url, public.chatbot_ai_clean_models(_models),
          now(), auth.uid(), now())
  on conflict (id) do update
    set provider = excluded.provider, api_key = excluded.api_key, key_hint = excluded.key_hint,
        base_url = excluded.base_url, models = excluded.models,
        verified_at = now(), updated_by = auth.uid(), updated_at = now();
  perform public.chatbot_ai_align_model(_default_model);
  return public.get_chatbot_ai_key_info();
end; $$;

drop function if exists public.set_chatbot_ai_models(jsonb);

create or replace function public.set_chatbot_ai_models(_models jsonb, _default_model text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED: متاح للمدير فقط';
  end if;
  update public.chatbot_ai_credentials
     set models = public.chatbot_ai_clean_models(_models), verified_at = now(),
         updated_by = auth.uid(), updated_at = now()
   where id;
  perform public.chatbot_ai_align_model(_default_model);
  return public.get_chatbot_ai_key_info();
end; $$;

revoke execute on function public.chatbot_ai_align_model(text) from public, anon, authenticated;
revoke execute on function public.set_chatbot_ai_key(text, text, jsonb, text, text) from public, anon;
revoke execute on function public.set_chatbot_ai_models(jsonb, text) from public, anon;
grant execute on function public.set_chatbot_ai_key(text, text, jsonb, text, text) to authenticated, service_role;
grant execute on function public.set_chatbot_ai_models(jsonb, text) to authenticated, service_role;
