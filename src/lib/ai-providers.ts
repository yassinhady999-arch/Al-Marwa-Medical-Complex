// Chat-model providers the customer chatbot can use. Anthropic has its own API; every
// other provider here speaks the OpenAI-compatible API (/models, /chat/completions),
// so one client covers them all, plus any custom OpenAI-compatible endpoint.

export type AiProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "groq"
  | "mistral"
  | "openrouter"
  | "xai"
  | "custom";

export type AiProvider = {
  id: AiProviderId;
  label: string;
  /** Where to create a key. */
  keysUrl: string | null;
  /** Shown in the key field. */
  keyPlaceholder: string;
  /** OpenAI-compatible base URL (null for Anthropic, and for custom where the admin types it). */
  baseUrl: string | null;
  /** Models to pick by default when the account has them, best first. */
  preferred: string[];
};

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-api03-…",
    baseUrl: null,
    preferred: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"],
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    keysUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-…",
    baseUrl: "https://api.openai.com/v1",
    preferred: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    keysUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIza…",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    preferred: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keysUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-…",
    baseUrl: "https://api.deepseek.com",
    preferred: ["deepseek-chat"],
  },
  {
    id: "groq",
    label: "Groq",
    keysUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_…",
    baseUrl: "https://api.groq.com/openai/v1",
    preferred: ["llama-3.3-70b-versatile"],
  },
  {
    id: "mistral",
    label: "Mistral",
    keysUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "…",
    baseUrl: "https://api.mistral.ai/v1",
    preferred: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
  },
  {
    id: "openrouter",
    label: "OpenRouter (مئات النماذج بمفتاح واحد)",
    keysUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-…",
    baseUrl: "https://openrouter.ai/api/v1",
    preferred: ["openai/gpt-5", "google/gemini-2.5-flash"],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    keysUrl: "https://console.x.ai",
    keyPlaceholder: "xai-…",
    baseUrl: "https://api.x.ai/v1",
    preferred: ["grok-4", "grok-3"],
  },
  {
    id: "custom",
    label: "مزود آخر متوافق مع OpenAI (رابط مخصص)",
    keysUrl: null,
    keyPlaceholder: "المفتاح",
    baseUrl: null,
    preferred: [],
  },
];

export const AI_PROVIDER_IDS = AI_PROVIDERS.map((p) => p.id) as [AiProviderId, ...AiProviderId[]];

export function aiProvider(id: string | null | undefined): AiProvider {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]!;
}

/** A model id safe to store and send (provider ids include "/", ":" and "@"). */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,150}$/;

/** The provider's preferred model if the account has it, else the first listed. */
export function defaultModel(provider: AiProviderId, models: { id: string }[]): string | null {
  const ids = new Set(models.map((m) => m.id));
  return aiProvider(provider).preferred.find((id) => ids.has(id)) ?? models[0]?.id ?? null;
}

/**
 * A custom endpoint must be public HTTPS: no localhost or private-network address,
 * so the server can't be pointed at itself or the hosting network.
 */
export function customBaseUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "الرابط غير صحيح";
  }
  if (url.protocol !== "https:") return "يجب أن يبدأ الرابط بـ https://";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^(fc|fd|fe80)/.test(host);
  return privateHost ? "لا يُسمح بعناوين الشبكة الداخلية" : null;
}
