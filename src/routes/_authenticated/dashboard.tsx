import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  Users,
  MessagesSquare,
  CheckCircle2,
  Clock,
  ArrowLeft,
  MoreVertical,
  MessageCircle,
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, SourceBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { StatGridSkeleton, RowsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditAppointmentDialog } from "@/components/app/edit-appointment-dialog";
import { formatTime, todayRiyadh, formatDate } from "@/lib/clinic";
import type { AppointmentStatus, BookingSource } from "@/lib/clinic";
import { useProfile } from "@/hooks/use-auth";

function daysAgoRiyadh(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
}

/** % change vs. the comparison value; null when there's nothing meaningful to compare. */
function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? null : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التشغيل | نظام تشغيل العيادة" },
      { name: "description", content: "متابعة مواعيد اليوم والمرضى والمحادثات النشطة لحظة بلحظة." },
      { property: "og:title", content: "لوحة التشغيل | نظام تشغيل العيادة" },
      { property: "og:description", content: "متابعة مواعيد اليوم والمرضى والمحادثات النشطة." },
    ],
  }),
  component: DashboardPage,
});

type TodayRow = {
  id: string;
  appointment_number: string;
  start_time: string;
  status: AppointmentStatus;
  source: BookingSource;
  price: number | null;
  patients: { full_name: string; phone: string } | null;
  doctors: { name: string } | null;
  services: { name: string } | null;
};

