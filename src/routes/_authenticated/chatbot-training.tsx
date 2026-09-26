import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Plus, Pencil, Trash2, Sparkles, MessageCircleQuestion } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { ToneBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Tone } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/chatbot-training")({
  head: () => ({
    meta: [
      { title: "تدريب الشات بوت | نظام تشغيل العيادة" },
      { name: "description", content: "أمثلة تدريب لردود البوت الآلي." },
    ],
  }),
  component: ChatbotTrainingPage,
});

type Category = "تحية" | "حجز" | "أسعار" | "عام" | "شكوى";

const CATEGORY_TONE: Record<Category, Tone> = {
  تحية: "info",
  حجز: "primary",
  أسعار: "warning",
  عام: "neutral",
  شكوى: "danger",
};

const CATEGORIES: Category[] = ["تحية", "حجز", "أسعار", "عام", "شكوى"];

type TrainingExample = {
  id: string;
  category: Category;
  question: string;
  answer: string;
};

const INITIAL_EXAMPLES: TrainingExample[] = [
  {
    id: "1",
    category: "تحية",
    question: "السلام عليكم",
    answer: "وعليكم السلام ورحمة الله 👋 أهلاً بك في عيادتنا، كيف أقدر أساعدك اليوم؟",
  },
  {
    id: "2",
    category: "حجز",
    question: "أبغى أحجز موعد",
    answer: "تمام! تفضّل باسمك الكامل ورقم جوالك، وأي تخصص تحتاج؟",
  },
  {
    id: "3",
    category: "أسعار",
    question: "كم سعر الكشف؟",
    answer: "سعر الكشف العام يبدأ من ١٠٠ ريال، ويختلف حسب التخصص. أي قسم تسأل عنه بالتحديد؟",
  },
  {
    id: "4",
    category: "عام",
    question: "وين موقع العيادة؟",
    answer: "نتواجد في الرياض، طريق الملك فهد، حي العليا. هل تحب أرسل لك الموقع على الخريطة؟",
  },
  {
    id: "5",
    category: "حجز",
    question: "أبغى ألغي موعدي",
    answer: "لا مشكلة، ممكن ترسل رقم الحجز أو اسمك ورقم جوالك عشان نلغي الموعد لك؟",
  },
  {
    id: "6",
    category: "شكوى",
    question: "انتظرت وقت طويل بدون داعي",
    answer: "نعتذر عن الإزعاج 🙏 راح أحوّلك لأحد موظفينا للمتابعة مباشرة.",
  },
];

function ChatbotTrainingPage() {
  const [examples, setExamples] = useState<TrainingExample[]>(INITIAL_EXAMPLES);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingExample | null>(null);

  const shown = filter === "all" ? examples : examples.filter((e) => e.category === filter);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(ex: TrainingExample) {
    setEditing(ex);
    setDialogOpen(true);
  }
  function remove(id: string) {
    setExamples((prev) => prev.filter((e) => e.id !== id));
    toast.success("تم حذف مثال التدريب");
  }
  function save(data: Omit<TrainingExample, "id">) {
    if (editing) {
      setExamples((prev) => prev.map((e) => (e.id === editing.id ? { ...e, ...data } : e)));
      toast.success("تم تحديث مثال التدريب");
    } else {
      setExamples((prev) => [...prev, { ...data, id: crypto.randomUUID() }]);
      toast.success("تمت إضافة مثال تدريب جديد");
    }
    setDialogOpen(false);
  }

  return (
    <AppShell
      title="تدريب الشات بوت"
      description="أمثلة أسئلة وردود لتدريب البوت الآلي على واتساب"
      section="chatbot_training"
      actions={
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" />
          مثال جديد
        </Button>
      }
    >
      <div className="surface-raised mb-4 flex items-start gap-3 rounded-2xl border-warning/30 bg-warning-soft p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning-foreground">
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-warning-foreground">وضع تجريبي — غير مفعّل</p>
          <p className="mt-0.5 text-xs text-warning-foreground/85">
            هذا القسم لإعداد وتجربة أمثلة تدريب البوت فقط. أي إضافة أو تعديل هنا لا يُرسل ولا
            يُطبَّق على البوت الفعلي حاليًا.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="أمثلة التدريب"
          value={examples.length}
          icon={MessageCircleQuestion}
          tone="primary"
        />
        <StatCard label="الفئات" value={CATEGORIES.length} icon={Sparkles} tone="info" />
        <StatCard label="حالة البوت" value="غير مفعّل" icon={Bot} tone="neutral" />
      </div>

      <SectionCard
        icon={Bot}
        title="أمثلة التدريب"
        description={`${shown.length} من ${examples.length} مثال`}
        action={
          <Select value={filter} onValueChange={(v) => setFilter(v as Category | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        bodyClassName="p-0"
      >
        {shown.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={MessageCircleQuestion}
              title="لا توجد أمثلة"
              hint="أضف أول مثال تدريب من زر «مثال جديد»."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {shown.map((ex) => (
              <li key={ex.id} className="flex items-start gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ToneBadge tone={CATEGORY_TONE[ex.category]} dot={false}>
                      {ex.category}
                    </ToneBadge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">{ex.question}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ex.answer}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEdit(ex)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="تعديل"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => remove(ex.id)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                    aria-label="حذف"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <TrainingExampleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSave={save}
      />
    </AppShell>
  );
}

function TrainingExampleDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TrainingExample | null;
  onSave: (data: Omit<TrainingExample, "id">) => void;
}) {
  const [category, setCategory] = useState<Category>(initial?.category ?? "عام");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");

  // Re-sync local fields whenever a different row is opened for editing (or "new" is opened).
  const key = `${open}-${initial?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setCategory(initial?.category ?? "عام");
    setQuestion(initial?.question ?? "");
    setAnswer(initial?.answer ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "تعديل مثال تدريب" : "مثال تدريب جديد"}</DialogTitle>
          <DialogDescription>
            هذا المثال للعرض والتجربة فقط، ولن يُرسل لأي نظام خارجي.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>الفئة</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>سؤال متوقع من المريض</Label>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>رد البوت المدرّب</Label>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="min-h-24"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            disabled={!question.trim() || !answer.trim()}
            onClick={() => onSave({ category, question: question.trim(), answer: answer.trim() })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
