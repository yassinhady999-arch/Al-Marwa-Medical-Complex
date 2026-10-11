// Customer chatbot (الشات بوت): menu tree model, live-data replies and the
// no-model knowledge matcher, shared by the staff editor, its preview and the
// public chat page.
import {
  CalendarCheck,
  Clock,
  Link2,
  MapPin,
  MessageSquareText,
  Stethoscope,
  Wallet,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { normalizeArabic } from "@/lib/arabic";
import { WEEKDAYS, departmentIds, formatTime, priceLabel, worksIn } from "@/lib/clinic";

export type MenuKind = "text" | "services" | "doctors" | "hours" | "contact" | "booking" | "link";

export type MenuNode = {
  id: string;
  /** The button the customer taps. */
  label: string;
  kind: MenuKind;
  /** What the bot says when the button is tapped (an intro line for live-data kinds). */
  reply: string;
  url?: string | undefined;
  url_label?: string | undefined;
  /** services / doctors only: limit the list to one specialty. */
  specialty_id?: string | null | undefined;
  children: MenuNode[];
};

export type ChatbotMode = "menu" | "ai" | "hybrid";

export type KnowledgeEntry = { category: string; question: string; answer: string };

export type WorkingHours = Record<string, { enabled?: boolean; start?: string; end?: string }>;

export type PublicChatbot = {
  bot_name: string;
  welcome_message: string;
  mode: ChatbotMode;
  menu: MenuNode[];
  fallback_message: string;
  booking_slug: string | null;
  clinic: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    working_hours: WorkingHours | null;
  } | null;
  specialties: { id: string; name: string }[];
  services: {
    name: string;
    price: number;
    duration_minutes: number;
    specialty_id: string | null;
    description: string | null;
  }[];
  doctors: {
    name: string;
    specialty_id: string | null;
    /** Every department the doctor works in (main one included). */
    specialty_ids?: string[] | undefined;
    bio?: string | null | undefined;
  }[];
  knowledge: KnowledgeEntry[];
};

type IconType = typeof Clock;

export const MENU_KIND_META: Record<MenuKind, { label: string; hint: string; icon: IconType }> = {
  text: {
    label: "رد نصي",
    hint: "رسالة تكتبها أنت، ويمكن أن تتفرع منها اختيارات أخرى",
    icon: MessageSquareText,
  },
  services: {
    label: "الخدمات والأسعار",
    hint: "تُعرض تلقائيًا من صفحة الخدمات بأسعارها الحالية",
    icon: Wallet,
  },
  doctors: {
    label: "الأطباء",
    hint: "قائمة الأطباء النشطين وتخصصاتهم",
    icon: Stethoscope,
  },
  hours: { label: "مواعيد العمل", hint: "من إعدادات العيادة", icon: Clock },
  contact: {
    label: "الموقع والتواصل",
    hint: "الهاتف والعنوان مع زر اتصال وواتساب",
    icon: MapPin,
  },
  booking: {
    label: "حجز موعد",
    hint: "زر يفتح نموذج الحجز المرتبط بالشات بوت",
    icon: CalendarCheck,
  },
  link: { label: "رابط", hint: "زر يفتح أي رابط (خرائط، موقع…)", icon: Link2 },
};

export const CHATBOT_MODES: { key: ChatbotMode; label: string; description: string }[] = [
  {
    key: "menu",
    label: "اختيارات فقط",
    description: "بدون نموذج ذكاء اصطناعي: العميل يتنقل بين الأزرار حتى يصل لإجابته.",
  },
  {
    key: "ai",
    label: "ذكاء اصطناعي",
    description: "العميل يكتب سؤاله بحرية ويرد النموذج من معلومات العيادة والمعرفة التي أضفتها.",
  },
  {
    key: "hybrid",
    label: "الاثنان معًا",
    description: "يبدأ بالاختيارات، ويستطيع العميل كتابة أي سؤال آخر ليرد عليه الذكاء الاصطناعي.",
  },
];

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "الأدق في الفهم والرد (افتراضي)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "متوازن: أسرع وأقل تكلفة" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "الأسرع والأوفر" },
] as const;

export const KNOWLEDGE_CATEGORIES = ["عام", "حجز", "أسعار", "تأمين", "تحضير للزيارة", "شكوى"];

/** Same starter menu the migration seeds: only live-data replies, so nothing is made up. */
export const STARTER_MENU: MenuNode[] = [
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
];

