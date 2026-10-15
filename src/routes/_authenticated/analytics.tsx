import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Inbox,
  PhoneCall,
  Wallet,
  XCircle,
} from "lucide-react";
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
import {
  STATUS_META,
  SOURCE_META,
  TONE_HEX,
  formatDate,
  formatDateTime,
  formatTime,
  percent,
  todayRiyadh,
} from "@/lib/clinic";
import type { AppointmentStatus, BookingSource } from "@/lib/clinic";
import {
  AppointmentFilterFields,
  useAppointmentFilters,
  type FilterableAppointment,
} from "@/components/app/appointment-filters";
import { RequestStatusBadge } from "@/components/app/booking-requests";
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_META,
  requestStatus,
  type BookingRequestStatus,
} from "@/lib/booking-forms";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "التقارير | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "تحليلات الحجوزات المحتملة والمواعيد والإيرادات ومصادر الحجز.",
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

      <RequestsReport from={from} to={to} matches={matches} />

      <div className="mb-4 mt-8">
        <h2 className="text-lg font-bold text-foreground">المواعيد</h2>
        <p className="text-xs text-muted-foreground">
          المواعيد المحجوزة فعلًا (ومنها الحجوزات المحتملة بعد تأكيدها)، بحسب تاريخ الموعد.
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

/** «الحجوزات المحتملة» in the report: every request from the booking form in the period. */
function RequestsReport({
  from,
  to,
  matches,
}: {
  from: string;
  to: string;
  matches: (r: FilterableAppointment) => boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["booking-requests", "report", from, to],
    queryFn: async () => {
      // The period is in Riyadh days; created_at is a timestamp.
      const start = new Date(`${from}T00:00:00+03:00`).toISOString();
      const end = new Date(`${to}T23:59:59.999+03:00`).toISOString();
      const { data, error } = await supabase
        .from("booking_form_submissions")
        .select(
          "id, request_number, status, created_at, answers, specialty_id, service_id, doctor_id, specialties(name), services(name), doctors(name), appointments(appointment_number, appointment_date, start_time)",
        )
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (data ?? []).filter(matches).map((r) => {
    const answers = (Array.isArray(r.answers) ? r.answers : []) as {
      type?: string;
      value?: string;
    }[];
    const nameOf = (v: unknown) => (v as { name?: string } | null)?.name ?? null;
    return {
      id: r.id,
      number: r.request_number ?? "—",
      status: requestStatus(r.status),
      createdAt: r.created_at,
      name: answers.find((a) => a.type === "full_name")?.value ?? "—",
      phone: answers.find((a) => a.type === "phone")?.value ?? "—",
      service: nameOf(r.services) ?? nameOf(r.specialties) ?? "غير محدد",
      doctor: nameOf(r.doctors),
      appointment: r.appointments as unknown as {
        appointment_number: string;
        appointment_date: string;
        start_time: string;
      } | null,
    };
  });
  const count = (s: BookingRequestStatus) => rows.filter((r) => r.status === s).length;
  const confirmed = count("confirmed");
  const conversion = rows.length ? confirmed / rows.length : 0;

  const byStatus = REQUEST_STATUSES.map((s) => ({
    name: REQUEST_STATUS_META[s].label,
    value: count(s),
    color: TONE_HEX[REQUEST_STATUS_META[s].tone],
  })).filter((d) => d.value > 0);
  const byService = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.service] = (acc[r.service] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  return (
    <section aria-labelledby="report-requests" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="report-requests" className="text-lg font-bold text-foreground">
            الحجوزات المحتملة
          </h2>
          <p className="text-xs text-muted-foreground">
            كل من طلب استكمال الحجز عبر واتساب من نموذج الحجز خلال الفترة، بحسب تاريخ الطلب.
          </p>
        </div>
        <Link
          to="/appointments"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-emphasis hover:underline"
        >
          متابعتها في قسم الحجوزات
          <ArrowLeft className="size-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <StatGridSkeleton count={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="لا توجد حجوزات محتملة في هذه الفترة"
          hint="تظهر هنا طلبات نموذج الحجز بكل حالاتها. جرّب فترة زمنية أخرى."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              index={0}
              label="إجمالي الحجوزات المحتملة"
              value={rows.length}
              icon={Inbox}
              tone="chat"
            />
            <StatCard
              index={1}
              label={REQUEST_STATUS_META.pending_contact.label}
              value={count("pending_contact")}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              index={2}
              label={REQUEST_STATUS_META.contacted.label}
              value={count("contacted")}
              icon={PhoneCall}
              tone="info"
            />
            <StatCard
              index={3}
              label={REQUEST_STATUS_META.confirmed.label}
              value={confirmed}
              icon={CalendarCheck2}
              tone="success"
              hint={`نسبة التحويل إلى موعد ${percent(conversion)}`}
            />
            <StatCard
              index={4}
              label={REQUEST_STATUS_META.cancelled.label}
              value={count("cancelled")}
              icon={XCircle}
              tone="neutral"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DonutCard title="الحجوزات المحتملة حسب الحالة" data={byStatus} />
            <RankCard title="الحجوزات المحتملة حسب الخدمة" data={byService} total={rows.length} />
          </div>

          <SectionCard
            title="كل الحجوزات المحتملة"
            description={`${rows.length} حجز محتمل · ${formatDate(from)} — ${formatDate(to)}`}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs text-muted-foreground">
                    {[
                      "رقم الطلب",
                      "الاسم",
                      "الجوال",
                      "الخدمة المطلوبة",
                      "الطبيب",
                      "الحالة",
                      "تاريخ الطلب",
                      "الموعد",
                    ].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-middle hover:bg-accent/40">
                      <td className="tabular px-4 py-2.5 font-medium text-foreground">
                        {r.number}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{r.name}</td>
                      <td className="tabular px-4 py-2.5 text-muted-foreground" dir="ltr">
                        {r.phone}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{r.service}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.doctor ?? "أي طبيب"}</td>
                      <td className="px-4 py-2.5">
                        <RequestStatusBadge status={r.status} />
                      </td>
                      <td className="tabular px-4 py-2.5 text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="tabular px-4 py-2.5 text-muted-foreground">
                        {r.status === "confirmed" && r.appointment
                          ? `${formatDate(r.appointment.appointment_date)} · ${formatTime(r.appointment.start_time)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </section>
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
