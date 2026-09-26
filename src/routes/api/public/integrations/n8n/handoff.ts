import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getAdmin,
  getConversationState,
  json,
  requestHandoff,
  type Admin,
} from "@/lib/n8n.server";

const target = {
  conversation_id: z.string().uuid().optional(),
  external_conversation_id: z.string().min(3).optional(),
};

const requestSchema = z
  .object({ ...target, reason: z.string().max(500).optional() })
  .refine((b) => b.conversation_id || b.external_conversation_id, {
    message: "conversation_id or external_conversation_id is required",
  });

async function findConversation(
  admin: Admin,
  ref: { conversation_id?: string | undefined; external_conversation_id?: string | undefined },
): Promise<{ id: string; patient_id: string | null } | null> {
  let q = admin.from("conversations").select("id, patient_id");
  q = ref.conversation_id
    ? q.eq("id", ref.conversation_id)
    : q.eq("external_conversation_id", ref.external_conversation_id ?? "");
  const { data } = await q.maybeSingle();
  return data;
}

export const Route = createFileRoute("/api/public/integrations/n8n/handoff")({
  server: {
    handlers: {
      // Is the bot allowed to answer this conversation right now?
      GET: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const ref = {
          conversation_id: url.searchParams.get("conversation_id") ?? undefined,
          external_conversation_id: url.searchParams.get("external_conversation_id") ?? undefined,
        };
        if (!ref.conversation_id && !ref.external_conversation_id) {
          return json({ error: "conversation_id or external_conversation_id is required" }, 400);
        }
        const admin = await getAdmin();
        const conv = await findConversation(admin, ref);
        if (!conv) return json({ error: "conversation_not_found" }, 404);

        return json({ ok: true, conversation: await getConversationState(admin, conv.id) });
      },

      // The AI hands the conversation to a human (pauses the bot until staff return it).
      POST: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const raw = await request.json().catch(() => null);
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.issues }, 400);
        }
        const admin = await getAdmin();
        const conv = await findConversation(admin, parsed.data);
        if (!conv) return json({ error: "conversation_not_found" }, 404);

        try {
          const queued = await requestHandoff(
            admin,
            conv.id,
            parsed.data.reason?.trim() || null,
            "n8n",
            conv.patient_id,
          );
          return json({
            ok: true,
            queued,
            conversation: await getConversationState(admin, conv.id),
          });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      },
    },
  },
});