/** Problems that would break the bot, in Arabic, checked before saving the menu. */
export function validateMenu(menu: MenuNode[]): string[] {
  const problems = new Set<string>();
  const walk = (nodes: MenuNode[], depth: number) => {
    for (const n of nodes) {
      if (!n.label.trim()) problems.add("يوجد اختيار بدون نص للزر");
      if (n.kind === "text" && !n.reply.trim() && n.children.length === 0)
        problems.add(`اكتب رد البوت للاختيار «${n.label || "بدون عنوان"}»`);
      if (n.kind === "link" && !/^(https?:\/\/|tel:|mailto:)/i.test(n.url?.trim() ?? ""))
        problems.add(`الرابط في «${n.label || "بدون عنوان"}» يجب أن يبدأ بـ https://`);
      if (depth > MAX_MENU_DEPTH) problems.add(`أقصى عمق للقائمة ${MAX_MENU_DEPTH} مستويات`);
      walk(n.children, depth + 1);
    }
  };
  walk(menu, 1);
  if (countNodes(menu) > MAX_MENU_NODES) problems.add(`أقصى عدد للاختيارات ${MAX_MENU_NODES}`);
  return [...problems];
}

const KINDS = new Set<string>(Object.keys(MENU_KIND_META));
export const MAX_MENU_DEPTH = 8;
export const MAX_MENU_NODES = 400;

