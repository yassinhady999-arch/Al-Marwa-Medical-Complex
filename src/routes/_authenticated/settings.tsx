import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Building2, Users, Palette, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/app/section-card";
import { ToneBadge } from "@/components/app/status-badge";
import { RowsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { useProfile, type AppRole } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import { WEEKDAYS } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | نظام تشغيل العيادة" },
      { name: "description", content: "بيانات العيادة وصلاحيات المستخدمين وإعدادات التشغيل." },
      { property: "og:title", content: "الإعدادات | نظام تشغيل العيادة" },
      { property: "og:description", content: "بيانات العيادة وصلاحيات المستخدمين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "المالك",
  admin: "مدير",
  receptionist: "موظف استقبال",
  doctor: "طبيب",
  viewer: "اطّلاع فقط",
};

function SettingsPage() {
  const { data: me } = useProfile();
  return (
    <AppShell title="الإعدادات" description="بيانات العيادة والصلاحيات" section="settings">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ClinicCard canEdit={!!me?.isAdmin} />
          <WorkingHoursCard canEdit={!!me?.isAdmin} />
        </div>
        <div className="space-y-4">
          <UsersCard canEdit={!!me?.isAdmin} />
          <AppearanceCard />
        </div>
      </div>
    </AppShell>
  );
}

function ClinicCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["clinic_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_settings")
        .select("id, clinic_name, phone, whatsapp_number, email, city, address, timezone, currency")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    clinic_name: "",
    phone: "",
    whatsapp_number: "",
    email: "",
    city: "",
    address: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        clinic_name: data.clinic_name ?? "",
        phone: data.phone ?? "",
        whatsapp_number: data.whatsapp_number ?? "",
        email: data.email ?? "",
        city: data.city ?? "",
        address: data.address ?? "",
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("لا توجد إعدادات عيادة");
      const whatsapp = form.whatsapp_number.trim();
      const whatsappDigits = whatsapp.replace(/D/g, "").length;
      if (whatsapp && (whatsappDigits < 9 || whatsappDigits > 15))
        throw new Error("رقم واتساب المجمع غير صحيح، اكتبه مثل 05xxxxxxxx");
      const { error } = await supabase
        .from("clinic_settings")
        .update({
          clinic_name: form.clinic_name.trim(),
          phone: form.phone.trim() || null,
          whatsapp_number: whatsapp || null,
          email: form.email.trim() || null,
          city: form.city.trim() || null,
          address: form.address.trim() || null,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "update",
        section: "settings",
        description: "تحديث بيانات العيادة",
        entityType: "clinic_settings",
      });
      toast.success("تم حفظ بيانات العيادة");
      void qc.invalidateQueries({ queryKey: ["clinic_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard icon={Building2} title="بيانات العيادة">
      <div className="space-y-3">
        <div className="grid gap-1.5">
          <Label>اسم العيادة</Label>
          <Input
            value={form.clinic_name}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="clinic-phone">الهاتف</Label>
            <Input
              id="clinic-phone"
              dir="ltr"
              value={form.phone}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="clinic-whatsapp">رقم واتساب المجمع</Label>
            <Input
              id="clinic-whatsapp"
              dir="ltr"
              inputMode="tel"
              placeholder="05xxxxxxxx"
              value={form.whatsapp_number}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              زر «استكمال حجزك عبر واتساب» يفتح للعميل محادثة مع هذا الرقم برسالة جاهزة. إذا تركته
              فارغًا يُستخدم رقم الهاتف.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input
              dir="ltr"
              value={form.email}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>المدينة</Label>
            <Input
              value={form.city}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>العنوان</Label>
            <Input
              value={form.address}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Clock3 className="size-3" />
            {data?.timezone ?? "Asia/Riyadh"}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            العملة: {data?.currency ?? "SAR"}
          </span>
        </div>
        <Button onClick={() => save.mutate()} disabled={!canEdit || save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </div>
    </SectionCard>
  );
}

type DayHours = { enabled: boolean; start: string; end: string };

/** The clinic's opening hours, which the customer chatbot quotes. */
function WorkingHoursCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const uid = useId();
  const { data } = useQuery({
    queryKey: ["clinic_settings", "hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_settings")
        .select("id, working_hours")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const stored = (data?.working_hours ?? {}) as Record<string, Partial<DayHours> | undefined>;
  const unset = Object.keys(stored).length === 0;
  const [days, setDays] = useState<DayHours[] | null>(null);
  const shown =
    days ??
    WEEKDAYS.map((_, i) => {
      const d = stored[String(i)];
      return {
        enabled: unset ? i !== 5 : d?.enabled !== false && !!d?.start,
        start: d?.start ?? "09:00",
        end: d?.end ?? "22:00",
      };
    });
  const setDay = (index: number, patch: Partial<DayHours>) =>
    setDays(shown.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const bad = shown.filter((d) => d.enabled && (!d.start || !d.end || d.start >= d.end));

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("لا توجد إعدادات عيادة");
      const working_hours = Object.fromEntries(shown.map((d, i) => [String(i), d]));
      const { error } = await supabase
        .from("clinic_settings")
        .update({ working_hours })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void logActivity({
        action: "update",
        section: "settings",
        description: "تحديث مواعيد العمل",
        entityType: "clinic_settings",
      });
      toast.success("تم حفظ مواعيد العمل");
      setDays(null);
      void qc.invalidateQueries({ queryKey: ["clinic_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      icon={Clock3}
      title="مواعيد العمل"
      description="يعرضها الشات بوت عند سؤال العملاء. ساعات كل طبيب تُضبط من صفحة الأطباء."
    >
      {unset && (
        <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
          لم تُحفظ مواعيد العمل بعد، والشات بوت يطلب من العميل التواصل لمعرفتها.
        </p>
      )}
      <div className="divide-y divide-border/70 rounded-xl border border-border">
        {shown.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
            <label
              htmlFor={`${uid}-${i}`}
              className="flex w-24 shrink-0 cursor-pointer items-center gap-2 text-sm"
            >
              <Switch
                id={`${uid}-${i}`}
                checked={d.enabled}
                disabled={!canEdit}
                onCheckedChange={(enabled) => setDay(i, { enabled })}
              />
              {WEEKDAYS[i]}
            </label>
            {d.enabled ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>من</span>
                <Input
                  type="time"
                  aria-label={`بداية ${WEEKDAYS[i]}`}
                  className="h-8 w-28"
                  value={d.start}
                  disabled={!canEdit}
                  onChange={(e) => setDay(i, { start: e.target.value })}
                />
                <span>إلى</span>
                <Input
                  type="time"
                  aria-label={`نهاية ${WEEKDAYS[i]}`}
                  className="h-8 w-28"
                  value={d.end}
                  disabled={!canEdit}
                  onChange={(e) => setDay(i, { end: e.target.value })}
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">مغلق</span>
            )}
          </div>
        ))}
      </div>
      {bad.length > 0 && (
        <p className="mt-2 text-xs text-destructive">وقت الإغلاق يجب أن يكون بعد وقت الفتح.</p>
      )}
      <Button
        className="mt-3"
        onClick={() => save.mutate()}
        disabled={!canEdit || bad.length > 0 || save.isPending || (!unset && days === null)}
      >
        {save.isPending ? "جارٍ الحفظ…" : "حفظ مواعيد العمل"}
      </Button>
    </SectionCard>
  );
}

function UsersCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        ...p,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role as AppRole | undefined,
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole; name: string }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void logActivity({
        action: "permissions_change",
        section: "settings",
        description: `تغيير دور ${vars.name} إلى «${ROLE_LABELS[vars.role]}»`,
        entityType: "user",
        entityId: vars.userId,
        metadata: { role: vars.role },
      });
      toast.success("تم تحديث الصلاحية");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard icon={Users} title="فريق العمل والصلاحيات">
      {isLoading ? (
        <RowsSkeleton rows={3} />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-3"
            >
              <InitialsAvatar name={u.full_name || u.email} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {u.full_name || u.email}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="ms-auto">
                {canEdit ? (
                  <Select
                    value={u.role ?? "viewer"}
                    onValueChange={(v) =>
                      setRole.mutate({
                        userId: u.id,
                        role: v as AppRole,
                        name: u.full_name || u.email || "",
                      })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <ToneBadge tone="neutral" dot={false}>
                    {u.role ? ROLE_LABELS[u.role] : "—"}
                  </ToneBadge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function AppearanceCard() {
  return (
    <SectionCard icon={Palette} title="المظهر">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">الوضع الليلي</p>
          <p className="text-xs text-muted-foreground">
            يُحفظ اختيارك على هذا المتصفح. الافتراضي هو الوضع الفاتح.
          </p>
        </div>
        <ThemeToggle />
      </div>
    </SectionCard>
  );
}
