import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
  CircleCheckBig,
  LoaderCircle,
  MessageCircle,
  Phone,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
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
import { priceLabel, dbErrorMessage, worksIn, todayRiyadh } from "@/lib/clinic";
import {
  bookingRequestWhatsAppUrl,
  type BookingRequestConfirmation,
  type FormField,
  type PublicBookingForm,
} from "@/lib/booking-forms";

const ANY_DOCTOR = "any";
const WHATSAPP_BUTTON = "bg-[#1fa855] text-white hover:bg-[#1a9049]";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** What went wrong, for the patient: our own checks, setup problems, or the connection. */
function requestError(e: Error & { code?: string }): string {
  // Our checks raise "CODE: الرسالة".
  if (/^[A-Z_]+:/.test(e.message)) return dbErrorMessage(e);
  console.error("[booking request]", e.code ?? "", e.message);
  // The database doesn't have the booking-request function (its SQL update wasn't run).
  if (e.code === "PGRST202" || e.code === "42883")
    return "تعذّر تسجيل طلبك لأن نظام الحجز قيد التحديث حاليًا. تواصل مع المجمع مباشرة.";
  if (/failed to fetch|networkerror|load failed|network/i.test(e.message))
    return "تعذّر تسجيل طلبك. تحقّق من اتصالك بالإنترنت وحاول مرة أخرى.";
  return "تعذّر تسجيل طلبك، حاول مرة أخرى أو تواصل مع المجمع مباشرة.";
}

/**
 * The booking form a customer fills in. It records a booking request (not an
 * appointment); the patient then finishes with the clinic on WhatsApp, which sets
 * the time. `preview` renders the same form for the builder with no real submission.
 */
