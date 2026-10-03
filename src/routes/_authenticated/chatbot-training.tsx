import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  BookOpen,
  CalendarCheck,
  CodeXml,
  Inbox,
  ListTree,
  Lock,
  MessageCircleQuestion,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isPreviewMode } from "@/integrations/supabase/mock";
import type { Database, Json } from "@/integrations/supabase/types";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import { SectionCard } from "@/components/app/section-card";
import { ToneBadge } from "@/components/app/status-badge";
import { ShareLink } from "@/components/app/share-link";
import { ChatbotWidget, type AskAi } from "@/components/chatbot/chatbot-widget";
import { MenuEditor } from "@/components/chatbot/menu-editor";
import { cn, copyText } from "@/lib/utils";
import { dbErrorMessage, formatRelative, todayRiyadh, type Tone } from "@/lib/clinic";
import {
  AI_MODELS,
  CHATBOT_MODES,
  KNOWLEDGE_CATEGORIES,
  STARTER_MENU,
  chatLink,
  parseMenu,
  validateMenu,
  type ChatbotMode,
  type MenuNode,
  type PublicChatbot,
  type WorkingHours,
} from "@/lib/chatbot";
import { newSlug } from "@/lib/booking-forms";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/chatbot-training")({
  head: () => ({
    meta: [
      { title: "تدريب الشات بوت | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "درّب الشات بوت بالاختيارات والأسئلة والأجوبة، وشارك رابطه مع العملاء.",
      },
    ],
  }),
  component: ChatbotPage,
});

type Settings = Database["public"]["Tables"]["chatbot_settings"]["Row"];
type Knowledge = Database["public"]["Tables"]["chatbot_knowledge"]["Row"];

type BotDraft = {
  is_active: boolean;
  mode: ChatbotMode;
  bot_name: string;
  welcome_message: string;
  fallback_message: string;
  ai_model: string;
  ai_instructions: string;
  ai_daily_limit: number;
  booking_form_id: string | null;
  menu: MenuNode[];
};

const NO_FORM = "none";

function toDraft(s: Settings): BotDraft {
  return {
    is_active: s.is_active,
    mode: s.mode === "menu" || s.mode === "ai" ? s.mode : "hybrid",
    bot_name: s.bot_name,
    welcome_message: s.welcome_message,
    fallback_message: s.fallback_message,
    ai_model: s.ai_model,
    ai_instructions: s.ai_instructions,
    ai_daily_limit: s.ai_daily_limit,
    booking_form_id: s.booking_form_id,
    menu: parseMenu(s.menu),
  };
}

function ChatbotPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const canWrite = !!me?.canWrite;
  const { data: settings, isLoading } = useQuery({
    queryKey: ["chatbot", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_settings")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("chatbot_settings")
        .insert({ menu: STARTER_MENU as unknown as Json });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["chatbot", "settings"] }),
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  if (isLoading || !settings) {
    return (
      <AppShell title="تدريب الشات بوت" section="chatbot_training">
        {isLoading ? (
          <RowsSkeleton rows={5} />
        ) : (
          <EmptyState
            icon={Bot}
            title="لم يُنشأ الشات بوت بعد"
            hint="أنشئه لتبدأ بإضافة الاختيارات والأسئلة والأجوبة، ثم شارك رابطه مع العملاء."
            action={
              canWrite ? (
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  <Plus />
                  إنشاء الشات بوت
                </Button>
              ) : undefined
            }
          />
        )}
      </AppShell>
    );
  }
  return <ChatbotManager key={settings.id} settings={settings} canWrite={canWrite} />;
}

