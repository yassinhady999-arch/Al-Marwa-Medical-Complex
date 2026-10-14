// Server-only: AI work the database does itself. The chat-model key saved in
// «تدريب الشات بوت» stays in Supabase, which calls the provider (pg_net); the site
// only starts the request and polls for the outcome, so the hosting needs no secret.
// SQL side: supabase/migrations/20261017120000_chatbot_ai_in_database.sql.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AiError } from "@/lib/ai-key.server";

type Db = SupabaseClient<Database>;
type Outcome = Record<string, unknown>;

/** HTTP status for each error the database reports. */
const STATUS: Record<string, number> = {
  invalid_payload: 400,
  not_found: 404,
  ai_disabled: 403,
  quota_exceeded: 429,
  rate_limited: 429,
  ai_not_configured: 503,
  invalid_api_key: 503,
  invalid_base_url: 503,
  db_http_missing: 503,
  model_unavailable: 502,
  ai_unreachable: 502,
  ai_failed: 502,
};

function failure(code: unknown): AiError {
  const error = typeof code === "string" && code in STATUS ? code : "ai_failed";
  return { error, status: STATUS[error] ?? 502 };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when a key is saved and the database can call its provider. */
export async function databaseAiAvailable(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc("chatbot_ai_available");
  return !error && data === true;
}

/** Polls chatbot_ai_poll until the provider has answered (the database gives up after ~100 s). */
async function waitFor(db: Db, token: string): Promise<Outcome> {
  const until = Date.now() + 110_000;
  for (let i = 0; Date.now() < until; i++) {
    await sleep(i < 10 ? 300 : 700);
    const { data, error } = await db.rpc("chatbot_ai_poll", { _token: token });
    if (error) return { error: "ai_failed" };
    const outcome = (data ?? {}) as Outcome;
    if (outcome["pending"] !== true) return outcome;
  }
  return { error: "ai_unreachable" };
}

/**
 * A customer reply from the clinic's saved chat model. Null when no key is saved (or the
 * SQL for this isn't installed), so the caller can fall back to ANTHROPIC_API_KEY.
 */
export async function askDatabaseAi(
  db: Db,
  slug: string,
  messages: { role: "user" | "assistant"; content: string }[],
  siteUrl: string,
): Promise<{ answer: string } | AiError | null> {
  const { data, error } = await db.rpc("chatbot_ai_ask", {
    _slug: slug,
    _messages: messages,
    _site_url: siteUrl,
  });
  if (error) return null;
  const started = (data ?? {}) as Outcome;
  if (started["error"] === "ai_not_configured") return null;
  if (typeof started["token"] !== "string") return failure(started["error"]);
  const done = await waitFor(db, started["token"]);
  return typeof done["answer"] === "string" ? { answer: done["answer"] } : failure(done["error"]);
}

/** Admin (signed-in client): the provider's raw model list for the saved key. */
export async function fetchSavedModels(
  db: Db,
): Promise<{ provider: string; status: number; body: string } | AiError> {
  const { data, error } = await db.rpc("chatbot_ai_models_start");
  if (error)
    return /NOT_ALLOWED|permission denied/i.test(error.message)
      ? { error: "admin_only", status: 403 }
      : failure("db_http_missing");
  const started = (data ?? {}) as Outcome;
  if (started["error"] === "no_key") return { error: "no_key", status: 400 };
  if (typeof started["token"] !== "string") return failure(started["error"]);
  const done = await waitFor(db, started["token"]);
  if (typeof done["status"] !== "number" || typeof done["body"] !== "string")
    return failure(done["error"]);
  return { provider: String(started["provider"]), status: done["status"], body: done["body"] };
}
