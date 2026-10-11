import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { CalendarX2, Copy, Pencil, Phone, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToneBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import {
  DOCTOR_DEPARTMENTS,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  dbErrorMessage,
  departmentIds,
  formatTime,
} from "@/lib/clinic";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/doctors")({
  head: () => ({
    meta: [
      { title: "الأطباء | نظام تشغيل العيادة" },
      { name: "description", content: "إدارة الأطباء وأقسامهم وجداول عملهم الأسبوعية." },
      { property: "og:title", content: "الأطباء | نظام تشغيل العيادة" },
      { property: "og:description", content: "إدارة الأطباء وجداول العمل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorsPage,
});

type Schedule = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  is_active: boolean;
};

type Doctor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  bio: string | null;
  departments: string[];
  schedules: Schedule[];
};

function DoctorsPage() {
  const { data: me } = useProfile();
  const [editing, setEditing] = useState<Doctor | "new" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["doctors-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          `id, name, phone, email, status, bio, specialty_id, ${DOCTOR_DEPARTMENTS}, doctor_schedules(day_of_week, start_time, end_time, break_start, break_end, is_active)`,
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((d): Doctor => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        email: d.email,
        status: d.status,
        bio: d.bio,
        departments: departmentIds(d),
        schedules: ((d.doctor_schedules ?? []) as Schedule[])
          .filter((s) => s.is_active)
          .sort((a, b) => a.day_of_week - b.day_of_week),
      }));
    },
  });

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const specialtyName = (id: string) => specialties.find((s) => s.id === id)?.name;

  return (
    <AppShell
      title="الأطباء"
      description="الفريق الطبي وأقسامه وجداول العمل"
      section="doctors"
      actions={
        me?.isAdmin ? <Button onClick={() => setEditing("new")}>طبيب جديد</Button> : undefined
      }
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
            const activeDays = new Set(d.schedules.map((s) => s.day_of_week));
            const departments = d.departments.map(specialtyName).filter(Boolean);
            return (
              <div
                key={d.id}
                className="surface-raised animate-rise flex flex-col rounded-2xl p-4"
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
                      {departments.length ? departments.join(" · ") : "بدون قسم"}
                    </p>
                    {d.bio && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.bio}</p>
                    )}
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

                {d.schedules.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {d.schedules.map((s) => (
                      <p key={s.day_of_week} className="tabular text-[11px] text-muted-foreground">
                        {WEEKDAYS[s.day_of_week]}: {formatTime(s.start_time)} —{" "}
                        {formatTime(s.end_time)}
                        {s.break_start && s.break_end
                          ? ` (استراحة ${formatTime(s.break_start)} — ${formatTime(s.break_end)})`
                          : ""}
                      </p>
                    ))}
                  </div>
                ) : (
                  d.status === "active" && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-warning-foreground">
                      <CalendarX2 className="size-3.5" />
                      لا يوجد جدول عمل، لن يظهر في الحجز حتى تضيفه
                    </p>
                  )
                )}

                {me?.isAdmin && (
                  <div className="mt-auto pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setEditing(d)}
                    >
                      <Pencil className="size-3.5" />
                      تعديل البيانات وجدول العمل
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <DoctorDialog
          doctor={editing === "new" ? null : editing}
          specialties={specialties}
          onClose={() => setEditing(null)}
        />
      )}
    </AppShell>
  );
}

type DayDraft = { on: boolean; start: string; end: string; breakStart: string; breakEnd: string };

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

function toDays(schedules: Schedule[]): DayDraft[] {
  return WEEKDAYS.map((_, day) => {
    const s = schedules.find((x) => x.day_of_week === day);
    return s
      ? {
          on: true,
          start: hhmm(s.start_time),
          end: hhmm(s.end_time),
          breakStart: hhmm(s.break_start),
          breakEnd: hhmm(s.break_end),
        }
      : { on: false, start: "09:00", end: "17:00", breakStart: "", breakEnd: "" };
  });
}

