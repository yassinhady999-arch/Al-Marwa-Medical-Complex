import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CircleCheck,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isPreviewMode } from "@/integrations/supabase/mock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfile } from "@/hooks/use-auth";
import { AI_MODELS } from "@/lib/chatbot";
import {
  AI_PROVIDERS,
  aiProvider,
  customBaseUrlProblem,
  defaultModel,
  type AiProviderId,
} from "@/lib/ai-providers";
import { cn } from "@/lib/utils";
import { dbErrorMessage, formatDateTime } from "@/lib/clinic";

type ModelOption = { id: string; name: string; created_at?: string | null };
type KeyInfo = {
  has_key: boolean;
  key_hint?: string;
  models: ModelOption[];
  verified_at?: string;
  provider?: AiProviderId;
  base_url?: string | null;
};
type KeyStatus = {
  info: KeyInfo | null;
  env_key: boolean;
  service_role: boolean;
  server_reads_saved: boolean;
  active_source: "saved" | "env" | null;
};

const HINTS: Record<string, string> = Object.fromEntries(AI_MODELS.map((m) => [m.id, m.hint]));
const SEARCH_FROM = 12;

const ERRORS: Record<string, string> = {
  invalid_api_key: "المفتاح غير صحيح أو غير مفعّل لدى المزود المختار.",
  invalid_key_format: "صيغة المفتاح غير صحيحة لهذا المزود.",
  invalid_base_url: "رابط الخدمة غير صحيح، يجب أن يكون https:// وعنوانًا عامًا.",
  admin_only: "حفظ المفتاح متاح للمدير فقط.",
  no_key: "لا يوجد مفتاح محفوظ، أضف المفتاح أولًا.",
  ai_unreachable: "تعذّر الاتصال بالمزود، تأكد من الرابط وحاول مرة أخرى.",
  ai_failed: "رد المزود بخطأ، تأكد من المفتاح والرابط.",
  rate_limited: "طلبات كثيرة على المزود الآن، حاول بعد قليل.",
  unauthorized: "انتهت الجلسة، سجّل الدخول مرة أخرى.",
  supabase_not_configured: "إعدادات الاتصال بقاعدة البيانات غير مكتملة على الخادم.",
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchStatus(): Promise<KeyStatus> {
  if (isPreviewMode()) {
    const { data } = await supabase.rpc("get_chatbot_ai_key_info");
    const info = data as KeyInfo | null;
    return {
      info,
      env_key: false,
      service_role: true,
      server_reads_saved: !!info?.has_key,
      active_source: info?.has_key ? "saved" : null,
    };
  }
  const res = await fetch("/api/chatbot-ai", { headers: await authHeaders() });
  const body = (await res.json().catch(() => ({}))) as Partial<KeyStatus> & { error?: string };
  if (!res.ok) throw new Error(ERRORS[body.error ?? ""] ?? "تعذّر قراءة حالة المفتاح");
  return body as KeyStatus;
}

/** Sample lists for the local preview, which has no server to ask the provider. */
const PREVIEW_MODELS: Partial<Record<AiProviderId, string[]>> = {
  openai: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

/** Checks a key with its provider (or refreshes the saved one); returns the account's models. */
async function checkKey(
  provider: AiProviderId,
  key?: string,
  baseUrl?: string,
): Promise<ModelOption[]> {
  if (isPreviewMode()) {
    if (provider === "anthropic")
      return AI_MODELS.map((m, i) => ({
        id: m.id,
        name: m.label,
        created_at: `2026-0${9 - i}-01T00:00:00Z`,
      }));
    return (PREVIEW_MODELS[provider] ?? ["model-large", "model-small"]).map((id) => ({
      id,
      name: id,
    }));
  }
  const res = await fetch("/api/chatbot-ai", {
    method: "POST",
    headers: { ...(await authHeaders()), "content-type": "application/json" },
    body: JSON.stringify(key ? { provider, key, base_url: baseUrl || undefined } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as { models?: ModelOption[]; error?: string };
  if (!res.ok) throw new Error(ERRORS[body.error ?? ""] ?? "تعذّر التحقق من المفتاح");
  return body.models ?? [];
}

/**
 * «مفتاح الذكاء الاصطناعي»: an admin picks the chat-model provider and pastes its key, the
 * site checks it and lists the models the account can use, and the bot answers with the
 * one picked here.
 */
export function AiKeyCard({
  model,
  onModelChange,
}: {
  model: string;
  onModelChange: (model: string) => void;
}) {
  const uid = useId();
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const isAdmin = !!me?.isAdmin;

  const status = useQuery({ queryKey: ["chatbot", "ai-key"], queryFn: fetchStatus });
  const info = status.data?.info ?? null;
  const savedProvider: AiProviderId = info?.has_key ? (info.provider ?? "anthropic") : "anthropic";

  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [query, setQuery] = useState("");
  const chosen = provider ?? savedProvider;
  const meta = aiProvider(chosen);

  const refreshStatus = () => {
    void qc.invalidateQueries({ queryKey: ["chatbot", "ai-key"] });
    void qc.invalidateQueries({ queryKey: ["chatbot", "ai-status"] });
    // Saving a key can move the bot to a model the new account has (done in the database).
    void qc.invalidateQueries({ queryKey: ["chatbot", "settings"] });
  };

  // Keep the page's model in step with what the new account offers.
  const pickFrom = (p: AiProviderId, models: ModelOption[]) => {
    if (models.length === 0 || models.some((m) => m.id === model)) return;
    const next = defaultModel(p, models);
    if (next) onModelChange(next);
  };

  const urlProblem = chosen === "custom" ? customBaseUrlProblem(baseUrl || " ") : null;
  const keyOk =
    key.trim().length >= 8 &&
    !/\s/.test(key.trim()) &&
    (chosen !== "anthropic" || key.trim().startsWith("sk-ant-"));

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = key.trim();
      const models = await checkKey(chosen, trimmed, baseUrl.trim());
      const { error } = await supabase.rpc("set_chatbot_ai_key", {
        _provider: chosen,
        _key: trimmed,
        _models: models,
        _base_url: chosen === "custom" ? baseUrl.trim() : null,
        _default_model: defaultModel(chosen, models),
      });
      if (error) throw new Error(dbErrorMessage(error));
      return models;
    },
    onSuccess: (models) => {
      setKey("");
      setProvider(null);
      refreshStatus();
      pickFrom(chosen, models);
      toast.success(`تم التحقق من المفتاح وحفظه ✅ ${models.length} نموذج متاح لحسابك`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const models = await checkKey(savedProvider);
      const { error } = await supabase.rpc("set_chatbot_ai_models", {
        _models: models,
        _default_model: defaultModel(savedProvider, models),
      });
      if (error) throw new Error(dbErrorMessage(error));
      return models;
    },
    onSuccess: (models) => {
      refreshStatus();
      pickFrom(savedProvider, models);
      toast.success("تم تحديث قائمة النماذج");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("clear_chatbot_ai_key");
      if (error) throw new Error(dbErrorMessage(error));
    },
    onSuccess: () => {
      refreshStatus();
      toast.success("تم حذف المفتاح");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savedModels = info?.has_key ? (info.models ?? []) : [];
  const options: ModelOption[] = savedModels.length
    ? [...savedModels]
    : AI_MODELS.map((m) => ({ id: m.id, name: m.label }));
  if (model && !options.some((m) => m.id === model)) {
    options.push({ id: model, name: `${model} (غير موجود في قائمة حسابك)` });
  }
  const recommended = defaultModel(savedModels.length ? savedProvider : "anthropic", options);
  const q = query.trim().toLowerCase();
  const visible = q
    ? options.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    : options;
  const busy = save.isPending || refresh.isPending || remove.isPending;

  return (
    <div className="space-y-4">
      <StatusBanner status={status.data} loading={status.isLoading} error={status.error} />

      <div className="space-y-3 rounded-xl border border-border bg-surface-2/50 p-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-provider`}>مزود الشات موديل</Label>
          <Select
            value={chosen}
            onValueChange={(v) => setProvider(v as AiProviderId)}
            disabled={!isAdmin || busy}
          >
            <SelectTrigger id={`${uid}-provider`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {chosen === "custom" && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-url`}>رابط الخدمة (Base URL)</Label>
            <Input
              id={`${uid}-url`}
              dir="ltr"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              disabled={!isAdmin || busy}
              className="font-mono text-sm"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              أي خدمة متوافقة مع OpenAI API (فيها ‎/models و ‎/chat/completions).
              {baseUrl && urlProblem ? ` — ${urlProblem}` : ""}
            </p>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-key`} className="flex items-center gap-1.5">
            <KeyRound className="size-4 text-muted-foreground" />
            {info?.has_key ? "مفتاح API جديد (يحل محل المحفوظ)" : "مفتاح API"}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${uid}-key`}
              type="password"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder={meta.keyPlaceholder}
              value={key}
              disabled={!isAdmin || busy}
              className="min-w-0 flex-1 font-mono text-sm"
              onChange={(e) => setKey(e.target.value)}
            />
            <Button
              type="button"
              disabled={!isAdmin || busy || !keyOk || !!urlProblem}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
              تحقق واحفظ
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? "يُحفظ المفتاح في مكان محمي على الخادم ولا يظهر لأحد بعد الحفظ. نتحقق منه مع المزود ونعرض النماذج المتاحة لحسابك."
              : "إضافة المفتاح أو تغييره متاحة للمدير فقط."}{" "}
            {meta.keysUrl && (
              <a
                href={meta.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary-emphasis underline-offset-2 hover:underline"
              >
                احصل على مفتاح من {meta.label.replace(/\s*\(.*\)$/, "")}
                <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>

        {isAdmin && info?.has_key && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => refresh.mutate()}
            >
              <RefreshCw className={cn(refresh.isPending && "animate-spin")} />
              تحديث قائمة النماذج
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm("حذف مفتاح الذكاء الاصطناعي؟ سيتوقف الرد بالذكاء الاصطناعي.")) {
                  remove.mutate();
                }
              }}
            >
              <Trash2 />
              حذف المفتاح
            </Button>
          </div>
        )}
      </div>

      <div role="group" aria-labelledby={`${uid}-models`} className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p id={`${uid}-models`} className="text-sm font-medium text-foreground">
            النموذج المستخدم في الرد
          </p>
          <p className="text-[11px] text-muted-foreground">
            {savedModels.length
              ? `${savedModels.length} نموذج متاح لحسابك لدى ${aiProvider(savedProvider).label}`
              : "أضف المفتاح لعرض النماذج المتاحة لحسابك"}
          </p>
        </div>
        {options.length > SEARCH_FROM && (
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="ابحث في النماذج"
              placeholder="ابحث عن نموذج…"
              value={query}
              className="ps-9"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <RadioGroup
          value={model}
          onValueChange={onModelChange}
          className="max-h-80 gap-0 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border"
        >
          {visible.length === 0 && (
            <p className="p-3 text-center text-xs text-muted-foreground">
              لا يوجد نموذج بهذا الاسم
            </p>
          )}
          {visible.map((m) => {
            const id = `${uid}-m-${m.id}`;
            const selected = m.id === model;
            return (
              <label
                key={m.id}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50",
                  selected && "bg-primary/10",
                )}
              >
                <RadioGroupItem id={id} value={m.id} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                    {m.name}
                    {m.id === recommended && (
                      <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary-emphasis">
                        موصى به
                      </span>
                    )}
                  </span>
                  {m.name !== m.id && (
                    <span className="block font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {m.id}
                    </span>
                  )}
                  {HINTS[m.id] && (
                    <span className="block text-xs text-muted-foreground">{HINTS[m.id]}</span>
                  )}
                </span>
              </label>
            );
          })}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          اضغط «حفظ التغييرات» أعلى الصفحة لتطبيق النموذج المختار.
        </p>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  loading,
  error,
}: {
  status: KeyStatus | undefined;
  loading: boolean;
  error: Error | null;
}) {
  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        جارٍ التحقق من حالة المفتاح…
      </p>
    );
  if (error || !status)
    return (
      <Banner tone="warning" title="تعذّر قراءة حالة المفتاح">
        {error?.message}
      </Banner>
    );
  const info = status.info;
  if (status.active_source === "saved")
    return (
      <Banner
        tone="success"
        title={`الذكاء الاصطناعي مفعّل عن طريق ${aiProvider(info?.provider).label}`}
      >
        <span dir="ltr" className="font-mono">
          {info?.key_hint}
        </span>
        {info?.verified_at ? ` · آخر تحقق ${formatDateTime(info.verified_at)}` : ""}
      </Banner>
    );
  if (info?.has_key)
    return (
      <Banner tone="warning" title="المفتاح محفوظ، لكن الخادم لا يستطيع قراءته بعد">
        أضف مرة واحدة في إعدادات الاستضافة (Vercel ← Settings ← Environment Variables) المتغير{" "}
        <code dir="ltr" className="rounded bg-surface/60 px-1 font-mono">
          SUPABASE_SERVICE_ROLE_KEY
        </code>{" "}
        وقيمته من Supabase ← Project Settings ← API Keys ← service_role، ثم أعد النشر (Redeploy).
        {status.env_key
          ? " حتى ذلك الحين يُستخدم المفتاح الموجود في ANTHROPIC_API_KEY."
          : " حتى ذلك الحين يرد البوت من «الأسئلة والأجوبة» فقط."}
      </Banner>
    );
  if (status.active_source === "env")
    return (
      <Banner tone="success" title="الذكاء الاصطناعي مفعّل بمفتاح Anthropic من إعدادات الاستضافة">
        يُستخدم ANTHROPIC_API_KEY. يمكنك حفظ مفتاح من أي مزود هنا ليحل محله.
      </Banner>
    );
  return (
    <Banner tone="warning" title="لم يُضف مفتاح الذكاء الاصطناعي بعد">
      اختر المزود وأضف مفتاح API بالأسفل. حتى ذلك الحين يرد البوت على الأسئلة المكتوبة من «الأسئلة
      والأجوبة» فقط.
    </Banner>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "success" | "warning";
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border p-3 text-sm",
        tone === "success"
          ? "border-success/25 bg-success-soft text-success-emphasis"
          : "border-warning/30 bg-warning-soft text-warning-foreground",
      )}
    >
      {tone === "success" ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5 text-xs leading-relaxed">{children}</p>}
      </div>
    </div>
  );
}
