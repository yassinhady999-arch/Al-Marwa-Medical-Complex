import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MessageSquareDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isPreviewMode } from "@/integrations/supabase/mock";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatbotWidget, type AskAi } from "@/components/chatbot/chatbot-widget";
import { parsePublicChatbot } from "@/lib/chatbot";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/chat/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تحدّث معنا" },
      { name: "description", content: "اسأل عن مواعيد العيادة وخدماتها وأسعارها واحجز موعدك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicChatPage,
});

/** One id per browser tab, so the staff log can group a customer's questions. */
function sessionIdFor(slug: string): string {
  const key = `cf-chat-${slug}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function PublicChatPage() {
  const { slug } = Route.useParams();
  const [sessionId] = useState(() => sessionIdFor(slug));
  const {
    data: bot,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["public-chatbot", slug],
    retry: 1,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_chatbot", { _slug: slug });
      if (error) throw error;
      return parsePublicChatbot(data);
    },
  });

  useEffect(() => {
    if (bot) document.title = [bot.bot_name, bot.clinic?.name || BRAND.name].join(" | ");
  }, [bot]);

  // In the local mock preview there is no server-side bot, so typed questions are answered locally.
  const askAi: AskAi = async (turns) => {
    if (isPreviewMode()) return null;
    const res = await fetch("/api/public/chatbot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, session_id: sessionId, messages: turns }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { answer?: unknown } | null;
    return typeof body?.answer === "string" && body.answer.trim() ? body.answer : null;
  };

  const logLocalAnswer = (question: string, answer: string, source: "knowledge" | "fallback") => {
    if (isPreviewMode()) return;
    void supabase.rpc("log_chatbot_exchange", {
      _slug: slug,
      _session: sessionId,
      _question: question,
      _answer: answer,
      _source: source,
    });
  };

  return (
    <div className="app-canvas flex h-[100dvh] justify-center sm:items-center sm:p-6">
      <div className="surface-raised flex h-full w-full max-w-lg flex-col overflow-hidden sm:h-[min(780px,92dvh)] sm:rounded-3xl">
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-16 w-4/5 rounded-2xl" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          </div>
        ) : bot ? (
          <ChatbotWidget
            bot={bot}
            origin={window.location.origin}
            askAi={bot.mode === "menu" ? undefined : askAi}
            onLocalAnswer={logLocalAnswer}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <MessageSquareDashed className="size-7" />
              </span>
              <p className="mt-4 font-bold text-foreground">
                {isError ? "تعذّر تحميل المحادثة" : "المحادثة غير متاحة حاليًا"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isError
                  ? "تحقّق من اتصالك بالإنترنت."
                  : "قد يكون الرابط قديمًا أو أوقفته العيادة مؤقتًا."}
              </p>
              {isError && (
                <button
                  type="button"
                  className="mt-4 text-sm font-semibold text-primary-emphasis underline"
                  onClick={() => void refetch()}
                >
                  إعادة المحاولة
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
