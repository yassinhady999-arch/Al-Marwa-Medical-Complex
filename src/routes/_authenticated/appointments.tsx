import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, CalendarDays, Phone, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, SourceBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import {
  STATUS_FLOW,
  STATUS_LABELS,
  formatDate,
  formatTime,
  todayRiyadh,
  addMinutes,
  currency,
} from "@/lib/clinic";
import type { AppointmentStatus } from "@/lib/clinic";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import {
  AppointmentFilterFields,
  useAppointmentFilters,
} from "@/components/app/appointment-filters";
import {
  EditAppointmentDialog,
  useAppointmentRefs,
} from "@/components/app/edit-appointment-dialog";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "المواعيد | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "إدارة حجوزات العيادة: إنشاء، تأكيد، حضور، إكمال وإلغاء المواعيد.",
      },
      { property: "og:title", content: "المواعيد | نظام تشغيل العيادة" },
      { property: "og:description", content: "إدارة حجوزات العيادة وحالات المواعيد." },
    ],
  }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [date, setDate] = useState(todayRiyadh());
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { filters, setFilters, matches } = useAppointmentFilters();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["appointments", date, status],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select(
          "id, appointment_number, appointment_date, start_time, end_time, status, source, price, notes, doctor_id, service_id, specialty_id, patients(full_name, phone), doctors(name), services(name)",
        )
        .eq("appointment_date", date)
        .order("start_time");
      if (status !== "all") q = q.eq("status", status as AppointmentStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("appointments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        qc.invalidateQueries({ queryKey: ["appointments"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: AppointmentStatus; number: string }) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          status: next,
          ...(next === "completed" ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void logActivity({
        action: "status_change",
        section: "appointments",
        description: `تغيير حالة الموعد ${vars.number} إلى «${STATUS_LABELS[vars.next]}»`,
        entityType: "appointment",
        entityId: vars.id,
        metadata: { status: vars.next },
      });
      toast.success("تم تحديث حالة الموعد");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (rows ?? []).filter((r) => {
    if (!matches(r)) return false;
    if (!search.trim()) return true;
    const term = search.trim();
    return (
      r.appointment_number.includes(term) ||
      (r.patients as unknown as { full_name?: string; phone?: string } | null)?.full_name?.includes(
        term,
      ) ||
      (r.patients as unknown as { phone?: string } | null)?.phone?.includes(term)
    );
  });

  return (
    <AppShell
      title="المواعيد"
      description="إدارة الحجوزات وحالات المواعيد"
      section="appointments"
      actions={me?.canWrite ? <NewAppointmentDialog defaultDate={date} /> : undefined}
    >
      <div className="surface-raised mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">التاريخ</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-44"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">الحالة</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {STATUS_FLOW.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AppointmentFilterFields filters={filters} onChange={setFilters} />
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label className="text-xs text-muted-foreground">بحث (اسم / جوال / رقم موعد)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث…"
              className="pe-9"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="لا توجد مواعيد"
          hint={`لا توجد نتائج ليوم ${formatDate(date)}`}
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="tabular font-semibold text-foreground">{filtered.length}</span> موعد
          </p>
          <div className="space-y-3">
            {filtered.map((a, i) => {
              const patient = a.patients as unknown as { full_name: string; phone: string } | null;
              return (
                <div
                  key={a.id}
                  className="surface-raised animate-rise flex flex-wrap items-center gap-4 rounded-2xl p-4"
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                >
                  <div className="w-16 shrink-0 text-center">
                    <p className="tabular text-sm font-bold text-foreground">
                      {formatTime(a.start_time)}
                    </p>
                    <p className="tabular text-[11px] text-muted-foreground">
                      {formatTime(a.end_time)}
                    </p>
                  </div>
                  <InitialsAvatar name={patient?.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {patient?.full_name ?? "—"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      <span dir="ltr">{patient?.phone ?? "—"}</span>
                      <span className="text-border-strong">·</span>
                      {(a.doctors as unknown as { name: string } | null)?.name ?? "بدون طبيب"}
                      <span className="text-border-strong">·</span>
                      {(a.services as unknown as { name: string } | null)?.name ?? "—"}
                    </p>
                    <p className="tabular mt-1 truncate text-[11px] text-muted-foreground">
                      {a.appointment_number} · {currency(a.price)}
                    </p>
                  </div>
                  <SourceBadge source={a.source} />
                  <StatusBadge status={a.status} />
                  {me?.canWrite && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`تعديل الموعد ${a.appointment_number}`}
                      title="تعديل الموعد"
                      onClick={() => setEditingId(a.id)}
                    >
                      <Pencil />
                    </Button>
                  )}
                  {me?.canWrite && (
                    <Select
                      value={a.status}
                      onValueChange={(v) =>
                        updateStatus.mutate({
                          id: a.id,
                          next: v as AppointmentStatus,
                          number: a.appointment_number,
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {!STATUS_FLOW.includes(a.status) && (
                          <SelectItem value={a.status} disabled>
                            {STATUS_LABELS[a.status]}
                          </SelectItem>
                        )}
                        {STATUS_FLOW.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <EditAppointmentDialog
        appointmentId={editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
    </AppShell>
  );
}

function NewAppointmentDialog({ defaultDate }: { defaultDate: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  const { data: refs } = useAppointmentRefs();

  const service = refs?.services.find((s) => s.id === serviceId);

  const create = useMutation({
    mutationFn: async () => {
      if (!patientId || !doctorId || !serviceId) throw new Error("اختر المريض والطبيب والخدمة");
      const duration = service?.duration_minutes ?? 30;
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          appointment_number: "",
          patient_id: patientId,
          doctor_id: doctorId,
          service_id: serviceId,
          specialty_id: service?.specialty_id ?? null,
          appointment_date: date,
          start_time: `${time}:00`,
          end_time: addMinutes(time, duration),
          price: service?.price ?? 0,
          source: "manual",
          notes: notes || null,
          idempotency_key: `manual-${patientId}-${date}-${time}`,
        })
        .select("id, appointment_number")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void logActivity({
        action: "create",
        section: "appointments",
        description: `حجز موعد جديد${data?.appointment_number ? ` ${data.appointment_number}` : ""} بتاريخ ${date}`,
        entityType: "appointment",
        entityId: data?.id ?? null,
      });
      toast.success("تم إنشاء الموعد");
      setOpen(false);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>موعد جديد</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>حجز موعد جديد</DialogTitle>
          <DialogDescription>يتم التحقق من دوام الطبيب ومنع التعارض تلقائيًا.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>المريض</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المريض" />
              </SelectTrigger>
              <SelectContent>
                {refs?.patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} — <span dir="ltr">{p.phone}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>الخدمة</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الخدمة" />
              </SelectTrigger>
              <SelectContent>
                {refs?.services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {s.duration_minutes} د
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>الطبيب</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الطبيب" />
              </SelectTrigger>
              <SelectContent>
                {refs?.doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>الوقت</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "جارٍ الحفظ…" : "حفظ الموعد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