export function newMenuNode(kind: MenuKind = "text"): MenuNode {
  return {
    id: `n_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
    label: kind === "text" ? "اختيار جديد" : MENU_KIND_META[kind].label,
    kind,
    reply: "",
    children: [],
  };
}

/** Reads a stored menu defensively (bounded depth and size). */
export function parseMenu(json: Json | undefined): MenuNode[] {
  let budget = MAX_MENU_NODES;
  const walk = (value: unknown, depth: number): MenuNode[] => {
    if (!Array.isArray(value) || depth > MAX_MENU_DEPTH) return [];
    const out: MenuNode[] = [];
    for (const raw of value) {
      if (budget <= 0) break;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const r = raw as Record<string, unknown>;
      if (typeof r["id"] !== "string" || typeof r["label"] !== "string") continue;
      budget--;
      const kind = typeof r["kind"] === "string" && KINDS.has(r["kind"]) ? r["kind"] : "text";
      out.push({
        id: r["id"],
        label: r["label"],
        kind: kind as MenuKind,
        reply: typeof r["reply"] === "string" ? r["reply"] : "",
        ...(typeof r["url"] === "string" ? { url: r["url"] } : {}),
        ...(typeof r["url_label"] === "string" ? { url_label: r["url_label"] } : {}),
        ...(typeof r["specialty_id"] === "string" ? { specialty_id: r["specialty_id"] } : {}),
        children: walk(r["children"], depth + 1),
      });
    }
    return out;
  };
  return walk(json, 1);
}

export function countNodes(menu: MenuNode[]): number {
  return menu.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

// ---------------------------------------------------------------------------
// Tree edits (pure: each returns a new menu)
// ---------------------------------------------------------------------------

export function updateNode(menu: MenuNode[], id: string, patch: Partial<MenuNode>): MenuNode[] {
  return menu.map((n) =>
    n.id === id ? { ...n, ...patch } : { ...n, children: updateNode(n.children, id, patch) },
  );
}

export function removeNode(menu: MenuNode[], id: string): MenuNode[] {
  return menu
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

/** Appends `node` under `parentId` (null = main menu). */
export function addChild(menu: MenuNode[], parentId: string | null, node: MenuNode): MenuNode[] {
  if (parentId === null) return [...menu, node];
  return menu.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, node] }
      : { ...n, children: addChild(n.children, parentId, node) },
  );
}

/** Moves a node one place up (-1) or down (+1) among its siblings. */
export function moveNode(menu: MenuNode[], id: string, delta: -1 | 1): MenuNode[] {
  const index = menu.findIndex((n) => n.id === id);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= menu.length) return menu;
    const next = [...menu];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  }
  return menu.map((n) => ({ ...n, children: moveNode(n.children, id, delta) }));
}

/** The node and its ancestors (root first), or null. */
export function findPath(menu: MenuNode[], id: string, trail: MenuNode[] = []): MenuNode[] | null {
  for (const n of menu) {
    if (n.id === id) return [...trail, n];
    const found = findPath(n.children, id, [...trail, n]);
    if (found) return found;
  }
  return null;
}

export function parsePublicChatbot(json: Json | null): PublicChatbot | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, Json | undefined>;
  const list = <T>(v: Json | undefined) => (Array.isArray(v) ? (v as unknown as T[]) : []);
  const mode = r["mode"];
  return {
    bot_name: String(r["bot_name"] ?? "المساعد الآلي"),
    welcome_message: String(r["welcome_message"] ?? ""),
    mode: mode === "menu" || mode === "ai" ? mode : "hybrid",
    menu: parseMenu(r["menu"]),
    fallback_message: String(r["fallback_message"] ?? ""),
    booking_slug: typeof r["booking_slug"] === "string" ? r["booking_slug"] : null,
    clinic: (r["clinic"] as PublicChatbot["clinic"]) ?? null,
    specialties: list(r["specialties"]),
    services: list<PublicChatbot["services"][number]>(r["services"]).map((s) => ({
      ...s,
      price: Number(s.price ?? 0),
    })),
    doctors: list(r["doctors"]),
    knowledge: list(r["knowledge"]),
  };
}

// ---------------------------------------------------------------------------
// Live-data replies
// ---------------------------------------------------------------------------

/** "الأحد – الخميس: 9:00 ص – 9:00 م", consecutive days with the same hours grouped. */
export function formatWorkingHours(hours: WorkingHours | null | undefined): string[] {
  if (!hours || Object.keys(hours).length === 0) return [];
  const value = (d: number) => {
    const h = hours[String(d)];
    if (!h || h.enabled === false || !h.start || !h.end) return "مغلق";
    return `${formatTime(h.start)} – ${formatTime(h.end)}`;
  };
  const lines: string[] = [];
  let from = 0;
  for (let d = 1; d <= 7; d++) {
    if (d === 7 || value(d) !== value(from)) {
      const days = from === d - 1 ? WEEKDAYS[from] : `${WEEKDAYS[from]} – ${WEEKDAYS[d - 1]}`;
      lines.push(`${days}: ${value(from)}`);
      from = d;
    }
  }
  return lines;
}

/** Digits for wa.me from a Saudi number in any common format. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `966${digits}`;
  return digits;
}

export type BotReply = { text: string; links: { label: string; url: string }[] };

/** What the bot says when a menu choice is tapped. */
export function renderNodeReply(node: MenuNode, bot: PublicChatbot, origin: string): BotReply {
  const intro = node.reply.trim();
  const join = (...parts: (string | false | null | undefined)[]) =>
    parts.filter((p): p is string => !!p && p.trim() !== "").join("\n");
  const specialtyName = (id: string | null) =>
    bot.specialties.find((s) => s.id === id)?.name ?? null;
  const phone = bot.clinic?.phone ?? null;

  switch (node.kind) {
    case "services": {
      const services = bot.services.filter(
        (s) => !node.specialty_id || s.specialty_id === node.specialty_id,
      );
      if (services.length === 0)
        return { text: join(intro, "لا توجد خدمات معروضة حاليًا."), links: [] };
      const groups = new Map<string, string[]>();
      for (const s of services) {
        const key = specialtyName(s.specialty_id) ?? "خدمات عامة";
        const line = `• ${s.name} — ${priceLabel(s.price)}`;
        groups.set(key, [...(groups.get(key) ?? []), line]);
      }
      const body =
        groups.size === 1 && node.specialty_id
          ? [...groups.values()][0]!.join("\n")
          : [...groups.entries()]
              .map(([name, lines]) => `${name}:\n${lines.join("\n")}`)
              .join("\n\n");
      return { text: join(intro, body), links: [] };
    }
    case "doctors": {
      const doctors = bot.doctors.filter(
        (d) => !node.specialty_id || worksIn(d, node.specialty_id),
      );
      if (doctors.length === 0)
        return { text: join(intro, "لا يوجد أطباء معروضون حاليًا."), links: [] };
      const lines = doctors.map((d) => {
        // Inside one department its name is already the heading; list the others too.
        const depts = departmentIds(d)
          .filter((id) => id !== node.specialty_id)
          .map(specialtyName)
          .filter(Boolean)
          .join("، ");
        const bio = d.bio?.trim();
        return [`• ${d.name}${depts ? ` — ${depts}` : ""}`, bio && `   ${bio}`]
          .filter(Boolean)
          .join("\n");
      });
      return { text: join(intro, lines.join("\n")), links: [] };
    }
    case "hours": {
      const lines = formatWorkingHours(bot.clinic?.working_hours);
      return {
        text: join(intro, lines.length ? lines.join("\n") : "تواصل معنا لمعرفة مواعيد العمل."),
        links: [],
      };
    }
    case "contact": {
      const c = bot.clinic;
      const place = [c?.address, c?.city].filter(Boolean).join("، ");
      const links: BotReply["links"] = [];
      if (phone) {
        links.push({ label: "اتصال", url: `tel:${phone.replace(/[^\d+]/g, "")}` });
        links.push({ label: "واتساب", url: `https://wa.me/${whatsappNumber(phone)}` });
      }
      return {
        text: join(
          intro,
          phone && `📞 ${phone}`,
          place && `📍 ${place}`,
          c?.email && `✉️ ${c.email}`,
          !phone && !place && !c?.email && "لم تُضف بيانات التواصل بعد.",
        ),
        links,
      };
    }
    case "booking":
      if (bot.booking_slug) {
        return {
          text: intro || "احجز موعدك من الرابط التالي:",
          links: [{ label: "احجز موعدك الآن", url: `${origin}/book/${bot.booking_slug}` }],
        };
      }
      return {
        text: join(intro, phone ? `للحجز تواصل معنا على ${phone}` : "تواصل مع العيادة لحجز موعدك."),
        links: phone ? [{ label: "اتصال", url: `tel:${phone.replace(/[^\d+]/g, "")}` }] : [],
      };
    case "link":
      return {
        text: intro,
        links: node.url ? [{ label: node.url_label?.trim() || "فتح الرابط", url: node.url }] : [],
      };
    default:
      return { text: intro, links: [] };
  }
}

