import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  head: () => ({
    meta: [
      { title: "المساعد الذكي | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "اسأل عن بيانات عيادتك (المواعيد، الحالات، الإيراد) واحصل على إجابة فورية.",
      },
    ],
  }),
  component: AiAssistantPage,
});

type Msg = { role: "user" | "assistant" | "error"; content: string };

const SUGGESTIONS = [
  "كم عدد الحجوزات اليوم؟",
  "كم عدد الحجوزات المؤكدة اليوم؟",
  "كم الإيراد اليوم؟",
  "كم إجمالي عدد المرضى؟",
];

function AiAssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const history = messages
      .filter((m) => m.role !== "error")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setPending(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q, history }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          body?.error === "integration_not_configured" || body?.error === "invalid_api_key"
            ? "المساعد الذكي غير مُفعّل بعد — يحتاج ANTHROPIC_API_KEY في إعدادات الخادم."
            : body?.error === "supabase_not_configured"
              ? "تعذّر الاتصال بقاعدة البيانات — تحقّق من إعدادات Supabase في الخادم."
              : body?.error === "rate_limited"
                ? "الخدمة مزدحمة، حاول بعد لحظات."
                : body?.error === "unauthorized"
                  ? "يجب تسجيل الدخول لاستخدام المساعد."
                  : "تعذّر الحصول على إجابة، حاول مرة أخرى.";
        setMessages((prev) => [...prev, { role: "error", content: message }]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: body.answer || "—" }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: "تعذّر الاتصال بالمساعد، تحقق من الاتصال بالإنترنت." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell
      title="المساعد الذكي"
      description="اسأل عن بيانات عيادتك واحصل على إجابة فورية"
      section="ai_assistant"
    >
      <div className="surface-raised flex h-[calc(100vh-220px)] min-h-[420px] flex-col overflow-hidden rounded-2xl">
        <div className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary-emphasis">
                <Sparkles className="size-7" />
              </span>
              <div>
                <p className="font-bold text-foreground">اسأل المساعد الذكي عن عيادتك</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  أرقام حقيقية من قاعدة البيانات — مواعيد، حالات، إيراد، مرضى
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:text-foreground hover:shadow-xs"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "animate-rise flex items-start gap-2.5",
                    m.role === "user" && "flex-row-reverse",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full",
                      m.role === "user"
                        ? "bg-foreground text-background"
                        : m.role === "error"
                          ? "bg-destructive-soft text-destructive"
                          : "bg-primary/15 text-primary-emphasis",
                    )}
                  >
                    {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                  </span>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : m.role === "error"
                          ? "border border-destructive/25 bg-destructive-soft text-destructive"
                          : "border border-border bg-surface-2/60 text-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-emphasis">
                    <Bot className="size-4" />
                  </span>
                  <div className="rounded-2xl border border-border bg-surface-2/60 px-4 py-2.5 text-sm text-muted-foreground">
                    <span className="tabular">...جارٍ التفكير</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب سؤالك عن العيادة…"
            disabled={pending}
            className="flex h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm shadow-xs transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-60"
          />
          <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="إرسال">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
