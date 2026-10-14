import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/n8n.server";
import { userSupabase } from "@/lib/public-supabase.server";
import { forgetSavedAi, listAiModels, savedAi, serviceRoleConfigured } from "@/lib/ai-key.server";
import { AI_PROVIDER_IDS, customBaseUrlProblem } from "@/lib/ai-providers";

const postSchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS).optional(),
  /** A new key to check; without it the saved key's model list is refreshed. */
  key: z.string().trim().min(8).max(400).regex(/^\S+$/).optional(),
  base_url: z.string().trim().max(300).optional(),
});

/** The signed-in staff member behind the request, or a JSON error response. */
async function staffFrom(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "unauthorized" }, 401) };
  let supabase;
  try {
    supabase = userSupabase(token);
  } catch {
    return { error: json({ error: "supabase_not_configured" }, 503) };
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: "unauthorized" }, 401) };
  return { supabase };
}

// Staff-only: the AI key status for «تدريب الشات بوت», and checking a key with its provider.
// The key itself is never sent back to the browser.
export const Route = createFileRoute("/api/chatbot-ai")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const staff = await staffFrom(request);
        if ("error" in staff) return staff.error;
        const { data: info } = await staff.supabase.rpc("get_chatbot_ai_key_info");
        const saved = (info as { has_key?: boolean } | null)?.has_key === true;
        const serverReadsSaved = saved && (await savedAi()) !== null;
        const envKey = !!process.env["ANTHROPIC_API_KEY"];
        return json({
          info,
          env_key: envKey,
          service_role: serviceRoleConfigured(),
          server_reads_saved: serverReadsSaved,
          active_source: serverReadsSaved ? "saved" : envKey ? "env" : null,
        });
      },

      POST: async ({ request }) => {
        const staff = await staffFrom(request);
        if ("error" in staff) return staff.error;
        const { data: isAdmin } = await staff.supabase.rpc("is_admin");
        if (!isAdmin) return json({ error: "admin_only" }, 403);

        const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return json({ error: "invalid_key_format" }, 400);
        const body = parsed.data;

        let provider = body.provider ?? "anthropic";
        let key = body.key;
        let baseUrl = body.base_url || null;
        if (key) {
          if (provider === "anthropic" && !key.startsWith("sk-ant-"))
            return json({ error: "invalid_key_format" }, 400);
          if (provider === "custom" && (!baseUrl || customBaseUrlProblem(baseUrl)))
            return json({ error: "invalid_base_url" }, 400);
          forgetSavedAi();
        } else {
          // Refresh: re-check the saved key with its own provider.
          const saved = await savedAi();
          if (saved) {
            provider = saved.provider;
            key = saved.key;
            baseUrl = saved.baseUrl;
          } else if (process.env["ANTHROPIC_API_KEY"]) {
            provider = "anthropic";
            key = process.env["ANTHROPIC_API_KEY"];
          } else {
            return json({ error: "no_key" }, 400);
          }
        }
        const result = await listAiModels(provider, key, baseUrl);
        if ("error" in result) return json({ error: result.error }, result.status);
        return json({ provider, models: result.models });
      },
    },
  },
});
