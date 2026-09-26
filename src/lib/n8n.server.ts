// Server-only helpers for the n8n integration endpoints.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Admin = SupabaseClient<Database>;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns null when authorized, or a 401 Response when not. */
export function checkApiKey(request: Request): Response | null {
  const expected = process.env["N8N_API_KEY"];
  if (!expected) return json({ error: "integration_not_configured" }, 503);
  const provided =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function getAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

export async function logAutomation(
  admin: Admin,
  entry: {
    workflow_name: string;
    event_type?: string | null;
    status: string;
    request_payload?: unknown;
    response_payload?: unknown;
    error_message?: string | null;
    appointment_id?: string | null;
    patient_id?: string | null;
  },
) {
  await admin.from("automation_logs").insert({
    workflow_name: entry.workflow_name,
    event_type: entry.event_type ?? null,
    status: entry.status,
    request_payload: (entry.request_payload ?? null) as never,
    response_payload: (entry.response_payload ?? null) as never,
    error_message: entry.error_message ?? null,
    appointment_id: entry.appointment_id ?? null,
    patient_id: entry.patient_id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Human handoff (التدخل البشري)
// ---------------------------------------------------------------------------

/** What n8n needs to know about a conversation before letting the AI reply. */
export type ConversationState = {
  id: string;
  status: string;
  /** false while a human owns the conversation — the AI must not reply. */
  bot_active: boolean;
  assigned_to: string | null;
  handoff_reason: string | null;
  handoff_requested_at: string | null;
};

export async function getConversationState(
  admin: Admin,
  conversationId: string,
): Promise<ConversationState | null> {
  const { data } = await admin
    .from("conversations")
    .select("id, status, assigned_to, handoff_reason, handoff_requested_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, bot_active: data.status !== "human_support" };
}

/**
 * Moves the conversation into the handoff queue (pauses the AI).
 * Returns true when it was newly queued, false when a human already had it.
 */
export async function requestHandoff(
  admin: Admin,
  conversationId: string,
  reason: string | null,
  source: string,
  patientId: string | null = null,
): Promise<boolean> {
  const { data, error } = await admin.rpc("request_human_handoff", {
    _conversation_id: conversationId,
    ...(reason ? { _reason: reason } : {}),
  });
  await logAutomation(admin, {
    workflow_name: "n8n.handoff.request",
    event_type: "conversation.handoff_requested",
    status: error ? "failed" : "success",
    request_payload: { conversation_id: conversationId, reason, source },
    response_payload: { queued: data ?? null },
    error_message: error?.message ?? null,
    patient_id: patientId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Strips tashkeel/tatweel and unifies alef, yaa and taa-marbuta forms. */
function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

const HUMAN_TARGET =
  /(موظف|خدمه العملاء|شخص حقيقي|انسان|الاستقبال|human|agent|representative|real person|customer service)/;
const SPEAK_VERB =
  /(اكلم|تكلم|تحدث|تواصل|احكي|كلمني|كلموني|يكلمني|يكلموني|يرد علي|حولني|حولوني|تحويل|talk|speak|connect|transfer)/;
const BARE_REQUEST =
  /^(?:(?:ابي|ابغي|ابغا|اريد|ودي|بدي|ممكن|لو سمحت|من فضلك) )*(?:ال)?(?:موظف(?:ه|ين)?|خدمه العملاء|انسان|شخص حقيقي|human|agent|representative)(?: (?:لو سمحت|من فضلك|ضروري|بسرعه|please|pls))*[ !؟?.]*$/;

/**
 * Safety net for patients who explicitly ask for a person ("أبي أكلم موظف", "موظف لو سمحت").
 * Deliberately narrow — a false positive silences the bot — so broader intent
 * (complaints, billing problems…) is left to the AI, which flags it via
 * `request_human` or POST /handoff.
 */
export function detectHumanRequest(text: string | null | undefined): boolean {
  const t = normalizeArabic(text ?? "");
  if (!t) return false;
  return (HUMAN_TARGET.test(t) && SPEAK_VERB.test(t)) || BARE_REQUEST.test(t);
}

export function addMinutes(time: string, minutes: number): string {
  const [h = "0", m = "0"] = time.split(":");
  const total = Number(h) * 60 + Number(m) + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}
