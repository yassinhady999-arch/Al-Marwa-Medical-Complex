import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Baby,
  Brain,
  CalendarCheck,
  ChevronLeft,
  ClipboardList,
  Clock,
  Droplet,
  ExternalLink,
  Gift,
  HeartPulse,
  Hospital,
  House,
  LayoutGrid,
  Link2,
  MapPin,
  MessageCircle,
  MessageCircleQuestion,
  MessageSquareText,
  Microscope,
  Phone,
  Puzzle,
  SendHorizontal,
  Smile,
  Speech,
  Stethoscope,
  Target,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { TONE_SOFT, type Tone } from "@/lib/clinic";
import {
  findKnowledgeAnswer,
  isolateLtr,
  renderNodeReply,
  type MenuKind,
  type MenuNode,
  type PublicChatbot,
} from "@/lib/chatbot";

type ChatLink = { label: string; url: string };
type Choice = {
  id: string;
  label: string;
  /** A menu option to open… */
  node?: MenuNode | undefined;
  /** …or navigation: show the list found at this path ([] = main menu). */
  navTo?: MenuNode[] | undefined;
  /** Path to the list this option belongs to. */
  stack: MenuNode[];
};
type Item = {
  id: string;
  from: "bot" | "user";
  text: string;
  links?: ChatLink[];
  choices?: Choice[];
};

export type ChatTurn = { role: "user" | "assistant"; content: string };
/** Resolves to the AI's answer, or null when AI isn't available (the widget then answers locally). */
export type AskAi = (turns: ChatTurn[]) => Promise<string | null>;

type IconType = typeof Clock;

let counter = 0;
const uid = () => `m${++counter}`;

function listAt(menu: MenuNode[], stack: MenuNode[]): MenuNode[] {
  return stack.length ? stack[stack.length - 1]!.children : menu;
}

function choicesFor(nodes: MenuNode[], stack: MenuNode[]): Choice[] {
  const choices: Choice[] = nodes.map((node) => ({ id: node.id, label: node.label, node, stack }));
  if (stack.length > 0) {
    choices.push({ id: "__back", label: "رجوع", navTo: stack.slice(0, -1), stack });
    if (stack.length > 1)
      choices.push({ id: "__home", label: "القائمة الرئيسية", navTo: [], stack });
  }
  return choices;
}

// Menu labels often start with an emoji ("📅 حجز موعد"). Emoji look different on every
// phone, so the widget shows a matching icon instead and keeps the words.
const LEADING_EMOJI =
  /^\s*(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*\s*)+/u;

function splitLabel(label: string): { emoji: string; text: string } {
  const match = label.match(LEADING_EMOJI);
  if (!match) return { emoji: "", text: label.trim() };
  const text = label.slice(match[0].length).trim();
  return { emoji: match[0].replace(/[\s️]/g, ""), text: text || label.trim() };
}

const EMOJI_VISUALS: Record<string, [IconType, Tone]> = {
  "📅": [CalendarCheck, "primary"],
  "🗓": [CalendarCheck, "primary"],
  "🏥": [Hospital, "primary"],
  "💰": [Wallet, "warning"],
  "💵": [Wallet, "warning"],
  "🎁": [Gift, "warning"],
  "👨‍⚕": [Stethoscope, "info"],
  "👩‍⚕": [Stethoscope, "info"],
  "🩺": [HeartPulse, "info"],
  "🦷": [Smile, "info"],
  "🤰": [Baby, "chat"],
  "🧒": [Baby, "chat"],
  "👶": [Baby, "chat"],
  "🧠": [Brain, "chat"],
  "🗣": [Speech, "chat"],
  "🎯": [Target, "chat"],
  "🧩": [Puzzle, "chat"],
  "🩸": [Droplet, "danger"],
  "👩": [UserRound, "danger"],
  "👨": [UserRound, "danger"],
  "🔬": [Microscope, "info"],
  "🕘": [Clock, "accent"],
  "🕐": [Clock, "accent"],
  "⏰": [Clock, "accent"],
  "🏠": [House, "success"],
  "🏡": [House, "success"],
  "📋": [ClipboardList, "neutral"],
  "⚠": [TriangleAlert, "warning"],
  "📍": [MapPin, "success"],
  "📞": [Phone, "success"],
  "💬": [MessageCircle, "success"],
  "❓": [MessageCircleQuestion, "primary"],
};

const KIND_VISUALS: Record<MenuKind, [IconType, Tone]> = {
  text: [MessageSquareText, "primary"],
  services: [Wallet, "warning"],
  doctors: [Stethoscope, "info"],
  hours: [Clock, "accent"],
  contact: [MapPin, "success"],
  booking: [CalendarCheck, "primary"],
  link: [Link2, "neutral"],
};

