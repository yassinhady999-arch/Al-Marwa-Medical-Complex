// The complex's identity, shown in the staff sidebar and on the public booking and chat pages.
// Images live in public/brand (generated from the complex's logo on a white background).
export const BRAND = {
  name: "مجمع المروة السيل الطبي",
  nameEn: "Al Marwa Al Seel Medical Complex",
  /** Full logo: mark + Arabic and English names. */
  logo: "/brand/logo.png",
  /** The mark alone, square, for small spots (avatars, sidebar). */
  mark: "/brand/logo-mark.png",
} as const;
