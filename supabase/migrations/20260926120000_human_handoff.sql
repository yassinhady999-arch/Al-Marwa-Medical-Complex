-- ============================================================================
-- HUMAN HANDOFF (التدخل البشري)
--
-- A conversation enters the handoff queue when the patient asks to talk to a
-- staff member (flagged by n8n / the AI, by keyword detection in the messages
-- endpoint, or manually by staff). While conversations.status = 'human_support'
-- the AI must stay silent; staff reply from the dashboard and then hand the
-- conversation back to the bot.
--
-- Safe to run more than once (idempotent). Paste into Supabase SQL Editor.
-- ============================================================================

alter table public.conversations
  add column if not exists handoff_reason text,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_resolved_at timestamptz;

create index if not exists idx_conversations_handoff_queue
  on public.conversations(handoff_requested_at)
  where status = 'human_support';

-- n8n reads GET /events ordered by created_at. now() is the transaction start, so
-- two events emitted by one call (e.g. human_takeover + message.send) tied and
-- could reach the patient out of order; clock_timestamp() keeps emit order.
alter table public.integration_events alter column created_at set default clock_timestamp();

-- Shared payload for the handoff events n8n pulls from GET /events.
create or replace function public.handoff_event_payload(_conversation_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'conversation_id', c.id,
    'external_conversation_id', c.external_conversation_id,
    'channel', c.channel,
    'status', c.status,
    'bot_active', c.status <> 'human_support',
    'handoff_reason', c.handoff_reason,
    'assigned_to', c.assigned_to,
    'assigned_to_name', (select full_name from public.profiles where id = c.assigned_to),
    'patient_id', c.patient_id,
    'patient_name', p.full_name,
    'phone', p.phone,
    'whatsapp_number', coalesce(p.whatsapp_number, p.normalized_phone)
  )
  from public.conversations c
  left join public.patients p on p.id = c.patient_id
  where c.id = _conversation_id;
$$;

-- Put a conversation in the handoff queue and pause the AI.
-- Callable by staff with write access, and by the service role (n8n endpoints).
-- Returns false when the conversation was already waiting for / with a human.
create or replace function public.request_human_handoff(
  _conversation_id uuid,
  _reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _status public.conversation_status;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
  _patient text;
begin
  if auth.uid() is not null and not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;

  select status into _status from public.conversations where id = _conversation_id for update;
  if not found then
    raise exception 'NOT_FOUND: المحادثة غير موجودة';
  end if;

  if _status = 'human_support' then
    if _reason_clean is not null then
      update public.conversations
         set handoff_reason = coalesce(handoff_reason, _reason_clean)
       where id = _conversation_id;
    end if;
    return false;
  end if;

  update public.conversations
     set status = 'human_support',
         handoff_reason = _reason_clean,
         handoff_requested_at = now(),
         handoff_resolved_at = null,
         assigned_to = null
   where id = _conversation_id;

  perform public.emit_event('conversation.handoff_requested', 'conversation', _conversation_id,
    public.handoff_event_payload(_conversation_id));

  select p.full_name into _patient
    from public.conversations c join public.patients p on p.id = c.patient_id
   where c.id = _conversation_id;
  insert into public.notifications (type, title, message, entity_type, entity_id)
  values ('conversation.handoff_requested', 'طلب التحدث مع موظف',
          coalesce(_patient, 'مريض') || coalesce(' — ' || _reason_clean, ''),
          'conversation', _conversation_id);

  return true;
end; $$;

-- Current staff member takes over the conversation (AI stays paused).
create or replace function public.claim_conversation(_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _status public.conversation_status;
  _assigned uuid;
begin
  if not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;

  select status, assigned_to into _status, _assigned
    from public.conversations where id = _conversation_id for update;
  if not found then
    raise exception 'NOT_FOUND: المحادثة غير موجودة';
  end if;
  if _status = 'human_support' and _assigned = auth.uid() then
    return;
  end if;

  -- Taking over a conversation that was not in the queue starts a fresh handoff.
  update public.conversations
     set status = 'human_support',
         assigned_to = auth.uid(),
         handoff_requested_at = case when _status = 'human_support' then handoff_requested_at else now() end,
         handoff_reason = case when _status = 'human_support' then handoff_reason end,
         handoff_resolved_at = null,
         unread_count = 0
   where id = _conversation_id;

  perform public.emit_event('conversation.human_takeover', 'conversation', _conversation_id,
    public.handoff_event_payload(_conversation_id));
end; $$;

-- Staff reply. Stored as an outbound human message with status 'pending' and
-- queued as a `message.send` event for n8n to deliver over WhatsApp.
-- Replying to a conversation you have not claimed yet claims it first.
create or replace function public.send_human_reply(_conversation_id uuid, _content text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _text text := btrim(coalesce(_content, ''));
  _status public.conversation_status;
  _assigned uuid;
  _patient uuid;
  _name text;
  _msg uuid;
begin
  if not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;
  if _text = '' then
    raise exception 'EMPTY_MESSAGE: لا يمكن إرسال رسالة فارغة';
  end if;

  select status, assigned_to, patient_id into _status, _assigned, _patient
    from public.conversations where id = _conversation_id;
  if not found then
    raise exception 'NOT_FOUND: المحادثة غير موجودة';
  end if;
  if _status <> 'human_support' or _assigned is null then
    perform public.claim_conversation(_conversation_id);
  end if;

  select full_name into _name from public.profiles where id = auth.uid();

  insert into public.messages
    (conversation_id, patient_id, direction, sender_type, message_type, content, status, metadata)
  values
    (_conversation_id, _patient, 'outbound', 'human', 'text', _text, 'pending',
     jsonb_build_object('sent_by', auth.uid(), 'sent_by_name', coalesce(_name, '')))
  returning id into _msg;

  update public.conversations set unread_count = 0 where id = _conversation_id;

  perform public.emit_event('message.send', 'message', _msg,
    public.handoff_event_payload(_conversation_id)
      || jsonb_build_object('message_id', _msg, 'content', _text, 'sender_type', 'human',
                            'sent_by_name', coalesce(_name, '')));
  return _msg;
end; $$;

-- Hand the conversation back to the AI. Returns false if it was not in handoff.
create or replace function public.release_to_bot(_conversation_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write() then
    raise exception 'FORBIDDEN: لا تملك صلاحية تعديل المحادثات';
  end if;

  update public.conversations
     set status = 'active',
         assigned_to = null,
         handoff_resolved_at = now(),
         unread_count = 0
   where id = _conversation_id and status = 'human_support';
  if not found then
    return false;
  end if;

  perform public.emit_event('conversation.ai_resume', 'conversation', _conversation_id,
    public.handoff_event_payload(_conversation_id));
  return true;
end; $$;

revoke execute on function public.handoff_event_payload(uuid) from public, anon, authenticated;
revoke execute on function public.request_human_handoff(uuid, text) from public, anon;
revoke execute on function public.claim_conversation(uuid) from public, anon;
revoke execute on function public.send_human_reply(uuid, text) from public, anon;
revoke execute on function public.release_to_bot(uuid) from public, anon;
grant execute on function public.request_human_handoff(uuid, text) to authenticated, service_role;
grant execute on function public.claim_conversation(uuid) to authenticated;
grant execute on function public.send_human_reply(uuid, text) to authenticated;
grant execute on function public.release_to_bot(uuid) to authenticated;
grant execute on function public.handoff_event_payload(uuid) to service_role;