function optionVisual(node: MenuNode): { Icon: IconType; tone: Tone; text: string } {
  const { emoji, text } = splitLabel(node.label);
  const url = node.url ?? "";
  if (node.kind === "link" && /wa\.me|whatsapp/i.test(url))
    return { Icon: MessageCircle, tone: "success", text };
  if (node.kind === "link" && url.startsWith("tel:")) return { Icon: Phone, tone: "success", text };
  const byEmoji =
    EMOJI_VISUALS[emoji] ?? EMOJI_VISUALS[Array.from(emoji)[0] ?? ""] ?? KIND_VISUALS[node.kind];
  return { Icon: byEmoji[0], tone: byEmoji[1], text };
}

function linkVisual(url: string): { Icon: IconType; className: string } {
  if (/wa\.me|whatsapp/i.test(url))
    return { Icon: MessageCircle, className: "bg-[#1fa855] text-white hover:bg-[#1a9049]" };
  if (url.startsWith("tel:"))
    return {
      Icon: Phone,
      className: "border border-border bg-surface text-foreground hover:bg-accent",
    };
  if (url.includes("/book/"))
    return {
      Icon: CalendarCheck,
      className: "bg-primary text-primary-foreground hover:bg-primary/90",
    };
  return {
    Icon: ExternalLink,
    className: "bg-primary text-primary-foreground hover:bg-primary/90",
  };
}

/**
 * The customer-facing chat. Menu choices are answered locally (no model); typed
 * questions go to `askAi` and fall back to the closest stored answer.
 */
