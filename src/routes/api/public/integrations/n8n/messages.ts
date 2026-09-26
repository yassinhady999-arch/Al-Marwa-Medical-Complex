import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  detectHumanRequest,
  getAdmin,
  getConversationState,
  json,
  logAutomation,
  requestHandoff,
} from "@/lib/n8n.server";

const schema = z.object({
  external_conversation_id: z.string().min(3),
  external_message_id: z.string().optional(),
  phone: z.string().min(6),
  full_name: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  sender_type: z.enum(["patient", "ai", "human", "system"]).default("patient"),
  message_type: z
    .enum(["text", "image", "audio", "document", "location", "interactive"])
    .default("text"),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.string().optional(),
  /** Set by the AI/n8n when the patient needs a staff member — pauses the bot. */
  request_human: z.boolean().optional(),
  handoff_reason: z.string().max(500).optional(),
});

export const Route = createFileRoute("/api/public/integrations/n8n/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const raw = await request.json().catch(() => null);
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.issues }, 400);
        }
        const body = parsed.data;
        const admin = await getAdmin();

        if (body.external_message_id) {
          const { data: dupe } = await admin
            .from("messages")
            .select("id, conversation_id")
            .eq("external_message_id", body.external_message_id)
            .maybeSingle();
          if (dupe) {
            const conversation = await getConversationState(admin, dupe.conversation_id);
            return json({ ok: true, duplicate: true, message: dupe, conversation });
          }
        }

        const { data: normalized, error: phoneErr } = await admin.rpc("normalize_sa_phone", {
          p: body.phone,
        });
        if (phoneErr) return json({ error: phoneErr.message }, 400);

        const { data: foundPatient } = await admin
          .from("patients")
          .select("id")
          .eq("normalized_phone", normalized as string)
          .maybeSingle();

        let patientId = foundPatient?.id ?? null;
        if (!patientId) {
          const { data: createdPatient } = await admin
            .from("patients")
            .insert({
              full_name: body.full_name?.trim() || `مريض ${body.phone}`,
              phone: body.phone,
              normalized_phone: "",
              source: "whatsapp",
            })
            .select("id")
            .single();
          patientId = createdPatient?.id ?? null;
        }

        const { data: conv } = await admin
          .from("conversations")
          .select("id")
          .eq("external_conversation_id", body.external_conversation_id)
          .maybeSingle();

        let conversationId = conv?.id;
        if (!conversationId) {
          const { data: createdConv, error: convErr } = await admin
            .from("conversations")
            .insert({
              external_conversation_id: body.external_conversation_id,
              patient_id: patientId,
              channel: "whatsapp",
            })
            .select("id")
            .single();
          if (convErr || !createdConv) {
            return json({ error: convErr?.message ?? "conversation_failed" }, 400);
          }
          conversationId = createdConv.id;
        }

        const { data: message, error } = await admin
          .from("messages")
          .insert({
            conversation_id: conversationId,
            patient_id: patientId,
            direction: body.direction,
            sender_type: body.sender_type,
            message_type: body.message_type,
            content: body.content ?? null,
            external_message_id: body.external_message_id ?? null,
            metadata: (body.metadata ?? {}) as never,
            ...(body.status ? { status: body.status } : {}),
          })
          .select("id, conversation_id, created_at")
          .single();

        if (error) {
          await logAutomation(admin, {
            workflow_name: "n8n.messages.ingest",
            event_type: "message.received",
            status: "failed",
            request_payload: body,
            error_message: error.message,
            patient_id: patientId,
          });
          return json({ error: error.message }, 400);
        }

        await admin
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: (body.content ?? "").slice(0, 160) || null,
            ...(patientId ? { patient_id: patientId } : {}),
          })
          .eq("id", conversationId);

        await logAutomation(admin, {
          workflow_name: "n8n.messages.ingest",
          event_type: `message.${body.direction}`,
          status: "success",
          request_payload: body,
          response_payload: message,
          patient_id: patientId,
        });

        const patientAsked =
          body.direction === "inbound" &&
          body.sender_type === "patient" &&
          detectHumanRequest(body.content);
        if (body.request_human || patientAsked) {
          const reason =
            body.handoff_reason?.trim() ||
            (patientAsked ? (body.content ?? "").slice(0, 200) : null);
          // A failed handoff is logged by requestHandoff and must not fail the ingest.
          await requestHandoff(
            admin,
            conversationId,
            reason,
            body.request_human ? "n8n" : "keyword",
            patientId,
          ).catch(() => false);
        }

        // n8n checks `conversation.bot_active` before letting the AI reply.
        const conversation = await getConversationState(admin, conversationId);
        return json({ ok: true, duplicate: false, message, conversation });
      },
    },
  },
});
