// «موعد جديد»: a staff member books an appointment by hand (phone, walk-in). Lives on the
// calendar; the doctor's hours and double booking are checked by the database.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { addMinutes } from "@/lib/clinic";
import { logActivity } from "@/lib/activity";
import { useAppointmentRefs } from "@/components/app/edit-appointment-dialog";

export function NewAppointmentDialog({ defaultDate }: { defaultDate: string }) {
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
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
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
