import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCheck,
  Clock,
  Cog,
  Headset,
  Hourglass,
  MessageSquareWarning,
  Phone,
  SendHorizontal,
  User,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import { ToneBadge } from "@/components/app/status-badge";
import { InitialsAvatar } from "@/components/app/avatar";
import { cn } from "@/lib/utils";
import { TONE_SOFT, dbErrorMessage, formatDateTime, todayRiyadh } from "@/lib/clinic";
import {
  HANDOFF_KEY,
  formatWait,
  invalidateHandoff,
  minutesSince,
  useNow,
  waitTone,
} from "@/lib/handoff";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/handoff")({
  validateSearch: (search: Record<string, unknown>): { c?: string } =>
    typeof search["c"] === "string" ? { c: search["c"] } : {},
  head: () => ({
    meta: [
      { title: "التدخل البشري | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "المحادثات التي طلب فيها المريض التحدث مع موظف: استلام، رد، وإعادة للمساعد الآلي.",
      },
      { property: "og:title", content: "التدخل البشري | نظام تشغيل العيادة" },
      { property: "og:description", content: "قائمة المحادثات المحوّلة من البوت إلى الموظفين." },
    ],
  }),
  component: HandoffPage,
});

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "waiting", label: "بانتظار موظف" },
  { key: "mine", label: "محادثاتي" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

async function fetchQueue() {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, status, assigned_to, unread_count, last_message_preview, last_message_at, handoff_reason, handoff_requested_at, patients(full_name, phone)",
    )
    .eq("status", "human_support")
    .order("handoff_requested_at", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

type QueueItem = Awaited<ReturnType<typeof fetchQueue>>[number];

async function fetchMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, sender_type, content, status, metadata, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  // Newest 200, displayed oldest → newest.
  return (data ?? []).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

type Message = Awaited<ReturnType<typeof fetchMessages>>[number];

/** When the handoff started; rows handed off before the migration fall back to their last message. */
function waitingSince(c: QueueItem): string {
  return c.handoff_requested_at ?? c.last_message_at;
}

function HandoffPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const { c: initialSelected } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [filter, setFilter] = useState<FilterKey>("all");
  // Unsent replies per conversation, so switching conversations never loses or leaks a draft.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const now = useNow();
  const today = todayRiyadh();
  const myId = me?.profile?.id ?? null;

  const { data: queue, isLoading } = useQuery({
    queryKey: [HANDOFF_KEY, "queue"],
    queryFn: fetchQueue,
  });

  const { data: staffNames } = useQuery({
    queryKey: [HANDOFF_KEY, "staff"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((p) => [p.id, p.full_name || p.email || "موظف"]),
      ) as Record<string, string>;
    },
  });

  const { data: resolvedToday = 0 } = useQuery({
    queryKey: [HANDOFF_KEY, "resolved-today", today],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gte("handoff_resolved_at", `${today}T00:00:00+03:00`);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    // Unique topic per mount so a quick leave/return never reuses a closing channel.
    const channel = supabase
      .channel(`handoff-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void qc.invalidateQueries({ queryKey: [HANDOFF_KEY, "queue"] });
        void qc.invalidateQueries({ queryKey: [HANDOFF_KEY, "resolved-today"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void qc.invalidateQueries({ queryKey: [HANDOFF_KEY, "messages"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const rows = queue ?? [];
  const waiting = rows.filter((c) => !c.assigned_to);
  const mine = rows.filter((c) => !!myId && c.assigned_to === myId);
  const inProgress = rows.length - waiting.length;
  const oldestWait = Math.max(0, ...waiting.map((c) => minutesSince(waitingSince(c), now)));

  // Unassigned first (they need someone to pick them up), then oldest request first.
  const visible = (filter === "waiting" ? waiting : filter === "mine" ? mine : rows)
    .slice()
    .sort(
      (a, b) =>
        Number(!!a.assigned_to) - Number(!!b.assigned_to) ||
        Date.parse(waitingSince(a)) - Date.parse(waitingSince(b)),
    );
  const counts: Record<FilterKey, number> = {
    all: rows.length,
    waiting: waiting.length,
    mine: mine.length,
  };

  const active = rows.find((c) => c.id === selected) ?? null;

  return (
    <AppShell
      title="التدخل البشري"
      description="محادثات طلب فيها المريض التحدث مع موظف — البوت متوقف فيها حتى تعيدها إليه"
      section="handoff"
    >
      <div className="mb-5 hidden gap-3 sm:grid sm:grid-cols-3">
        <StatCard
          label="بانتظار موظف"
          value={waiting.length}
          icon={Hourglass}
          tone={waiting.length > 0 ? waitTone(oldestWait) : "success"}
          hint={waiting.length > 0 ? `أقدم انتظار: ${formatWait(oldestWait)}` : "لا أحد ينتظر الآن"}
          index={0}
        />
        <StatCard
          label="قيد المعالجة"
          value={inProgress}
          icon={Headset}
          tone="info"
          hint={mine.length > 0 ? `${mine.length} منها معك` : "لم تستلم أي محادثة"}
          index={1}
        />
        <StatCard
          label="أُعيدت للبوت اليوم"
          value={resolvedToday}
          icon={Bot}
          tone="success"
          hint="محادثات انتهى فيها التدخل"
          index={2}
        />
      </div>

      {isLoading ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Headset}
          title="لا توجد محادثات تحتاج تدخلًا بشريًا"
          hint="عندما يطلب مريض التحدث مع موظف تظهر محادثته هنا فورًا، ويتوقف البوت عن الرد حتى تعيدها إليه."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
          <div
            className={cn(
              "surface-raised flex flex-col overflow-hidden rounded-2xl lg:h-[72vh] lg:min-h-[520px]",
              active && "hidden lg:flex",
            )}
          >
            <div className="flex gap-1 border-b border-border/70 p-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
                    filter === f.key
                      ? "bg-primary/15 text-primary-emphasis"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span className="tabular rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {counts[f.key]}
                  </span>
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                لا توجد محادثات في هذا التصنيف
              </p>
            ) : (
              <ul className="flex-1 divide-y divide-border/70 overflow-y-auto">
                {visible.map((c) => (
                  <QueueRow
                    key={c.id}
                    c={c}
                    now={now}
                    active={c.id === selected}
                    myId={myId}
                    staffNames={staffNames}
                    onSelect={() => setSelected(c.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div
            className={cn(
              "surface-raised flex h-[calc(100dvh-8rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl lg:h-[72vh] lg:min-h-[520px]",
              !active && "hidden lg:flex",
            )}
          >
            {active ? (
              <ConversationPane
                key={active.id}
                c={active}
                now={now}
                myId={myId}
                myName={me?.profile?.full_name ?? ""}
                canWrite={!!me?.canWrite}
                staffNames={staffNames}
                draft={drafts[active.id] ?? ""}
                onDraftChange={(id, text) => setDrafts((d) => ({ ...d, [id]: text }))}
                onBack={() => setSelected(null)}
                onReleased={() => setSelected(null)}
              />
            ) : (
              <div className="grid flex-1 place-items-center p-8">
                <div className="text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary-emphasis">
                    <Headset className="size-6" />
                  </span>
                  <p className="mt-3 text-sm text-muted-foreground">
                    اختر محادثة من القائمة للرد على المريض
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function AssigneeBadge({
  c,
  myId,
  staffNames,
}: {
  c: QueueItem;
  myId: string | null;
  staffNames: Record<string, string> | undefined;
}) {
  if (!c.assigned_to) {
    return (
      <ToneBadge tone="warning" pulse className="!px-2 !py-0 text-[10px]">
        بانتظار موظف
      </ToneBadge>
    );
  }
  if (c.assigned_to === myId) {
    return (
      <ToneBadge tone="primary" className="!px-2 !py-0 text-[10px]">
        معك
      </ToneBadge>
    );
  }
  return (
    <ToneBadge tone="info" className="max-w-40 !px-2 !py-0 text-[10px]">
      <span className="truncate">مع {staffNames?.[c.assigned_to] ?? "موظف"}</span>
    </ToneBadge>
  );
}

function QueueRow({
  c,
  now,
  active,
  myId,
  staffNames,
  onSelect,
}: {
  c: QueueItem;
  now: number;
  active: boolean;
  myId: string | null;
  staffNames: Record<string, string> | undefined;
  onSelect: () => void;
}) {
  const minutes = minutesSince(waitingSince(c), now);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
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
            <ToneBadge
              tone={c.assigned_to ? "neutral" : waitTone(minutes)}
              icon={Clock}
              className="shrink-0 !px-2 !py-0 text-[10px]"
            >
              <span className="tabular">{formatWait(minutes)}</span>
            </ToneBadge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {c.handoff_reason ?? c.last_message_preview ?? "—"}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <AssigneeBadge c={c} myId={myId} staffNames={staffNames} />
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
}

const SENDER_LABEL: Record<string, { label: string; icon: typeof Bot }> = {
  patient: { label: "المريض", icon: User },
  ai: { label: "المساعد الآلي", icon: Bot },
  human: { label: "موظف", icon: Headset },
  system: { label: "النظام", icon: Cog },
};

function DeliveryState({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-0.5">
        <Clock className="size-3" />
        بانتظار الإرسال
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-0.5 text-success-emphasis">
        <CheckCheck className="size-3" />
        أُرسلت
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold text-destructive">
        <AlertCircle className="size-3" />
        فشل الإرسال
      </span>
    );
  }
  return null;
}

function MessageBubble({ m }: { m: Message }) {
  if (m.sender_type === "system") {
    return (
      <p className="mx-auto w-fit max-w-[90%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
        {m.content ?? "—"}
      </p>
    );
  }
  const meta = SENDER_LABEL[m.sender_type] ?? { label: "النظام", icon: Cog };
  const outbound = m.direction !== "inbound";
  const staffName =
    m.sender_type === "human"
      ? ((m.metadata as { sent_by_name?: string } | null)?.sent_by_name ?? "")
      : "";
  return (
    <div
      className={cn(
        "w-fit max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-xs",
        !outbound
          ? "border border-border bg-surface-2"
          : m.sender_type === "human"
            ? "ms-auto border border-info/30 bg-info-soft"
            : "ms-auto border border-primary/25 bg-primary/10",
      )}
    >
      <p className="whitespace-pre-wrap break-words text-foreground">{m.content ?? "—"}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
        <meta.icon className="size-3" />
        {staffName || meta.label} · {formatDateTime(m.created_at)}
        {m.sender_type === "human" && <DeliveryState status={m.status} />}
      </p>
    </div>
  );
}

function ConversationPane({
  c,
  now,
  myId,
  myName,
  canWrite,
  staffNames,
  draft,
  onDraftChange,
  onBack,
  onReleased,
}: {
  c: QueueItem;
  now: number;
  myId: string | null;
  myName: string;
  canWrite: boolean;
  staffNames: Record<string, string> | undefined;
  draft: string;
  onDraftChange: (conversationId: string, text: string) => void;
  onBack: () => void;
  onReleased: () => void;
}) {
  const qc = useQueryClient();
  const setDraft = (text: string) => onDraftChange(c.id, text);
  const scrollRef = useRef<HTMLDivElement>(null);
  const patientName = c.patients?.full_name ?? "مريض غير معروف";
  const isMine = !!myId && c.assigned_to === myId;
  const assigneeName = c.assigned_to ? (staffNames?.[c.assigned_to] ?? "موظف آخر") : null;
  const minutes = minutesSince(waitingSince(c), now);

  const { data: messages, isLoading } = useQuery({
    queryKey: [HANDOFF_KEY, "messages", c.id],
    queryFn: () => fetchMessages(c.id),
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const claim = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("claim_conversation", { _conversation_id: c.id });
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "takeover",
        section: "handoff",
        description: `استلام محادثة ${patientName}`,
        entityType: "conversation",
        entityId: c.id,
      });
      toast.success("استلمت المحادثة — البوت متوقف حتى تعيدها إليه");
      invalidateHandoff(qc);
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const reply = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.rpc("send_human_reply", {
        _conversation_id: c.id,
        _content: text,
      });
      if (error) throw error;
    },
    onSuccess: (_d, text) => {
      void logActivity({
        action: "send",
        section: "handoff",
        description: `رد على ${patientName} عبر واتساب`,
        entityType: "conversation",
        entityId: c.id,
        metadata: { preview: text.slice(0, 120) },
      });
      invalidateHandoff(qc);
    },
    onError: (e: Error, text) => {
      setDraft(text); // give the unsent reply back
      toast.error(dbErrorMessage(e));
    },
  });

  const release = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("release_to_bot", { _conversation_id: c.id });
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "release",
        section: "handoff",
        description: `إعادة محادثة ${patientName} للمساعد الآلي`,
        entityType: "conversation",
        entityId: c.id,
      });
      toast.success("أُعيدت المحادثة للمساعد الآلي");
      onReleased();
      invalidateHandoff(qc);
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const send = () => {
    const text = draft.trim();
    if (!text || reply.isPending) return;
    setDraft("");
    reply.mutate(text);
  };

  // "أمل الشهري" → "أمل"; keep a title with its name: "د. يحيى هادي" → "د. يحيى".
  const nameParts = myName.trim().split(/\s+/).filter(Boolean);
  const shortName = nameParts.slice(0, nameParts[0]?.endsWith(".") ? 2 : 1).join(" ");
  const quickReplies = [
    {
      label: "ترحيب",
      text: `أهلًا بك، معك ${shortName || "فريق العيادة"} 👋 كيف أقدر أساعدك؟`,
    },
    { label: "لحظات", text: "لحظات من فضلك، أتحقق من طلبك وأعود إليك." },
    {
      label: "ختام",
      text: "سعدنا بخدمتك 🌿 سيتابع معك المساعد الآلي، ويمكنك طلب موظف في أي وقت.",
    },
  ];

  // Where the conversation was handed to a human, marked inline in the thread.
  const requestedAt = c.handoff_requested_at ? Date.parse(c.handoff_requested_at) : null;
  const list = messages ?? [];
  const splitIndex =
    requestedAt === null ? -1 : list.findIndex((m) => Date.parse(m.created_at) >= requestedAt);
  const divider = requestedAt !== null && (
    <div className="flex items-center gap-2 py-1 text-[11px] font-medium text-warning-foreground">
      <span className="h-px flex-1 bg-warning/40" />
      <Headset className="size-3.5" />
      بدء التدخل البشري · {formatDateTime(c.handoff_requested_at)}
      <span className="h-px flex-1 bg-warning/40" />
    </div>
  );

  const bannerTone = c.assigned_to ? (isMine ? "primary" : "info") : waitTone(minutes);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="رجوع للقائمة"
          onClick={onBack}
        >
          <ArrowRight />
        </Button>
        <InitialsAvatar name={c.patients?.full_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{patientName}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground" dir="ltr">
            <Phone className="size-3" />
            {c.patients?.phone ?? "—"}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {!c.assigned_to ? (
              <Button size="sm" onClick={() => claim.mutate()} disabled={claim.isPending}>
                <Headset />
                استلام المحادثة
              </Button>
            ) : (
              !isMine && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={claim.isPending}>
                      <UserCheck />
                      نقل إليّ
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>استلام المحادثة من {assigneeName}؟</AlertDialogTitle>
                      <AlertDialogDescription>
                        يتولى {assigneeName} هذه المحادثة حاليًا. بعد الاستلام تصبح أنت المسؤول عن
                        الرد على {patientName}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                      <AlertDialogAction onClick={() => claim.mutate()}>استلام</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant={isMine ? "default" : "outline"}
                  disabled={release.isPending}
                >
                  <Bot />
                  إعادة للبوت
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>إعادة المحادثة للمساعد الآلي؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيستأنف البوت الرد على {patientName} تلقائيًا وتخرج المحادثة من قائمة التدخل
                    البشري. إذا طلب المريض موظفًا مرة أخرى ستعود إلى هنا.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => release.mutate()}>
                    إعادة للبوت
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex items-start gap-2.5 border-b px-4 py-2.5 text-xs",
          TONE_SOFT[bannerTone],
        )}
      >
        <MessageSquareWarning className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {c.assigned_to
              ? isMine
                ? "أنت تتولى هذه المحادثة — البوت متوقف حتى تعيدها إليه"
                : `يتولاها ${assigneeName} — البوت متوقف`
              : `بانتظار موظف منذ ${formatWait(minutes)} — البوت متوقف`}
          </p>
          {c.handoff_reason && (
            <p className="mt-0.5 line-clamp-2">سبب التحويل: «{c.handoff_reason}»</p>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {isLoading ? (
          <RowsSkeleton rows={3} />
        ) : list.length === 0 ? (
          <>
            <p className="py-12 text-center text-sm text-muted-foreground">لا توجد رسائل</p>
            {divider}
          </>
        ) : (
          <>
            {list.map((m, i) => (
              <Fragment key={m.id}>
                {i === splitIndex && divider}
                <MessageBubble m={m} />
              </Fragment>
            ))}
            {splitIndex === -1 && divider}
          </>
        )}
      </div>

      {canWrite ? (
        <form
          className="border-t border-border/70 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickReplies.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setDraft(q.text)}
                className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder={`اكتب ردك إلى ${patientName}…`}
              className="max-h-40 min-h-[44px] resize-none"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="إرسال الرد"
              disabled={!draft.trim() || reply.isPending}
            >
              <SendHorizontal className="-scale-x-100" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">Enter للإرسال · Shift+Enter لسطر جديد · </span>
            يصل ردك إلى المريض على واتساب
          </p>
        </form>
      ) : (
        <p className="border-t border-border/70 p-3 text-center text-xs text-muted-foreground">
          لديك صلاحية اطّلاع فقط — لا يمكنك الرد على المحادثات.
        </p>
      )}
    </>
  );
}
