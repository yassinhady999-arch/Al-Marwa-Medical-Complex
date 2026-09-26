import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, XCircle, Wallet, BarChart3 } from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { StatGridSkeleton, ChartSkeleton } from "@/components/app/state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  axisTick,
  gridProps,
  ChartTooltip,
  ChartFrame,
  ChartLegend,
} from "@/components/app/chart-kit";
import { STATUS_META, SOURCE_META, TONE_HEX, formatDate, percent, todayRiyadh } from "@/lib/clinic";
import type { AppointmentStatus, BookingSource } from "@/lib/clinic";
import {
  AppointmentFilterFields,
  useAppointmentFilters,
} from "@/components/app/appointment-filters";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "التقارير | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "تحليلات المواعيد والإيرادات ومصادر الحجز خلال آخر 30 يومًا.",
      },
      { property: "og:title", content: "التقارير | نظام تشغيل العيادة" },
      { property: "og:description", content: "تحليلات المواعيد والإيرادات ومصادر الحجز." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
}

/** First/last day (YYYY-MM-DD) of the Riyadh month `monthOffset` away from `base`. */
function monthBounds(base: string, monthOffset: number): { from: string; to: string } {
  const [y, m] = base.split("-").map(Number) as [number, number];
  let ty = y;
  let tm = m + monthOffset;
  while (tm < 1) {
    tm += 12;
    ty -= 1;
  }
  while (tm > 12) {
    tm -= 12;
    ty += 1;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return { from: `${ty}-${pad(tm)}-01`, to: `${ty}-${pad(tm)}-${pad(lastDay)}` };
}

type Preset = "7d" | "30d" | "90d" | "this_month" | "last_month" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  "7d": "آخر ٧ أيام",
  "30d": "آخر ٣٠ يومًا",
  "90d": "آخر ٩٠ يومًا",
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  custom: "فترة مخصّصة",
};

const PRESET_ORDER: Preset[] = ["7d", "30d", "90d", "this_month", "last_month", "custom"];

function AnalyticsPage() {
  const today = todayRiyadh();
  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState(() => daysAgo(30));
  const [customTo, setCustomTo] = useState(today);
  const { filters, setFilters, matches, active } = useAppointmentFilters();

  const { from, to } = useMemo(() => {
    switch (preset) {
      case "7d":
        return { from: daysAgo(7), to: today };
      case "90d":
        return { from: daysAgo(90), to: today };
      case "this_month": {
        const b = monthBounds(today, 0);
        return { from: b.from, to: b.to < today ? b.to : today };
      }
      case "last_month":
        return monthBounds(today, -1);
      case "custom":
        return { from: customFrom, to: customTo < customFrom ? customFrom : customTo };
      case "30d":
      default:
        return { from: daysAgo(30), to: today };
    }
  }, [preset, today, customFrom, customTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, appointment_date, status, source, price, doctor_id, service_id, specialty_id, doctors(name), services(name)",
        )
        .gte("appointment_date", from)
        .lte("appointment_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (data ?? []).filter(matches);
  const completed = rows.filter((r) => r.status === "completed");
  const cancelled = rows.filter((r) => r.status === "cancelled" || r.status === "no_show");
  const revenue = completed.reduce((sum, r) => sum + Number(r.price ?? 0), 0);
  const completionRate = rows.length ? completed.length / rows.length : 0;
  const cancelRate = rows.length ? cancelled.length / rows.length : 0;

  const byStatus = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([status, count]) => {
    const meta = STATUS_META[status as AppointmentStatus];
    return { name: meta?.label ?? status, value: count, color: TONE_HEX[meta?.tone ?? "neutral"] };
  });

  const bySource = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.source] = (acc[r.source] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([source, count]) => {
    const meta = SOURCE_META[source as BookingSource];
    return { name: meta?.label ?? source, value: count, color: TONE_HEX[meta?.tone ?? "neutral"] };
  });

  const topBy = (key: "doctors" | "services") =>
    Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const name = (r[key] as unknown as { name: string } | null)?.name ?? "غير محدد";
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  const byDoctor = topBy("doctors");
  const byService = topBy("services");

  const byDay = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.appointment_date] = (acc[r.appointment_date] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ name: date.slice(5), value: count }));

  return (
    <AppShell
      title="التقارير"
      description={`أداء العيادة — ${PRESET_LABELS[preset]}`}
      section="analytics"
    >
      <div className="surface-raised mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">الفترة الزمنية</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRESET_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preset === "custom" && (
          <>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">من</Label>
              <Input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">إلى</Label>
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
          </>
        )}

        <AppointmentFilterFields filters={filters} onChange={setFilters} />

        <p className="tabular text-xs text-muted-foreground sm:ms-auto">
          {formatDate(from)} — {formatDate(to)}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <StatGridSkeleton count={4} />
          <ChartSkeleton />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="لا توجد بيانات كافية"
          hint={
            active
              ? "لا توجد مواعيد تطابق القسم / الطبيب / الخدمة المختارة ضمن هذه الفترة."
              : "لا توجد مواعيد ضمن هذه الفترة. جرّب فترة زمنية أخرى."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              index={0}
              label="إجمالي المواعيد"
              value={rows.length}
              icon={CalendarCheck2}
              tone="primary"
            />
            <StatCard
              index={1}
              label="مواعيد مكتملة"
              value={completed.length}
              icon={CheckCircle2}
              tone="success"
              hint={`نسبة الإكمال ${percent(completionRate)}`}
            />
            <StatCard
              index={2}
              label="ملغية / لم يحضر"
              value={cancelled.length}
              icon={XCircle}
              tone="danger"
              hint={`نسبة الإلغاء ${percent(cancelRate)}`}
            />
            <StatCard
              index={3}
              label="إيراد المكتملة"
              value={Math.round(revenue)}
              numeric
              suffix="ر.س"
              icon={Wallet}
              tone="success"
            />
          </div>

          <SectionCard
            title="المواعيد اليومية"
            description={`${formatDate(from)} — ${formatDate(to)}`}
          >
            <ChartFrame height={260}>
              <AreaChart data={byDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="an-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-info)" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-border)" }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="مواعيد"
                  stroke="var(--color-info)"
                  strokeWidth={2}
                  fill="url(#an-area)"
                />
              </AreaChart>
            </ChartFrame>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <DonutCard title="التوزيع حسب الحالة" data={byStatus} />
            <DonutCard title="مصادر الحجز" data={bySource} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankCard title="المواعيد حسب الطبيب" data={byDoctor} total={rows.length} />
            <RankCard title="المواعيد حسب الخدمة" data={byService} total={rows.length} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function DonutCard({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <SectionCard title={title}>
      <ChartFrame height={216}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={54}
            outerRadius={84}
            paddingAngle={2}
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ChartFrame>
      <div className="mt-4 border-t border-border/70 pt-4">
        <ChartLegend
          items={data.map((d) => ({
            label: d.name,
            color: d.color,
            value: `${d.value} (${total ? Math.round((d.value / total) * 100) : 0}٪)`,
          }))}
        />
      </div>
    </SectionCard>
  );
}

function RankCard({
  title,
  data,
  total,
}: {
  title: string;
  data: { name: string; value: number }[];
  total: number;
}) {
  return (
    <SectionCard title={title}>
      <ul className="space-y-3">
        {data.slice(0, 8).map((d) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={d.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground">{d.name}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">
                  {d.value} ({pct}٪)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
