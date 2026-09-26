import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Stethoscope,
  CalendarClock,
  MessageCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/app/theme-toggle";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "دخول فريق العيادة إلى لوحة التشغيل: المواعيد والمرضى والمحادثات.",
      },
      { property: "og:title", content: "تسجيل الدخول | نظام تشغيل العيادة" },
      { property: "og:description", content: "دخول فريق العيادة إلى لوحة التشغيل." },
    ],
  }),
  component: AuthPage,
});

const FEATURES = [
  {
    icon: CalendarClock,
    title: "حجوزات ومواعيد فورية",
    desc: "تأكيد، حضور، وإكمال المواعيد لحظة بلحظة مع منع الحجز المزدوج.",
  },
  {
    icon: MessageCircle,
    title: "محادثات واتساب موحّدة",
    desc: "كل رسائل المرضى في صندوق واحد، بتسليم واستلام بين الذكاء الاصطناعي والموظف.",
  },
];

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("تعذّر تسجيل الدخول: " + error.message);
      return;
    }
    await logActivity({
      action: "login",
      section: "dashboard",
      description: "تسجيل دخول إلى النظام",
    });
    toast.success("تم تسجيل الدخول");
    navigate({ to: "/dashboard" });
  };

  const forgotPassword = async () => {
    if (!email) {
      toast.error("اكتب بريدك الإلكتروني أولًا");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("تعذّر إرسال رابط الاستعادة: " + error.message);
      return;
    }
    toast.success("تم إرسال رابط استعادة كلمة المرور إلى بريدك");
  };

  return (
    <div className="relative h-screen overflow-hidden bg-surface-2 lg:grid lg:grid-cols-[minmax(0,38rem)_1fr]">
      <div className="absolute top-4 z-20 end-4">
        <ThemeToggle />
      </div>

      {/* ── Sign-in — RIGHT in RTL ──────────────────────────────────── */}
      <main
        className="relative flex h-full items-center justify-center overflow-y-auto px-5 py-6 sm:px-10"
        style={{
          backgroundImage: [
            "radial-gradient(46rem 32rem at 100% -14%, color-mix(in oklch, var(--color-primary) 11%, transparent), transparent 60%)",
            "radial-gradient(34rem 30rem at -14% 114%, color-mix(in oklch, var(--color-primary) 5%, transparent), transparent 58%)",
            "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--color-foreground) 4.5%, transparent) 1px, transparent 0)",
          ].join(","),
          backgroundSize: "auto, auto, 24px 24px",
        }}
      >
        <div className="animate-rise w-full max-w-[27rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <Stethoscope className="size-5" />
            </div>
            <span className="font-bold text-foreground">نظام تشغيل العيادة</span>
          </div>

          <div className="surface-raised relative overflow-hidden rounded-3xl p-6 shadow-xl sm:p-9">
            <span
              className="absolute inset-x-10 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklch, var(--color-primary) 65%, transparent), transparent)",
              }}
            />

            <div
              className="grid size-11 place-items-center rounded-2xl text-primary-emphasis ring-1 ring-primary/20"
              style={{
                backgroundImage:
                  "linear-gradient(160deg, color-mix(in oklch, var(--color-primary) 20%, transparent), color-mix(in oklch, var(--color-primary) 8%, transparent))",
              }}
            >
              <Stethoscope className="size-[22px]" />
            </div>

            <h1 className="mt-5 text-[1.6rem] font-bold leading-tight tracking-tight text-foreground">
              مرحبًا بعودتك
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              سجّل الدخول للوصول إلى لوحة تشغيل العيادة.
            </p>

            <form className="mt-7 space-y-4" onSubmit={signIn}>
              <Field label="البريد الإلكتروني" htmlFor="email">
                <IconInput
                  id="email"
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  placeholder="name@clinic.sa"
                  required
                  value={email}
                  onChange={setEmail}
                />
              </Field>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <button
                    type="button"
                    className="rounded text-xs font-semibold text-primary-emphasis transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-50"
                    disabled={loading}
                    onClick={forgotPassword}
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-2 w-full shadow-md hover:shadow-lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    جارٍ الدخول…
                  </>
                ) : (
                  "تسجيل الدخول"
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-emphasis" />
              <span>
                الحسابات يُنشئها مدير النظام من قسم «الموظفون»، ثم تسجّل الدخول بها مباشرةً.
              </span>
            </div>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground/80">
            <Lock className="size-3" />
            اتصال آمن ومصادقة عبر Supabase
          </p>
        </div>
      </main>

      {/* ── Brand panel — LEFT in RTL ───────────────────────────────── */}
      <aside
        className="relative hidden overflow-hidden border-s border-white/10 bg-sidebar text-sidebar-foreground lg:block"
        style={{
          backgroundImage: [
            "radial-gradient(42rem 34rem at 90% 4%, color-mix(in oklch, var(--color-sidebar-primary) 26%, transparent), transparent 58%)",
            "radial-gradient(32rem 32rem at 2% 100%, color-mix(in oklch, var(--color-info) 16%, transparent), transparent 56%)",
            "linear-gradient(to right, color-mix(in oklch, #fff 3.5%, transparent) 1px, transparent 1px)",
            "linear-gradient(to bottom, color-mix(in oklch, #fff 3.5%, transparent) 1px, transparent 1px)",
            "linear-gradient(210deg, var(--color-sidebar), var(--color-sidebar-2))",
          ].join(","),
          backgroundSize: "auto, auto, 48px 48px, 48px 48px, auto",
        }}
      >
        {/* Concentric-ring motif anchored to the top-end corner */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-48 -end-48 size-[46rem] rounded-full opacity-70"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in oklch, var(--color-sidebar-primary) 24%, transparent), transparent)",
            }}
          />
          <div className="absolute -top-40 -end-40 size-[42rem] rounded-full border border-white/[0.06]" />
          <div className="absolute -top-28 -end-28 size-[33rem] rounded-full border border-white/[0.05]" />
          <div className="absolute -top-16 -end-16 size-[24rem] rounded-full border border-white/[0.04]" />
          <div
            className="absolute -bottom-32 -start-24 size-[24rem] rounded-full opacity-60"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in oklch, var(--color-info) 18%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-[22%] end-20 size-24 rotate-12 rounded-[1.4rem] border border-white/[0.08]" />
          <div className="absolute top-[30%] start-16 size-3.5 rotate-45 rounded-[3px] bg-white/[0.1]" />
        </div>

        <div className="relative flex h-full flex-col p-10 xl:p-14">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-soft">
                <Stethoscope className="size-6" />
              </div>
              <div>
                <p className="text-[0.95rem] font-bold text-sidebar-foreground">
                  نظام تشغيل العيادة
                </p>
                <p className="text-[0.7rem] tracking-wide text-sidebar-muted">CLINIC OPERATIONS</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-sidebar-muted">
              <span className="size-1.5 rounded-full bg-sidebar-primary" />
              منصة تشغيل العيادات
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-10">
            <div className="max-w-lg">
              <h2 className="text-[2rem] font-bold leading-[1.42] tracking-tight text-sidebar-foreground xl:text-[2.55rem] xl:leading-[1.32]">
                كل ما يحدث في عيادتك،
                <br />
                <span className="text-sidebar-primary">في شاشة واحدة.</span>
              </h2>
              <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-sidebar-muted">
                من رسالة واتساب أول ما تصل، إلى الموعد وهو مكتمل — بدون فتح n8n ولا قاعدة البيانات.
              </p>

              <ul className="mt-9 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {FEATURES.map((f, i) => (
                  <li
                    key={f.title}
                    className="animate-rise flex items-start gap-4 py-4"
                    style={{ animationDelay: `${140 + i * 90}ms` }}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-sidebar-primary ring-1 ring-inset ring-white/10">
                      <f.icon className="size-[18px]" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-sidebar-foreground">{f.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-sidebar-muted">{f.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-sidebar-muted">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-sidebar-primary" />
              اتصال مُشفّر
            </span>
            <span className="size-1 rounded-full bg-white/20" />
            <span>© {new Date().getFullYear()} نظام تشغيل العيادة</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span className="tabular">Asia/Riyadh · SAR</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function IconInput({
  id,
  icon: Icon,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  required,
}: {
  id: string;
  icon: typeof Mail;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="relative" dir="ltr">
      <Icon className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-muted-foreground" />
      <Input
        id={id}
        type={type}
        dir="ltr"
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 pl-10 text-base sm:text-sm"
      />
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" dir="ltr">
      <Lock className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-muted-foreground" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        dir="ltr"
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 pl-10 pr-11 text-base sm:text-sm"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        className="absolute inset-y-0 right-1.5 my-auto grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
