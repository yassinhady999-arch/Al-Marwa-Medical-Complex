import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/n8n.server";
import { parsePublicChatbot } from "@/lib/chatbot";
import { answerCustomer, chatbotAiConfigured, type CustomerMessage } from "@/lib/chatbot.server";
import { askDatabaseAi } from "@/lib/ai-database.server";
import { getPublicSupabase } from "@/lib/public-supabase.server";

type PublicSupabase = ReturnType<typeof getPublicSupabase>;

const bodySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{6,64}$/i),
  session_id: z.string().max(64).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1500),
      }),
    )
    .min(1)
    .max(16),
});

/** The API wants user-first, alternating turns; the widget's transcript starts with the bot. */
function toTurns(messages: CustomerMessage[]): CustomerMessage[] {
  const turns: CustomerMessage[] = [];
  for (const m of messages) {
    if (turns.length === 0 && m.role === "assistant") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else turns.push({ ...m });
  }
  return turns;
}

/** The reply from ANTHROPIC_API_KEY on the hosting (when no key is saved in the database). */
async function answerWithHostKey(
  supabase: PublicSupabase,
  slug: string,
  turns: CustomerMessage[],
  origin: string,
): Promise<{ answer: string } | { error: string; status: number }> {
  if (!process.env["ANTHROPIC_API_KEY"]) return { error: "ai_not_configured", status: 503 };

  // Counts against today's cap before spending anything on the model.
  const { data: quota, error: quotaError } = await supabase.rpc("consume_chatbot_ai_quota", {
    _slug: slug,
  });
  if (quotaError) return { error: "bot_unavailable", status: 502 };
  const q = (quota ?? {}) as {
    allowed?: boolean;
    reason?: string;
    model?: string;
    instructions?: string;
  };
  if (!q.allowed) {
    return {
      error: q.reason ?? "bot_unavailable",
      status: q.reason === "quota_exceeded" ? 429 : 403,
    };
  }

  const { data: botJson, error: botError } = await supabase.rpc("get_public_chatbot", {
    _slug: slug,
  });
  const bot = botError ? null : parsePublicChatbot(botJson);
  if (!bot) return { error: "bot_unavailable", status: 404 };

  return answerCustomer(
    bot,
    { model: q.model ?? "", instructions: q.instructions ?? "" },
    turns,
    bot.booking_slug ? `${origin}/book/${bot.booking_slug}` : null,
  );
}

function publicSupabaseOrNull(): PublicSupabase | null {
  try {
    return getPublicSupabase();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/chatbot")({
  server: {
    handlers: {
      // Lets the staff page show whether AI answers are switched on.
      GET: async () => json({ ai_configured: await chatbotAiConfigured(publicSupabaseOrNull()) }),

      POST: async ({ request }) => {
        const raw = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "invalid_payload" }, 400);
        const { slug, session_id, messages } = parsed.data;

        const turns = toTurns(messages);
        const question = turns[turns.length - 1];
        if (!question || question.role !== "user") return json({ error: "invalid_payload" }, 400);

        const supabase = publicSupabaseOrNull();
        if (!supabase) return json({ error: "supabase_not_configured" }, 503);

        // The key saved in «تدريب الشات بوت»: the database asks the provider itself.
        const origin = new URL(request.url).origin;
        const result =
          (await askDatabaseAi(supabase, slug, turns, origin)) ??
          (await answerWithHostKey(supabase, slug, turns, origin));
        if ("error" in result) return json({ error: result.error }, result.status);

        await supabase.rpc("log_chatbot_exchange", {
          _slug: slug,
          _session: session_id ?? "",
          _question: question.content,
          _answer: result.answer,
          _source: "ai",
        });
        return json({ answer: result.answer });
      },
    },
  },
});
