import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Phone, Bot, User, Cog, Send, Headset } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import { ConversationStatusBadge } from "@/components/app/status-badge";
import { InitialsAvatar } from "@/components/app/avatar";
import { cn } from "@/lib/utils";
import { dbErrorMessage, formatDateTime, formatRelative } from "@/lib/clinic";
import { invalidateHandoff } from "@/lib/handoff";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({
    meta: [
      { title: "المحادثات | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "متابعة محادثات واتساب مع المرضى وسجل الرسائل الواردة والصادرة.",
      },
      { property: "og:title", content: "المحادثات | نظام تشغيل العيادة" },
      { property: "og:description", content: "محادثات واتساب وسجل الرسائل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversationsPage,
});

type SenderMeta = { label: string; icon: typeof Bot };

const SENDER_META: Record<string, SenderMeta> = {
  patient: { label: "المريض", icon: User },
  ai: { label: "الذكاء الاصطناعي", icon: Bot },
  human: { label: "موظف", icon: User },
  system: { label: "النظام", icon: Cog },
};

function senderMeta(t: string | null | undefined): SenderMeta {
  return (t ? SENDER_META[t] : undefined) ?? { label: "النظام", icon: Cog };
}

function ConversationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useProfile();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, channel, status, unread_count, last_message_preview, last_message_at, patients(full_name, phone)",
        )
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, sender_type, content, created_at")
        .eq("conversation_id", selected!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("conversations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const activeConvo = (conversations ?? []).find((c) => c.id === selected);

  // Staff step in: the bot pauses and the conversation moves to «التدخل البشري».
  const takeover = useMutation({
    mutationFn: async (c: { id: string; name: string }) => {
      const { error } = await supabase.rpc("claim_conversation", { _conversation_id: c.id });
      if (error) throw error;
    },
    onSuccess: (_d, c) => {
      void logActivity({
        action: "takeover",
        section: "handoff",
        description: `استلام محادثة ${c.name}`,
        entityType: "conversation",
        entityId: c.id,
      });
      toast.success("استلمت المحادثة — البوت متوقف حتى تعيدها إليه");
      invalidateHandoff(qc);
      void navigate({ to: "/handoff", search: { c: c.id } });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <AppShell
      title="المحادثات"
      description="محادثات واتساب الواردة عبر منظومة الأتمتة"
      section="conversations"
    >
      {isLoading ? (
        <RowsSkeleton rows={6} />
      ) : (conversations ?? []).length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="لا توجد محادثات"
          hint="ستظهر المحادثات هنا فور استقبال أول رسالة عبر تكامل واتساب."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,340px)_1fr]">
          <div className="surface-raised overflow-hidden rounded-2xl">
            <div className="border-b border-border/70 px-4 py-3 text-sm font-bold text-foreground">
              الصندوق الوارد
            </div>
            <ul className="max-h-[70vh] divide-y divide-border/70 overflow-y-auto">
              {(conversations ?? []).map((c) => {
                const active = selected === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-start transition-colors",
                        active ? "bg-primary/10" : "hover:bg-accent/60",
                      )}
                    >
                      <InitialsAvatar name={c.patients?.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {c.patients?.full_name ?? "مريض غير معروف"}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatRelative(c.last_message_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.last_message_preview ?? "—"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <ConversationStatusBadge status={c.status} />
                          {c.unread_count > 0 && (
                            <span className="tabular grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                              {c.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="surface-raised flex min-h-[440px] flex-col overflow-hidden rounded-2xl">
            {!selected ? (
              <div className="grid flex-1 place-items-center p-8">
                <div className="text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary-emphasis">
                    <MessageCircle className="size-6" />
                  </span>
                  <p className="mt-3 text-sm text-muted-foreground">اختر محادثة لعرض الرسائل</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
                  <InitialsAvatar name={activeConvo?.patients?.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {activeConvo?.patients?.full_name ?? "مريض غير معروف"}
                    </p>
                    <p
                      className="flex items-center gap-1 truncate text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      <Phone className="size-3" />
                      {activeConvo?.patients?.phone ?? "—"}
                    </p>
                  </div>
                  {activeConvo && <ConversationStatusBadge status={activeConvo.status} />}
                  {activeConvo?.status === "human_support" && me?.can("handoff") ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/handoff" search={{ c: activeConvo.id }}>
                        <Headset />
                        فتح في التدخل البشري
                      </Link>
                    </Button>
                  ) : (
                    activeConvo &&
                    activeConvo.status !== "human_support" &&
                    me?.canWrite &&
                    me.can("handoff") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={takeover.isPending}
                        onClick={() =>
                          takeover.mutate({
                            id: activeConvo.id,
                            name: activeConvo.patients?.full_name ?? "مريض",
                          })
                        }
                      >
                        <Headset />
                        استلام المحادثة
                      </Button>
                    )
                  )}
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                  {(messages ?? []).length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">لا توجد رسائل</p>
                  ) : (
                    (messages ?? []).map((m) => {
                      const meta = senderMeta(m.sender_type);
                      const outbound = m.direction !== "inbound";
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "w-fit max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-xs",
                            outbound
                              ? "ms-auto border border-primary/25 bg-primary/10"
                              : "border border-border bg-surface-2",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-foreground">
                            {m.content ?? "—"}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <meta.icon className="size-3" />
                            {meta.label} · {formatDateTime(m.created_at)}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-border/70 p-3">
                  <div className="relative opacity-60">
                    <Input
                      placeholder="للرد بنفسك: استلم المحادثة لتنتقل إلى «التدخل البشري»"
                      disabled
                      className="pe-10"
                    />
                    <Send className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
