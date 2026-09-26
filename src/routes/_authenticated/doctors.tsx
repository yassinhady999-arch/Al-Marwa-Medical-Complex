import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Stethoscope, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { ToneBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import { WEEKDAYS, WEEKDAYS_SHORT, formatTime } from "@/lib/clinic";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/doctors")({
  head: () => ({
    meta: [
      { title: "الأطباء | نظام تشغيل العيادة" },
      { name: "description", content: "إدارة الأطباء وتخصصاتهم وجداول عملهم الأسبوعية." },
      { property: "og:title", content: "الأطباء | نظام تشغيل العيادة" },
      { property: "og:description", content: "إدارة الأطباء وجداول العمل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorsPage,
});

type Schedule = { day_of_week: number; start_time: string; end_time: string; is_active: boolean };

function DoctorsPage() {
  const { data: me } = useProfile();

  const { data, isLoading } = useQuery({
    queryKey: ["doctors-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, name, phone, email, status, bio, specialties(name), doctor_schedules(day_of_week, start_time, end_time, is_active)",
        )
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title="الأطباء"
      description="فريق العيادة الطبي وجداول العمل"
      section="doctors"
      actions={me?.isAdmin ? <NewDoctorDialog /> : undefined}
    >
      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="لا يوجد أطباء"
          hint="أضف أطباء العيادة لتفعيل الحجز والتقويم."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((d, i) => {
            const schedules = ((d.doctor_schedules ?? []) as Schedule[]).filter((s) => s.is_active);
            const activeDays = new Set(schedules.map((s) => s.day_of_week));
            return (
              <div
                key={d.id}
                className="surface-raised animate-rise rounded-2xl p-4"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={d.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-foreground">{d.name}</p>
                      <ToneBadge tone={d.status === "active" ? "success" : "neutral"}>
                        {d.status === "active" ? "نشط" : "موقوف"}
                      </ToneBadge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {d.specialties?.name ?? "بدون تخصص"}
                    </p>
                    {d.phone && (
                      <p
                        className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                        dir="ltr"
                      >
                        <Phone className="size-3" />
                        {d.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-1 border-t border-border/70 pt-3">
                  {WEEKDAYS_SHORT.map((wd, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        "tabular grid h-6 flex-1 place-items-center rounded-md text-[10px] font-semibold",
                        activeDays.has(idx)
                          ? "bg-primary/15 text-primary-emphasis"
                          : "bg-muted text-muted-foreground/60",
                      )}
                    >
                      {wd}
                    </span>
                  ))}
                </div>

                {schedules.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {schedules
                      .sort((a, b) => a.day_of_week - b.day_of_week)
                      .map((s) => (
                        <p
                          key={s.day_of_week}
                          className="tabular text-[11px] text-muted-foreground"
                        >
                          {WEEKDAYS[s.day_of_week]}: {formatTime(s.start_time)} —{" "}
                          {formatTime(s.end_time)}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function NewDoctorDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", specialty_id: "" });

  const { data: specialties } = useQuery({
    queryKey: ["specialties-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .insert({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          specialty_id: form.specialty_id || null,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void logActivity({
        action: "create",
        section: "doctors",
        description: `إضافة طبيب: ${data?.name ?? form.name.trim()}`,
        entityType: "doctor",
        entityId: data?.id ?? null,
      });
      toast.success("تمت إضافة الطبيب");
      setOpen(false);
      setForm({ name: "", phone: "", email: "", specialty_id: "" });
      qc.invalidateQueries({ queryKey: ["doctors-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>طبيب جديد</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة طبيب</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>الاسم</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>التخصص</Label>
            <Select
              value={form.specialty_id}
              onValueChange={(v) => setForm({ ...form, specialty_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر التخصص" />
              </SelectTrigger>
              <SelectContent>
                {(specialties ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>الجوال</Label>
            <Input
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
