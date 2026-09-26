import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATUS_FLOW,
  STATUS_LABELS,
  addMinutes,
  dbErrorMessage,
  formatTime,
  minutesFromTime,
} from "@/lib/clinic";
import type { AppointmentStatus } from "@/lib/clinic";
import { logActivity } from "@/lib/activity";

/** Patients, active doctors and active services for the booking forms (shared cache). */
export function useAppointmentRefs() {
  return useQuery({
    queryKey: ["appointment-refs"],
    queryFn: async () => {
      const [patients, doctors, services] = await Promise.all([
        supabase.from("patients").select("id, full_name, phone").order("full_name").limit(500),
        supabase.from("doctors").select("id, name, specialty_id").eq("status", "active"),
        supabase
          .from("services")
          .select("id, name, duration_minutes, price, specialty_id")
          .eq("is_active", true),
      ]);
      return {
        patients: patients.data ?? [],
        doctors: doctors.data ?? [],
        services: services.data ?? [],
      };
    },
  });
}

type Refs = NonNullable<ReturnType<typeof useAppointmentRefs>["data"]>;

const APPOINTMENT_FIELDS =
  "id, appointment_number, patient_id, doctor_id, service_id, specialty_id, appointment_date, start_time, end_time, status, price, notes, patients(full_name, phone), doctors(name), services(name)";

async function fetchAppointment(id: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_FIELDS)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

type Appointment = Awaited<ReturnType<typeof fetchAppointment>>;

/** Radix Select can't hold an empty value, so "no doctor / no service" uses a sentinel. */
const NONE = "none";

const FIELD_LABELS: Record<string, string> = {
  patient_id: "المريض",
  service_id: "الخدمة",
  doctor_id: "الطبيب",
  appointment_date: "التاريخ",
  start_time: "الوقت",
  end_time: "المدة",
  status: "الحالة",
  price: "السعر",
  notes: "الملاحظات",
};

/** Query keys of every screen that lists appointments. */
const APPOINTMENT_VIEWS = new Set(["appointments", "calendar", "dashboard", "analytics"]);

/**
 * Edit any booking in place. Controlled by `appointmentId`: the dialog is open
 * while it is set, and fetches a fresh copy of the appointment on every open.
 */