// ---------------------------------------------------------------------------
// Knowledge matching without a model
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "في من مين على الى إلى عن هل يا او أو ما ماذا انا أنا انت انتم ابي ابغى ابغي ابغا اريد أريد ودي بدي ممكن لو سمحت عندكم عندك لكم " +
    "لي هذا هذه ذلك اللي التي الذي مع كيف وش ايش شو كم متى عشان علشان شكرا السلام عليكم مرحبا اهلا يوجد توجد فيه هناك عندي لدي the a an is are to i you do can what how"
  )
    .split(" ")
    .map(normalizeArabic),
);

/** Common ways customers phrase the same intent, collapsed to one token. */
const SYNONYMS: [string, string[]][] = [
  ["سعر", ["سعر", "اسعار", "تكلفه", "تكاليف", "بكم", "رسوم", "فلوس", "price", "cost"]],
  ["موقع", ["موقع", "مكان", "عنوان", "وين", "فين", "اين", "لوكيشن", "location", "where"]],
  ["دوام", ["دوام", "تفتح", "تقفل", "تسكر", "مفتوح", "ساعات", "اوقات", "hours", "open"]],
  ["حجز", ["حجز", "احجز", "موعد", "مواعيد", "book", "appointment"]],
  ["الغاء", ["الغاء", "الغي", "كنسل", "cancel"]],
  ["تامين", ["تامين", "insurance"]],
  ["دكتور", ["دكتور", "دكتوره", "دكاتره", "دكاتر", "طبيب", "طبيبه", "اطباء", "doctor"]],
];

function canonical(token: string): string {
  for (const [canon, variants] of SYNONYMS) {
    if (variants.some((v) => token === v || (v.length >= 3 && token.startsWith(v)))) return canon;
  }
  return token;
}

function stripArticle(token: string): string {
  for (const prefix of ["وال", "بال", "كال", "فال", "لل", "ال"]) {
    if (token.startsWith(prefix) && token.length - prefix.length >= 2)
      return token.slice(prefix.length);
  }
  return token;
}

export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalizeArabic(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    // Synonyms first: "الغي" is a verb, not "ال" + "غي".
    const direct = canonical(raw);
    const token = direct !== raw ? direct : canonical(stripArticle(raw));
    if (!STOPWORDS.has(token)) out.add(token);
  }
  return out;
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a));
}

/** Best stored answer for a typed question, or null when nothing is close enough. */
export function findKnowledgeAnswer(
  question: string,
  entries: KnowledgeEntry[],
): KnowledgeEntry | null {
  const asked = [...keywords(question)];
  if (asked.length === 0) return null;
  let best: KnowledgeEntry | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const stored = [...keywords(entry.question)];
    if (stored.length === 0) continue;
    const hits = stored.filter((w) => asked.some((a) => similar(a, w))).length;
    if (hits === 0) continue;
    // Equal weight on both sides, so a short generic entry ("كيف أحجز موعد؟") doesn't beat one
    // that covers more of what the customer actually asked ("كيف ألغي موعدي؟").
    const score = (hits / stored.length) * 0.5 + (hits / asked.length) * 0.5;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Keeps phone numbers, emails and links readable inside Arabic text (no "966…+" flips). */
export function isolateLtr(text: string): string {
  return text.replace(
    /(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s-]{7,}\d)/g,
    "⁦$1⁩", // left-to-right isolate … pop isolate
  );
}

export function chatLink(slug: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/chat/${slug}`;
}
