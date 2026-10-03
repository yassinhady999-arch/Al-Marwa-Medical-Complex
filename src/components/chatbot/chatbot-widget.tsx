import { useEffect, useRef, useState } from "react";
import { Bot, ExternalLink, LayoutList, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  findKnowledgeAnswer,
  isolateLtr,
  renderNodeReply,
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

let counter = 0;
const uid = () => `m${++counter}`;

function listAt(menu: MenuNode[], stack: MenuNode[]): MenuNode[] {
  return stack.length ? stack[stack.length - 1]!.children : menu;
}

function choicesFor(nodes: MenuNode[], stack: MenuNode[]): Choice[] {
  const choices: Choice[] = nodes.map((node) => ({ id: node.id, label: node.label, node, stack }));
  if (stack.length > 0) {
    choices.push({ id: "__back", label: "↩ رجوع", navTo: stack.slice(0, -1), stack });
    if (stack.length > 1)
      choices.push({ id: "__home", label: "🏠 القائمة الرئيسية", navTo: [], stack });
  }
  return choices;
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
        text: "تفضّل، اختر ما يناسبك:",
        choices: choicesFor(listAt(bot.menu, choice.navTo), choice.navTo),
      });
      return;
    }
    const node = choice.node!;
    const reply = renderNodeReply(node, bot, origin);
    const hasChildren = node.children.length > 0;
    const stack = hasChildren ? [...choice.stack, node] : choice.stack;
    // A leaf offers a way back to the list it came from, and to the main menu.
    const home: Choice = { id: "__home", label: "🏠 القائمة الرئيسية", navTo: [], stack: [] };
    const leafNav: Choice[] = choice.stack.length
      ? [{ id: "__back", label: "↩ رجوع", navTo: choice.stack, stack: choice.stack }, home]
      : [home];
    push(
      { id: uid(), from: "user", text: node.label },
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
      push({
        id: uid(),
        from: "bot",
        text: answer,
        // Nothing matched: put the menu back in front of the customer.
        ...(!match && menuEnabled ? { choices: choicesFor(bot.menu, []) } : {}),
      });
    } else {
      push({ id: uid(), from: "bot", text: answer });
    }
    setPending(false);
  }

  const last = items[items.length - 1];

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface", className)}>
      <header className="flex items-center gap-3 border-b border-border/70 bg-surface px-4 py-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-emphasis">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{bot.bot_name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success live-dot" />
            {bot.clinic?.name ?? "متصل الآن"}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2/40 p-4">
        {items.map((item) => (
          <div key={item.id} className={cn("flex", item.from === "user" && "justify-end")}>
            <div className="max-w-[86%] space-y-2">
              <div
                className={cn(
                  "w-fit whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-xs",
                  item.from === "user"
                    ? "ms-auto rounded-ee-md bg-primary text-primary-foreground"
                    : "rounded-es-md border border-border bg-surface text-foreground",
                )}
              >
                {isolateLtr(item.text)}
              </div>
              {item.links && item.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target={link.url.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft transition-transform hover:-translate-y-px"
                    >
                      <ExternalLink className="size-3.5" />
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
              {item === last && item.choices && item.choices.length > 0 && !pending && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {item.choices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => choose(choice)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-start text-xs font-semibold transition-all hover:-translate-y-px",
                        choice.navTo
                          ? "border-border bg-surface text-muted-foreground hover:text-foreground"
                          : "border-primary/40 bg-primary/10 text-primary-emphasis hover:bg-primary/20",
                      )}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex">
            <div className="flex items-center gap-1 rounded-2xl rounded-es-md border border-border bg-surface px-4 py-3">
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
          className="flex items-center gap-2 border-t border-border/70 bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          {menuEnabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="القائمة"
              title="القائمة"
              disabled={pending}
              onClick={() => choose({ id: "__menu", label: "", navTo: [], stack: [] })}
            >
              <LayoutList />
            </Button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب سؤالك هنا…"
            maxLength={500}
            disabled={pending}
            aria-label="سؤالك"
            className="flex h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-2/60 px-3.5 text-sm transition-[box-shadow,border-color] placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-60"
          />
          <Button type="submit" size="icon" aria-label="إرسال" disabled={pending || !input.trim()}>
            <SendHorizontal className="-scale-x-100" />
          </Button>
        </form>
      )}
      {textEnabled && (
        <p className="bg-surface px-4 pb-2 text-center text-[10px] text-muted-foreground">
          المساعد الآلي لا يقدّم تشخيصًا طبيًا · في الحالات الطارئة اتصل على 997
        </p>
      )}
    </div>
  );
}
