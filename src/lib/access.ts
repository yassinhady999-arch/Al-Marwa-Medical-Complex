// Shared metadata for section-level access control and the activity log.

/** Sections an employee can be granted or denied access to. */
export const SECTIONS = [
  { key: "dashboard", label: "لوحة التشغيل" },
  { key: "appointments", label: "المواعيد" },
  { key: "calendar", label: "التقويم" },
  { key: "patients", label: "المرضى" },
  { key: "conversations", label: "المحادثات" },
  { key: "handoff", label: "التدخل البشري" },
  { key: "doctors", label: "الأطباء" },
  { key: "specialties", label: "التخصصات" },
  { key: "services", label: "الخدمات" },
  { key: "analytics", label: "التقارير" },
  { key: "automation", label: "الأتمتة والتكامل" },
  { key: "staff", label: "الموظفون" },
  { key: "activity", label: "سجل النشاط" },
  { key: "settings", label: "الإعدادات" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s.label]),
);

/** Sections that only owners/admins may ever open, regardless of the permissions map. */
export const ADMIN_ONLY_SECTIONS: SectionKey[] = ["staff"];

/** Default permissions map applied to a brand-new employee (full access, tweak per row). */
export function defaultSectionPermissions(): Record<string, boolean> {
  return Object.fromEntries(
    SECTIONS.filter((s) => !ADMIN_ONLY_SECTIONS.includes(s.key)).map((s) => [s.key, true]),
  );
}

/**
 * Opt-out model: a section is allowed unless the map explicitly holds `false`.
 * Admins always pass. Admin-only sections require admin.
 */
export function canAccessSection(
  section: SectionKey,
  isAdmin: boolean,
  permissions: Record<string, boolean> | null | undefined,
): boolean {
  if (isAdmin) return true;
  if (ADMIN_ONLY_SECTIONS.includes(section)) return false;
  return permissions?.[section] !== false;
}

export const ACTION_LABELS: Record<string, string> = {
  create: "إضافة",
  update: "تعديل",
  delete: "حذف",
  status_change: "تغيير حالة",
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  password_reset: "إعادة تعيين كلمة المرور",
  permissions_change: "تعديل الصلاحيات",
  activate: "تفعيل",
  deactivate: "إيقاف",
  send: "إرسال",
  export: "تصدير",
  handoff_request: "تحويل لموظف",
  takeover: "استلام محادثة",
  release: "إعادة للبوت",
};

export const ACTION_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  status_change: "secondary",
  login: "outline",
  logout: "outline",
  password_reset: "secondary",
  permissions_change: "secondary",
  activate: "default",
  deactivate: "destructive",
  send: "secondary",
  export: "outline",
  handoff_request: "secondary",
  takeover: "default",
  release: "outline",
};
