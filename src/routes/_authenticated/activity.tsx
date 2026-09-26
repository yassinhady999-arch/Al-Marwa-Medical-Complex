import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import { useProfile } from "@/hooks/use-auth";
import { ACTION_BADGE, ACTION_LABELS, SECTIONS, SECTION_LABELS } from "@/lib/access";
import { formatDateTime } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "سجل النشاط | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "سجل يوضّح ما قام به كل موظف داخل النظام: إضافة وتعديل وحذف وتسجيل الدخول.",
      },
      { property: "og:title", content: "سجل النشاط | نظام تشغيل العيادة" },
      { property: "og:description", content: "سجل نشاط الموظفين داخل النظام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

const PAGE_SIZE = 50;
const ACTION_KEYS = Object.keys(ACTION_LABELS);

/** True when the query failed only because the migration hasn't been applied yet. */
function isSchemaMissing(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return (
    err?.code === "PGRST205" ||
    err?.code === "42P01" ||
    /schema cache|does not exist/i.test(err?.message ?? "")
  );
}

function ActivityPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const isAdmin = !!me?.isAdmin;

  const [userId, setUserId] = useState("all");
  const [section, setSection] = useState("all");
  const [action, setAction] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: employees } = useQuery({
    queryKey: ["activity-employees"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: result, isLoading } = useQuery({
    queryKey: ["activity-logs", userId, section, action, limit],
    refetchInterval: 20000,
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select(
          "id, user_id, actor_name, actor_email, action, section, entity_type, description, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (userId !== "all") q = q.eq("user_id", userId);
      if (section !== "all") q = q.eq("section", section);
      if (action !== "all") q = q.eq("action", action);
      const { data, error } = await q;
      if (error) {
        if (isSchemaMissing(error)) return { rows: [], notReady: true };
        throw error;
      }
      return { rows: data ?? [], notReady: false };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("activity-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, () =>
        qc.invalidateQueries({ queryKey: ["activity-logs"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const list = result?.rows ?? [];
  const notReady = result?.notReady ?? false;

  return (
    <AppShell
      title="سجل النشاط"
      description={isAdmin ? "كل ما قام به الموظفون داخل النظام" : "سجل نشاطك داخل النظام"}
      section="activity"
    >
      {notReady ? (
        <EmptyState
          icon={History}
          title="سجل النشاط غير مُفعّل بعد"
          hint="طبّق أحدث تحديث لقاعدة البيانات (migration) على Supabase لتفعيل هذا القسم."
        />
      ) : (
        <ActivityBody
          isAdmin={isAdmin}
          isLoading={isLoading}
          list={list}
          limit={limit}
          setLimit={setLimit}
          employees={employees ?? []}
          userId={userId}
          setUserId={setUserId}
          section={section}
          setSection={setSection}
          action={action}
          setAction={setAction}
        />
      )}
    </AppShell>
  );
}

type Emp = { id: string; full_name: string; email: string | null };
type LogRow = {
  id: string;
  user_id: string | null;
  actor_name: string;
  actor_email: string | null;
  action: string;
  section: string;
  entity_type: string | null;
  description: string;
  created_at: string;
};

function ActivityBody({
  isAdmin,
  isLoading,
  list,
  limit,
  setLimit,
  employees,
  userId,
  setUserId,
  section,
  setSection,
  action,
  setAction,
}: {
  isAdmin: boolean;
  isLoading: boolean;
  list: LogRow[];
  limit: number;
  setLimit: React.Dispatch<React.SetStateAction<number>>;
  employees: Emp[];
  userId: string;
  setUserId: (v: string) => void;
  section: string;
  setSection: (v: string) => void;
  action: string;
  setAction: (v: string) => void;
}) {
  return (
    <>
      <div className="surface-raised mb-4 flex flex-wrap items-end gap-3 rounded-2xl p-4">
        {isAdmin && (
          <div className="grid gap-1.5">
            <Label className="text-xs">الموظف</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name || e.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label className="text-xs">القسم</Label>
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {SECTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">نوع الإجراء</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {ACTION_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {ACTION_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={8} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={History}
          title="لا يوجد نشاط"
          hint="ستظهر هنا إجراءات الموظفين فور حدوثها."
        />
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div
              key={r.id}
              className="surface-raised flex flex-wrap items-center gap-3 rounded-2xl p-4"
            >
              <Badge variant={ACTION_BADGE[r.action] ?? "secondary"}>
                {ACTION_LABELS[r.action] ?? r.action}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {SECTION_LABELS[r.section] ?? r.section}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {r.description || "—"}
              </span>
              <span className="text-xs font-medium text-foreground">
                {r.actor_name || r.actor_email || "—"}
              </span>
              <span className="tabular text-xs text-muted-foreground">
                {formatDateTime(r.created_at)}
              </span>
            </div>
          ))}

          {list.length >= limit && (
            <div className="pt-2 text-center">
              <Button variant="outline" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                عرض المزيد
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