export function ChatbotWidget({
  bot,
  origin,
  askAi,
  onLocalAnswer,
  className,
}: {
  bot: PublicChatbot;
  origin: string;
  askAi?: AskAi | undefined;
  onLocalAnswer?:
    ((question: string, answer: string, source: "knowledge" | "fallback") => void) | undefined;
  className?: string | undefined;
}) {
  const menuEnabled = bot.mode !== "ai" && bot.menu.length > 0;
  const textEnabled = bot.mode !== "menu";
  const [items, setItems] = useState<Item[]>(() => [
    {
      id: uid(),
      from: "bot",
      text: bot.welcome_message || "أهلًا بك 👋 كيف أقدر أساعدك؟",
      ...(menuEnabled ? { choices: choicesFor(bot.menu, []) } : {}),
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const place = [bot.clinic?.address, bot.clinic?.city].filter(Boolean).join("، ");

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length, pending]);

  const push = (...next: Item[]) => setItems((prev) => [...prev, ...next]);

  function choose(choice: Choice) {
    if (pending) return;
    if (choice.navTo) {
      push({
        id: uid(),
        from: "bot",
        text: choice.navTo.length ? "تفضّل، اختر ما يناسبك:" : "القائمة الرئيسية، اختر ما تحتاجه:",
        choices: choicesFor(listAt(bot.menu, choice.navTo), choice.navTo),
      });
      return;
    }
    const node = choice.node!;
    const reply = renderNodeReply(node, bot, origin);
    const hasChildren = node.children.length > 0;
    const stack = hasChildren ? [...choice.stack, node] : choice.stack;
    // A leaf offers a way back to the list it came from, and to the main menu.
    const home: Choice = { id: "__home", label: "القائمة الرئيسية", navTo: [], stack: [] };
    const leafNav: Choice[] = choice.stack.length
      ? [{ id: "__back", label: "رجوع", navTo: choice.stack, stack: choice.stack }, home]
      : [home];
    push(
      { id: uid(), from: "user", text: splitLabel(node.label).text },
      {
        id: uid(),
        from: "bot",
        text: reply.text || (hasChildren ? "اختر من التالي:" : "—"),
        links: reply.links,
        choices: hasChildren ? choicesFor(node.children, stack) : leafNav,
      },
    );
  }

  async function ask(raw: string) {
    const question = raw.trim().slice(0, 500);
    if (!question || pending) return;
    setInput("");
    const history: ChatTurn[] = items
      .filter((i) => i.text && i.text !== "—")
      .slice(-12)
      .map((i) => ({
        role: i.from === "user" ? "user" : "assistant",
        content: i.text.slice(0, 1500),
      }));
    push({ id: uid(), from: "user", text: question });
    setPending(true);
    let answer: string | null = null;
    try {
      answer = askAi ? await askAi([...history, { role: "user", content: question }]) : null;
    } catch {
      answer = null;
    }
    if (answer === null) {
      const match = findKnowledgeAnswer(question, bot.knowledge);
      answer = match ? match.answer : bot.fallback_message;
      onLocalAnswer?.(question, answer, match ? "knowledge" : "fallback");
      // A booking answer ("احجز…") comes with the button that opens the booking form.
      const bookingLink =
        match && match.category === "حجز" && answer.includes("احجز") && bot.booking_slug
          ? [{ label: "احجز الآن", url: `${origin}/book/${bot.booking_slug}` }]
          : [];
      push({
        id: uid(),
        from: "bot",
        text: answer,
        ...(bookingLink.length ? { links: bookingLink } : {}),
        // Nothing matched: put the menu back in front of the customer.
        ...(!match && menuEnabled ? { choices: choicesFor(bot.menu, []) } : {}),
      });
    } else {
      push({ id: uid(), from: "bot", text: answer });
    }
    setPending(false);
  }

  const last = items[items.length - 1];
  const openMenu = () => choose({ id: "__menu", label: "", navTo: [], stack: [] });

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface", className)}>
      <header className="flex items-center gap-3 border-b border-border/70 bg-surface px-4 py-3">
        <span className="relative shrink-0">
          <img
            src={BRAND.mark}
            alt=""
            width={44}
            height={44}
            className="size-11 rounded-full bg-white object-contain p-0.5 ring-1 ring-border"
          />
          <span className="absolute bottom-0 end-0 size-3 rounded-full border-2 border-surface bg-success" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">{bot.bot_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            متصل الآن{bot.clinic?.name ? ` · ${bot.clinic.name}` : ""}
          </p>
        </div>
        {menuEnabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full"
            disabled={pending}
            onClick={openMenu}
          >
            <LayoutGrid className="size-4" />
            القائمة
          </Button>
        )}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-2/50 px-3 py-4 sm:px-4"
      >
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          <img
            src={BRAND.logo}
            alt={bot.clinic?.name || BRAND.name}
            width={516}
            height={444}
            className="h-20 w-auto rounded-3xl bg-white object-contain p-2 shadow-sm ring-1 ring-border/60"
          />
          {place && (
            <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3" />
              {place}
            </p>
          )}
        </div>

        {items.map((item) =>
          item.from === "user" ? (
            <div key={item.id} className="flex justify-end">
              <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground shadow-xs">
                {isolateLtr(item.text)}
              </div>
            </div>
          ) : (
            <div key={item.id} className="flex items-start gap-2">
              <img
                src={BRAND.mark}
                alt=""
                width={28}
                height={28}
                className="mt-0.5 size-7 shrink-0 rounded-full bg-white object-contain p-0.5 ring-1 ring-border/70"
              />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="w-fit max-w-[94%] break-words rounded-2xl rounded-ss-md border border-primary/25 bg-primary/10 px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-xs">
                  <MessageText text={item.text} />
                </div>
                {item.links && item.links.length > 0 && <LinkButtons links={item.links} />}
                {item === last && item.choices && item.choices.length > 0 && !pending && (
                  <Choices choices={item.choices} onChoose={choose} />
                )}
              </div>
            </div>
          ),
        )}

        {pending && (
          <div className="flex items-start gap-2">
            <img
              src={BRAND.mark}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-full bg-white object-contain p-0.5 ring-1 ring-border/70"
            />
            <div className="flex items-center gap-1 rounded-2xl rounded-ss-md border border-primary/25 bg-primary/10 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {textEnabled && (
        <form
          className="flex items-center gap-2 border-t border-border/70 bg-surface px-3 pb-2 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب سؤالك هنا…"
            maxLength={500}
            disabled={pending}
            aria-label="سؤالك"
            className="flex h-11 min-w-0 flex-1 rounded-full border border-border bg-surface-2/60 px-4 text-sm transition-[box-shadow,border-color] placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-60"
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            aria-label="إرسال"
            disabled={pending || !input.trim()}
          >
            <SendHorizontal className="-scale-x-100" />
          </Button>
        </form>
      )}
      <p className="bg-surface px-4 pb-2 pt-1 text-center text-[10px] text-muted-foreground">
        المساعد الآلي لا يقدّم تشخيصًا طبيًا · في الحالات الطارئة اتصل على 997
      </p>
    </div>
  );
}

