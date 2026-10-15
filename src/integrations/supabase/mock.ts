/**
 * LOCAL PREVIEW MOCK — lets you browse the whole UI without a Supabase session or DB.
 *
 * Enable:  visit any page with ?preview=1   (e.g. http://localhost:8080/dashboard?preview=1)
 * Disable: visit any page with ?preview=0
 * The flag is remembered in localStorage ("cf-preview").
 *
 * This is a dev-only convenience. It is inert unless the flag is set, and it is
 * never reachable during SSR or a production build (guards on `window`).
 */

const KEY = "cf-preview";

export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const p = new URLSearchParams(window.location.search).get("preview");
    if (p === "1") localStorage.setItem(KEY, "1");
    else if (p === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const iso = (dayOffset: number) => {
  const x = new Date();
  x.setDate(x.getDate() + dayOffset);
  // Local Y/M/D, not toISOString() — that converts to UTC and can shift the
  // calendar date depending on the current local time of day + UTC offset.
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const stamp = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString();

const P = (full_name: string, phone: string) => ({ full_name, phone });

const APPTS = [
  {
    id: "a1",
    appointment_number: "APT-26-000101",
    appointment_date: iso(0),
    start_time: "09:00:00",
    end_time: "09:30:00",
    status: "confirmed",
    source: "whatsapp",
    price: 150,
    notes: null,
    patients: P("أحمد المطيري", "+966501112233"),
    patient_id: "p1",
    doctors: { name: "د. خالد الغامدي" },
    services: { name: "كشف أسنان" },
    doctor_id: "d1",
    service_id: "sv1",
    specialty_id: "sp1",
  },
  {
    id: "a2",
    appointment_number: "APT-26-000102",
    appointment_date: iso(0),
    start_time: "09:30:00",
    end_time: "10:00:00",
    status: "checked_in",
    source: "website",
    price: 200,
    notes: null,
    patients: P("سارة العتيبي", "+966502223344"),
    patient_id: "p2",
    doctors: { name: "د. منى السالم" },
    services: { name: "استشارة جلدية" },
    doctor_id: "d2",
    service_id: "sv3",
    specialty_id: "sp2",
  },
  {
    id: "a3",
    appointment_number: "APT-26-000103",
    appointment_date: iso(0),
    start_time: "10:15:00",
    end_time: "10:45:00",
    status: "in_progress",
    source: "phone",
    price: 120,
    notes: "متابعة",
    patients: P("خالد الدوسري", "+966503334455"),
    patient_id: "p3",
    doctors: { name: "د. خالد الغامدي" },
    services: { name: "تنظيف أسنان" },
    doctor_id: "d1",
    service_id: "sv2",
    specialty_id: "sp1",
  },
  {
    id: "a4",
    appointment_number: "APT-26-000104",
    appointment_date: iso(0),
    start_time: "11:00:00",
    end_time: "11:30:00",
    status: "pending",
    source: "whatsapp",
    price: 250,
    notes: null,
    patients: P("نورة الحربي", "+966504445566"),
    patient_id: "p4",
    doctors: { name: "د. فهد الزهراني" },
    services: { name: "فحص أطفال" },
    doctor_id: "d3",
    service_id: "sv4",
    specialty_id: "sp3",
  },
  {
    id: "a5",
    appointment_number: "APT-26-000105",
    appointment_date: iso(0),
    start_time: "12:00:00",
    end_time: "12:30:00",
    status: "completed",
    source: "manual",
    price: 300,
    notes: null,
    patients: P("عبدالله القحطاني", "+966505556677"),
    patient_id: "p5",
    doctors: { name: "د. منى السالم" },
    services: { name: "جلسة علاج" },
    doctor_id: "d2",
    service_id: "sv5",
    specialty_id: "sp2",
  },
  {
    id: "a6",
    appointment_number: "APT-26-000106",
    appointment_date: iso(0),
    start_time: "13:00:00",
    end_time: "13:30:00",
    status: "cancelled",
    source: "whatsapp",
    price: 150,
    notes: null,
    patients: P("ريم الشمري", "+966506667788"),
    patient_id: "p6",
    doctors: { name: "د. فهد الزهراني" },
    services: { name: "كشف باطنة" },
    doctor_id: "d3",
    service_id: "sv6",
    specialty_id: "sp3",
  },
  {
    id: "a7",
    appointment_number: "APT-26-000107",
    appointment_date: iso(0),
    start_time: "14:00:00",
    end_time: "14:30:00",
    status: "completed",
    source: "referral",
    price: 400,
    notes: null,
    patients: P("ماجد العنزي", "+966507778899"),
    patient_id: "p7",
    doctors: { name: "د. خالد الغامدي" },
    services: { name: "حشو أسنان" },
    doctor_id: "d1",
    service_id: null,
    specialty_id: "sp1",
  },
  {
    id: "a8",
    appointment_number: "APT-26-000108",
    appointment_date: iso(1),
    start_time: "10:00:00",
    end_time: "10:30:00",
    status: "confirmed",
    source: "website",
    price: 200,
    notes: null,
    patients: P("هند المالكي", "+966508889900"),
    patient_id: "p8",
    doctors: { name: "د. منى السالم" },
    services: { name: "استشارة جلدية" },
    doctor_id: "d2",
    service_id: "sv3",
    specialty_id: "sp2",
  },
  {
    id: "a9",
    appointment_number: "APT-26-000109",
    appointment_date: iso(2),
    start_time: "11:30:00",
    end_time: "12:00:00",
    status: "pending",
    source: "whatsapp",
    price: 250,
    notes: null,
    patients: P("يوسف البقمي", "+966509990011"),
    patient_id: "p9",
    doctors: { name: "د. فهد الزهراني" },
    services: { name: "فحص أطفال" },
    doctor_id: "d3",
    service_id: "sv4",
    specialty_id: "sp3",
  },
  {
    id: "a10",
    appointment_number: "APT-26-000110",
    appointment_date: iso(-3),
    start_time: "09:00:00",
    end_time: "09:30:00",
    status: "no_show",
    source: "phone",
    price: 150,
    notes: null,
    patients: P("لمى الرشيد", "+966510001122"),
    patient_id: "p10",
    doctors: { name: "د. خالد الغامدي" },
    services: { name: "كشف أسنان" },
    doctor_id: "d1",
    service_id: "sv1",
    specialty_id: "sp1",
  },
  {
    id: "a11",
    appointment_number: "APT-26-000111",
    appointment_date: iso(-8),
    start_time: "16:00:00",
    end_time: "16:30:00",
    status: "completed",
    source: "whatsapp",
    price: 300,
    notes: null,
    patients: P("طلال السبيعي", "+966511112233"),
    patient_id: "p11",
    doctors: { name: "د. منى السالم" },
    services: { name: "جلسة علاج" },
    doctor_id: "d2",
    service_id: "sv5",
    specialty_id: "sp2",
  },
  {
    id: "a12",
    appointment_number: "APT-26-000112",
    appointment_date: iso(-15),
    start_time: "15:00:00",
    end_time: "15:30:00",
    status: "rescheduled",
    source: "website",
    price: 200,
    notes: null,
    patients: P("دانة الفهد", "+966512223344"),
    patient_id: "p12",
    doctors: { name: "د. فهد الزهراني" },
    services: { name: "كشف باطنة" },
    doctor_id: "d3",
    service_id: "sv6",
    specialty_id: "sp3",
  },
];

const SCHED = (days: number[]) =>
  days.map((d) => ({
    day_of_week: d,
    start_time: "09:00:00",
    end_time: "17:00:00",
    break_start: null,
    break_end: null,
    is_active: true,
  }));
const DEPTS = (...ids: string[]) => ids.map((specialty_id) => ({ specialty_id }));

const MOCK: Record<string, unknown[]> = {
  clinic_settings: [
    {
      id: "clinic-1",
      clinic_name: "مجمع المروة السيل الطبي",
      phone: "+966112345678",
      whatsapp_number: "0566684827",
      email: "info@nukhba.sa",
      city: "الرياض",
      address: "طريق الملك فهد، حي العليا",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      n8n_webhook_url: "https://n8n.nukhba.sa/webhook/clinic",
      working_hours: {
        "0": { enabled: true, start: "09:00", end: "21:00" },
        "1": { enabled: true, start: "09:00", end: "21:00" },
        "2": { enabled: true, start: "09:00", end: "21:00" },
        "3": { enabled: true, start: "09:00", end: "21:00" },
        "4": { enabled: true, start: "09:00", end: "21:00" },
        "5": { enabled: false, start: "09:00", end: "21:00" },
        "6": { enabled: true, start: "16:00", end: "22:00" },
      },
    },
  ],
  profiles: [
    {
      id: "user-owner",
      full_name: "د. يحيى هادي",
      email: "owner@clinic.sa",
      phone: "+966500000000",
      is_active: true,
      created_at: stamp(60 * 24 * 40),
    },
    {
      id: "user-2",
      full_name: "أمل الشهري",
      email: "amal@nukhba.sa",
      phone: "+966501234567",
      is_active: true,
      created_at: stamp(60 * 24 * 20),
    },
    {
      id: "user-3",
      full_name: "فيصل النمر",
      email: "faisal@nukhba.sa",
      phone: "+966502345678",
      is_active: true,
      created_at: stamp(60 * 24 * 10),
    },
    {
      id: "user-4",
      full_name: "سلمى القرني",
      email: "salma@nukhba.sa",
      phone: null,
      is_active: false,
      created_at: stamp(60 * 24 * 4),
    },
  ],
  user_roles: [
    { user_id: "user-owner", role: "owner" },
    { user_id: "user-2", role: "admin" },
    { user_id: "user-3", role: "receptionist" },
    { user_id: "user-4", role: "viewer" },
  ],
  staff_permissions: [],
  specialties: [
    {
      id: "sp1",
      name: "طب الأسنان",
      description: "كشف، تنظيف، حشو وتقويم الأسنان",
      is_active: true,
    },
    { id: "sp2", name: "الجلدية", description: "أمراض الجلد والتجميل الطبي", is_active: true },
    {
      id: "sp3",
      name: "طب الأطفال",
      description: "فحص ومتابعة الأطفال والتطعيمات",
      is_active: true,
    },
    { id: "sp4", name: "الباطنة", description: "الأمراض الباطنية العامة", is_active: true },
    { id: "sp5", name: "العظام", description: "إصابات ومفاصل الجهاز الحركي", is_active: false },
    { id: "sp6", name: "العيون", description: "فحص النظر وأمراض العيون", is_active: true },
  ],
  services: [
    {
      id: "sv1",
      name: "كشف أسنان",
      description: "فحص شامل للأسنان واللثة",
      duration_minutes: 30,
      price: 150,
      is_active: true,
      specialties: { name: "طب الأسنان" },
      specialty_id: "sp1",
    },
    {
      id: "sv2",
      name: "تنظيف أسنان",
      description: "إزالة الجير وتلميع",
      duration_minutes: 30,
      price: 120,
      price_from: true,
      is_active: true,
      specialties: { name: "طب الأسنان" },
      specialty_id: "sp1",
    },
    {
      id: "sv3",
      name: "استشارة جلدية",
      description: null,
      duration_minutes: 20,
      price: 200,
      is_active: true,
      specialties: { name: "الجلدية" },
      specialty_id: "sp2",
    },
    {
      id: "sv4",
      name: "فحص أطفال",
      description: "فحص عام ومتابعة النمو",
      duration_minutes: 30,
      price: 250,
      is_active: true,
      specialties: { name: "طب الأطفال" },
      specialty_id: "sp3",
    },
    {
      id: "sv5",
      name: "جلسة علاج",
      description: "جلسة علاجية بالليزر",
      duration_minutes: 45,
      price: 300,
      is_active: true,
      specialties: { name: "الجلدية" },
      specialty_id: "sp2",
    },
    {
      id: "sv6",
      name: "كشف باطنة",
      description: null,
      duration_minutes: 30,
      price: 250,
      is_active: false,
      specialties: { name: "الباطنة" },
      specialty_id: "sp4",
    },
  ],
  doctors: [
    {
      id: "d1",
      name: "د. خالد الغامدي",
      phone: "+966551110000",
      email: "khaled@nukhba.sa",
      status: "active",
      bio: null,
      specialties: { name: "طب الأسنان" },
      specialty_id: "sp1",
      doctor_specialties: DEPTS("sp1"),
      doctor_schedules: SCHED([0, 1, 2, 3, 4]),
    },
    {
      id: "d2",
      name: "د. منى السالم",
      phone: "+966552220000",
      email: "mona@nukhba.sa",
      status: "active",
      bio: null,
      specialties: { name: "الجلدية" },
      specialty_id: "sp2",
      doctor_specialties: DEPTS("sp2"),
      doctor_schedules: SCHED([0, 2, 4]),
    },
    {
      id: "d3",
      name: "د. فهد الزهراني",
      phone: "+966553330000",
      email: null,
      status: "active",
      bio: "متابعة نمو الأطفال والتطعيمات، والباطنة العامة.",
      specialties: { name: "طب الأطفال" },
      specialty_id: "sp3",
      // Works in two departments, like a real doctor covering pediatrics and internal medicine.
      doctor_specialties: DEPTS("sp3", "sp4"),
      doctor_schedules: SCHED([1, 3, 5]),
    },
    {
      id: "d4",
      name: "د. عمر الحازمي",
      phone: null,
      email: null,
      status: "inactive",
      bio: null,
      specialties: { name: "الباطنة" },
      specialty_id: "sp4",
      doctor_specialties: DEPTS("sp4"),
      doctor_schedules: [],
    },
  ],
  patients: [
    {
      id: "p1",
      full_name: "أحمد المطيري",
      phone: "+966501112233",
      whatsapp_number: "+966501112233",
      email: null,
      gender: "male",
      city: "الرياض",
      source: "whatsapp",
      last_contact_at: stamp(30),
    },
    {
      id: "p2",
      full_name: "سارة العتيبي",
      phone: "+966502223344",
      whatsapp_number: "+966502223344",
      email: "sara@example.com",
      gender: "female",
      city: "جدة",
      source: "website",
      last_contact_at: stamp(120),
    },
    {
      id: "p3",
      full_name: "خالد الدوسري",
      phone: "+966503334455",
      whatsapp_number: null,
      email: null,
      gender: "male",
      city: "الرياض",
      source: "phone",
      last_contact_at: stamp(60 * 5),
    },
    {
      id: "p4",
      full_name: "نورة الحربي",
      phone: "+966504445566",
      whatsapp_number: "+966504445566",
      email: null,
      gender: "female",
      city: "الدمام",
      source: "whatsapp",
      last_contact_at: stamp(60 * 26),
    },
    {
      id: "p5",
      full_name: "عبدالله القحطاني",
      phone: "+966505556677",
      whatsapp_number: null,
      email: null,
      gender: "male",
      city: "الرياض",
      source: "manual",
      last_contact_at: stamp(60 * 48),
    },
    {
      id: "p6",
      full_name: "ريم الشمري",
      phone: "+966506667788",
      whatsapp_number: "+966506667788",
      email: null,
      gender: "female",
      city: "بريدة",
      source: "whatsapp",
      last_contact_at: stamp(60 * 72),
    },
    {
      id: "p7",
      full_name: "ماجد العنزي",
      phone: "+966507778899",
      whatsapp_number: null,
      email: null,
      gender: "male",
      city: "حائل",
      source: "referral",
      last_contact_at: stamp(60 * 96),
    },
    {
      id: "p8",
      full_name: "هند المالكي",
      phone: "+966508889900",
      whatsapp_number: "+966508889900",
      email: null,
      gender: "female",
      city: "الطائف",
      source: "website",
      last_contact_at: stamp(60 * 120),
    },
  ],
  appointments: APPTS,
  conversations: [
    {
      id: "c1",
      channel: "whatsapp",
      status: "active",
      assigned_to: null,
      unread_count: 2,
      last_message_preview: "تمام، أشوفكم بكرة الساعة ٩",
      last_message_at: stamp(12),
      created_at: stamp(40),
      handoff_reason: "طلب تأكيد الموعد من موظف",
      handoff_requested_at: stamp(30),
      handoff_resolved_at: stamp(5),
      patients: P("أحمد المطيري", "+966501112233"),
    },
    {
      id: "c2",
      channel: "whatsapp",
      status: "waiting_patient",
      assigned_to: null,
      unread_count: 0,
      last_message_preview: "من فضلك أرسل رقم الهوية لتأكيد الحجز",
      last_message_at: stamp(55),
      created_at: stamp(90),
      handoff_reason: null,
      handoff_requested_at: null,
      handoff_resolved_at: null,
      patients: P("سارة العتيبي", "+966502223344"),
    },
    {
      id: "c3",
      channel: "whatsapp",
      status: "human_support",
      assigned_to: null,
      unread_count: 1,
      last_message_preview: "تمام، بانتظاركم",
      last_message_at: stamp(16),
      created_at: stamp(360),
      handoff_reason: "الموضوع معقد شوي، أحتاج أكلم موظف بخصوص تغيير الموعد",
      handoff_requested_at: stamp(18),
      handoff_resolved_at: null,
      patients: P("خالد الدوسري", "+966503334455"),
    },
    {
      id: "c4",
      channel: "whatsapp",
      status: "appointment_created",
      assigned_to: null,
      unread_count: 0,
      last_message_preview: "تم حجز موعدك يوم الأحد الساعة ١١ ✅",
      last_message_at: stamp(240),
      created_at: stamp(1800),
      handoff_reason: null,
      handoff_requested_at: null,
      handoff_resolved_at: null,
      patients: P("نورة الحربي", "+966504445566"),
    },
    {
      id: "c5",
      channel: "whatsapp",
      status: "closed",
      assigned_to: null,
      unread_count: 0,
      last_message_preview: "شكرًا لكم",
      last_message_at: stamp(1560),
      created_at: stamp(4320),
      handoff_reason: null,
      handoff_requested_at: null,
      handoff_resolved_at: null,
      patients: P("ريم الشمري", "+966506667788"),
    },
    {
      id: "c6",
      channel: "whatsapp",
      status: "human_support",
      assigned_to: null,
      unread_count: 3,
      last_message_preview: "أحد يرد؟",
      last_message_at: stamp(8),
      created_at: stamp(50),
      handoff_reason: "استفسار عن مبلغ خاطئ في فاتورة التأمين",
      handoff_requested_at: stamp(42),
      handoff_resolved_at: null,
      patients: P("هند المالكي", "+966508889900"),
    },
    {
      id: "c7",
      channel: "whatsapp",
      status: "human_support",
      assigned_to: "user-3",
      unread_count: 1,
      last_message_preview: "موعدي كان ٤:٣٠ العصر مع د. منى",
      last_message_at: stamp(44),
      created_at: stamp(75),
      handoff_reason: "شكوى من التأخير في العيادة",
      handoff_requested_at: stamp(65),
      handoff_resolved_at: null,
      patients: P("عبدالله القحطاني", "+966505556677"),
    },
    {
      id: "c8",
      channel: "whatsapp",
      status: "human_support",
      assigned_to: "user-owner",
      unread_count: 0,
      last_message_preview: "أهلًا ماجد، معك د. يحيى. نسبة التحمل تعتمد على فئة وثيقتك…",
      last_message_at: stamp(3),
      created_at: stamp(40),
      handoff_reason: null,
      handoff_requested_at: stamp(25),
      handoff_resolved_at: null,
      patients: P("ماجد العنزي", "+966507778899"),
    },
  ],
  messages: [
    {
      id: "m1",
      conversation_id: "c1",
      direction: "inbound",
      sender_type: "patient",
      content: "السلام عليكم، أبغى أحجز موعد كشف أسنان",
      created_at: stamp(40),
    },
    {
      id: "m2",
      conversation_id: "c1",
      direction: "outbound",
      sender_type: "ai",
      content:
        "وعليكم السلام 👋 أهلاً بك في مجمع المروة السيل الطبي. تفضّل باسمك الكامل ورقم جوالك.",
      created_at: stamp(39),
    },
    {
      id: "m3",
      conversation_id: "c1",
      direction: "inbound",
      sender_type: "patient",
      content: "أحمد المطيري - 0501112233",
      created_at: stamp(37),
    },
    {
      id: "m4",
      conversation_id: "c1",
      direction: "outbound",
      sender_type: "ai",
      content: "متاح لدينا يوم الأحد الساعة ٩:٠٠ صباحًا مع د. خالد الغامدي. هل يناسبك؟",
      created_at: stamp(35),
    },
    {
      id: "m5",
      conversation_id: "c1",
      direction: "inbound",
      sender_type: "patient",
      content: "نعم مناسب",
      created_at: stamp(20),
    },
    {
      id: "m6",
      conversation_id: "c1",
      direction: "outbound",
      sender_type: "human",
      content: "تم تثبيت الموعد. بانتظارك 🌿",
      created_at: stamp(12),
    },
    {
      id: "m7",
      conversation_id: "c3",
      direction: "inbound",
      sender_type: "patient",
      content: "السلام عليكم، عندي موعد بكرة الساعة ١٠ وأبي أغيّره",
      status: "received",
      metadata: {},
      created_at: stamp(24),
    },
    {
      id: "m8",
      conversation_id: "c3",
      direction: "outbound",
      sender_type: "ai",
      content: "وعليكم السلام خالد 👋 لديك موعد تنظيف أسنان غدًا ١٠:١٥ ص. أي يوم يناسبك؟",
      status: "received",
      metadata: {},
      created_at: stamp(23),
    },
    {
      id: "m9",
      conversation_id: "c3",
      direction: "inbound",
      sender_type: "patient",
      content: "الموضوع معقد شوي، أحتاج أكلم موظف بخصوص تغيير الموعد",
      status: "received",
      metadata: {},
      created_at: stamp(18.2),
    },
    {
      id: "m10",
      conversation_id: "c3",
      direction: "outbound",
      sender_type: "ai",
      content: "حاضر، حوّلت محادثتك لأحد موظفينا وبيرد عليك بأقرب وقت 🙏",
      status: "received",
      metadata: {},
      created_at: stamp(17.5),
    },
    {
      id: "m11",
      conversation_id: "c3",
      direction: "inbound",
      sender_type: "patient",
      content: "تمام، بانتظاركم",
      status: "received",
      metadata: {},
      created_at: stamp(16),
    },
    {
      id: "m12",
      conversation_id: "c6",
      direction: "inbound",
      sender_type: "patient",
      content: "مرحبا، وصلتني فاتورة من التأمين فيها مبلغ غلط",
      status: "received",
      metadata: {},
      created_at: stamp(47),
    },
    {
      id: "m13",
      conversation_id: "c6",
      direction: "outbound",
      sender_type: "ai",
      content:
        "أهلًا هند، أقدر أساعدك في المواعيد والخدمات. لاستفسارات الفواتير أحوّلك لموظف مختص؟",
      status: "received",
      metadata: {},
      created_at: stamp(46),
    },
    {
      id: "m14",
      conversation_id: "c6",
      direction: "inbound",
      sender_type: "patient",
      content: "ايه لو سمحت حولني لموظف",
      status: "received",
      metadata: {},
      created_at: stamp(42.2),
    },
    {
      id: "m15",
      conversation_id: "c6",
      direction: "inbound",
      sender_type: "patient",
      content: "؟",
      status: "received",
      metadata: {},
      created_at: stamp(20),
    },
    {
      id: "m16",
      conversation_id: "c6",
      direction: "inbound",
      sender_type: "patient",
      content: "أحد يرد؟",
      status: "received",
      metadata: {},
      created_at: stamp(8),
    },
    {
      id: "m17",
      conversation_id: "c7",
      direction: "inbound",
      sender_type: "patient",
      content: "انتظرت ساعة في العيادة أمس وما دخلت للدكتور!",
      status: "received",
      metadata: {},
      created_at: stamp(70),
    },
    {
      id: "m18",
      conversation_id: "c7",
      direction: "outbound",
      sender_type: "ai",
      content: "نعتذر جدًا عن ذلك. سأحوّلك لأحد الموظفين لمتابعة شكواك.",
      status: "received",
      metadata: {},
      created_at: stamp(65.2),
    },
    {
      id: "m19",
      conversation_id: "c7",
      direction: "outbound",
      sender_type: "human",
      content: "أهلًا عبدالله، معك فيصل من فريق العيادة. نعتذر عن التأخير، ممكن أعرف موعدك بالضبط؟",
      status: "sent",
      metadata: { sent_by_name: "فيصل النمر" },
      created_at: stamp(50),
    },
    {
      id: "m20",
      conversation_id: "c7",
      direction: "inbound",
      sender_type: "patient",
      content: "موعدي كان ٤:٣٠ العصر مع د. منى",
      status: "received",
      metadata: {},
      created_at: stamp(44),
    },
    {
      id: "m21",
      conversation_id: "c8",
      direction: "inbound",
      sender_type: "patient",
      content: "هل تقبلون تأمين بوبا؟",
      status: "received",
      metadata: {},
      created_at: stamp(35),
    },
    {
      id: "m22",
      conversation_id: "c8",
      direction: "outbound",
      sender_type: "ai",
      content: "نعم نقبل تأمين بوبا ✅ هل تود حجز موعد؟",
      status: "received",
      metadata: {},
      created_at: stamp(34),
    },
    {
      id: "m23",
      conversation_id: "c8",
      direction: "inbound",
      sender_type: "patient",
      content: "ايوه بس ابي اعرف نسبة التحمل على الحشوات",
      status: "received",
      metadata: {},
      created_at: stamp(28),
    },
    {
      id: "m24",
      conversation_id: "c8",
      direction: "outbound",
      sender_type: "human",
      content: "أهلًا ماجد، معك د. يحيى. نسبة التحمل تعتمد على فئة وثيقتك، ممكن ترسل صورة البطاقة؟",
      status: "pending",
      metadata: { sent_by_name: "د. يحيى هادي" },
      created_at: stamp(3),
    },
  ],
  notifications: [
    {
      id: "n0",
      type: "conversation.handoff_requested",
      title: "طلب التحدث مع موظف",
      message: "هند المالكي — استفسار عن مبلغ خاطئ في فاتورة التأمين",
      is_read: false,
      created_at: stamp(42),
      entity_type: "conversation",
      entity_id: "c6",
    },
    {
      id: "n1",
      type: "appointment",
      title: "موعد جديد من واتساب",
      message: "أحمد المطيري — الأحد ٩:٠٠ص مع د. خالد",
      is_read: false,
      created_at: stamp(12),
    },
    {
      id: "n2",
      type: "appointment",
      title: "تم تأكيد موعد",
      message: "هند المالكي أكّدت موعدها",
      is_read: false,
      created_at: stamp(70),
    },
    {
      id: "n3",
      type: "automation",
      title: "فشل إرسال حدث أتمتة",
      message: "appointment.confirmed لم يُسلَّم إلى n8n",
      is_read: true,
      created_at: stamp(60 * 6),
    },
    {
      id: "n4",
      type: "reminder",
      title: "تذكير",
      message: "المريض خالد الدوسري لديه موعد بعد ساعتين",
      is_read: true,
      created_at: stamp(60 * 20),
    },
  ],
  integration_events: [
    {
      id: "e1",
      event_type: "appointment.created",
      entity_type: "appointment",
      entity_id: "a1",
      status: "delivered",
      attempts: 1,
      error_message: null,
      created_at: stamp(12),
      processed_at: stamp(11),
    },
    {
      id: "e2",
      event_type: "appointment.confirmed",
      entity_type: "appointment",
      entity_id: "a8",
      status: "delivered",
      attempts: 1,
      error_message: null,
      created_at: stamp(70),
      processed_at: stamp(69),
    },
    {
      id: "e3",
      event_type: "message.received",
      entity_type: "message",
      entity_id: "m1",
      status: "pending",
      attempts: 0,
      error_message: null,
      created_at: stamp(40),
      processed_at: null,
    },
    {
      id: "e4",
      event_type: "appointment.cancelled",
      entity_type: "appointment",
      entity_id: "a6",
      status: "failed",
      attempts: 3,
      error_message: "n8n webhook timeout بعد ٣ محاولات",
      created_at: stamp(60 * 3),
      processed_at: null,
    },
    {
      id: "e5",
      event_type: "patient.created",
      entity_type: "patient",
      entity_id: "p8",
      status: "processing",
      attempts: 1,
      error_message: null,
      created_at: stamp(60 * 5),
      processed_at: null,
    },
  ],
  automation_logs: [
    {
      id: "l1",
      workflow_name: "whatsapp-inbound",
      event_type: "message.received",
      status: "success",
      error_message: null,
      created_at: stamp(40),
    },
    {
      id: "l2",
      workflow_name: "booking-flow",
      event_type: "appointment.created",
      status: "success",
      error_message: null,
      created_at: stamp(12),
    },
    {
      id: "l3",
      workflow_name: "reminder-24h",
      event_type: "appointment.reminder",
      status: "success",
      error_message: null,
      created_at: stamp(60 * 8),
    },
    {
      id: "l4",
      workflow_name: "confirmation-sender",
      event_type: "appointment.cancelled",
      status: "failed",
      error_message: "HTTP 504 من بوابة واتساب",
      created_at: stamp(60 * 3),
    },
  ],
  booking_forms: [
    {
      id: "f1",
      slug: "dental2026ab",
      title: "حجز كشف الأسنان",
      description: "احجز موعدك مع أطباء الأسنان في أقل من دقيقة.",
      is_active: true,
      created_at: stamp(60 * 24 * 6),
      updated_at: stamp(60 * 24 * 2),
      fields: [
        {
          id: "full_name",
          type: "full_name",
          label: "الاسم الكامل",
          required: true,
          placeholder: "مثال: محمد أحمد",
        },
        {
          id: "phone",
          type: "phone",
          label: "رقم الجوال",
          required: true,
          placeholder: "05xxxxxxxx",
        },
        { id: "appointment", type: "appointment", label: "الخدمة المطلوبة", required: true },
        {
          id: "f_source",
          type: "select",
          label: "كيف عرفت عنا؟",
          required: true,
          options: ["سناب شات", "تويتر", "صديق", "بحث جوجل"],
        },
        { id: "email", type: "email", label: "البريد الإلكتروني", required: false },
        {
          id: "notes",
          type: "notes",
          label: "ملاحظات",
          required: false,
          placeholder: "أي معلومة تحب توصلها للطبيب",
        },
        {
          id: "f_policy",
          type: "checkbox",
          label: "أوافق على سياسة الإلغاء (قبل 24 ساعة)",
          required: true,
        },
      ],
      settings: {
        specialty_ids: ["sp1"],
        service_ids: [],
        choose_doctor: true,
        booking_window_days: 14,
        show_prices: true,
        success_message: "نرجو الالتزام بالموعد بعد تأكيده، والاعتذار قبل الموعد بيوم على الأقل.",
      },
    },
    {
      id: "f2",
      slug: "general00xyz",
      title: "حجز موعد — كل التخصصات",
      description: null,
      is_active: false,
      created_at: stamp(60 * 24 * 12),
      updated_at: stamp(60 * 24 * 12),
      fields: [
        { id: "full_name", type: "full_name", label: "الاسم الكامل", required: true },
        { id: "phone", type: "phone", label: "رقم الجوال", required: true },
        { id: "gender", type: "gender", label: "الجنس", required: false },
        { id: "date_of_birth", type: "date_of_birth", label: "تاريخ الميلاد", required: false },
        { id: "appointment", type: "appointment", label: "الخدمة المطلوبة", required: true },
      ],
      settings: {
        specialty_ids: [],
        service_ids: [],
        choose_doctor: false,
        booking_window_days: 21,
        show_prices: false,
        success_message: "تم استلام حجزك بنجاح.",
      },
    },
  ],
  booking_form_submissions: [
    {
      id: "fs1",
      form_id: "f1",
      form_title: "حجز كشف الأسنان",
      request_number: "REQ-26-00001",
      status: "confirmed",
      specialty_id: "sp1",
      service_id: "sv1",
      doctor_id: "d1",
      specialties: { name: "طب الأسنان" },
      services: { name: "كشف أسنان" },
      doctors: { name: "د. خالد الغامدي" },
      appointment_id: "a1",
      patient_id: "p1",
      created_at: stamp(60 * 26),
      answers: [
        { field_id: "full_name", label: "الاسم الكامل", type: "full_name", value: "أحمد المطيري" },
        { field_id: "phone", label: "رقم الجوال", type: "phone", value: "0501112233" },
        { field_id: "f_source", label: "كيف عرفت عنا؟", type: "select", value: "صديق" },
        {
          field_id: "f_policy",
          label: "أوافق على سياسة الإلغاء (قبل 24 ساعة)",
          type: "checkbox",
          value: "true",
        },
      ],
      appointments: {
        appointment_number: "APT-26-000101",
        appointment_date: iso(0),
        start_time: "09:00:00",
        status: "confirmed",
      },
      patients: P("أحمد المطيري", "+966501112233"),
    },
    {
      id: "fs2",
      form_id: "f1",
      form_title: "حجز كشف الأسنان",
      request_number: "REQ-26-00002",
      status: "confirmed",
      specialty_id: "sp1",
      service_id: "sv2",
      doctor_id: null,
      specialties: { name: "طب الأسنان" },
      services: { name: "تنظيف أسنان" },
      doctors: null,
      appointment_id: "a3",
      patient_id: "p3",
      created_at: stamp(60 * 50),
      answers: [
        { field_id: "full_name", label: "الاسم الكامل", type: "full_name", value: "خالد الدوسري" },
        { field_id: "phone", label: "رقم الجوال", type: "phone", value: "0503334455" },
        { field_id: "f_source", label: "كيف عرفت عنا؟", type: "select", value: "سناب شات" },
        { field_id: "notes", label: "ملاحظات", type: "notes", value: "عندي حساسية من البنج" },
        {
          field_id: "f_policy",
          label: "أوافق على سياسة الإلغاء (قبل 24 ساعة)",
          type: "checkbox",
          value: "true",
        },
      ],
      appointments: {
        appointment_number: "APT-26-000103",
        appointment_date: iso(0),
        start_time: "10:15:00",
        status: "in_progress",
      },
      patients: P("خالد الدوسري", "+966503334455"),
    },
    {
      id: "fs3",
      form_id: "f1",
      form_title: "حجز كشف الأسنان",
      request_number: "REQ-26-00003",
      status: "pending_contact",
      specialty_id: "sp1",
      service_id: "sv2",
      doctor_id: "d1",
      specialties: { name: "طب الأسنان" },
      services: { name: "تنظيف أسنان" },
      doctors: { name: "د. خالد الغامدي" },
      appointment_id: null,
      appointments: null,
      patient_id: "p2",
      created_at: stamp(25),
      answers: [
        { field_id: "full_name", label: "الاسم الكامل", type: "full_name", value: "سارة العتيبي" },
        { field_id: "phone", label: "رقم الجوال", type: "phone", value: "0502223344" },
        { field_id: "notes", label: "ملاحظات", type: "notes", value: "أفضّل الفترة المسائية" },
      ],
      patients: P("سارة العتيبي", "+966502223344"),
    },
    {
      id: "fs4",
      form_id: "f1",
      form_title: "حجز كشف الأسنان",
      request_number: "REQ-26-00004",
      status: "contacted",
      specialty_id: "sp1",
      service_id: "sv1",
      doctor_id: null,
      specialties: { name: "طب الأسنان" },
      services: { name: "كشف أسنان" },
      doctors: null,
      appointment_id: null,
      appointments: null,
      patient_id: "p4",
      created_at: stamp(60 * 3),
      answers: [
        { field_id: "full_name", label: "الاسم الكامل", type: "full_name", value: "نورة الحربي" },
        { field_id: "phone", label: "رقم الجوال", type: "phone", value: "0504445566" },
      ],
      patients: P("نورة الحربي", "+966504445566"),
    },
  ],
  chatbot_settings: [
    {
      id: "bot1",
      slug: "nukhbabot001",
      bot_name: "مساعد مجمع المروة",
      welcome_message: "أهلًا بك في مجمع المروة السيل الطبي 👋 كيف أقدر أساعدك اليوم؟",
      mode: "hybrid",
      is_active: true,
      fallback_message:
        "عذرًا، لم أجد إجابة دقيقة لسؤالك. اختر من القائمة أو تواصل معنا على 0112345678.",
      ai_model: "claude-opus-5-5",
      ai_instructions: "نقبل تأمين بوبا والتعاونية وميدغلف. الكشف الأول للأطفال دون 3 سنوات مجاني.",
      ai_daily_limit: 300,
      booking_form_id: "f1",
      created_at: stamp(60 * 24 * 7),
      updated_at: stamp(60 * 3),
      menu: [
        {
          id: "n_booking",
          label: "📅 حجز موعد",
          kind: "booking",
          reply: "يسعدنا خدمتك! احجز موعدك بسهولة من الرابط التالي:",
          children: [],
        },
        {
          id: "n_services",
          label: "💰 الخدمات والأسعار",
          kind: "services",
          reply: "هذه خدماتنا وأسعارها:",
          children: [],
        },
        {
          id: "n_doctors",
          label: "👨‍⚕️ الأطباء",
          kind: "doctors",
          reply: "تعرّف على أطبائنا:",
          children: [],
        },
        {
          id: "n_faq",
          label: "❓ أسئلة شائعة",
          kind: "text",
          reply: "اختر سؤالك:",
          children: [
            {
              id: "n_ins",
              label: "🛡️ التأمين الطبي",
              kind: "text",
              reply:
                "نقبل التأمين من بوبا، التعاونية، وميدغلف. أحضر بطاقة التأمين والهوية معك يوم الزيارة.",
              children: [],
            },
            {
              id: "n_park",
              label: "🅿️ المواقف",
              kind: "text",
              reply: "نعم، توجد مواقف مجانية أمام العيادة مباشرة.",
              children: [],
            },
            {
              id: "n_kids",
              label: "👶 خدمات الأطفال",
              kind: "text",
              reply: "نقدم للأطفال الكشف الدوري والتطعيمات. ماذا تحتاج؟",
              children: [
                {
                  id: "n_vacc",
                  label: "💉 التطعيمات",
                  kind: "text",
                  reply: "نوفر جميع تطعيمات الجدول الوطني. أحضر كرت التطعيم معك.",
                  children: [],
                },
                {
                  id: "n_kids_prices",
                  label: "💰 أسعار خدمات الأطفال",
                  kind: "services",
                  reply: "أسعار خدمات الأطفال:",
                  specialty_id: "sp3",
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: "n_hours",
          label: "🕘 مواعيد العمل",
          kind: "hours",
          reply: "مواعيد عمل العيادة:",
          children: [],
        },
        {
          id: "n_contact",
          label: "📍 الموقع والتواصل",
          kind: "contact",
          reply: "يسعدنا تواصلك معنا:",
          children: [],
        },
      ],
    },
  ],
  chatbot_knowledge: [
    {
      id: "k1",
      category: "عام",
      question: "وين موقع العيادة؟",
      answer: "نتواجد في الرياض، طريق الملك فهد، حي العليا. يسعدنا زيارتك!",
      is_active: true,
      created_at: stamp(60 * 24 * 5),
    },
    {
      id: "k2",
      category: "أسعار",
      question: "كم سعر الكشف؟",
      answer:
        "يبدأ سعر الكشف من 100 ر.س ويختلف حسب التخصص. اختر «الخدمات والأسعار» من القائمة للتفاصيل.",
      is_active: true,
      created_at: stamp(60 * 24 * 5),
    },
    {
      id: "k3",
      category: "تأمين",
      question: "هل تقبلون التأمين؟",
      answer: "نعم، نقبل التأمين من بوبا والتعاونية وميدغلف.",
      is_active: true,
      created_at: stamp(60 * 24 * 4),
    },
    {
      id: "k4",
      category: "حجز",
      question: "أبغى ألغي موعدي",
      answer: "لا مشكلة، أرسل لنا رقم الحجز على واتساب أو اتصل بنا وسنلغيه لك.",
      is_active: true,
      created_at: stamp(60 * 24 * 3),
    },
    {
      id: "k5",
      category: "عام",
      question: "هل يوجد مواقف؟",
      answer: "نعم، توجد مواقف مجانية أمام العيادة.",
      is_active: true,
      created_at: stamp(60 * 24 * 2),
    },
    {
      id: "k6",
      category: "تحضير للزيارة",
      question: "هل أحتاج أكون صايم قبل التحاليل؟",
      answer: "بعض التحاليل تحتاج صيامًا 8 ساعات. سيوضح لك الطبيب ذلك عند الحجز.",
      is_active: false,
      created_at: stamp(60 * 24),
    },
  ],
  chatbot_logs: [
    {
      id: "l1",
      session_id: "s1",
      question: "هل عندكم تقويم أسنان شفاف؟",
      answer: "عذرًا، لم أجد إجابة دقيقة لسؤالك.",
      source: "fallback",
      created_at: stamp(35),
    },
    {
      id: "l2",
      session_id: "s2",
      question: "بكم الكشف؟",
      answer: "يبدأ سعر الكشف من 100 ر.س ويختلف حسب التخصص.",
      source: "knowledge",
      created_at: stamp(80),
    },
    {
      id: "l3",
      session_id: "s3",
      question: "طفلي عنده حرارة من يومين، أقدر أجيبه اليوم؟",
      answer:
        "سلامته! نعم يمكنك حجز موعد اليوم مع طبيب الأطفال من رابط الحجز. وإن كانت الحرارة مرتفعة جدًا أو مع صعوبة تنفس فتوجه للطوارئ فورًا.",
      source: "ai",
      created_at: stamp(140),
    },
    {
      id: "l4",
      session_id: "s4",
      question: "تشتغلون يوم الجمعة؟",
      answer: "عذرًا، لم أجد إجابة دقيقة لسؤالك.",
      source: "fallback",
      created_at: stamp(300),
    },
  ],
  chatbot_usage: [{ day: iso(0), ai_requests: 18 }],
  activity_logs: [
    {
      id: "ac1",
      user_id: "user-owner",
      actor_name: "د. يحيى هادي",
      actor_email: "owner@clinic.sa",
      action: "login",
      section: "dashboard",
      entity_type: null,
      description: "تسجيل دخول إلى النظام",
      created_at: stamp(5),
    },
    {
      id: "ac2",
      user_id: "user-3",
      actor_name: "فيصل النمر",
      actor_email: "faisal@nukhba.sa",
      action: "create",
      section: "appointments",
      entity_type: "appointment",
      description: "حجز موعد جديد APT-26-000110 بتاريخ " + iso(0),
      created_at: stamp(25),
    },
    {
      id: "ac3",
      user_id: "user-3",
      actor_name: "فيصل النمر",
      actor_email: "faisal@nukhba.sa",
      action: "status_change",
      section: "appointments",
      entity_type: "appointment",
      description: "تغيير حالة الموعد APT-26-000105 إلى «مكتمل»",
      created_at: stamp(48),
    },
    {
      id: "ac4",
      user_id: "user-2",
      actor_name: "أمل الشهري",
      actor_email: "amal@nukhba.sa",
      action: "create",
      section: "patients",
      entity_type: "patient",
      description: "إضافة مريض: هند المالكي",
      created_at: stamp(120),
    },
    {
      id: "ac5",
      user_id: "user-2",
      actor_name: "أمل الشهري",
      actor_email: "amal@nukhba.sa",
      action: "update",
      section: "settings",
      entity_type: "clinic_settings",
      description: "تحديث بيانات العيادة",
      created_at: stamp(60 * 5),
    },
    {
      id: "ac6",
      user_id: "user-2",
      actor_name: "أمل الشهري",
      actor_email: "amal@nukhba.sa",
      action: "permissions_change",
      section: "settings",
      entity_type: "user",
      description: "تغيير دور سلمى القرني إلى «اطّلاع فقط»",
      created_at: stamp(60 * 26),
    },
  ],
};

// ---------------------------------------------------------------------------
// Fake PostgREST query builder — chainable + thenable
// ---------------------------------------------------------------------------

type Res<T> = { data: T; error: null; count?: number | null };
const ok = <T>(data: T, count?: number | null): Promise<Res<T>> =>
  Promise.resolve({ data, error: null, count: count ?? null });

const newId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID?.()) || `mock-${Date.now()}`;

const TABLE_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  booking_forms: () => ({
    slug: newId().replace(/-/g, "").slice(0, 12),
    is_active: true,
    description: null,
    fields: [],
    settings: {},
    updated_at: new Date().toISOString(),
  }),
  chatbot_knowledge: () => ({ category: "عام", is_active: true }),
  chatbot_settings: () => ({
    slug: newId().replace(/-/g, "").slice(0, 12),
    bot_name: "المساعد الآلي",
    welcome_message: "أهلًا بك 👋 كيف أقدر أساعدك اليوم؟",
    mode: "hybrid",
    is_active: true,
    fallback_message: "عذرًا، لم أجد إجابة دقيقة لسؤالك.",
    ai_model: "claude-opus-5-5",
    ai_instructions: "",
    ai_daily_limit: 300,
    booking_form_id: null,
    menu: [],
  }),
};
/** Lists these tables feed are shown newest first. */
const NEWEST_FIRST = new Set([
  "booking_forms",
  "booking_form_submissions",
  "chatbot_knowledge",
  "chatbot_logs",
  "notifications",
  "activity_logs",
]);

function withGeneratedFields(table: string, v: Record<string, unknown>) {
  return {
    id: newId(),
    appointment_number: "APT-26-" + String(Math.floor(Math.random() * 900000) + 100000),
    created_at: new Date().toISOString(),
    ...TABLE_DEFAULTS[table]?.(),
    ...v,
  };
}

function persist(table: string, row: Record<string, unknown>) {
  const list = (MOCK[table] ??= []);
  if (NEWEST_FIRST.has(table)) list.unshift(row);
  else list.push(row);
}

type Row = Record<string, unknown>;

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/;

/** Orders dates/timestamps as instants (mixed UTC offsets), everything else as-is. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string" && DATE_LIKE.test(a) && DATE_LIKE.test(b)) {
    return Date.parse(a) - Date.parse(b);
  }
  if (a === b) return 0;
  return (a as number) < (b as number) ? -1 : 1;
}

/** Keeps an edited appointment's embedded patient/doctor/service names in sync with its ids. */
function refreshAppointmentEmbeds(r: Row) {
  const byId = (t: string, id: unknown) => ((MOCK[t] ?? []) as Row[]).find((x) => x["id"] === id);
  const patient = byId("patients", r["patient_id"]);
  if (patient) r["patients"] = P(String(patient["full_name"]), String(patient["phone"]));
  const doctor = byId("doctors", r["doctor_id"]);
  r["doctors"] = doctor ? { name: doctor["name"] } : r["doctor_id"] ? r["doctors"] : null;
  const service = byId("services", r["service_id"]);
  r["services"] = service ? { name: service["name"] } : r["service_id"] ? r["services"] : null;
}

class MockRpcError extends Error {}

const rowsOf = (name: string) => (MOCK[name] ?? []) as Row[];
const toMinutes = (t: unknown) => {
  const [h = 0, m = 0] = String(t).split(":").map(Number);
  return h * 60 + m;
};
const toTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;

/** Every department a mock doctor works in (main one first), like doctor_specialty_ids. */
function mockDepts(d: Row): unknown[] {
  const extra = ((d["doctor_specialties"] ?? []) as Row[]).map((x) => x["specialty_id"]);
  return [...new Set([d["specialty_id"], ...extra].filter((x) => x != null))];
}

/** Free start times for a doctor on a day, like get_available_slots. */
function mockSlots(doctorId: unknown, day: string, duration: number): string[] {
  const doctor = rowsOf("doctors").find((d) => d["id"] === doctorId && d["status"] === "active");
  const dow = new Date(`${day}T00:00:00`).getDay();
  const sch = ((doctor?.["doctor_schedules"] ?? []) as Row[]).find(
    (x) => x["day_of_week"] === dow && x["is_active"] !== false,
  );
  if (!sch) return [];
  const booked = rowsOf("appointments")
    .filter(
      (a) =>
        a["doctor_id"] === doctorId &&
        a["appointment_date"] === day &&
        !["cancelled", "no_show", "rescheduled"].includes(String(a["status"])),
    )
    .map((a) => [toMinutes(a["start_time"]), toMinutes(a["end_time"])] as const);
  const now = new Date();
  const past = day === iso(0) ? now.getHours() * 60 + now.getMinutes() : -1;
  const out: string[] = [];
  for (
    let t = toMinutes(sch["start_time"]);
    t + duration <= toMinutes(sch["end_time"]);
    t += duration
  ) {
    const inBreak =
      sch["break_start"] != null &&
      sch["break_end"] != null &&
      t < toMinutes(sch["break_end"]) &&
      t + duration > toMinutes(sch["break_start"]);
    if (inBreak || t <= past || booked.some(([s, e]) => s < t + duration && e > t)) continue;
    out.push(toTime(t));
  }
  return out;
}

function formScope(form: Row) {
  const settings = (form["settings"] ?? {}) as Row;
  const ids = (k: string) => (Array.isArray(settings[k]) ? (settings[k] as unknown[]) : []);
  const allowSpec = (id: unknown) =>
    ids("specialty_ids").length === 0 || (id != null && ids("specialty_ids").includes(id));
  // Requests need no weekly schedule (the clinic sets the time); hidden names are never listed.
  const doctors = rowsOf("doctors").filter(
    (d) =>
      d["status"] === "active" &&
      (ids("specialty_ids").length === 0 || mockDepts(d).some((id) => allowSpec(id))),
  );
  const services = rowsOf("services").filter(
    (v) =>
      v["is_active"] !== false &&
      allowSpec(v["specialty_id"] ?? null) &&
      (ids("service_ids").length === 0 || ids("service_ids").includes(v["id"])),
  );
  return { settings, allowSpec, doctors, services };
}

function answerOf(r: Row, type: string): string | null {
  const a = ((r["answers"] ?? []) as Row[]).find((x) => x["type"] === type);
  return a ? String(a["value"] ?? "") : null;
}

function activeForm(slug: unknown) {
  return rowsOf("booking_forms").find((f) => f["slug"] === slug && f["is_active"] === true);
}

/** Booking-form and chatbot RPCs (public pages), replayed against the in-memory tables. */
function mockPublicRpc(fn: string, args: Row): { handled: boolean; value?: unknown } {
  const clinic = rowsOf("clinic_settings")[0] ?? {};
  if (fn === "get_public_booking_form") {
    const form = activeForm(args["_slug"]);
    if (!form) return { handled: true, value: null };
    const { allowSpec, doctors, services } = formScope(form);
    return {
      handled: true,
      value: {
        id: form["id"],
        slug: form["slug"],
        title: form["title"],
        description: form["description"],
        fields: form["fields"],
        settings: form["settings"],
        clinic: {
          name: clinic["clinic_name"],
          phone: clinic["phone"],
          address: clinic["address"],
          city: clinic["city"],
          logo_url: null,
          whatsapp:
            String(clinic["whatsapp_number"] ?? "").trim() ||
            String(clinic["phone"] ?? "").trim() ||
            null,
        },
        specialties: rowsOf("specialties")
          .filter((s) => s["is_active"] !== false && allowSpec(s["id"]))
          .map((s) => ({ id: s["id"], name: s["name"] })),
        services: services.map((v) => ({
          id: v["id"],
          name: v["name"],
          specialty_id: v["specialty_id"] ?? null,
          duration_minutes: v["duration_minutes"],
          price: v["price"],
          price_from: v["price_from"] === true,
          description: v["description"] ?? null,
        })),
        doctors: doctors
          .filter((d) => d["hide_name"] !== true)
          .map((d) => ({
            id: d["id"],
            name: d["name"],
            specialty_id: d["specialty_id"] ?? null,
            specialty_ids: mockDepts(d),
          })),
      },
    };
  }

  if (fn === "get_public_booking_availability") return { handled: true, value: [] };

  if (fn === "submit_booking_request" || fn === "submit_public_booking") {
    const form = activeForm(args["_slug"]);
    if (!form) throw new MockRpcError("FORM_UNAVAILABLE: هذا النموذج غير متاح حاليًا");
    const payload = (args["_payload"] ?? {}) as Row;
    const answers = (payload["answers"] ?? {}) as Record<string, string>;
    const key = `request:${String(payload["request_id"] ?? newId())}`;
    const { settings, doctors, services } = formScope(form);
    const confirm = (r: Row, duplicate: boolean) => ({
      request_number: r["request_number"],
      status: r["status"],
      created_at: r["created_at"],
      patient_name: answerOf(r, "full_name"),
      phone: answerOf(r, "phone"),
      specialty_name: (r["specialties"] as Row | null)?.["name"] ?? null,
      service_name: (r["services"] as Row | null)?.["name"] ?? null,
      doctor_name: (r["doctors"] as Row | null)?.["name"] ?? null,
      success_message: settings["success_message"] ?? null,
      clinic_whatsapp:
        String(clinic["whatsapp_number"] ?? "").trim() ||
        String(clinic["phone"] ?? "").trim() ||
        null,
      clinic_phone: clinic["phone"] ?? null,
      duplicate,
    });
    const existing = rowsOf("booking_form_submissions").find((r) => r["request_key"] === key);
    if (existing) return { handled: true, value: confirm(existing, true) };
    for (const f of (form["fields"] ?? []) as Row[]) {
      if (f["type"] === "appointment") continue;
      if (!f["required"] && f["type"] !== "full_name" && f["type"] !== "phone") continue;
      const v = String(answers[String(f["id"])] ?? "").trim();
      if (!v || (f["type"] === "checkbox" && v !== "true"))
        throw new MockRpcError(`REQUIRED_FIELD: يرجى تعبئة «${String(f["label"])}»`);
    }
    const name = String(answers["full_name"] ?? "").trim();
    const phone = String(answers["phone"] ?? "").trim();
    if (phone.replace(/\D/g, "").length < 9)
      throw new MockRpcError("INVALID_PHONE: رقم الجوال غير صحيح");
    const service = services.find((v) => v["id"] === payload["service_id"]) ?? null;
    if (payload["service_id"] && !service)
      throw new MockRpcError("INVALID_SERVICE: الخدمة المختارة غير متاحة");
    const specId = service ? (service["specialty_id"] ?? null) : (payload["specialty_id"] ?? null);
    const doctor =
      settings["choose_doctor"] !== false && payload["doctor_id"]
        ? doctors.find((d) => d["id"] === payload["doctor_id"] && d["hide_name"] !== true)
        : null;
    const tail = phone.replace(/\D/g, "").slice(-9);
    let patient = rowsOf("patients").find((x) =>
      String(x["phone"]).replace(/\D/g, "").endsWith(tail),
    );
    if (!patient) {
      patient = {
        id: newId(),
        full_name: name,
        phone,
        whatsapp_number: phone,
        email: answers["email"] ?? null,
        gender: answers["gender"] ?? null,
        city: answers["city"] ?? null,
        source: "website",
        last_contact_at: new Date().toISOString(),
      };
      persist("patients", patient);
    }
    const spec = rowsOf("specialties").find((x) => x["id"] === specId);
    const number = rowsOf("booking_form_submissions").length + 1;
    const request: Row = {
      id: newId(),
      form_id: form["id"],
      form_title: form["title"],
      request_number: `REQ-26-${String(number).padStart(5, "0")}`,
      request_key: key,
      status: "pending_contact",
      specialty_id: specId,
      service_id: service?.["id"] ?? null,
      doctor_id: doctor?.["id"] ?? null,
      specialties: spec ? { name: spec["name"] } : null,
      services: service ? { name: service["name"] } : null,
      doctors: doctor ? { name: doctor["name"] } : null,
      appointment_id: null,
      appointments: null,
      patient_id: patient["id"],
      created_at: new Date().toISOString(),
      answers: ((form["fields"] ?? []) as Row[])
        .filter((f) => f["type"] !== "appointment" && String(answers[String(f["id"])] ?? "").trim())
        .map((f) => ({
          field_id: f["id"],
          label: f["label"],
          type: f["type"],
          value: answers[String(f["id"])],
        })),
      patients: P(String(patient["full_name"]), String(patient["phone"])),
    };
    persist("booking_form_submissions", request);
    persist("notifications", {
      id: newId(),
      type: "booking_request.created",
      title: "حجز محتمل جديد",
      message: `${name}${service ? ` — ${String(service["name"])}` : ""}`,
      is_read: false,
      created_at: new Date().toISOString(),
    });
    return { handled: true, value: confirm(request, false) };
  }

  if (fn === "set_booking_request_status") {
    const r = rowsOf("booking_form_submissions").find((x) => x["id"] === args["_request_id"]);
    if (!r) throw new MockRpcError("NOT_FOUND: الطلب غير موجود");
    if (r["status"] === "confirmed")
      throw new MockRpcError(
        "ALREADY_CONFIRMED: هذا الطلب تأكّد وأصبح موعدًا، عدّل الموعد نفسه من التقويم",
      );
    Object.assign(r, { status: args["_status"], status_changed_at: new Date().toISOString() });
    return { handled: true, value: { id: r["id"], status: r["status"] } };
  }

  if (fn === "confirm_booking_request") {
    const r = rowsOf("booking_form_submissions").find((x) => x["id"] === args["_request_id"]);
    if (!r) throw new MockRpcError("NOT_FOUND: الطلب غير موجود");
    const doctor = rowsOf("doctors").find((d) => d["id"] === args["_doctor_id"]);
    if (!doctor) throw new MockRpcError("INVALID_DOCTOR: اختر الطبيب");
    const service = rowsOf("services").find((v) => v["id"] === args["_service_id"]) ?? null;
    const duration = Number(service?.["duration_minutes"] ?? 30);
    const day = String(args["_date"] ?? "");
    const start = `${String(args["_time"] ?? "").slice(0, 5)}:00`;
    if (!mockSlots(doctor["id"], day, duration).includes(start))
      throw new MockRpcError("DOUBLE_BOOKING: الوقت غير متاح لهذا الطبيب");
    const patient = rowsOf("patients").find((x) => x["id"] === r["patient_id"]);
    const appointment: Row = {
      id: newId(),
      appointment_number: "APT-26-" + String(Math.floor(Math.random() * 900000) + 100000),
      appointment_date: day,
      start_time: start,
      end_time: toTime(toMinutes(start) + duration),
      status: "confirmed",
      source: "website",
      price: service?.["price"] ?? 0,
      notes: `من طلب الحجز ${String(r["request_number"])}`,
      idempotency_key: `request:${String(r["id"])}`,
      patient_id: r["patient_id"],
      doctor_id: doctor["id"],
      service_id: service?.["id"] ?? null,
      specialty_id: service?.["specialty_id"] ?? r["specialty_id"] ?? null,
      patients: patient ? P(String(patient["full_name"]), String(patient["phone"])) : null,
      doctors: { name: doctor["name"] },
      services: service ? { name: service["name"] } : null,
    };
    persist("appointments", appointment);
    Object.assign(r, {
      status: "confirmed",
      appointment_id: appointment["id"],
      appointments: {
        appointment_number: appointment["appointment_number"],
        appointment_date: day,
        start_time: start,
      },
    });
    return {
      handled: true,
      value: {
        appointment_id: appointment["id"],
        appointment_number: appointment["appointment_number"],
      },
    };
  }

  if (fn === "get_available_slots") {
    const duration = Number(args["_duration"] ?? 30);
    return {
      handled: true,
      value: mockSlots(args["_doctor_id"], String(args["_date"] ?? ""), duration).map(
        (slot_time) => ({ slot_time }),
      ),
    };
  }

  if (fn === "get_public_chatbot") {
    const bot = rowsOf("chatbot_settings")[0];
    if (!bot || bot["slug"] !== args["_slug"] || bot["is_active"] !== true)
      return { handled: true, value: null };
    const bookingForm = rowsOf("booking_forms").find(
      (f) => f["id"] === bot["booking_form_id"] && f["is_active"] === true,
    );
    return {
      handled: true,
      value: {
        bot_name: bot["bot_name"],
        welcome_message: bot["welcome_message"],
        mode: bot["mode"],
        menu: bot["menu"],
        fallback_message: bot["fallback_message"],
        booking_slug: bookingForm?.["slug"] ?? null,
        clinic: {
          name: clinic["clinic_name"],
          phone: clinic["phone"],
          email: clinic["email"],
          address: clinic["address"],
          city: clinic["city"],
          working_hours: clinic["working_hours"] ?? {},
        },
        specialties: rowsOf("specialties")
          .filter((s) => s["is_active"] !== false)
          .map((s) => ({ id: s["id"], name: s["name"] })),
        services: rowsOf("services")
          .filter((v) => v["is_active"] !== false)
          .map((v) => ({
            name: v["name"],
            price: v["price"],
            price_from: v["price_from"] === true,
            duration_minutes: v["duration_minutes"],
            specialty_id: v["specialty_id"] ?? null,
            description: v["description"] ?? null,
          })),
        doctors: rowsOf("doctors")
          .filter((d) => d["status"] === "active" && d["hide_name"] !== true)
          .map((d) => ({
            name: d["name"],
            specialty_id: d["specialty_id"] ?? null,
            specialty_ids: mockDepts(d),
            bio: d["bio"] ?? null,
          })),
        knowledge: rowsOf("chatbot_knowledge")
          .filter((k) => k["is_active"] === true)
          .map((k) => ({ category: k["category"], question: k["question"], answer: k["answer"] })),
      },
    };
  }
  if (fn === "consume_chatbot_ai_quota")
    return { handled: true, value: { allowed: false, reason: "ai_disabled" } };
  if (fn === "log_chatbot_exchange") {
    persist("chatbot_logs", {
      id: newId(),
      session_id: args["_session"],
      question: args["_question"],
      answer: args["_answer"],
      source: args["_source"],
      created_at: new Date().toISOString(),
    });
    return { handled: true, value: null };
  }
  return { handled: false };
}

/** The human-handoff RPCs, replayed against the in-memory tables. */
/** save_doctor: details, departments (first = main) and weekly schedule in one go. */
function mockSaveDoctor(args: Row): string {
  const p = (args["_payload"] ?? {}) as Row;
  const name = String(p["name"] ?? "").trim();
  if (name.length < 2) throw new MockRpcError("INVALID_NAME: اكتب اسم الطبيب");
  const depts = [...new Set((p["specialty_ids"] ?? []) as string[])];
  const schedules = ((p["schedules"] ?? []) as Row[]).map((d) => ({
    day_of_week: Number(d["day_of_week"]),
    start_time: `${String(d["start_time"]).slice(0, 5)}:00`,
    end_time: `${String(d["end_time"]).slice(0, 5)}:00`,
    break_start: d["break_start"] ? `${String(d["break_start"]).slice(0, 5)}:00` : null,
    break_end: d["break_end"] ? `${String(d["break_end"]).slice(0, 5)}:00` : null,
    is_active: true,
  }));
  if (schedules.some((d) => d.start_time >= d.end_time))
    throw new MockRpcError("INVALID_SCHEDULE: وقت النهاية يجب أن يكون بعد وقت البداية");
  const main = depts[0] ?? null;
  const fields = {
    name,
    phone: String(p["phone"] ?? "").trim() || null,
    email: String(p["email"] ?? "").trim() || null,
    bio: String(p["bio"] ?? "").trim() || null,
    status: p["status"] === "inactive" ? "inactive" : "active",
    hide_name: p["hide_name"] === true,
    specialty_id: main,
    specialties: main
      ? { name: rowsOf("specialties").find((s) => s["id"] === main)?.["name"] }
      : null,
    doctor_specialties: DEPTS(...depts),
    doctor_schedules: schedules,
  };
  const existing = rowsOf("doctors").find((d) => d["id"] === args["_doctor_id"]);
  if (existing) {
    Object.assign(existing, fields);
    return String(existing["id"]);
  }
  const id = newId();
  persist("doctors", { id, avatar_url: null, user_id: null, ...fields });
  return id;
}

/** The AI key saved from the chatbot page (preview keeps only the hint, like the real RPCs return). */
let mockAiKey: {
  provider: string;
  base_url: string | null;
  key_hint: string;
  models: unknown[];
  verified_at: string;
} | null = null;

/** Like chatbot_ai_align_model: move the bot to a model the new account has. */
function mockAlignModel(defaultModel: unknown) {
  const bot = rowsOf("chatbot_settings")[0];
  const ids = (mockAiKey?.models ?? []).map((m) => (m as Row)["id"]);
  if (bot && typeof defaultModel === "string" && ids.length && !ids.includes(bot["ai_model"]))
    bot["ai_model"] = defaultModel;
}

function mockAiKeyRpc(fn: string, args: Row): { handled: boolean; value?: unknown } {
  const info = () => ({
    ...(mockAiKey ? { has_key: true, ...mockAiKey } : { has_key: false, models: [] }),
    db_http: true,
  });
  if (fn === "get_chatbot_ai_key_info") return { handled: true, value: info() };
  if (fn === "set_chatbot_ai_key") {
    const key = String(args["_key"] ?? "").trim();
    const provider = String(args["_provider"] ?? "anthropic");
    if (
      key.length < 8 ||
      /\s/.test(key) ||
      (provider === "anthropic" && !key.startsWith("sk-ant-"))
    )
      throw new MockRpcError("INVALID_KEY: صيغة المفتاح غير صحيحة");
    mockAiKey = {
      provider,
      base_url: provider === "custom" ? String(args["_base_url"] ?? "") : null,
      key_hint: `${key.slice(0, 6)}…${key.slice(-4)}`,
      models: Array.isArray(args["_models"]) ? (args["_models"] as unknown[]) : [],
      verified_at: new Date().toISOString(),
    };
    mockAlignModel(args["_default_model"]);
    return { handled: true, value: info() };
  }
  if (fn === "set_chatbot_ai_models" && mockAiKey) {
    mockAiKey = {
      ...mockAiKey,
      models: Array.isArray(args["_models"]) ? (args["_models"] as unknown[]) : [],
      verified_at: new Date().toISOString(),
    };
    mockAlignModel(args["_default_model"]);
    return { handled: true, value: info() };
  }
  if (fn === "clear_chatbot_ai_key") {
    mockAiKey = null;
    return { handled: true, value: info() };
  }
  return { handled: false };
}

function mockRpc(fn: string, args: Row): unknown {
  const aiKey = mockAiKeyRpc(fn, args);
  if (aiKey.handled) return aiKey.value;
  const publicRpc = mockPublicRpc(fn, args);
  if (publicRpc.handled) return publicRpc.value;
  if (fn === "save_doctor") return mockSaveDoctor(args);
  const handoffFns = [
    "request_human_handoff",
    "claim_conversation",
    "send_human_reply",
    "release_to_bot",
  ];
  if (!handoffFns.includes(fn)) return null;
  const convo = ((MOCK["conversations"] ?? []) as Row[]).find(
    (c) => c["id"] === args["_conversation_id"],
  );
  if (!convo) return null;
  const now = new Date().toISOString();
  const inHandoff = convo["status"] === "human_support";

  if (fn === "request_human_handoff") {
    if (inHandoff) return false;
    Object.assign(convo, {
      status: "human_support",
      assigned_to: null,
      handoff_reason: args["_reason"] ?? null,
      handoff_requested_at: now,
      handoff_resolved_at: null,
    });
    return true;
  }
  if (fn === "claim_conversation") {
    Object.assign(convo, {
      status: "human_support",
      assigned_to: MOCK_USER.id,
      handoff_requested_at: inHandoff ? convo["handoff_requested_at"] : now,
      handoff_reason: inHandoff ? convo["handoff_reason"] : null,
      handoff_resolved_at: null,
      unread_count: 0,
    });
    return null;
  }
  if (fn === "send_human_reply") {
    if (!inHandoff || !convo["assigned_to"]) mockRpc("claim_conversation", args);
    const content = String(args["_content"] ?? "").trim();
    const id = newId();
    (MOCK["messages"] ??= []).push({
      id,
      conversation_id: convo["id"],
      direction: "outbound",
      sender_type: "human",
      content,
      status: "pending",
      metadata: { sent_by_name: MOCK_USER.user_metadata.full_name },
      created_at: now,
    });
    Object.assign(convo, {
      last_message_preview: content.slice(0, 160),
      last_message_at: now,
      unread_count: 0,
    });
    return id;
  }
  // release_to_bot
  if (!inHandoff) return false;
  Object.assign(convo, {
    status: "active",
    assigned_to: null,
    handoff_resolved_at: now,
    unread_count: 0,
  });
  return true;
}

function formStats(): Row[] {
  const stats = new Map<unknown, Row>();
  for (const s of (MOCK["booking_form_submissions"] ?? []) as Row[]) {
    const current = stats.get(s["form_id"]);
    stats.set(s["form_id"], {
      form_id: s["form_id"],
      submissions: Number(current?.["submissions"] ?? 0) + 1,
      last_submission_at:
        current && String(current["last_submission_at"]) > String(s["created_at"])
          ? current["last_submission_at"]
          : s["created_at"],
    });
  }
  return [...stats.values()];
}

function builder(table: string) {
  let rows = (table === "booking_form_stats" ? formStats() : [...(MOCK[table] ?? [])]) as Row[];
  let head = false;

  // Filters apply only to columns the mock table actually carries, so partially
  // modelled tables keep rendering instead of coming back empty.
  const where = (col: string, test: (v: unknown) => boolean) => {
    if (rows.some((r) => col in r)) rows = rows.filter((r) => test(r[col] ?? null));
    return chain;
  };

  const chain: Record<string, unknown> = {
    select(_sel?: string, opts?: { head?: boolean; count?: string }) {
      if (opts?.head) head = true;
      return chain;
    },
    order: () => chain,
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return chain;
    },
    range: () => chain,
    eq: (col: string, val: unknown) => where(col, (v) => v === val),
    neq: (col: string, val: unknown) => where(col, (v) => v !== val),
    gt: (col: string, val: unknown) => where(col, (v) => v !== null && compare(v, val) > 0),
    gte: (col: string, val: unknown) => where(col, (v) => v !== null && compare(v, val) >= 0),
    lt: (col: string, val: unknown) => where(col, (v) => v !== null && compare(v, val) < 0),
    lte: (col: string, val: unknown) => where(col, (v) => v !== null && compare(v, val) <= 0),
    in: (col: string, vals: unknown[]) => where(col, (v) => vals.includes(v)),
    is: (col: string, val: unknown) => where(col, (v) => v === val),
    like: () => chain,
    ilike: () => chain,
    or: () => chain,
    not: () => chain,
    filter: () => chain,
    match: () => chain,
    contains: () => chain,
    overlaps: () => chain,
    textSearch: () => chain,
    maybeSingle: () => ok(rows[0] ?? null),
    single: () => ok(rows[0] ?? null),
    then: (onF: (r: Res<unknown>) => unknown, onR?: (e: unknown) => unknown) =>
      (head ? ok(null, rows.length) : ok(rows)).then(onF, onR),
    insert(v: Record<string, unknown> | Record<string, unknown>[]) {
      const made = (Array.isArray(v) ? v : [v]).map((row) => withGeneratedFields(table, row));
      made.forEach((row) => persist(table, row));
      const single = made[0];
      const ins: Record<string, unknown> = {
        select: () => ins,
        single: () => ok(single),
        maybeSingle: () => ok(single),
        then: (onF: (r: Res<unknown>) => unknown, onR?: (e: unknown) => unknown) =>
          ok(null).then(onF, onR),
      };
      return ins;
    },
    update(patch: Row) {
      // Persist edits into the in-memory tables so the preview reflects them.
      const apply = (test: (r: Row) => boolean) => {
        for (const r of (MOCK[table] ?? []) as Row[]) {
          if (!test(r)) continue;
          Object.assign(r, patch);
          if (table === "appointments") refreshAppointmentEmbeds(r);
          if (table === "services" && "specialty_id" in patch) {
            const spec = rowsOf("specialties").find((s) => s["id"] === patch["specialty_id"]);
            r["specialties"] = spec ? { name: spec["name"] } : null;
          }
        }
        return ok(null);
      };
      const upd: Record<string, unknown> = {
        eq: (col: string, val: unknown) => apply((r) => r[col] === val),
        in: (col: string, vals: unknown[]) => apply((r) => vals.includes(r[col])),
        match: () => ok(null),
        then: (onF: (r: Res<unknown>) => unknown, onR?: (e: unknown) => unknown) =>
          ok(null).then(onF, onR),
      };
      return upd;
    },
    delete() {
      const remove = (test: (r: Row) => boolean) => {
        MOCK[table] = ((MOCK[table] ?? []) as Row[]).filter((r) => !test(r));
        return ok(null);
      };
      const del: Record<string, unknown> = {
        eq: (col: string, val: unknown) => remove((r) => r[col] === val),
        in: (col: string, vals: unknown[]) => remove((r) => vals.includes(r[col])),
        not: (col: string, _op: string, val: unknown) => remove((r) => (r[col] ?? null) !== val),
        match: () => ok(null),
        then: (onF: (r: Res<unknown>) => unknown, onR?: (e: unknown) => unknown) =>
          ok(null).then(onF, onR),
      };
      return del;
    },
    upsert: () => ok(null),
  };
  return chain;
}

const MOCK_USER = {
  id: "user-owner",
  email: "owner@clinic.sa",
  user_metadata: { full_name: "د. يحيى هادي" },
  app_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};
const MOCK_SESSION = {
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: MOCK_USER,
};

let cached: Record<string, unknown> | null = null;

export function getMockClient(): Record<string, unknown> {
  if (cached) return cached;
  cached = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Row = {}) => {
      try {
        return ok(mockRpc(fn, args));
      } catch (e) {
        if (!(e instanceof MockRpcError)) throw e;
        return Promise.resolve({
          data: null,
          error: { message: e.message, code: "P0001", details: null, hint: null },
        });
      }
    },
    channel: () => {
      const ch: Record<string, unknown> = {
        on: () => ch,
        subscribe: () => ch,
        unsubscribe: () => Promise.resolve("ok"),
      };
      return ch;
    },
    removeChannel: () => Promise.resolve("ok"),
    removeAllChannels: () => Promise.resolve("ok"),
    auth: {
      getUser: () => Promise.resolve({ data: { user: MOCK_USER }, error: null }),
      getSession: () => Promise.resolve({ data: { session: MOCK_SESSION }, error: null }),
      onAuthStateChange: (_cb: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: () =>
        Promise.resolve({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      signUp: () =>
        Promise.resolve({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
      updateUser: () => Promise.resolve({ data: { user: MOCK_USER }, error: null }),
    },
  };
  return cached;
}
