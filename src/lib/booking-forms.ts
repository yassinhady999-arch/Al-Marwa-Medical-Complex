// Booking forms (نماذج الحجز): field model, defaults and parsing shared by the
// staff builder, its live preview and the public booking page.
import {
  AlignJustify,
  Cake,
  Calendar,
  CalendarClock,
  CircleDot,
  Hash,
  List,
  Mail,
  MapPin,
  Phone,
  SquareCheck,
  StickyNote,
  Type,
  User,
  VenusAndMars,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

export const SYSTEM_FIELD_TYPES = [
  "full_name",
  "phone",
  "appointment",
  "email",
  "gender",
  "date_of_birth",
  "city",
  "notes",
] as const;
export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
] as const;

export type SystemFieldType = (typeof SYSTEM_FIELD_TYPES)[number];
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type FieldType = SystemFieldType | CustomFieldType;

export type FormField = {
  /** System fields use their type as id; custom fields get "f_xxxxxx". */
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string | undefined;
  help?: string | undefined;
  /** select / radio only. */
  options?: string[] | undefined;
};

export type FormSettings = {
  /** Empty = every active specialty. */
  specialty_ids: string[];
  /** Empty = every active service within the allowed specialties. */
  service_ids: string[];
  /** false = no doctor field; the clinic assigns the least busy free doctor. */
  choose_doctor: boolean;
  booking_window_days: number;
  show_prices: boolean;
  success_message: string;
};

type IconType = typeof User;

/** Fields the patient record or the booking itself needs; the locked ones can't be removed. */
export const SYSTEM_FIELD_META: Record<
  SystemFieldType,
  { label: string; locked: boolean; icon: IconType; placeholder?: string }
> = {
  full_name: { label: "الاسم الكامل", locked: true, icon: User, placeholder: "مثال: محمد أحمد" },
  phone: { label: "رقم الجوال", locked: true, icon: Phone, placeholder: "05xxxxxxxx" },
  appointment: { label: "اختيار الموعد", locked: true, icon: CalendarClock },
  email: { label: "البريد الإلكتروني", locked: false, icon: Mail, placeholder: "name@example.com" },
  gender: { label: "الجنس", locked: false, icon: VenusAndMars },
  date_of_birth: { label: "تاريخ الميلاد", locked: false, icon: Cake },
  city: { label: "المدينة", locked: false, icon: MapPin, placeholder: "مثال: الرياض" },
  notes: {
    label: "ملاحظات",
    locked: false,
    icon: StickyNote,
    placeholder: "أي معلومة تحب توصلها للطبيب",
  },
};

export const CUSTOM_FIELD_META: Record<CustomFieldType, { label: string; icon: IconType }> = {
  text: { label: "نص قصير", icon: Type },
  textarea: { label: "نص طويل", icon: AlignJustify },
  number: { label: "رقم", icon: Hash },
  select: { label: "قائمة منسدلة", icon: List },
  radio: { label: "اختيار من متعدد", icon: CircleDot },
  checkbox: { label: "مربع موافقة", icon: SquareCheck },
  date: { label: "تاريخ", icon: Calendar },
};

export function isSystemType(type: FieldType): type is SystemFieldType {
  return (SYSTEM_FIELD_TYPES as readonly string[]).includes(type);
}

export function fieldMeta(type: FieldType): { label: string; icon: IconType } {
  return isSystemType(type) ? SYSTEM_FIELD_META[type] : CUSTOM_FIELD_META[type];
}

export function isLockedField(field: FormField): boolean {
  return isSystemType(field.type) && SYSTEM_FIELD_META[field.type].locked;
}

export function hasOptions(type: FieldType): boolean {
  return type === "select" || type === "radio";
}

export function systemField(type: SystemFieldType): FormField {
  const meta = SYSTEM_FIELD_META[type];
  return {
    id: type,
    type,
    label: meta.label,
    required: meta.locked,
    ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
  };
}

