import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { CalendarClock, CircleCheckBig, LoaderCircle, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  currency,
  dbErrorMessage,
  formatDate,
  formatTime,
  todayRiyadh,
} from "@/lib/clinic";
import type { BookingConfirmation, FormField, PublicBookingForm } from "@/lib/booking-forms";

const ANY_DOCTOR = "any";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Shown in the builder's preview, where nothing is booked for real. */
function sampleSlots(): { day: string; slot_time: string }[] {
  const today = todayRiyadh();
  return [1, 2, 3, 5].flatMap((offset) =>
    ["09:00:00", "09:30:00", "10:30:00", "12:00:00", "16:00:00", "17:30:00"].map((slot_time) => ({
      day: addDaysIso(today, offset),
      slot_time,
    })),
  );
}

function dayLabel(day: string): { top: string; bottom: string } {
  const today = todayRiyadh();
  const date = new Date(`${day}T00:00:00`);
  const top =
    day === today
      ? "اليوم"
      : day === addDaysIso(today, 1)
        ? "غدًا"
        : (WEEKDAYS[date.getDay()] ?? "");
  const bottom = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    day: "numeric",
    month: "short",
  }).format(date);
  return { top, bottom };
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * The booking form a customer fills in. `preview` renders the same form for the
 * builder with sample times and no real submission.
 */