async function fetchLiveData() {
  const [specialties, services, doctors, clinic] = await Promise.all([
    supabase.from("specialties").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("services")
      .select("name, price, duration_minutes, specialty_id, description")
      .eq("is_active", true)
      .order("name"),
    supabase.from("doctors").select("name, specialty_id").eq("status", "active").order("name"),
    supabase
      .from("clinic_settings")
      .select("clinic_name, phone, email, address, city, working_hours")
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    specialties: specialties.data ?? [],
    services: (services.data ?? []).map((s) => ({ ...s, price: Number(s.price ?? 0) })),
    doctors: doctors.data ?? [],
    clinic: clinic.data
      ? {
          name: clinic.data.clinic_name,
          phone: clinic.data.phone,
          email: clinic.data.email,
          address: clinic.data.address,
          city: clinic.data.city,
          working_hours: (clinic.data.working_hours ?? null) as unknown as WorkingHours | null,
        }
      : null,
  };
}

function ChatbotManager({ settings, canWrite }: { settings: Settings; canWrite: boolean }) {
  const qc = useQueryClient();
  const saved = toDraft(settings);
  const [draft, setDraft] = useState(saved);
  const [tab, setTab] = useState("menu");
  const [knowledgeDialog, setKnowledgeDialog] = useState<KnowledgeDraft | null>(null);
  const [previewRun, setPreviewRun] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const today = todayRiyadh();

  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("لديك تغييرات غير محفوظة على الشات بوت. هل تريد المغادرة بدون حفظ؟"),
    enableBeforeUnload: () => dirty,
  });

  const { data: knowledge = [] } = useQuery({
    queryKey: ["chatbot", "knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_knowledge")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: live } = useQuery({ queryKey: ["chatbot", "live-data"], queryFn: fetchLiveData });
  const { data: forms = [] } = useQuery({
    queryKey: ["booking-forms", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_forms")
        .select("id, title, slug, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: aiConfigured = false } = useQuery({
    queryKey: ["chatbot", "ai-status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/api/public/chatbot");
      if (!res.ok) return false;
      const body = (await res.json().catch(() => null)) as { ai_configured?: boolean } | null;
      return body?.ai_configured === true;
    },
  });
  const { data: usedToday = 0 } = useQuery({
    queryKey: ["chatbot", "usage", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("chatbot_usage")
        .select("ai_requests")
        .eq("day", today)
        .maybeSingle();
      return data?.ai_requests ?? 0;
    },
  });

  const update = (patch: Partial<BotDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: async () => {
      const problems = [
        ...(!draft.bot_name.trim() ? ["اكتب اسم البوت"] : []),
        ...(!draft.welcome_message.trim() ? ["اكتب رسالة الترحيب"] : []),
        ...validateMenu(draft.menu),
      ];
      if (problems.length) throw new Error(problems[0]);
      const { error } = await supabase
        .from("chatbot_settings")
        .update({
          is_active: draft.is_active,
          mode: draft.mode,
          bot_name: draft.bot_name.trim(),
          welcome_message: draft.welcome_message.trim(),
          fallback_message: draft.fallback_message.trim() || saved.fallback_message,
          ai_model: draft.ai_model,
          ai_instructions: draft.ai_instructions.trim(),
          ai_daily_limit: draft.ai_daily_limit,
          booking_form_id: draft.booking_form_id,
          menu: draft.menu as unknown as Json,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "update",
        section: "chatbot_training",
        description: "تحديث إعدادات وقائمة الشات بوت",
        entityType: "chatbot",
        entityId: settings.id,
      });
      toast.success("تم حفظ الشات بوت — التغييرات ظاهرة الآن للعملاء");
      void qc.invalidateQueries({ queryKey: ["chatbot", "settings"] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("chatbot_settings")
        .update({ slug: newSlug() })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "update",
        section: "chatbot_training",
        description: "تجديد رابط الشات بوت",
        entityType: "chatbot",
        entityId: settings.id,
      });
      toast.success("تم تجديد الرابط — الرابط القديم لم يعد يعمل");
      void qc.invalidateQueries({ queryKey: ["chatbot", "settings"] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const link = chatLink(settings.slug);
  const modeLabel = CHATBOT_MODES.find((m) => m.key === saved.mode)?.label ?? "";
  const usesAi = saved.mode !== "menu";
  const previewBot: PublicChatbot = {
    bot_name: draft.bot_name || "المساعد الآلي",
    welcome_message: draft.welcome_message,
    mode: draft.mode,
    menu: draft.menu,
    fallback_message: draft.fallback_message,
    booking_slug: forms.find((f) => f.id === draft.booking_form_id && f.is_active)?.slug ?? null,
    clinic: live?.clinic ?? null,
    specialties: live?.specialties ?? [],
    services: live?.services ?? [],
    doctors: live?.doctors ?? [],
    knowledge: knowledge
      .filter((k) => k.is_active)
      .map((k) => ({ category: k.category, question: k.question, answer: k.answer })),
  };
  // The preview asks the real AI only when the saved bot can answer with it.
  const previewAi =
    aiConfigured && saved.is_active && usesAi && !isPreviewMode()
      ? previewAskAi(settings.slug)
      : undefined;

  const preview = (
    <aside className="xl:sticky xl:top-24 xl:self-start">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          تجربة مباشرة — هكذا يراه العميل
        </p>
        <Button size="sm" variant="ghost" onClick={() => setPreviewRun((n) => n + 1)}>
          <RotateCcw />
          إعادة
        </Button>
      </div>
      <div className="h-[600px] overflow-hidden rounded-3xl border-4 border-muted shadow-soft">
        <ChatbotWidget
          key={`${previewRun}-${draft.mode}-${draft.welcome_message}-${JSON.stringify(draft.menu)}`}
          bot={previewBot}
          origin={typeof window === "undefined" ? "" : window.location.origin}
          askAi={previewAi}
        />
      </div>
      {draft.mode !== "menu" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {previewAi
            ? "الأسئلة المكتوبة هنا يجيب عنها الذكاء الاصطناعي من آخر إعدادات محفوظة."
            : "الأسئلة المكتوبة هنا يُجاب عنها من «الأسئلة والأجوبة» فقط (الذكاء الاصطناعي غير مفعّل في المعاينة)."}
        </p>
      )}
    </aside>
  );

  return (
    <AppShell
      title="تدريب الشات بوت"
      description="درّب البوت بالاختيارات والأسئلة والأجوبة، ثم شارك رابطه مع العملاء"
      section="chatbot_training"
      actions={
        canWrite ? (
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="hidden text-xs font-semibold text-warning-foreground sm:inline">
                تغييرات غير محفوظة
              </span>
            )}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="surface-raised mb-5 space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
            رابط الشات بوت — انسخه وأرسله للعميل، أو ضعه في موقعك وحسابات التواصل
          </p>
          <ToneBadge tone={saved.is_active ? "success" : "neutral"}>
            {saved.is_active ? "مفعّل" : "متوقف"}
          </ToneBadge>
          <ToneBadge tone="info" dot={false}>
            {modeLabel}
          </ToneBadge>
          {usesAi && (
            <ToneBadge tone={aiConfigured ? "success" : "warning"} dot={false}>
              {aiConfigured
                ? `الذكاء الاصطناعي اليوم: ${usedToday} من ${saved.ai_daily_limit}`
                : "الذكاء الاصطناعي غير مُعدّ"}
            </ToneBadge>
          )}
        </div>
        <ShareLink url={link} muted={!saved.is_active} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const code = `<iframe src="${link}" title="${saved.bot_name}" style="width:100%;max-width:420px;height:640px;border:0;border-radius:16px"></iframe>`;
              if (await copyText(code)) toast.success("تم نسخ كود التضمين — ألصقه في صفحة موقعك");
              else toast.error("تعذّر النسخ");
            }}
          >
            <CodeXml />
            نسخ كود التضمين للموقع
          </Button>
          {canWrite && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" disabled={regenerate.isPending}>
                  <RefreshCw />
                  تجديد الرابط
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تجديد رابط الشات بوت؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتوقف الرابط الحالي فورًا عن العمل لكل من لديه، وستحتاج لإرسال الرابط الجديد
                    للعملاء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => regenerate.mutate()}>تجديد</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      {!canWrite && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
          <Lock className="size-4" />
          لديك صلاحية اطّلاع فقط على الشات بوت.
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="menu">
            <ListTree className="size-4" />
            شجرة الاختيارات
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="size-4" />
            الإعدادات
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="size-4" />
            الأسئلة والأجوبة
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Inbox className="size-4" />
            أسئلة العملاء
          </TabsTrigger>
        </TabsList>

        <TabsContent value="menu" className="mt-4">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <fieldset disabled={!canWrite} className="min-w-0 space-y-3">
              {draft.mode === "ai" && (
                <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-foreground">
                  <TriangleAlert className="size-4 shrink-0" />
                  البوت الآن في وضع «ذكاء اصطناعي» فقط، فلن تظهر هذه الاختيارات للعميل. غيّر طريقة
                  الرد من «الإعدادات» إلى «اختيارات فقط» أو «الاثنان معًا».
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                ابنِ شبكة الاختيارات: كل اختيار يرد على العميل، ويمكن أن يتفرع منه اختيارات أخرى حتى
                يصل العميل لإجابته — بدون أي نموذج ذكاء اصطناعي.
              </p>
              <MenuEditor
                menu={draft.menu}
                onChange={(menu) => update({ menu })}
                specialties={live?.specialties ?? []}
              />
            </fieldset>
            {preview}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <fieldset disabled={!canWrite} className="min-w-0">
              <SettingsPanel
                draft={draft}
                onChange={update}
                aiConfigured={aiConfigured}
                forms={forms}
              />
            </fieldset>
            {preview}
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <KnowledgePanel
              knowledge={knowledge}
              canWrite={canWrite}
              onEdit={(k) => setKnowledgeDialog(k)}
            />
            {preview}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogsPanel
            canWrite={canWrite}
            onTeach={(question, answer) =>
              setKnowledgeDialog({ category: "عام", question, answer, is_active: true })
            }
          />
        </TabsContent>
      </Tabs>

      <KnowledgeDialog draft={knowledgeDialog} onClose={() => setKnowledgeDialog(null)} />
    </AppShell>
  );
}

function previewAskAi(slug: string): AskAi {
  return async (turns) => {
    const res = await fetch("/api/public/chatbot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, session_id: "staff-preview", messages: turns }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { answer?: unknown } | null;
    return typeof body?.answer === "string" && body.answer.trim() ? body.answer : null;
  };
}

function SettingsPanel({
  draft,
  onChange,
  aiConfigured,
  forms,
}: {
  draft: BotDraft;
  onChange: (patch: Partial<BotDraft>) => void;
  aiConfigured: boolean;
  forms: { id: string; title: string; is_active: boolean }[];
}) {
  const uid = useId();
  return (
    <div className="space-y-5">
      <SectionCard icon={Bot} title="طريقة رد البوت">
        <div className="space-y-4">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">البوت مفعّل</span>
              <span className="text-xs text-muted-foreground">
                عند الإيقاف يظهر لمن يفتح الرابط أن المحادثة غير متاحة.
              </span>
            </span>
            <Switch checked={draft.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
          </label>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="طريقة الرد">
            {CHATBOT_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={draft.mode === m.key}
                onClick={() => onChange({ mode: m.key })}
                className={cn(
                  "rounded-xl border p-3 text-start transition-colors",
                  draft.mode === m.key
                    ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="block text-sm font-bold text-foreground">{m.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{m.description}</span>
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={MessageCircleQuestion} title="الرسائل">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-1`}>اسم البوت</Label>
            <Input
              id={`${uid}-1`}
              value={draft.bot_name}
              maxLength={60}
              onChange={(e) => onChange({ bot_name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-2`}>رسالة الترحيب</Label>
            <Textarea
              id={`${uid}-2`}
              rows={2}
              value={draft.welcome_message}
              maxLength={500}
              onChange={(e) => onChange({ welcome_message: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-3`}>الرد عندما لا يعرف البوت الإجابة</Label>
            <Textarea
              id={`${uid}-3`}
              rows={2}
              value={draft.fallback_message}
              maxLength={500}
              onChange={(e) => onChange({ fallback_message: e.target.value })}
            />
          </div>
        </div>
      </SectionCard>

      {draft.mode !== "menu" && (
        <SectionCard icon={Sparkles} title="الذكاء الاصطناعي">
          <div className="grid gap-4">
            {aiConfigured ? (
              <p className="rounded-xl border border-success/25 bg-success-soft p-3 text-sm text-success-emphasis">
                مفتاح الذكاء الاصطناعي مضبوط على الخادم. يجيب البوت من معلومات العيادة (الخدمات
                والأسعار والأطباء ومواعيد العمل) ومن «الأسئلة والأجوبة».
              </p>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-foreground">
                <p className="font-semibold">لم يُضبط مفتاح API للذكاء الاصطناعي بعد.</p>
                <p className="mt-1 text-xs">
                  أضف المفتاح باسم{" "}
                  <span dir="ltr" className="rounded bg-surface/60 px-1 font-mono">
                    ANTHROPIC_API_KEY
                  </span>{" "}
                  في ملف <span className="font-mono">.env</span> أو في متغيرات البيئة لدى الاستضافة،
                  ثم أعد تشغيل الموقع. حتى ذلك الحين يرد البوت على الأسئلة المكتوبة من «الأسئلة
                  والأجوبة» فقط.
                </p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-4`}>النموذج</Label>
              <Select value={draft.ai_model} onValueChange={(v) => onChange({ ai_model: v })}>
                <SelectTrigger id={`${uid}-4`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} — {m.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-5`}>تعليمات إضافية للبوت</Label>
              <Textarea
                id={`${uid}-5`}
                rows={4}
                value={draft.ai_instructions}
                maxLength={3000}
                placeholder="مثال: نقبل تأمين بوبا والتعاونية. الكشف الأول للأطفال مجاني. لا تعطِ مواعيد قبل التأكد."
                onChange={(e) => onChange({ ai_instructions: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                تُرسل للنموذج مع كل سؤال، فلا تكتب فيها معلومات سرية.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-6`}>الحد الأقصى لأسئلة الذكاء الاصطناعي يوميًا</Label>
              <Input
                id={`${uid}-6`}
                type="number"
                min={0}
                max={100000}
                className="w-40"
                value={draft.ai_daily_limit}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n))
                    onChange({ ai_daily_limit: Math.min(100000, Math.max(0, n)) });
                }}
              />
              <p className="text-xs text-muted-foreground">
                يحمي فاتورة الـ API لأن الرابط عام. بعد الوصول للحد يرد البوت من «الأسئلة والأجوبة»
                حتى اليوم التالي.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard icon={CalendarCheck} title="الحجز من داخل الشات بوت">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-7`}>نموذج الحجز الذي يفتحه زر «حجز موعد»</Label>
          <Select
            value={draft.booking_form_id ?? NO_FORM}
            onValueChange={(v) => onChange({ booking_form_id: v === NO_FORM ? null : v })}
          >
            <SelectTrigger id={`${uid}-7`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FORM}>بدون — يعرض رقم العيادة للحجز</SelectItem>
              {forms.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.title}
                  {f.is_active ? "" : " (متوقف)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {forms.length === 0 && (
            <p className="text-xs text-muted-foreground">
              لا توجد نماذج بعد.{" "}
              <Link to="/forms" className="font-semibold text-primary-emphasis underline">
                أنشئ نموذج حجز
              </Link>{" "}
              ليحجز العميل من داخل المحادثة.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

type KnowledgeDraft = {
  id?: string | undefined;
  category: string;
  question: string;
  answer: string;
  is_active: boolean;
};

function KnowledgePanel({
  knowledge,
  canWrite,
  onEdit,
}: {
  knowledge: Knowledge[];
  canWrite: boolean;
  onEdit: (draft: KnowledgeDraft) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const categories = [...new Set([...KNOWLEDGE_CATEGORIES, ...knowledge.map((k) => k.category)])];
  const term = search.trim();
  const shown = knowledge.filter(
    (k) =>
      (category === "all" || k.category === category) &&
      (!term || k.question.includes(term) || k.answer.includes(term)),
  );

  const toggle = useMutation({
    mutationFn: async (k: Knowledge) => {
      const { error } = await supabase
        .from("chatbot_knowledge")
        .update({ is_active: !k.is_active })
        .eq("id", k.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["chatbot", "knowledge"] }),
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (k: Knowledge) => {
      const { error } = await supabase.from("chatbot_knowledge").delete().eq("id", k.id);
      if (error) throw error;
    },
    onSuccess: (_d, k) => {
      void logActivity({
        action: "delete",
        section: "chatbot_training",
        description: `حذف سؤال من معرفة الشات بوت: ${k.question.slice(0, 60)}`,
        entityType: "chatbot_knowledge",
        entityId: k.id,
      });
      toast.success("تم الحذف");
      void qc.invalidateQueries({ queryKey: ["chatbot", "knowledge"] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm text-muted-foreground">
        أسئلة يطرحها العملاء كثيرًا مع إجاباتها المعتمدة. يعتمد عليها الذكاء الاصطناعي في الرد،
        وبدونه يرد البوت بأقرب إجابة لسؤال العميل.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في الأسئلة والأجوبة…"
            className="pe-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canWrite && (
          <Button
            onClick={() => onEdit({ category: "عام", question: "", answer: "", is_active: true })}
          >
            <Plus />
            سؤال وجواب
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={knowledge.length ? "لا توجد نتائج" : "لم تُضف أسئلة وأجوبة بعد"}
          hint={
            knowledge.length
              ? "جرّب كلمة بحث أو تصنيفًا آخر."
              : "أضف أسئلة مثل: هل تقبلون التأمين؟ هل يوجد مواقف؟ كيف أستعد للزيارة؟"
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {shown.map((k) => (
            <li
              key={k.id}
              className={cn("surface-raised rounded-2xl p-4", !k.is_active && "opacity-60")}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <ToneBadge tone="primary" dot={false} className="mb-2">
                    {k.category}
                  </ToneBadge>
                  <p className="text-sm font-semibold text-foreground">{k.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {k.answer}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={k.is_active}
                      onCheckedChange={() => toggle.mutate(k)}
                      aria-label="مفعّل"
                      title={k.is_active ? "مفعّل" : "متوقف"}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="تعديل"
                      onClick={() =>
                        onEdit({
                          id: k.id,
                          category: k.category,
                          question: k.question,
                          answer: k.answer,
                          is_active: k.is_active,
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="حذف"
                      className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                      onClick={() => remove.mutate(k)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KnowledgeDialog({
  draft,
  onClose,
}: {
  draft: KnowledgeDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {draft && (
          <KnowledgeForm key={draft.id ?? draft.question} initial={draft} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeForm({ initial, onDone }: { initial: KnowledgeDraft; onDone: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const uid = useId();
  const categories = [...new Set([...KNOWLEDGE_CATEGORIES, initial.category])];

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        category: value.category,
        question: value.question.trim(),
        answer: value.answer.trim(),
        is_active: value.is_active,
      };
      const { error } = initial.id
        ? await supabase.from("chatbot_knowledge").update(row).eq("id", initial.id)
        : await supabase.from("chatbot_knowledge").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: initial.id ? "update" : "create",
        section: "chatbot_training",
        description: `${initial.id ? "تعديل" : "إضافة"} سؤال في معرفة الشات بوت: ${value.question.trim().slice(0, 60)}`,
        entityType: "chatbot_knowledge",
        entityId: initial.id ?? null,
      });
      toast.success(initial.id ? "تم حفظ التعديل" : "تمت الإضافة — البوت يستخدمها الآن");
      void qc.invalidateQueries({ queryKey: ["chatbot", "knowledge"] });
      onDone();
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial.id ? "تعديل سؤال وجواب" : "سؤال وجواب جديد"}</DialogTitle>
        <DialogDescription>
          اكتب السؤال كما يكتبه العميل عادة، والإجابة المعتمدة من العيادة.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-1`}>التصنيف</Label>
        <Select
          value={value.category}
          onValueChange={(category) => setValue((v) => ({ ...v, category }))}
        >
          <SelectTrigger id={`${uid}-1`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-2`}>السؤال</Label>
        <Input
          id={`${uid}-2`}
          value={value.question}
          maxLength={500}
          placeholder="مثال: هل تقبلون التأمين؟"
          onChange={(e) => setValue((v) => ({ ...v, question: e.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-3`}>الإجابة</Label>
        <Textarea
          id={`${uid}-3`}
          rows={4}
          value={value.answer}
          maxLength={4000}
          onChange={(e) => setValue((v) => ({ ...v, answer: e.target.value }))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={value.is_active}
          onCheckedChange={(is_active) => setValue((v) => ({ ...v, is_active }))}
        />
        مفعّل
      </label>
      <DialogFooter>
        <Button
          type="submit"
          disabled={!value.question.trim() || !value.answer.trim() || save.isPending}
        >
          {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const SOURCE_META: Record<string, { label: string; tone: Tone }> = {
  ai: { label: "ذكاء اصطناعي", tone: "accent" },
  knowledge: { label: "من الأسئلة والأجوبة", tone: "success" },
  fallback: { label: "بدون إجابة", tone: "warning" },
};

function LogsPanel({
  canWrite,
  onTeach,
}: {
  canWrite: boolean;
  onTeach: (question: string, answer: string) => void;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "fallback" | "knowledge" | "ai">("all");
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["chatbot", "logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_logs")
        .select("id, question, answer, source, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("chatbot_logs").delete().not("id", "is", null);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "delete",
        section: "chatbot_training",
        description: "مسح سجل أسئلة العملاء في الشات بوت",
        entityType: "chatbot_logs",
      });
      toast.success("تم مسح السجل");
      void qc.invalidateQueries({ queryKey: ["chatbot", "logs"] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const counts = {
    all: logs.length,
    fallback: logs.filter((l) => l.source === "fallback").length,
    knowledge: logs.filter((l) => l.source === "knowledge").length,
    ai: logs.filter((l) => l.source === "ai").length,
  };
  const shown = filter === "all" ? logs : logs.filter((l) => l.source === filter);
  const FILTERS = [
    ["all", "الكل"],
    ["fallback", "بدون إجابة"],
    ["knowledge", "من الأسئلة والأجوبة"],
    ["ai", "ذكاء اصطناعي"],
  ] as const;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        ما كتبه العملاء في المحادثة. أسئلة «بدون إجابة» هي أفضل مكان لتعليم البوت: أضف إجابتها بضغطة
        واحدة.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === key
                ? "border-primary bg-primary/15 text-primary-emphasis"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {label}
            <span className="tabular rounded-full bg-muted px-1.5 text-[10px]">{counts[key]}</span>
          </button>
        ))}
        {canWrite && logs.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="ms-auto text-muted-foreground">
                <Trash2 />
                مسح السجل
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>مسح سجل أسئلة العملاء؟</AlertDialogTitle>
                <AlertDialogDescription>
                  تُحذف كل الأسئلة المسجلة نهائيًا. لا يؤثر ذلك على الأسئلة والأجوبة المحفوظة.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => clear.mutate()}>مسح</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {isLoading ? (
        <RowsSkeleton rows={4} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="لا توجد أسئلة هنا بعد"
          hint="عندما يكتب العملاء أسئلتهم في الشات بوت تظهر هنا."
        />
      ) : (
        <ul className="space-y-2.5">
          {shown.map((l) => {
            const meta = SOURCE_META[l.source] ?? SOURCE_META["fallback"]!;
            return (
              <li key={l.id} className="surface-raised rounded-2xl p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{l.question}</p>
                    {l.answer && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.answer}</p>
                    )}
                    <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <ToneBadge tone={meta.tone} dot={false} className="!px-2 !py-0 text-[10px]">
                        {meta.label}
                      </ToneBadge>
                      {formatRelative(l.created_at)}
                    </p>
                  </div>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant={l.source === "fallback" ? "default" : "outline"}
                      onClick={() =>
                        onTeach(l.question, l.source === "fallback" ? "" : (l.answer ?? ""))
                      }
                    >
                      <Plus />
                      أضف للأسئلة والأجوبة
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
