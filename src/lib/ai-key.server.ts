// Server-only: which chat-model provider and key the AI features use. The key an admin
// saved in «تدريب الشات بوت» (chatbot_ai_credentials, readable only with the service
// role) wins; ANTHROPIC_API_KEY from the environment is the fallback.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  AI_PROVIDER_IDS,
  aiProvider,
  customBaseUrlProblem,
  type AiProviderId,
} from "@/lib/ai-providers";

export type AiKeySource = "saved" | "env";
export type AiModelOption = { id: string; name: string; created_at: string };
export type ResolvedAi = {
  provider: AiProviderId;
  key: string;
  /** OpenAI-compatible base URL (null for Anthropic). */
  baseUrl: string | null;
  /** Model ids saved with the key ([] when unknown). */
  models: string[];
  source: AiKeySource;
};
export type AiError = { error: string; status: number };

const CACHE_MS = 60_000;
let cached: { saved: Omit<ResolvedAi, "source"> | null; at: number } | undefined;

function supabaseUrl(): string | undefined {
  return process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
}

export function serviceRoleConfigured(): boolean {
  return !!supabaseUrl() && !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
}

/** Base URL for an OpenAI-compatible provider ("…/v1" without a trailing slash). */
export function providerBaseUrl(provider: AiProviderId, custom: string | null): string | null {
  const url = provider === "custom" ? custom : aiProvider(provider).baseUrl;
  return url ? url.replace(/\/+$/, "") : null;
}