export function BookingFormView({
  form,
  preview = false,
}: {
  form: PublicBookingForm;
  preview?: boolean | undefined;
}) {
  const uid = useId();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [specialtyId, setSpecialtyId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState(ANY_DOCTOR);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One id per attempt: a double tap or retry returns the same request instead of a second one.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<BookingRequestConfirmation | null>(null);

  const { settings } = form;
  const hasWhatsApp = !!form.clinic?.whatsapp;
  const askSpecialty = form.specialties.length > 1;
  const activeSpecialty = form.specialties.length === 1 ? form.specialties[0]!.id : specialtyId;
  const services = form.services.filter(
    (s) => !activeSpecialty || s.specialty_id === activeSpecialty || s.specialty_id === null,
  );
  const service = services.find((s) => s.id === serviceId);
  const doctorSpecialty = service ? service.specialty_id : activeSpecialty || null;
  const doctors = form.doctors.filter((d) => !doctorSpecialty || worksIn(d, doctorSpecialty));
  const chosenDoctor =
    settings.choose_doctor && doctorId !== ANY_DOCTOR && doctors.some((d) => d.id === doctorId)
      ? doctorId
      : null;
  const ready = (!askSpecialty || !!activeSpecialty) && (services.length === 0 || !!service);

  const setAnswer = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setErrors(({ [id]: _drop, ...rest }) => rest);
  };
  const clearChoiceError = () => setErrors(({ appointment: _drop, ...rest }) => rest);

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_booking_request", {
        _slug: form.slug,
        _payload: {
          request_id: requestId,
          specialty_id: service?.specialty_id ?? (activeSpecialty || null),
          service_id: service?.id ?? null,
          doctor_id: chosenDoctor,
          answers,
        } as Json,
      });
      if (error) throw error;
      const saved = data as unknown as BookingRequestConfirmation | null;
      // Never show success unless the database handed back the saved request.
      if (!saved?.request_number) throw new Error("تعذّر تسجيل طلبك، حاول مرة أخرى.");
      return saved;
    },
    onSuccess: (saved) => {
      setDone(saved);
      // Only now that the request is saved: open WhatsApp with the message ready. A browser
      // may block this; the success screen has the same link as a button.
      const url = bookingRequestWhatsAppUrl(saved);
      if (url && typeof window !== "undefined") {
        const tab = window.open(url, "_blank");
        if (tab) tab.opener = null;
      }
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: Error) => setErrors({ _form: requestError(e) }),
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
    if (askSpecialty && !activeSpecialty) found["appointment"] = "اختر القسم";
    else if (services.length > 0 && !service) found["appointment"] = "اختر الخدمة";
    return found;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || submit.isPending) return;
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
    const whatsappUrl = bookingRequestWhatsAppUrl(done);
    const service = done.service_name
      ? `${done.service_name}${done.specialty_name ? ` (${done.specialty_name})` : ""}`
      : done.specialty_name;
    return (
      <div className="animate-rise space-y-5 py-4 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success-emphasis">
          <CircleCheckBig className="size-9" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-foreground">تم تسجيل طلبك</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {whatsappUrl
              ? "تم تسجيل طلبك، ويمكنك الآن استكمال التواصل مع المجمع عبر واتساب لتحديد الموعد."
              : "تم تسجيل طلبك، وسيتواصل معك المجمع لتحديد الموعد."}
          </p>
          {done.duplicate && (
            <p className="mt-1 text-xs text-muted-foreground">
              هذا طلبك السابق نفسه، لم نسجّل طلبًا جديدًا.
            </p>
          )}
        </div>
        <dl className="mx-auto grid max-w-sm gap-2 rounded-2xl border border-border bg-surface-2/60 p-4 text-sm">
          {[
            ["رقم الطلب", done.request_number],
            ["الخدمة المطلوبة", service],
            ["الطبيب المطلوب", done.doctor_name],
            ["الحالة", "بانتظار تحديد الموعد"],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular font-semibold text-foreground">{v}</dd>
              </div>
            ))}
        </dl>

        {whatsappUrl ? (
          <div className="mx-auto max-w-sm space-y-2">
            <Button asChild size="lg" className={`w-full ${WHATSAPP_BUTTON}`}>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                استكمال حجزك عبر واتساب
              </a>
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              تُفتح محادثة واتساب مع المجمع ورسالتك جاهزة فيها. اضغط «إرسال» داخل واتساب لتصل
              للمجمع، فالرسالة لا تُرسل وحدها.
            </p>
          </div>
        ) : (
          <NoWhatsApp phone={done.clinic_phone} />
        )}

        {done.success_message && (
          <p className="mx-auto max-w-sm whitespace-pre-wrap text-xs text-muted-foreground">
            {done.success_message}
          </p>
        )}
        <Button
          variant="outline"
          onClick={() => {
            // A new request may be for someone else or another service: start clean.
            setDone(null);
            setAnswers({});
            setSpecialtyId("");
            setServiceId("");
            setDoctorId(ANY_DOCTOR);
            setErrors({});
            setRequestId(crypto.randomUUID());
          }}
        >
          طلب حجز آخر
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
              <Stethoscope className="size-5 text-primary-emphasis" />
              {field.label}
            </p>

            {askSpecialty && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-1`}>القسم</Label>
                <Select
                  value={specialtyId}
                  onValueChange={(v) => {
                    setSpecialtyId(v);
                    setServiceId("");
                    setDoctorId(ANY_DOCTOR);
                    clearChoiceError();
                  }}
                >
                  <SelectTrigger id={`${uid}-1`}>
                    <SelectValue placeholder="اختر القسم" />
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
                    clearChoiceError();
                  }}
                >
                  <SelectTrigger id={`${uid}-2`}>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {settings.show_prices ? ` · ${priceLabel(s.price, s.price_from)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {settings.choose_doctor && ready && doctors.length > 1 && (
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-3`}>الطبيب</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
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

            <p className="text-xs leading-relaxed text-muted-foreground">
              لا تحتاج لاختيار يوم أو وقت: يحدد المجمع معك الموعد المناسب بعد إرسال الطلب.
            </p>
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
        <p
          role="alert"
          className="rounded-xl border border-destructive/25 bg-destructive-soft p-3 text-sm text-destructive"
        >
          {errors["_form"]}
        </p>
      )}

      {!preview && !hasWhatsApp && <NoWhatsApp phone={form.clinic?.phone ?? null} before />}

      <Button
        type="submit"
        size="lg"
        className={hasWhatsApp ? `w-full ${WHATSAPP_BUTTON}` : "w-full"}
        disabled={preview || submit.isPending}
      >
        {submit.isPending ? (
          <>
            <LoaderCircle className="animate-spin" />
            جارٍ تسجيل طلبك…
          </>
        ) : hasWhatsApp ? (
          <>
            <MessageCircle />
            استكمال حجزك عبر واتساب
          </>
        ) : (
          "إرسال طلب الحجز"
        )}
      </Button>
      {hasWhatsApp && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          نسجّل طلبك أولًا، ثم نفتح لك محادثة واتساب مع المجمع برسالة جاهزة لتحديد الموعد.
        </p>
      )}
      {preview && (
        <p className="text-center text-xs text-muted-foreground">
          معاينة فقط — جرّب إرسال طلب فعلي من رابط النموذج.
        </p>
      )}
    </form>
  );
}

/** The clinic hasn't set its WhatsApp number: say so and offer the phone instead. */
function NoWhatsApp({ phone, before = false }: { phone: string | null; before?: boolean }) {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-sm gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3 text-start text-sm text-warning-foreground"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-2">
        <p>
          {before
            ? "التواصل عبر واتساب غير متاح حاليًا. سيُسجَّل طلبك ويتواصل معك المجمع على رقم جوالك."
            : "رقم واتساب المجمع غير متاح حاليًا، لذلك لم نفتح واتساب. طلبك محفوظ وسيتواصل معك المجمع على رقم جوالك."}
        </p>
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center gap-1.5 font-semibold underline"
          >
            <Phone className="size-3.5" />
            أو اتصل بنا: <span dir="ltr">{phone}</span>
          </a>
        )}
      </div>
    </div>
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
