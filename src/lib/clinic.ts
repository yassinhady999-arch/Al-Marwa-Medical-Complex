import type { Database } from "@/integrations/supabase/types";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
export type BookingSource = Database["public"]["Enums"]["booking_source"];
export type ConversationStatus = Database["public"]["Enums"]["conversation_status"];

export type Tone =
  "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "accent" | "chat";

/** Soft badge / chip surface per tone (bg + text + border), theme-aware. */
export const TONE_SOFT: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary-emphasis border-primary/30",
  success: "bg-success-soft text-success-emphasis border-success/25",
  warning: "bg-warning-soft text-warning-foreground border-warning/30",
  danger: "bg-destructive-soft text-destructive border-destructive/25",
  info: "bg-info-soft text-info border-info/25",
  neutral: "bg-muted text-muted-foreground border-border",
  accent: "bg-highlight-soft text-highlight-emphasis border-highlight/30",
  chat: "bg-chat-soft text-chat-emphasis border-chat/25",
};

/** Solid dot color per tone. */
export const TONE_DOT: Record<Tone, string> = {
  primary: "bg-primary-emphasis",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground/60",
  accent: "bg-highlight-emphasis",
  chat: "bg-chat-emphasis",
};

/** Raw CSS color per tone — for SVG/canvas contexts (charts) that can't use Tailwind classes. */
export const TONE_HEX: Record<Tone, string> = {
  primary: "var(--color-primary-emphasis)",
  success: "var(--color-success-emphasis)",
  warning: "var(--color-warning)",
  danger: "var(--color-destructive)",
  info: "var(--color-info)",
  neutral: "var(--color-muted-foreground)",
  accent: "var(--color-highlight-emphasis)",
  chat: "var(--color-chat-emphasis)",
};

/** Statuses staff pick by hand; the rest arrive from the clinic/n8n flow. */
export const STATUS_FLOW: AppointmentStatus[] = ["pending", "confirmed", "cancelled"];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "مؤكد",
  checked_in: "تم الحضور",
  in_progress: "قيد الكشف",
  completed: "مكتمل",
  cancelled: "ملغي",
  no_show: "لم يحضر",
  rescheduled: "أُعيد جدولته",
};

/**
 * Each status keeps its own tone so the eye can scan a day's list purely by
 * color. Only "rescheduled" reuses "pending"'s amber (both mean "needs a
 * fresh look"); every other pair of statuses that can realistically appear
 * side by side in the same list — confirmed/in_progress, checked_in/rescheduled —
 * now has a distinct color.
 */
export const STATUS_META: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  pending: { label: STATUS_LABELS.pending, tone: "warning" },
  confirmed: { label: STATUS_LABELS.confirmed, tone: "success" },
  checked_in: { label: STATUS_LABELS.checked_in, tone: "info" },
  in_progress: { label: STATUS_LABELS.in_progress, tone: "accent" },
  completed: { label: STATUS_LABELS.completed, tone: "primary" },
  cancelled: { label: STATUS_LABELS.cancelled, tone: "danger" },
  no_show: { label: STATUS_LABELS.no_show, tone: "neutral" },
  rescheduled: { label: STATUS_LABELS.rescheduled, tone: "warning" },
};

/** Kept for backwards compatibility with older call sites. */
export const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  pending: TONE_SOFT.warning,
  confirmed: TONE_SOFT.success,
  checked_in: TONE_SOFT.info,
  in_progress: TONE_SOFT.accent,
  completed: TONE_SOFT.primary,
  cancelled: TONE_SOFT.danger,
  no_show: TONE_SOFT.neutral,
  rescheduled: TONE_SOFT.warning,
};

export const SOURCE_LABELS: Record<BookingSource, string> = {
  whatsapp: "واتساب",
  website: "الموقع",
  phone: "هاتف",
  manual: "إدخال يدوي",
  referral: "إحالة",
};

export const SOURCE_META: Record<BookingSource, { label: string; tone: Tone }> = {
  whatsapp: { label: SOURCE_LABELS.whatsapp, tone: "success" },
  website: { label: SOURCE_LABELS.website, tone: "primary" },
  phone: { label: SOURCE_LABELS.phone, tone: "info" },
  manual: { label: SOURCE_LABELS.manual, tone: "neutral" },
  referral: { label: SOURCE_LABELS.referral, tone: "warning" },
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "نشطة",
  waiting_patient: "بانتظار المريض",
  human_support: "تحويل لموظف",
  appointment_created: "تم إنشاء موعد",
  closed: "مغلقة",
};

export const CONVERSATION_STATUS_META: Record<ConversationStatus, { label: string; tone: Tone }> = {
  active: { label: CONVERSATION_STATUS_LABELS.active, tone: "success" },
  waiting_patient: { label: CONVERSATION_STATUS_LABELS.waiting_patient, tone: "warning" },
  human_support: { label: CONVERSATION_STATUS_LABELS.human_support, tone: "info" },
  appointment_created: { label: CONVERSATION_STATUS_LABELS.appointment_created, tone: "primary" },
  closed: { label: CONVERSATION_STATUS_LABELS.closed, tone: "neutral" },
};

export const GENDER_LABELS: Record<string, string> = { male: "ذكر", female: "أنثى" };

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const WEEKDAYS_SHORT = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

export function todayRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(value?: string | null): string {
  if (!value) return "—";
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour < 12 ? "ص" : "م";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const day = Math.round(hr / 24);
  if (day < 7) return `قبل ${day} ي`;
  return formatDateTime(value);
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

export function minutesFromTime(time?: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatNumber(value?: number | null): string {
  return Number(value ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

export function currency(value?: number | null): string {
  return `${formatNumber(value)} ر.س`;
}

/**
 * What customers see for a service price: 0 means the clinic hasn't fixed one yet, and
 * `from` marks a starting price («يبدأ من 99 ر.س»).
 */
export function priceLabel(value?: number | null, from?: boolean | null): string {
  if (Number(value ?? 0) <= 0) return "السعر عند الاستفسار";
  return from ? `يبدأ من ${currency(value)}` : currency(value);
}

/** Embed for a doctors select that returns every department the doctor works in. */
export const DOCTOR_DEPARTMENTS = "doctor_specialties(specialty_id)";

type DoctorDepartments = {
  specialty_id: string | null;
  specialty_ids?: string[] | null | undefined;
  doctor_specialties?: { specialty_id: string }[] | null | undefined;
};

/** A doctor's departments, main one first (from the public RPCs or the DOCTOR_DEPARTMENTS embed). */
export function departmentIds(d: DoctorDepartments): string[] {
  const ids = [
    ...(d.specialty_id ? [d.specialty_id] : []),
    ...(d.specialty_ids ?? []),
    ...(d.doctor_specialties ?? []).map((x) => x.specialty_id),
  ];
  return [...new Set(ids)];
}

export function worksIn(d: DoctorDepartments, specialtyId: string): boolean {
  return departmentIds(d).includes(specialtyId);
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toLocaleString("ar-EG", { maximumFractionDigits: digits })}٪`;
}

/** DB triggers/RPCs raise "CODE: رسالة" (e.g. "DOUBLE_BOOKING: …") — show only the Arabic part. */
export function dbErrorMessage(e: Error): string {
  return e.message.replace(/^[A-Z_]+:\s*/, "");
}

export function initials(name?: string | null): string {
  if (!name) return "؟";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return (parts[0]![0] ?? "") + (parts[1]![0] ?? "");
}
