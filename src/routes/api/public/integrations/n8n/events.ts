import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkApiKey, getAdmin, json } from "@/lib/n8n.server";

const ackSchema = z.object({
  event_ids: z.array(z.string().uuid()).min(1),
  status: z.enum(["delivered", "failed"]).default("delivered"),
  error_message: z.string().optional(),
});

export const Route = createFileRoute("/api/public/integrations/n8n/events")({
  server: {
    handlers: {
      // Pull pending outbound events (appointment created/updated, reminders…)
      GET: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
        const admin = await getAdmin();

        const { data, error } = await admin
          .from("integration_events")
          .select("id, event_type, entity_type, entity_id, payload, attempts, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) return json({ error: error.message }, 400);

        return json({ ok: true, count: (data ?? []).length, events: data ?? [] });
      },

      // Acknowledge processed events
      POST: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const raw = await request.json().catch(() => null);
        const parsed = ackSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.issues }, 400);
        }
        const { event_ids, status, error_message } = parsed.data;
        const admin = await getAdmin();

        const { data, error } = await admin
          .from("integration_events")
          .update({
            status,
            processed_at: new Date().toISOString(),
            error_message: error_message ?? null,
          })
          .in("id", event_ids)
          .select("id, event_type, entity_id");
        if (error) return json({ error: error.message }, 400);

        // Staff replies queued as `message.send` show their delivery state in the inbox.
        const sentMessageIds = (data ?? [])
          .filter((e) => e.event_type === "message.send" && e.entity_id)
          .map((e) => e.entity_id as string);
        if (sentMessageIds.length > 0) {
          await admin
            .from("messages")
            .update({ status: status === "delivered" ? "sent" : "failed" })
            .in("id", sentMessageIds);
        }

        return json({ ok: true, updated: (data ?? []).length });
      },
    },
  },
});
