import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Workflow, ScrollText, Plug, Webhook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/app/section-card";
import { ToneBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import type { Tone } from "@/lib/clinic";
import { formatDateTime } from "@/lib/clinic";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/automation")({
  head: () => ({
    meta: [
      { title: "الأتمتة والتكامل | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "متابعة أحداث التكامل مع n8n وواتساب وسجلات الأتمتة ونقاط الربط الرسمية.",
      },
      { property: "og:title", content: "الأتمتة والتكامل | نظام تشغيل العيادة" },
      { property: "og:description", content: "أحداث التكامل وسجلات الأتمتة ونقاط الربط." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomationPage,
});

const EVENT_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار المعالجة",
  processing: "قيد المعالجة",
  delivered: "تم التسليم",
  failed: "فشل",
};

const EVENT_STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  processing: "info",
  delivered: "success",
  failed: "danger",
};

const METHOD_TONE: Record<string, Tone> = {
  GET: "info",
  POST: "success",
  PATCH: "warning",
  DELETE: "danger",
};

function AutomationPage() {
  const { data: me } = useProfile();

  return (
    <AppShell
      title="الأتمتة والتكامل"
      description="ربط العيادة مع n8n وواتساب ومتابعة التنفيذ"
      section="automation"
    >
      <Tabs defaultValue="events" dir="rtl">
        <TabsList>
          <TabsTrigger value="events">
            <Workflow className="size-4" />
            أحداث التكامل
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="size-4" />
            سجل الأتمتة
          </TabsTrigger>
          <TabsTrigger value="endpoints">
            <Plug className="size-4" />
            نقاط الربط
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <EventsPanel />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsPanel />
        </TabsContent>
        <TabsContent value="endpoints" className="mt-4">
          <EndpointsPanel canEdit={!!me?.isAdmin} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function EventsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["integration_events"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_events")
        .select(
          "id, event_type, entity_type, entity_id, status, attempts, error_message, created_at, processed_at",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <RowsSkeleton rows={6} />;
  if ((data ?? []).length === 0)
    return (
      <EmptyState icon={Workflow} title="لا توجد أحداث" hint="ستظهر هنا الأحداث الصادرة إلى n8n." />
    );

  const failed = (data ?? []).filter((e) => e.status === "failed").length;

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        <span className="tabular font-semibold text-foreground">{(data ?? []).length}</span> حدث ·{" "}
        <span className="tabular font-semibold text-destructive">{failed}</span> فشل
      </p>
      {(data ?? []).map((e) => (
        <div
          key={e.id}
          className="surface-raised flex flex-wrap items-center gap-3 rounded-2xl p-4"
        >
          <ToneBadge tone={EVENT_STATUS_TONE[e.status] ?? "neutral"}>
            {EVENT_STATUS_LABELS[e.status] ?? e.status}
          </ToneBadge>
          <span className="font-mono text-sm font-medium text-foreground">{e.event_type}</span>
          <span className="text-xs text-muted-foreground">{e.entity_type}</span>
          <span className="tabular ms-auto text-xs text-muted-foreground">
            {formatDateTime(e.created_at)}
          </span>
          {e.error_message && (
            <p className="w-full rounded-lg bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">
              {e.error_message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function LogsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["automation_logs"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_logs")
        .select("id, workflow_name, event_type, status, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <RowsSkeleton rows={6} />;
  if ((data ?? []).length === 0)
    return (
      <EmptyState
        icon={ScrollText}
        title="لا توجد سجلات"
        hint="ستظهر هنا عمليات n8n بعد أول تنفيذ."
      />
    );

  return (
    <div className="space-y-2.5">
      {(data ?? []).map((l) => (
        <div
          key={l.id}
          className="surface-raised flex flex-wrap items-center gap-3 rounded-2xl p-4"
        >
          <ToneBadge tone={l.status === "success" ? "success" : "danger"}>
            {l.status === "success" ? "نجحت" : "فشلت"}
          </ToneBadge>
          <span className="font-mono text-sm font-medium text-foreground">{l.workflow_name}</span>
          <span className="text-xs text-muted-foreground">{l.event_type ?? "—"}</span>
          <span className="tabular ms-auto text-xs text-muted-foreground">
            {formatDateTime(l.created_at)}
          </span>
          {l.error_message && (
            <p className="w-full rounded-lg bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">
              {l.error_message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/public/integrations/n8n/availability?doctor_id=&date=YYYY-MM-DD&duration=30",
    desc: "المواعيد المتاحة لطبيب في يوم محدد.",
  },
  {
    method: "POST",
    path: "/api/public/integrations/n8n/appointments",
    desc: "إنشاء موعد (يتطلب idempotency_key ويمنع الحجز المزدوج تلقائيًا).",
  },
  {
    method: "PATCH",
    path: "/api/public/integrations/n8n/appointments",
    desc: "تحديث حالة موعد (تأكيد، إلغاء، اكتمال…).",
  },
  {
    method: "POST",
    path: "/api/public/integrations/n8n/messages",
    desc: "استقبال رسائل واتساب الواردة/الصادرة وربطها بالمريض والمحادثة (تعيد bot_active).",
  },
  {
    method: "POST",
    path: "/api/public/integrations/n8n/handoff",
    desc: "تحويل المحادثة إلى موظف (التدخل البشري) وإيقاف البوت حتى يعيدها الموظف.",
  },
  {
    method: "GET",
    path: "/api/public/integrations/n8n/handoff?external_conversation_id=",
    desc: "هل يُسمح للبوت بالرد على هذه المحادثة الآن؟ (bot_active).",
  },
  {
    method: "GET",
    path: "/api/public/integrations/n8n/events",
    desc: "سحب الأحداث المعلّقة الصادرة من النظام.",
  },
  {
    method: "POST",
    path: "/api/public/integrations/n8n/events",
    desc: "تأكيد معالجة الأحداث (delivered / failed).",
  },
];

function EndpointsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [webhook, setWebhook] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const { data: settings } = useQuery({
    queryKey: ["clinic_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_settings")
        .select("id, n8n_webhook_url")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("لا توجد إعدادات عيادة");
      const { error } = await supabase
        .from("clinic_settings")
        .update({ n8n_webhook_url: (webhook ?? "").trim() || null })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "update",
        section: "automation",
        description: "تحديث رابط n8n الصادر",
        entityType: "clinic_settings",
      });
      toast.success("تم حفظ رابط n8n");
      qc.invalidateQueries({ queryKey: ["clinic_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("تم النسخ");
  };

  return (
    <div className="space-y-4">
      <SectionCard icon={Webhook} title="رابط n8n الصادر">
        <Label>Webhook URL في n8n</Label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <Input
            dir="ltr"
            placeholder="https://n8n.example.com/webhook/clinic"
            value={webhook ?? settings?.n8n_webhook_url ?? ""}
            onChange={(e) => setWebhook(e.target.value)}
            disabled={!canEdit}
          />
          <Button onClick={() => save.mutate()} disabled={!canEdit || save.isPending}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          المصادقة على نقاط الربط تتم عبر ترويسة{" "}
          <span className="rounded bg-muted px-1 font-mono text-[11px]">x-api-key</span> بمفتاح
          التكامل المخزّن في أسرار المشروع.
        </p>
      </SectionCard>

      <SectionCard icon={Plug} title="نقاط الربط الرسمية">
        <div className="space-y-2">
          {ENDPOINTS.map((e) => (
            <div
              key={`${e.method}-${e.path}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/50 p-3"
            >
              <ToneBadge
                tone={METHOD_TONE[e.method] ?? "neutral"}
                dot={false}
                className="font-mono"
              >
                {e.method}
              </ToneBadge>
              <span dir="ltr" className="break-all font-mono text-xs text-foreground">
                {e.path}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                className="ms-auto"
                aria-label="نسخ الرابط"
                onClick={() => copy(`${origin}${e.path.split("?")[0]}`)}
              >
                <Copy className="size-4" />
              </Button>
              <p className="w-full text-xs text-muted-foreground">{e.desc}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