/** Main menu as a grid of cards; deeper lists as rows; back / main menu as small links. */
function Choices({ choices, onChoose }: { choices: Choice[]; onChoose: (c: Choice) => void }) {
  const options = choices.filter((c) => c.node);
  const nav = choices.filter((c) => c.navTo);
  const isMainMenu = options.length > 0 && options.every((c) => c.stack.length === 0);

  return (
    <div className="space-y-2">
      {options.length > 0 &&
        (isMainMenu ? (
          <div className="grid grid-cols-2 gap-2">
            {options.map((choice) => {
              const { Icon, tone, text } = optionVisual(choice.node!);
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => onChoose(choice)}
                  className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-border bg-surface px-2.5 py-2 text-start shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl border",
                      TONE_SOFT[tone],
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 text-[13px] font-semibold leading-snug text-foreground">
                    {text}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
            {options.map((choice) => {
              const { Icon, tone, text } = optionVisual(choice.node!);
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => onChoose(choice)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg border",
                      TONE_SOFT[tone],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
                    {text}
                  </span>
                  <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        ))}
      {nav.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {nav.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onChoose(choice)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {choice.id === "__back" ? (
                <ArrowRight className="size-3.5" />
              ) : (
                <LayoutGrid className="size-3.5" />
              )}
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkButtons({ links }: { links: ChatLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const { Icon, className } = linkVisual(link.url);
        return (
          <a
            key={link.url}
            href={link.url}
            target={link.url.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-xs transition-colors",
              className,
            )}
          >
            <Icon className="size-4" />
            {link.label}
          </a>
        );
      })}
    </div>
  );
}

const PRICE_ROW = /^\s*•\s*(.+?)\s+—\s+(.*(?:ر\.س|ريال|السعر عند الاستفسار).*)$/;
const BULLET = /^\s*•\s*(.+)$/;
const CONTINUATION = /^\s{2,}(\S.*)$/;

type Row = { label: string; value: string; note?: string };
type Block =
  | { type: "text"; text: string; heading: boolean }
  | { type: "prices"; rows: Row[] }
  | { type: "bullets"; rows: { text: string; note?: string }[] }
  | { type: "gap" };

/**
 * Bot replies are plain text built from the menu and live data. Price lines
 * ("• خدمة — ٩٩ ر.س") become a price list, other "•" lines a bullet list, and an
 * indented line under a bullet is its note (for example the doctor's specialty).
 */
function MessageText({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const lastBlock = blocks[blocks.length - 1];
    const price = line.match(PRICE_ROW);
    const bullet = price ? null : line.match(BULLET);
    const continuation = price || bullet ? null : line.match(CONTINUATION);
    // A line right before a list is that list's title ("🦷 الأسنان").
    if ((price || bullet) && lastBlock?.type === "text") lastBlock.heading = true;
    if (price) {
      const row = { label: price[1]!, value: price[2]! };
      if (lastBlock?.type === "prices") lastBlock.rows.push(row);
      else blocks.push({ type: "prices", rows: [row] });
    } else if (bullet) {
      const row = { text: bullet[1]! };
      if (lastBlock?.type === "bullets") lastBlock.rows.push(row);
      else blocks.push({ type: "bullets", rows: [row] });
    } else if (continuation && (lastBlock?.type === "bullets" || lastBlock?.type === "prices")) {
      const row = lastBlock.rows[lastBlock.rows.length - 1]!;
      row.note = row.note ? `${row.note} ${continuation[1]}` : continuation[1]!;
    } else if (!line.trim()) {
      if (lastBlock && lastBlock.type !== "gap") blocks.push({ type: "gap" });
    } else {
      const trimmed = line.trim();
      blocks.push({ type: "text", text: trimmed, heading: trimmed.endsWith(":") });
    }
  }

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.type === "gap") return <div key={i} className="h-0.5" />;
        if (block.type === "text")
          return (
            <p key={i} className={cn(block.heading && "font-semibold")}>
              {isolateLtr(block.text)}
            </p>
          );
        if (block.type === "prices")
          return (
            <div
              key={i}
              className="divide-y divide-border/60 overflow-hidden rounded-xl border border-primary/20 bg-surface"
            >
              {block.rows.map((row, j) => (
                <div key={j} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0">
                    {isolateLtr(row.label)}
                    {row.note && (
                      <span className="block text-xs text-muted-foreground">{row.note}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 text-[13px] font-semibold",
                      /ر\.س|ريال/.test(row.value)
                        ? "text-primary-emphasis"
                        : "text-muted-foreground",
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          );
        return (
          <ul key={i} className="space-y-1">
            {block.rows.map((row, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary/70" />
                <span className="min-w-0">
                  {isolateLtr(row.text)}
                  {row.note && (
                    <span className="block text-xs text-muted-foreground">{row.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
