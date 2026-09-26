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
    is_active: true,
  }));

const MOCK: Record<string, unknown[]> = {
  clinic_settings: [
    {
      id: "clinic-1",
      clinic_name: "عيادة النخبة الطبية",
      phone: "+966112345678",
      email: "info@nukhba.sa",
      city: "الرياض",
      address: "طريق الملك فهد، حي العليا",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      n8n_webhook_url: "https://n8n.nukhba.sa/webhook/clinic",
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
      doctor_schedules: SCHED([0, 2, 4]),
    },
    {
      id: "d3",
      name: "د. فهد الزهراني",
      phone: "+966553330000",
      email: null,
      status: "active",
      bio: null,
      specialties: { name: "طب الأطفال" },
      specialty_id: "sp3",
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
      content: "وعليكم السلام 👋 أهلاً بك في عيادة النخبة. تفضّل باسمك الكامل ورقم جوالك.",
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

function withGeneratedFields(v: Record<string, unknown>) {
  return {
    id: newId(),
    appointment_number: "APT-26-" + String(Math.floor(Math.random() * 900000) + 100000),
    created_at: new Date().toISOString(),
    ...v,
  };
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

/** The human-handoff RPCs, replayed against the in-memory tables. */
function mockRpc(fn: string, args: Row): unknown {
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

function builder(table: string) {
  let rows = [...(MOCK[table] ?? [])] as Row[];
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
      const made = Array.isArray(v) ? v.map(withGeneratedFields) : withGeneratedFields(v);
      const single = Array.isArray(made) ? made[0] : made;
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
      const del: Record<string, unknown> = {
        eq: () => ok(null),
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
    rpc: (fn: string, args: Row = {}) => ok(mockRpc(fn, args)),
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