export function newCustomField(type: CustomFieldType): FormField {
  return {
    id: `f_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
    type,
    label: type === "checkbox" ? "أوافق على الشروط والأحكام" : "سؤال جديد",
    required: false,
    ...(hasOptions(type) ? { options: ["الخيار الأول", "الخيار الثاني"] } : {}),
  };
}

export const DEFAULT_FIELDS: FormField[] = [
  systemField("full_name"),
  systemField("phone"),
  systemField("appointment"),
  systemField("notes"),
];

export const DEFAULT_SETTINGS: FormSettings = {
  specialty_ids: [],
  service_ids: [],
  choose_doctor: true,
  booking_window_days: 21,
  show_prices: true,
  success_message: "تم استلام حجزك بنجاح ✅ سنتواصل معك لتأكيد الموعد.",
};

const ALL_TYPES = new Set<string>([...SYSTEM_FIELD_TYPES, ...CUSTOM_FIELD_TYPES]);

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Reads stored fields defensively and guarantees the locked fields are present. */
export function parseFields(json: Json | undefined): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(json) ? json : []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const type = r["type"];
    const id = r["id"];
    if (typeof type !== "string" || !ALL_TYPES.has(type) || typeof id !== "string" || seen.has(id))
      continue;
    seen.add(id);
    const options = Array.isArray(r["options"])
      ? r["options"].filter((o): o is string => typeof o === "string")
      : undefined;
    fields.push({
      id,
      type: type as FieldType,
      label: str(r["label"]) ?? fieldMeta(type as FieldType).label,
      required: r["required"] === true,
      ...(str(r["placeholder"]) ? { placeholder: str(r["placeholder"]) } : {}),
      ...(str(r["help"]) ? { help: str(r["help"]) } : {}),
      ...(hasOptions(type as FieldType) ? { options: options ?? [] } : {}),
    });
  }
  for (const type of ["full_name", "phone", "appointment"] as const) {
    if (!fields.some((f) => f.type === type)) fields.push(systemField(type));
  }
  return fields.map((f) => (isLockedField(f) ? { ...f, required: true } : f));
}

export function parseSettings(json: Json | undefined): FormSettings {
  const r = (json && typeof json === "object" && !Array.isArray(json) ? json : {}) as Record<
    string,
    unknown
  >;
  const ids = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const days = Number(r["booking_window_days"]);
  return {
    specialty_ids: ids(r["specialty_ids"]),
    service_ids: ids(r["service_ids"]),
    choose_doctor: r["choose_doctor"] !== false,
    booking_window_days:
      Number.isInteger(days) && days >= 1 && days <= 60
        ? days
        : DEFAULT_SETTINGS.booking_window_days,
    show_prices: r["show_prices"] !== false,
    success_message: str(r["success_message"]) ?? DEFAULT_SETTINGS.success_message,
  };
}

/** Problems that would make a form unusable, in Arabic, for the builder to show before saving. */
export function validateForm(draft: { title: string; fields: FormField[] }): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("اكتب عنوان النموذج");
  for (const f of draft.fields) {
    if (!f.label.trim()) problems.push("يوجد حقل بدون عنوان");
    if (hasOptions(f.type) && (f.options ?? []).filter((o) => o.trim()).length < 2)
      problems.push(`أضف خيارين على الأقل في «${f.label || "حقل بدون عنوان"}»`);
  }
  return [...new Set(problems)];
}

export type PublicService = {
  id: string;
  name: string;
  specialty_id: string | null;
  duration_minutes: number;
  price: number;
  /** The price is a starting price («يبدأ من»). */
  price_from?: boolean;
  description: string | null;
};

export type PublicBookingForm = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  fields: FormField[];
  settings: FormSettings;
  clinic: {
    name: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    logo_url: string | null;
  } | null;
  specialties: { id: string; name: string }[];
  services: PublicService[];
  /** specialty_ids: every department the doctor takes bookings in (main one included). */
  doctors: { id: string; name: string; specialty_id: string | null; specialty_ids?: string[] }[];
};

/** The `get_public_booking_form` RPC payload, or null when the form is missing or paused. */
export function parsePublicForm(json: Json | null): PublicBookingForm | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, Json | undefined>;
  const list = <T>(v: Json | undefined) => (Array.isArray(v) ? (v as unknown as T[]) : []);
  return {
    id: String(r["id"] ?? ""),
    slug: String(r["slug"] ?? ""),
    title: String(r["title"] ?? ""),
    description: typeof r["description"] === "string" ? r["description"] : null,
    fields: parseFields(r["fields"]),
    settings: parseSettings(r["settings"]),
    clinic: (r["clinic"] as PublicBookingForm["clinic"]) ?? null,
    specialties: list(r["specialties"]),
    services: list<PublicService>(r["services"])
      .map((s) => ({ ...s, price: Number(s.price ?? 0) }))
      // "9 كاسات" before "12 كاسة": compare the numbers inside names as numbers.
      .sort((a, b) => a.name.localeCompare(b.name, "ar", { numeric: true })),
    doctors: list(r["doctors"]),
  };
}

export type BookingConfirmation = {
  appointment_number: string;
  date: string;
  start_time: string;
  end_time: string;
  doctor_name: string | null;
  service_name: string | null;
  success_message: string | null;
  duplicate: boolean;
};

export function bookingLink(slug: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/book/${slug}`;
}

/** Unguessable public token used in the share link (regenerating it revokes the old link). */
export function newSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