export function EditAppointmentDialog({
  appointmentId,
  onOpenChange,
}: {
  appointmentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: appt, isError } = useQuery({
    queryKey: ["appointment", appointmentId],
    enabled: !!appointmentId,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: () => fetchAppointment(appointmentId!),
  });
  const { data: refs } = useAppointmentRefs();

  return (
    <Dialog open={!!appointmentId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل الموعد</DialogTitle>
          <DialogDescription>
            {appt ? <span className="tabular">{appt.appointment_number} · </span> : null}
            يتم التحقق من دوام الطبيب ومنع التعارض تلقائيًا.
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            تعذر تحميل بيانات الموعد، أغلق النافذة وحاول مرة أخرى.
          </p>
        ) : appt && refs ? (
          <EditAppointmentForm
            key={appt.id}
            appt={appt}
            refs={refs}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditAppointmentForm({
  appt,
  refs,
  onDone,
}: {
  appt: Appointment;
  refs: Refs;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState(appt.patient_id);
  const [serviceId, setServiceId] = useState(appt.service_id ?? NONE);
  const [doctorId, setDoctorId] = useState(appt.doctor_id ?? NONE);
  const [date, setDate] = useState(appt.appointment_date);
  const [time, setTime] = useState(appt.start_time.slice(0, 5));
  const initialDuration = Math.max(
    5,
    minutesFromTime(appt.end_time) - minutesFromTime(appt.start_time),
  );
  const [duration, setDuration] = useState(initialDuration);
  const [price, setPrice] = useState(String(appt.price ?? 0));
  const [status, setStatus] = useState<AppointmentStatus>(appt.status);
  const [notes, setNotes] = useState(appt.notes ?? "");

  // The booking's current patient/doctor/service stay selectable even when they fall
  // outside the refs lists (inactive, or beyond the first 500 patients).
  const current = appt as unknown as {
    patients: { full_name: string; phone: string } | null;
    doctors: { name: string } | null;
    services: { name: string } | null;
  };
  const patients =
    refs.patients.some((p) => p.id === appt.patient_id) || !current.patients
      ? refs.patients
      : [{ id: appt.patient_id, ...current.patients }, ...refs.patients];
  const doctors =
    !appt.doctor_id || refs.doctors.some((d) => d.id === appt.doctor_id)
      ? refs.doctors
      : [
          { id: appt.doctor_id, name: current.doctors?.name ?? "طبيب غير نشط", specialty_id: null },
          ...refs.doctors,
        ];
  const services =
    !appt.service_id || refs.services.some((s) => s.id === appt.service_id)
      ? refs.services
      : [
          {
            id: appt.service_id,
            name: current.services?.name ?? "خدمة غير نشطة",
            duration_minutes: initialDuration,
            price: Number(appt.price ?? 0),
            specialty_id: appt.specialty_id,
          },
          ...refs.services,
        ];
  const statuses = STATUS_FLOW.includes(appt.status) ? STATUS_FLOW : [appt.status, ...STATUS_FLOW];

  const onServiceChange = (value: string) => {
    setServiceId(value);
    const service = refs.services.find((s) => s.id === value);
    if (service) {
      setDuration(service.duration_minutes);
      setPrice(String(service.price));
    }
  };

  const endMinutes = minutesFromTime(time) + duration;
  const endsNextDay = !!time && endMinutes >= 24 * 60;

  const save = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error("اختر المريض");
      if (!date || !time) throw new Error("حدد تاريخ ووقت الموعد");
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
        throw new Error("مدة الموعد يجب أن تكون بين 5 و480 دقيقة");
      }
      if (endsNextDay) throw new Error("يجب أن ينتهي الموعد في نفس اليوم");
      const priceValue = Number(price);
      if (price.trim() === "" || !Number.isFinite(priceValue) || priceValue < 0) {
        throw new Error("أدخل سعرًا صحيحًا");
      }

      const service = services.find((s) => s.id === serviceId);
      const next = {
        patient_id: patientId,
        service_id: serviceId === NONE ? null : serviceId,
        specialty_id:
          serviceId !== (appt.service_id ?? NONE)
            ? (service?.specialty_id ?? appt.specialty_id)
            : appt.specialty_id,
        doctor_id: doctorId === NONE ? null : doctorId,
        appointment_date: date,
        start_time: `${time}:00`,
        end_time: addMinutes(time, duration),
        status,
        price: priceValue,
        notes: notes.trim() || null,
      };

      // Send only what changed: the booking guard re-checks doctor hours and clashes
      // whenever doctor/date/time/status are written, even with unchanged values, so a
      // notes-only edit on an older booking must not trip it.
      const patch: Partial<typeof next> = {};
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        const before = key === "price" ? Number(appt.price ?? 0) : appt[key];
        if (next[key] !== before) Object.assign(patch, { [key]: next[key] });
      }
      if (Object.keys(patch).length === 0) return null;

      const { error } = await supabase.from("appointments").update(patch).eq("id", appt.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      onDone();
      if (!patch) {
        toast.info("لا توجد تغييرات لحفظها");
        return;
      }
      const changed = [
        ...new Set(
          Object.keys(patch)
            .map((k) => FIELD_LABELS[k])
            .filter(Boolean),
        ),
      ];
      void logActivity({
        action: "update",
        section: "appointments",
        description: `تعديل الموعد ${appt.appointment_number}${changed.length ? ` (${changed.join("، ")})` : ""}`,
        entityType: "appointment",
        entityId: appt.id,
        metadata: { changes: patch },
      });
      toast.success("تم حفظ تعديلات الموعد");
      void qc.invalidateQueries({
        predicate: (q) => APPOINTMENT_VIEWS.has(String(q.queryKey[0])),
      });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-1.5">
        <Label>المريض</Label>
        <Select value={patientId} onValueChange={setPatientId}>
          <SelectTrigger>
            <SelectValue placeholder="اختر المريض" />
          </SelectTrigger>
          <SelectContent>
            {patients.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name} — <span dir="ltr">{p.phone}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>الخدمة</Label>
          <Select value={serviceId} onValueChange={onServiceChange}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الخدمة" />
            </SelectTrigger>
            <SelectContent>
              {!appt.service_id && <SelectItem value={NONE}>بدون خدمة</SelectItem>}
              {services.map((s) => (
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
              {!appt.doctor_id && <SelectItem value={NONE}>بدون طبيب</SelectItem>}
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>التاريخ</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>الوقت</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <Label>المدة (دقيقة)</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            step={5}
            value={Number.isNaN(duration) ? "" : duration}
            onChange={(e) => setDuration(e.target.valueAsNumber)}
          />
        </div>
      </div>
      <p className={endsNextDay ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {endsNextDay
          ? "الموعد يتجاوز منتصف الليل — قلّل المدة أو قدّم الوقت."
          : time && Number.isInteger(duration)
            ? `ينتهي الموعد الساعة ${formatTime(addMinutes(time, duration))}`
            : "حدد الوقت والمدة"}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>السعر (ر.س)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>الحالة</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as AppointmentStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <DialogFooter className="mt-1">
        <Button type="submit" disabled={save.isPending || endsNextDay}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
        </Button>
      </DialogFooter>
    </form>
  );
}
