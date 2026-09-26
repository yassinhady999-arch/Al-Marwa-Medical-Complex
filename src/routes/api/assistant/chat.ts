import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getAdmin, json } from "@/lib/n8n.server";
import { answerAssistantQuestion, type ChatMessage } from "@/lib/assistant.server";

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return json({ error: "unauthorized" }, 401);

        const raw = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.issues }, 400);
        }

        let admin;
        try {
          admin = await getAdmin();
        } catch {
          return json({ error: "supabase_not_configured" }, 503);
        }

        const { data: userData, error: authError } = await admin.auth.getUser(token);
        if (authError || !userData.user) return json({ error: "unauthorized" }, 401);

        const result = await answerAssistantQuestion(
          admin,
          parsed.data.question,
          (parsed.data.history ?? []) as ChatMessage[],
        );

        if ("error" in result) return json({ error: result.error }, result.status);
        return json({ answer: result.answer });
      },
    },
  },
});
