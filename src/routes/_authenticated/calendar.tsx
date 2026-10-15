import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, ChevronLeft, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/status-badge";
import { RowsSkeleton } from "@/components/app/state";
import { STATUS_META, formatTime, todayRiyadh, WEEKDAYS, TONE_DOT } from "@/lib/clinic";
import type { AppointmentStatus } from "@/lib/clinic";
import { cn } from "@/lib/utils";
import { AppointmentFilterBar, useAppointmentFilters } from "@/components/app/appointment-filters";
import { EditAppointmentDialog } from "@/components/app/edit-appointment-dialog";
import { NewAppointmentDialog } from "@/components/app/new-appointment-dialog";
import { useProfile } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "التقويم | نظام تشغيل العيادة" },
      { name: "description", content: "عرض أسبوعي لمواعيد العيادة موزعة على الأيام والأطباء." },
      { property: "og:title", content: "التقويم | نظام تشغيل العيادة" },
      { property: "og:description", content: "عرض أسبوعي لمواعيد العيادة." },
    ],
  }),
  component: CalendarPage,
});

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  // Format from local Y/M/D, not toISOString() (which converts to UTC and
  // shifts the calendar date by a day in any positive-UTC-offset timezone —
  // e.g. Riyadh — since this Date was parsed as local midnight).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CalendarPage() {
  const [anchor, setAnchor] = useState(todayRiyadh());
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: me } = useProfile();
  const { filters, setFilters, matches, active } = useAppointmentFilters();

  const weekStart = useMemo(() => {
    const d = new Date(`${anchor}T00:00:00`);
    return addDays(anchor, -d.getDay());
  }, [anchor]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = days[6]!;

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, appointment_date, start_time, status, doctor_id, service_id, specialty_id, patients(full_name), doctors(name), services(name)",
        )
        .gte("appointment_date", weekStart)
        .lte("appointment_date", weekEnd)
        .order("start_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = todayRiyadh();
  const visible = (data ?? []).filter(matches);
  const todayCount = visible.filter((a) => a.appointment_date === today).length;

  return (
    <AppShell
      title="التقويم"
      description={`الأسبوع ${weekStart} — ${weekEnd}`}
      section="calendar"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {me?.canWrite && <NewAppointmentDialog defaultDate={todayRiyadh()} />}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="الأسبوع السابق"
              onClick={() => setAnchor(addDays(weekStart, -7))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(todayRiyadh())}>
              اليوم
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="الأسبوع التالي"
              onClick={() => setAnchor(addDays(weekStart, 7))}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
      }
    >
      <AppointmentFilterBar
        filters={filters}
        onChange={setFilters}
        summary={
          <>
            اليوم: <span className="font-semibold text-foreground">{todayCount}</span> موعد ·
            الأسبوع: <span className="font-semibold text-foreground">{visible.length}</span>
            {active && ` من ${data?.length ?? 0}`}
          </>
        }
      />

      {isLoading ? (
        <RowsSkeleton rows={7} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((day, idx) => {
            const items = visible.filter((a) => a.appointment_date === day);
            const isToday = day === today;
            return (
              <div
                key={day}
                className={cn(
                  "surface-raised animate-rise flex flex-col overflow-hidden rounded-2xl",
                  isToday && "ring-2 ring-primary/40",
                )}
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div
                  className={cn(
                    "flex items-center justify-between border-b border-border/70 px-3.5 py-2.5",
                    isToday && "bg-primary/10",
                  )}
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">{WEEKDAYS[idx]}</p>
                    <p className="tabular text-[11px] text-muted-foreground">{day.slice(5)}</p>
                  </div>
                  {items.length > 0 && (
                    <span className="tabular grid size-6 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      {items.length}
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-1.5 p-3">
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">لا مواعيد</p>
                  ) : (
                    items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!me?.canWrite}
                        onClick={() => setEditingId(a.id)}
                        title={me?.canWrite ? "تعديل الموعد" : undefined}
                        className="group block w-full rounded-xl border border-border bg-surface-2/60 p-2.5 text-start transition-colors duration-200 enabled:hover:border-primary/40 enabled:hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-default"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              TONE_DOT[STATUS_META[a.status as AppointmentStatus].tone],
                            )}
                          />
                          <span className="tabular text-xs font-bold text-foreground">
                            {formatTime(a.start_time)}
                          </span>
                          {me?.canWrite && (
                            <Pencil className="ms-auto size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs font-medium text-foreground">
                          {(a.patients as unknown as { full_name: string } | null)?.full_name ??
                            "—"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {(a.doctors as unknown as { name: string } | null)?.name ?? "—"}
                          {(a.services as unknown as { name: string } | null)?.name &&
                            ` · ${(a.services as unknown as { name: string }).name}`}
                        </p>
                        <StatusBadge
                          status={a.status as AppointmentStatus}
                          className="mt-1.5 !px-1.5 !py-0 text-[10px]"
                        />
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <EditAppointmentDialog
        appointmentId={editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
    </AppShell>
  );
}
