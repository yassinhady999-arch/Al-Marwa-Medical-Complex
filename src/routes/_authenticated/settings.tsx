import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Users, Palette, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <ClinicCard canEdit={!!me?.isAdmin} />
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
        .select("id, clinic_name, phone, email, city, address, timezone, currency")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    clinic_name: "",
    phone: "",
    email: "",
    city: "",
    address: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        clinic_name: data.clinic_name ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        city: data.city ?? "",
        address: data.address ?? "",
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("لا توجد إعدادات عيادة");
      const { error } = await supabase
        .from("clinic_settings")
        .update({
          clinic_name: form.clinic_name.trim(),
          phone: form.phone.trim() || null,
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
      qc.invalidateQueries({ queryKey: ["clinic_settings"] });
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
            <Label>الهاتف</Label>
            <Input
              dir="ltr"
              value={form.phone}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
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