export function BookingFormView({
  form,
  preview = false,
}: {
  form: PublicBookingForm;
  preview?: boolean | undefined;
}) {
  const qc = useQueryClient();
  const uid = useId();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [specialtyId, setSpecialtyId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState(ANY_DOCTOR);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One id per attempt: a double tap or retry returns the same booking instead of a second one.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<BookingConfirmation | null>(null);

  const { settings } = form;
  const askSpecialty = form.specialties.length > 1;
  const activeSpecialty = form.specialties.length === 1 ? form.specialties[0]!.id : specialtyId;
  const services = form.services.filter(
    (s) => !activeSpecialty || s.specialty_id === activeSpecialty || s.specialty_id === null,
  );
  const service = services.find((s) => s.id === serviceId);
  const doctorSpecialty = service ? service.specialty_id : activeSpecialty || null;
  const doctors = form.doctors.filter(
    (d) => !doctorSpecialty || d.specialty_id === doctorSpecialty,
  );
  const chosenDoctor =
    settings.choose_doctor && doctorId !== ANY_DOCTOR && doctors.some((d) => d.id === doctorId)
      ? doctorId
      : null;
  const ready = (!askSpecialty || !!activeSpecialty) && (services.length === 0 || !!service);

  const slots = useQuery({
    queryKey: [
      "public-slots",
      form.slug,
      service?.id ?? null,
      chosenDoctor,
      activeSpecialty || null,
    ],
    enabled: ready && !preview,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_booking_availability", {
        _slug: form.slug,
        ...(service ? { _service_id: service.id } : {}),
        ...(chosenDoctor ? { _doctor_id: chosenDoctor } : {}),
        ...(!service && activeSpecialty ? { _specialty_id: activeSpecialty } : {}),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const slotRows = preview ? (ready ? sampleSlots() : []) : (slots.data ?? []);
  const byDay = new Map<string, string[]>();
  for (const s of slotRows) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.slot_time]);
  const days = [...byDay.keys()];
  const activeDay = byDay.has(day) ? day : (days[0] ?? "");
  const times = byDay.get(activeDay) ?? [];
  const activeTime = times.includes(time) ? time : "";

  const setAnswer = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setErrors(({ [id]: _drop, ...rest }) => rest);
  };
  const resetSlot = () => {
    setTime("");
    setErrors(({ appointment: _drop, ...rest }) => rest);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_public_booking", {
        _slug: form.slug,
        _payload: {
          request_id: requestId,
          specialty_id: service?.specialty_id ?? (activeSpecialty || null),
          service_id: service?.id ?? null,
          doctor_id: chosenDoctor,
          date: activeDay,
          time: activeTime.slice(0, 5),
          answers,
        } as Json,
      });
      if (error) throw error;
      return data as unknown as BookingConfirmation;
    },
    onSuccess: (confirmation) => {
      setDone(confirmation);
      void qc.invalidateQueries({ queryKey: ["public-slots", form.slug] });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: Error) => {
      if (/SLOT_TAKEN|DOUBLE_BOOKING/.test(e.message)) {
        setTime("");
        void slots.refetch();
        setErrors({ appointment: dbErrorMessage(e) });
      } else {
        setErrors({ _form: dbErrorMessage(e) });
      }
    },
  });

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    for (const f of form.fields) {
      if (f.type === "appointment") continue;
      const value = (answers[f.id] ?? "").trim();
      const empty = f.type === "checkbox" ? value !== "true" : value === "";
      if (empty) {
        if (f.required) found[f.id] = "هذا الحقل مطلوب";
        continue;
      }
      if (f.type === "phone" && (digits(value).length < 9 || digits(value).length > 15))
        found[f.id] = "رقم الجوال غير صحيح";
      if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
        found[f.id] = "البريد الإلكتروني غير صحيح";
      if (f.type === "full_name" && value.length < 2) found[f.id] = "اكتب الاسم الكامل";
    }
    if (askSpecialty && !activeSpecialty) found["appointment"] = "اختر التخصص";
    else if (services.length > 0 && !service) found["appointment"] = "اختر الخدمة";
    else if (!activeTime) found["appointment"] = "اختر يوم ووقت الموعد";
    return found;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    const found = validate();
    setErrors(found);
    const first = form.fields.find((f) => found[f.id]);
    if (first) {
      document
        .getElementById(`field-${first.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    submit.mutate();
  }

  if (done) {
    return (
      <div className="animate-rise space-y-5 py-4 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success-emphasis">
          <CircleCheckBig className="size-9" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-foreground">تم حجز موعدك بنجاح</h2>
          {done.success_message && (
            <p className="mt-1.5 text-sm text-muted-foreground">{done.success_message}</p>
          )}
        </div>
        <dl className="mx-auto grid max-w-sm gap-2 rounded-2xl border border-border bg-surface-2/60 p-4 text-sm">
          {[
            ["رقم الحجز", done.appointment_number],
            ["التاريخ", formatDate(done.date)],
            ["الوقت", `${formatTime(done.start_time)} – ${formatTime(done.end_time)}`],
            ["الطبيب", done.doctor_name],
            ["الخدمة", done.service_name],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular font-semibold text-foreground">{v}</dd>
              </div>
            ))}
        </dl>
        <Button
          variant="outline"
          onClick={() => {
            // A new booking may be for someone else or another service: start clean.
            setDone(null);
            setAnswers({});
            setSpecialtyId("");
            setServiceId("");
            setDoctorId(ANY_DOCTOR);
            setDay("");
            setTime("");
            setErrors({});
            setRequestId(crypto.randomUUID());
          }}
        >
          حجز موعد آخر
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{form.title}</h1>
        {form.description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{form.description}</p>
        )}
      </header>

      {form.fields.map((field) =>
        field.type === "appointment" ? (
          <section
            key={field.id}
            id="field-appointment"
            className="space-y-4 rounded-2xl border border-border bg-surface-2/50 p-4"
          >
            <p className="flex items-center gap-2 font-bold text-foreground">
              <CalendarClock className="size-5 text-primary-emphasis" />
              {field.label}
            </p>

            {askSpecialty && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-1`}>التخصص</Label>
                <Select
                  value={specialtyId}
                  onValueChange={(v) => {
                    setSpecialtyId(v);
                    setServiceId("");
                    setDoctorId(ANY_DOCTOR);
                    resetSlot();
                  }}
                >
                  <SelectTrigger id={`${uid}-1`}>
                    <SelectValue placeholder="اختر التخصص" />
                  </SelectTrigger>
                  <SelectContent>
                    {form.specialties.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {services.length > 0 && (!askSpecialty || activeSpecialty) && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-2`}>الخدمة</Label>
                <Select
                  value={serviceId}
                  onValueChange={(v) => {
                    setServiceId(v);
                    setDoctorId(ANY_DOCTOR);
                    resetSlot();
                  }}
                >
                  <SelectTrigger id={`${uid}-2`}>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {s.duration_minutes} د
                        {settings.show_prices ? ` · ${currency(s.price)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {settings.choose_doctor && ready && doctors.length > 1 && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-3`}>الطبيب</Label>
                <Select
                  value={doctorId}
                  onValueChange={(v) => {
                    setDoctorId(v);
                    resetSlot();
                  }}
                >
                  <SelectTrigger id={`${uid}-3`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_DOCTOR}>أي طبيب متاح</SelectItem>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {settings.choose_doctor && ready && doctors.length === 1 && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Stethoscope className="size-4" />
                الطبيب: <span className="font-semibold text-foreground">{doctors[0]!.name}</span>
              </p>
            )}

            {!ready ? (
              <p className="text-sm text-muted-foreground">
                {askSpecialty && !activeSpecialty ? "اختر التخصص" : "اختر الخدمة"} لعرض المواعيد
                المتاحة.
              </p>
            ) : !preview && slots.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                جارٍ تحميل المواعيد المتاحة…
              </p>
            ) : !preview && slots.isError ? (
              <p className="text-sm text-destructive">
                تعذّر تحميل المواعيد.{" "}
                <button type="button" className="underline" onClick={() => void slots.refetch()}>
                  إعادة المحاولة
                </button>
              </p>
            ) : days.length === 0 ? (
              <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                لا توجد مواعيد متاحة خلال الفترة القادمة. جرّب{" "}
                {settings.choose_doctor ? "طبيبًا أو " : ""}
                خدمة أخرى، أو تواصل مع العيادة
                {form.clinic?.phone ? (
                  <>
                    {" "}
                    على <span dir="ltr">{form.clinic.phone}</span>
                  </>
                ) : null}
                .
              </p>
            ) : (
              <div className="space-y-3">
                {preview && (
                  <p className="text-xs text-muted-foreground">
                    أوقات تجريبية للمعاينة — الرابط الفعلي يعرض الأوقات المتاحة فعلًا.
                  </p>
                )}
                <div
                  className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                  role="listbox"
                  aria-label="اليوم"
                >
                  {days.map((d) => {
                    const label = dayLabel(d);
                    const selected = d === activeDay;
                    return (
                      <button
                        key={d}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setDay(d);
                          resetSlot();
                        }}
                        className={cn(
                          "flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground shadow-soft"
                            : "border-border bg-surface hover:border-border-strong hover:bg-accent",
                        )}
                      >
                        <span className="font-bold">{label.top}</span>
                        <span className={cn("tabular", !selected && "text-muted-foreground")}>
                          {label.bottom}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div
                  className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                  role="listbox"
                  aria-label="الوقت"
                >
                  {times.map((t) => {
                    const selected = t === activeTime;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setDay(activeDay);
                          setTime(t);
                          setErrors(({ appointment: _drop, ...rest }) => rest);
                        }}
                        className={cn(
                          "tabular rounded-xl border py-2 text-sm font-semibold transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground shadow-soft"
                            : "border-border bg-surface text-foreground hover:border-border-strong hover:bg-accent",
                        )}
                      >
                        {formatTime(t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {errors["appointment"] && (
              <p className="text-xs font-medium text-destructive">{errors["appointment"]}</p>
            )}
          </section>
        ) : (
          <FieldInput
            key={field.id}
            field={field}
            value={answers[field.id] ?? ""}
            error={errors[field.id]}
            onChange={(v) => setAnswer(field.id, v)}
          />
        ),
      )}

      {errors["_form"] && (
        <p className="rounded-xl border border-destructive/25 bg-destructive-soft p-3 text-sm text-destructive">
          {errors["_form"]}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={preview || submit.isPending}>
        {submit.isPending ? "جارٍ تأكيد الحجز…" : "تأكيد الحجز"}
      </Button>
      {preview && (
        <p className="text-center text-xs text-muted-foreground">
          معاينة فقط — جرّب الحجز الفعلي من رابط النموذج.
        </p>
      )}
    </form>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.id}`;
  const label = (
    <Label htmlFor={id}>
      {field.label}
      {field.required && <span className="ms-0.5 text-destructive">*</span>}
    </Label>
  );
  const invalid = error ? true : undefined;
  let control: React.ReactNode;

  switch (field.type) {
    case "phone":
      control = (
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          className="text-end"
          value={value}
          placeholder={field.placeholder}
          maxLength={20}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "email":
      control = (
        <Input
          id={id}
          type="email"
          dir="ltr"
          autoComplete="email"
          className="text-end"
          value={value}
          placeholder={field.placeholder}
          maxLength={200}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "number":
      control = (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          dir="ltr"
          className="text-end"
          value={value}
          placeholder={field.placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "date":
    case "date_of_birth":
      control = (
        <Input
          id={id}
          type="date"
          value={value}
          max={field.type === "date_of_birth" ? todayRiyadh() : undefined}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "notes":
    case "textarea":
      control = (
        <Textarea
          id={id}
          rows={3}
          value={value}
          placeholder={field.placeholder}
          maxLength={2000}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "gender":
      control = (
        <RadioGroup id={id} value={value} onValueChange={onChange} className="flex gap-5" dir="rtl">
          {[
            ["male", "ذكر"],
            ["female", "أنثى"],
          ].map(([v, text]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value={v!} />
              {text}
            </label>
          ))}
        </RadioGroup>
      );
      break;
    case "radio":
      control = (
        <RadioGroup id={id} value={value} onValueChange={onChange} dir="rtl">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value={option} />
              {option}
            </label>
          ))}
        </RadioGroup>
      );
      break;
    case "select":
      control = (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} aria-invalid={invalid}>
            <SelectValue placeholder={field.placeholder || "اختر"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "checkbox":
      return (
        <div id={id} className="grid gap-1.5">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <Checkbox
              className="mt-0.5"
              checked={value === "true"}
              onCheckedChange={(c) => onChange(c === true ? "true" : "")}
            />
            <span>
              {field.label}
              {field.required && <span className="ms-0.5 text-destructive">*</span>}
            </span>
          </label>
          {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
      );
    default:
      control = (
        <Input
          id={id}
          value={value}
          placeholder={field.placeholder}
          maxLength={field.type === "full_name" ? 120 : 200}
          autoComplete={
            field.type === "full_name"
              ? "name"
              : field.type === "city"
                ? "address-level2"
                : undefined
          }
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className="grid gap-1.5">
      {label}
      {control}
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