async function readSaved(): Promise<Omit<ResolvedAi, "source"> | null> {
  const url = supabaseUrl();
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return null;
  const opaque = serviceKey.startsWith("sb_secret_");
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        // New-style secret keys are not JWTs and must not go in Authorization.
        if (opaque && headers.get("Authorization") === `Bearer ${serviceKey}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", serviceKey);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await admin
    .from("chatbot_ai_credentials")
    .select("provider, api_key, base_url, models")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return null;
  const provider = (AI_PROVIDER_IDS as string[]).includes(data.provider)
    ? (data.provider as AiProviderId)
    : "anthropic";
  const models = Array.isArray(data.models)
    ? data.models.flatMap((m) =>
        m && typeof m === "object" && !Array.isArray(m) && typeof m["id"] === "string"
          ? [m["id"]]
          : [],
      )
    : [];
  return { provider, key: data.api_key, baseUrl: data.base_url ?? null, models };
}

/** The provider + key saved from the staff page, or null (none saved / server can't read it). */
export async function savedAi(): Promise<Omit<ResolvedAi, "source"> | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.saved;
  const saved = await readSaved();
  cached = { saved, at: Date.now() };
  return saved;
}

/** Call after the saved key changes so this server instance stops using the old one. */
export function forgetSavedAi(): void {
  cached = undefined;
}

/** What the customer chatbot uses: the saved provider/key, else ANTHROPIC_API_KEY. */
export async function resolveAi(): Promise<ResolvedAi | null> {
  const saved = await savedAi();
  if (saved) return { ...saved, source: "saved" };
  const env = process.env["ANTHROPIC_API_KEY"];
  return env ? { provider: "anthropic", key: env, baseUrl: null, models: [], source: "env" } : null;
}

/** An Anthropic key only (the staff assistant uses Anthropic tool calling). */
export async function resolveAnthropicKey(): Promise<string | null> {
  const saved = await savedAi();
  if (saved?.provider === "anthropic") return saved.key;
  return process.env["ANTHROPIC_API_KEY"] ?? null;
}

const clients = new Map<string, Anthropic>();

/** One Anthropic SDK client per key (the key can change while the server runs). */
export function anthropicFor(key: string): Anthropic {
  let client = clients.get(key);
  if (!client) {
    client = new Anthropic({ apiKey: key });
    clients.clear();
    clients.set(key, client);
  }
  return client;
}

/** Maps an HTTP status from a provider to the errors the staff page and the bot know. */
export function providerError(status: number, body = ""): AiError {
  if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(body)))
    return { error: "invalid_api_key", status: 400 };
  if (status === 404) return { error: "model_unavailable", status: 502 };
  if (status === 429) return { error: "rate_limited", status: 429 };
  return { error: "ai_failed", status: 502 };
}

function compatHeaders(provider: AiProviderId, key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "content-type": "application/json",
    // OpenRouter asks apps to identify themselves; harmless elsewhere.
    ...(provider === "openrouter" ? { "X-Title": "Clinic chatbot" } : {}),
  };
}

// Not chat models: embeddings, speech, images, moderation…
const NOT_CHAT =
  /(embed|whisper|tts|transcri|audio|realtime|dall-e|image|imagen|veo|moderation|guard|rerank|aqa|search|computer-use|codex)/i;

/**
 * Checks a key with its provider and returns the chat models it can use, newest first.
 * Listing models costs nothing, so this never spends tokens.
 */
export async function listAiModels(
  provider: AiProviderId,
  key: string,
  customBaseUrl: string | null = null,
): Promise<{ models: AiModelOption[] } | AiError> {
  if (provider === "anthropic") return listAnthropicModels(key);

  if (provider === "custom") {
    if (!customBaseUrl || customBaseUrlProblem(customBaseUrl))
      return { error: "invalid_base_url", status: 400 };
  }
  const base = providerBaseUrl(provider, customBaseUrl);
  if (!base) return { error: "invalid_base_url", status: 400 };
  const headers = compatHeaders(provider, key);
  try {
    // OpenRouter's model list is public, so check the key on its own endpoint first.
    if (provider === "openrouter") {
      const check = await fetch(`${base}/key`, { headers, signal: AbortSignal.timeout(20_000) });
      if (!check.ok) return providerError(check.status, await check.text().catch(() => ""));
    }
    const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    if (!res.ok) return providerError(res.status, text);
    const body = JSON.parse(text) as {
      data?: { id?: unknown; name?: unknown; display_name?: unknown; created?: unknown }[];
    };
    const models: AiModelOption[] = [];
    for (const m of body.data ?? []) {
      if (typeof m.id !== "string") continue;
      // Gemini's OpenAI layer lists "models/gemini-…"; chat calls take the bare name.
      const id = m.id.replace(/^models\//, "");
      if (NOT_CHAT.test(id)) continue;
      if (provider === "openai" && !/^(gpt-|o\d|chatgpt-)/.test(id)) continue;
      if (provider === "gemini" && !/^gemini/.test(id)) continue;
      const name =
        (typeof m.display_name === "string" && m.display_name) ||
        (typeof m.name === "string" && m.name) ||
        id;
      const created = typeof m.created === "number" ? new Date(m.created * 1000).toISOString() : "";
      models.push({ id, name, created_at: created });
      if (models.length >= 500) break;
    }
    models.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    return { models };
  } catch (err) {
    if (err instanceof SyntaxError) return { error: "ai_failed", status: 502 };
    return { error: "ai_unreachable", status: 502 };
  }
}

async function listAnthropicModels(key: string): Promise<{ models: AiModelOption[] } | AiError> {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 });
  try {
    const models: AiModelOption[] = [];
    for await (const m of client.models.list({ limit: 100 })) {
      if (!m.id.startsWith("claude-")) continue;
      models.push({ id: m.id, name: m.display_name || m.id, created_at: m.created_at });
      if (models.length >= 100) break;
    }
    models.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { models };
  } catch (err) {
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      return { error: "invalid_api_key", status: 400 };
    }
    if (err instanceof Anthropic.RateLimitError) return { error: "rate_limited", status: 429 };
    if (err instanceof Anthropic.APIConnectionError)
      return { error: "ai_unreachable", status: 502 };
    if (err instanceof Anthropic.APIError) return { error: "ai_failed", status: 502 };
    throw err;
  }
}

/**
 * One reply from an OpenAI-compatible provider. `system` goes first as a system message.
 * OpenAI's newer models take max_completion_tokens; the others take max_tokens.
 */
export async function compatChat(
  ai: ResolvedAi,
  model: string,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<{ text: string } | AiError> {
  const base = providerBaseUrl(ai.provider, ai.baseUrl);
  if (!base || (ai.provider === "custom" && customBaseUrlProblem(base)))
    return { error: "invalid_base_url", status: 503 };
  const limit = ai.provider === "openai" ? { max_completion_tokens: 4096 } : { max_tokens: 4096 };
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: compatHeaders(ai.provider, ai.key),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        ...limit,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) return providerError(res.status, text);
    const body = JSON.parse(text) as {
      choices?: { message?: { content?: unknown; refusal?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    return { text: typeof content === "string" ? content.trim() : "" };
  } catch (err) {
    if (err instanceof SyntaxError) return { error: "ai_failed", status: 502 };
    return { error: "ai_unreachable", status: 502 };
  }
}