/** Same rules save_doctor enforces, in Arabic, before the request goes out. */
function scheduleProblems(days: DayDraft[]): string[] {
  const problems: string[] = [];
  days.forEach((d, i) => {
    if (!d.on) return;
    const day = WEEKDAYS[i];
    if (!d.start || !d.end || d.start >= d.end)
      problems.push(`${day}: وقت النهاية يجب أن يكون بعد وقت البداية`);
    else if (!!d.breakStart !== !!d.breakEnd)
      problems.push(`${day}: اكتب بداية ونهاية الاستراحة أو اتركهما فارغين`);
    else if (
      d.breakStart &&
      (d.breakStart >= d.breakEnd || d.breakStart <= d.start || d.breakEnd >= d.end)
    )
      problems.push(`${day}: الاستراحة يجب أن تكون داخل وقت العمل`);
  });
  return problems;
}

function DoctorDialog({
  doctor,
  specialties,
  onClose,
}: {
  doctor: Doctor | null;
  specialties: { id: string; name: string; is_active: boolean }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const uid = useId();
  const [form, setForm] = useState({
    name: doctor?.name ?? "",
    bio: doctor?.bio ?? "",
    phone: doctor?.phone ?? "",
    email: doctor?.email ?? "",
    active: (doctor?.status ?? "active") === "active",
  });
  // Order matters: the first department is the doctor's main one.
  const [departments, setDepartments] = useState<string[]>(doctor?.departments ?? []);
  const [days, setDays] = useState<DayDraft[]>(() => toDays(doctor?.schedules ?? []));

  const choices = specialties.filter((s) => s.is_active || departments.includes(s.id));
  const problems = [
    ...(form.name.trim().length < 2 ? ["اكتب اسم الطبيب"] : []),
    ...scheduleProblems(days),
  ];

  const setDay = (index: number, patch: Partial<DayDraft>) =>
    setDays((all) => all.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const firstOn = days.find((d) => d.on);
  const copyToAll = () =>
    firstOn &&
    setDays((all) =>
      all.map((d) =>
        d.on
          ? {
              ...d,
              start: firstOn.start,
              end: firstOn.end,
              breakStart: firstOn.breakStart,
              breakEnd: firstOn.breakEnd,
            }
          : d,
      ),
    );

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("save_doctor", {
        _doctor_id: doctor?.id ?? null,
        _payload: {
          name: form.name.trim(),
          bio: form.bio.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          status: form.active ? "active" : "inactive",
          specialty_ids: departments,
          schedules: days.flatMap((d, day) =>
            d.on
              ? [
                  {
                    day_of_week: day,
                    start_time: d.start,
                    end_time: d.end,
                    break_start: d.breakStart || null,
                    break_end: d.breakEnd || null,
                  },
                ]
              : [],
          ),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      void logActivity({
        action: doctor ? "update" : "create",
        section: "doctors",
        description: `${doctor ? "تعديل" : "إضافة"} طبيب: ${form.name.trim()}`,
        entityType: "doctor",
        entityId: id ?? doctor?.id ?? null,
      });
      toast.success(doctor ? "تم حفظ بيانات الطبيب" : "تمت إضافة الطبيب");
      void qc.invalidateQueries({ queryKey: ["doctors-full"] });
      void qc.invalidateQueries({ queryKey: ["appointment-filter-options"] });
      void qc.invalidateQueries({ queryKey: ["appointment-refs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doctor ? `تعديل: ${doctor.name}` : "إضافة طبيب"}</DialogTitle>
          <DialogDescription>
            الطبيب يظهر في الحجز والشات بوت في كل قسم يعمل فيه، وفي الأيام والساعات المحددة فقط.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-name`}>الاسم</Label>
              <Input
                id={`${uid}-name`}
                value={form.name}
                placeholder="مثال: د. محمد أحمد"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-phone`}>الجوال</Label>
              <Input
                id={`${uid}-phone`}
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`${uid}-bio`}>التخصص الدقيق / نبذة</Label>
              <Textarea
                id={`${uid}-bio`}
                rows={2}
                value={form.bio}
                placeholder="مثال: تركيبات وعلاج عصب وحشوات للكبار والأطفال"
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">يراها العملاء في الشات بوت.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-email`}>البريد الإلكتروني</Label>
              <Input
                id={`${uid}-email`}
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <Switch
                id={`${uid}-active`}
                checked={form.active}
                onCheckedChange={(active) => setForm({ ...form, active })}
              />
              <Label htmlFor={`${uid}-active`}>نشط ويستقبل حجوزات</Label>
            </div>
          </div>

          <div role="group" aria-labelledby={`${uid}-depts`} className="space-y-2">
            <p id={`${uid}-depts`} className="text-sm font-medium text-foreground">
              الأقسام التي يعمل فيها
            </p>
            <div className="flex flex-wrap gap-2">
              {choices.map((s) => {
                const index = departments.indexOf(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                      index >= 0
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border bg-surface text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={index >= 0}
                      onCheckedChange={(on) =>
                        setDepartments((all) =>
                          on ? [...all, s.id] : all.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {s.name}
                    {index === 0 && departments.length > 1 && (
                      <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary-emphasis">
                        رئيسي
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              أول قسم تختاره هو القسم الرئيسي. لا يمكن حجز الطبيب في وقتين متداخلين حتى لو كانا في
              قسمين مختلفين.
            </p>
          </div>

          <div role="group" aria-labelledby={`${uid}-week`} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p id={`${uid}-week`} className="text-sm font-medium text-foreground">
                جدول العمل الأسبوعي
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!firstOn}
                onClick={copyToAll}
              >
                <Copy className="size-3.5" />
                نفس أوقات أول يوم لكل الأيام
              </Button>
            </div>
            <div className="divide-y divide-border/70 rounded-xl border border-border">
              {days.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                  <label className="flex w-24 shrink-0 cursor-pointer items-center gap-2 text-sm">
                    <Switch
                      checked={d.on}
                      aria-label={`يعمل يوم ${WEEKDAYS[i]}`}
                      onCheckedChange={(on) => setDay(i, { on })}
                    />
                    {WEEKDAYS[i]}
                  </label>
                  {d.on ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>من</span>
                      <Input
                        type="time"
                        aria-label={`بداية ${WEEKDAYS[i]}`}
                        className="h-8 w-28"
                        value={d.start}
                        onChange={(e) => setDay(i, { start: e.target.value })}
                      />
                      <span>إلى</span>
                      <Input
                        type="time"
                        aria-label={`نهاية ${WEEKDAYS[i]}`}
                        className="h-8 w-28"
                        value={d.end}
                        onChange={(e) => setDay(i, { end: e.target.value })}
                      />
                      <span className="ms-1">استراحة</span>
                      <Input
                        type="time"
                        aria-label={`بداية استراحة ${WEEKDAYS[i]}`}
                        className="h-8 w-28"
                        value={d.breakStart}
                        onChange={(e) => setDay(i, { breakStart: e.target.value })}
                      />
                      <span>—</span>
                      <Input
                        type="time"
                        aria-label={`نهاية استراحة ${WEEKDAYS[i]}`}
                        className="h-8 w-28"
                        value={d.breakEnd}
                        onChange={(e) => setDay(i, { breakEnd: e.target.value })}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">إجازة</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              الاستراحة اختيارية، مثلًا للدوام على فترتين (صباحي ومسائي).
            </p>
          </div>

          {problems.length > 0 && form.name.trim() !== "" && (
            <ul className="space-y-1 rounded-xl bg-destructive-soft px-3 py-2 text-xs text-destructive">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button disabled={problems.length > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