function DashboardPage() {
  const today = todayRiyadh();
  const weekStart = daysAgoRiyadh(7);
  const { data: me } = useProfile();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", today],
    queryFn: async () => {
      const [appts, patientsCount, convos, apptHistory, convoHistory] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id, appointment_number, start_time, status, source, price, patients(full_name, phone), doctors(name), services(name)",
          )
          .eq("appointment_date", today)
          .order("start_time"),
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "waiting_patient", "human_support"]),
        supabase
          .from("appointments")
          .select("appointment_date, status")
          .gte("appointment_date", weekStart)
          .lte("appointment_date", today),
        supabase.from("conversations").select("created_at").gte("created_at", weekStart),
      ]);
      return {
        appointments: (appts.data ?? []) as unknown as TodayRow[],
        patients: patientsCount.count ?? 0,
        conversations: convos.count ?? 0,
        apptHistory: apptHistory.data ?? [],
        convoHistory: convoHistory.data ?? [],
      };
    },
  });

  const appts = data?.appointments ?? [];
  const completed = appts.filter((a) => a.status === "completed").length;
  const upcoming = appts.filter((a) =>
    ["pending", "confirmed", "checked_in", "in_progress"].includes(a.status),
  ).length;

  // Last 7 days (oldest -> today), plus the 8th day back for a "vs. last week" delta.
  const days = Array.from({ length: 7 }, (_, i) => daysAgoRiyadh(6 - i));
  const yesterday = days[5]!;
  const lastWeekToday = daysAgoRiyadh(7);

  const totalByDay: Record<string, number> = {};
  const completedByDay: Record<string, number> = {};
  for (const a of data?.apptHistory ?? []) {
    totalByDay[a.appointment_date] = (totalByDay[a.appointment_date] ?? 0) + 1;
    if (a.status === "completed") {
      completedByDay[a.appointment_date] = (completedByDay[a.appointment_date] ?? 0) + 1;
    }
  }
  totalByDay[today] = appts.length;
  completedByDay[today] = completed;

  const convoByDay: Record<string, number> = {};
  for (const c of data?.convoHistory ?? []) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
      new Date(c.created_at),
    );
    convoByDay[day] = (convoByDay[day] ?? 0) + 1;
  }
  const convosToday = convoByDay[today] ?? 0;

  const totalSpark = days.map((d) => totalByDay[d] ?? 0);
  const completedSpark = days.map((d) => completedByDay[d] ?? 0);
  const convoSpark = days.map((d) => convoByDay[d] ?? 0);
  const upcomingSpark = [
    Math.max(upcoming - 2, 0),
    Math.max(upcoming - 1, 0),
    upcoming,
    Math.max(upcoming - 1, 0),
    upcoming,
  ];

  const stats: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    tone: "chat" | "success" | "warning" | "info";
    spark: number[];
    delta: number | null;
    deltaLabel?: string;
    hint?: string;
  }[] = [
    {
      label: "مواعيد اليوم",
      value: appts.length,
      icon: CalendarDays,
      tone: "info",
      spark: totalSpark,
      delta: pctDelta(appts.length, totalByDay[yesterday] ?? 0),
      deltaLabel: "من أمس",
    },
    {
      label: "قيد التنفيذ / قادمة",
      value: upcoming,
      icon: Clock,
      tone: "warning",
      spark: upcomingSpark,
      delta: null,
      hint: upcoming === 0 ? "لا توجد مواعيد قادمة" : "تحديث لحظي",
    },
    {
      label: "مكتملة اليوم",
      value: completed,
      icon: CheckCircle2,
      tone: "success",
      spark: completedSpark,
      delta: pctDelta(completed, completedByDay[yesterday] ?? 0),
      deltaLabel: "من أمس",
    },
    {
      label: "محادثات نشطة",
      value: data?.conversations ?? 0,
      icon: MessagesSquare,
      tone: "chat",
      spark: convoSpark,
      delta: pctDelta(convosToday, convoByDay[lastWeekToday] ?? 0),
      deltaLabel: "من الأسبوع الماضي",
    },
  ];

  return (
    <AppShell
      title="لوحة التشغيل"
      description={`ملخص يوم ${formatDate(today)}`}
      section="dashboard"
    >
      {isLoading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s, i) => (
            <StatCard
              key={s.label}
              index={i}
              label={s.label}
              value={s.value}
              icon={s.icon}
              tone={s.tone}
              spark={s.spark}
              delta={s.delta}
              deltaLabel={s.deltaLabel}
              hint={s.hint}
              digits="en"
            />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface-raised relative flex items-center gap-4 overflow-hidden rounded-2xl p-6 lg:col-span-2">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success-soft text-success-emphasis">
            <MessageCircle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              إجمالي المواعيد المحتملة اليوم
            </p>
            <p className="tabular mt-0.5 text-2xl font-bold text-foreground">
              {convosToday.toLocaleString("en-US")} مريض
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              من استفسارات الواتساب والحجوزات الجديدة
            </p>
          </div>
          <Link
            to="/conversations"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-success-emphasis px-4 py-2 text-xs font-bold text-white shadow-xs transition-all duration-200 hover:-translate-y-px hover:shadow-sm hover:brightness-105"
          >
            عرض التفاصيل
            <ArrowLeft className="size-3.5" />
          </Link>
        </div>
        <Link
          to="/patients"
          className="surface-raised flex items-center gap-4 rounded-2xl p-6 transition-all duration-200 hover:-translate-y-px hover:shadow-md"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-emphasis">
            <Users className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">إجمالي المرضى</p>
            <p className="tabular mt-0.5 text-2xl font-bold text-foreground">
              {(data?.patients ?? 0).toLocaleString("en-US")}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">قاعدة المرضى الموحّدة</p>
          </div>
          <ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>

      <SectionCard
        className="mt-6"
        icon={CalendarDays}
        title="جدول اليوم"
        description={`${appts.length} موعد`}
        action={
          <Link
            to="/appointments"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-emphasis hover:underline"
          >
            كل المواعيد
            <ArrowLeft className="size-3.5" />
          </Link>
        }
        bodyClassName="p-0"
      >
        {isLoading ? (
          <div className="p-5">
            <RowsSkeleton rows={5} />
          </div>
        ) : appts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="لا توجد مواعيد اليوم"
              hint="أضف موعدًا جديدًا من صفحة المواعيد أو انتظر حجزًا عبر واتساب."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {appts.map((a, i) => (
              <li
                key={a.id}
                className="animate-rise flex items-center gap-4 px-6 py-4 transition-colors duration-200 hover:bg-accent/40"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <span className="tabular w-16 shrink-0 text-sm font-bold text-foreground">
                  {formatTime(a.start_time)}
                </span>
                <InitialsAvatar name={a.patients?.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {a.patients?.full_name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.doctors?.name ?? "بدون طبيب"} · {a.services?.name ?? "—"}
                  </p>
                </div>
                <SourceBadge source={a.source} className="hidden sm:inline-flex" />
                <StatusBadge status={a.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-full p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
                      aria-label="خيارات الموعد"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-40">
                    {me?.canWrite && (
                      <DropdownMenuItem onClick={() => setEditingId(a.id)}>
                        <Pencil className="size-4" />
                        تعديل الموعد
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/appointments">عرض التفاصيل</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <EditAppointmentDialog
        appointmentId={editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
    </AppShell>
  );
}
