import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/app/theme-toggle";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "تعيين كلمة مرور جديدة لحساب فريق العيادة بعد طلب الاستعادة.",
      },
      { property: "og:title", content: "تعيين كلمة مرور جديدة | نظام تشغيل العيادة" },
      { property: "og:description", content: "استعادة الوصول إلى لوحة تشغيل العيادة." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("تعذّر تحديث كلمة المرور: " + error.message);
      return;
    }
    toast.success("تم تحديث كلمة المرور");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-5 py-12">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>

      <div className="animate-rise w-full max-w-[400px]">
        <div className="surface-raised rounded-2xl p-6 sm:p-7">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary-emphasis">
            <KeyRound className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">كلمة مرور جديدة</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            افتح هذه الصفحة من رابط الاستعادة المرسل إلى بريدك، ثم اختر كلمة مرور قوية.
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="newpass">كلمة المرور الجديدة</Label>
                <span className="text-xs text-muted-foreground">٨ أحرف على الأقل</span>
              </div>
              <div className="relative" dir="ltr">
                <Input
                  id="newpass"
                  type={show ? "text" : "password"}
                  dir="ltr"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute inset-y-0 right-2 my-auto grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
            </Button>
          </form>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          اتصال آمن ومصادقة عبر Supabase
        </p>
      </div>
    </div>
  );
}
