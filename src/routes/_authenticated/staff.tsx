import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfile, type AppRole } from "@/hooks/use-auth";
import { ADMIN_ONLY_SECTIONS, SECTIONS, defaultSectionPermissions } from "@/lib/access";
import { createStaffFn, deleteStaffFn, resetStaffPasswordFn, updateStaffFn } from "@/lib/staff";
import { formatDate } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "الموظفون | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "إنشاء حسابات الموظفين وتحديد صلاحيات وصولهم إلى أقسام النظام.",
      },
      { property: "og:title", content: "الموظفون | نظام تشغيل العيادة" },
      { property: "og:description", content: "حسابات الموظفين وصلاحيات الوصول." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

type StaffRole = "admin" | "receptionist" | "doctor" | "viewer";

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "المالك",
  admin: "مدير",
  receptionist: "موظف استقبال",
  doctor: "طبيب",
  viewer: "اطّلاع فقط",
};

const ASSIGNABLE_ROLES: StaffRole[] = ["admin", "receptionist", "doctor", "viewer"];

const PERMISSION_SECTIONS = SECTIONS.filter((s) => !ADMIN_ONLY_SECTIONS.includes(s.key));

type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole | undefined;
  sections: Record<string, boolean>;
};

function StaffPage() {
  const { data: me } = useProfile();

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async (): Promise<StaffRow[]> => {
      const [{ data: profiles, error }, { data: roles }, { data: perms }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, is_active, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("staff_permissions").select("user_id, sections"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        is_active: p.is_active,
        created_at: p.created_at,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role as AppRole | undefined,
        sections: ((perms ?? []).find((x) => x.user_id === p.id)?.sections ?? {}) as Record<
          string,
          boolean
        >,
      }));
    },
  });

  return (
    <AppShell
      title="الموظفون"
      description="حسابات فريق العمل وصلاحيات الوصول إلى الأقسام"
      section="staff"
      adminOnly
      actions={me?.isAdmin ? <NewStaffDialog /> : undefined}
    >
      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (staff ?? []).length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="لا يوجد موظفون"
          hint="أضف موظفًا جديدًا بإيميل وكلمة مرور لتسجيل الدخول."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(staff ?? []).map((s) => (
            <StaffCard key={s.id} row={s} isSelf={s.id === me?.profile?.id} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function StaffCard({ row, isSelf }: { row: StaffRow; isSelf: boolean }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff-list"] });
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const setRole = useMutation({
    mutationFn: async (role: StaffRole) => {
      await updateStaffFn({ data: { userId: row.id, role } });
    },
    onSuccess: () => {
      toast.success("تم تحديث الدور");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      await updateStaffFn({ data: { userId: row.id, isActive } });
    },
    onSuccess: (_d, isActive) => {
      toast.success(isActive ? "تم تفعيل الحساب" : "تم إيقاف الحساب");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteStaffFn({ data: { userId: row.id } });
    },
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grantedCount = PERMISSION_SECTIONS.filter((s) => row.sections[s.key] !== false).length;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{row.full_name || row.email || "بدون اسم"}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">
              {row.email}
            </p>
          </div>
          <Badge variant={row.is_active ? "default" : "destructive"}>
            {row.is_active ? "نشط" : "موقوف"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>أُضيف: {formatDate(row.created_at)}</span>
          <span>·</span>
          <span>
            الوصول: {grantedCount}/{PERMISSION_SECTIONS.length} قسم
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={row.role ?? "viewer"}
            onValueChange={(v) => setRole.mutate(v as StaffRole)}
            disabled={isSelf || setRole.isPending}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PermissionsDialog row={row} onSaved={invalidate} />
          <ResetPasswordDialog userId={row.id} name={row.full_name || row.email || ""} />

          <div className="flex items-center gap-2">
            <Switch
              checked={row.is_active}
              disabled={isSelf || setActive.isPending}
              onCheckedChange={(v) => setActive.mutate(v)}
              aria-label="تفعيل الحساب"
            />
            <span className="text-xs text-muted-foreground">مفعّل</span>
          </div>

          {!isSelf && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="حذف" className="text-destructive">
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف حساب الموظف؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف حساب «{row.full_name || row.email}» نهائيًا ولن يتمكن من تسجيل الدخول.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>حذف</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionsDialog({ row, onSaved }: { row: StaffRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState<Record<string, boolean>>({});

  const openDialog = (v: boolean) => {
    setOpen(v);
    if (v) {
      const next: Record<string, boolean> = {};
      for (const s of PERMISSION_SECTIONS) next[s.key] = row.sections[s.key] !== false;
      setMap(next);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      await updateStaffFn({ data: { userId: row.id, sections: map } });
    },
    onSuccess: () => {
      toast.success("تم حفظ الصلاحيات");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allOn = PERMISSION_SECTIONS.every((s) => map[s.key]);

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldCheck className="size-4" />
          الصلاحيات
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>صلاحيات الوصول</DialogTitle>
          <DialogDescription>
            حدّد الأقسام التي يمكن لـ«{row.full_name || row.email}» الدخول إليها.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
          <span className="text-sm font-medium">تحديد الكل</span>
          <Switch
            checked={allOn}
            onCheckedChange={(v) => {
              const next: Record<string, boolean> = {};
              for (const s of PERMISSION_SECTIONS) next[s.key] = v;
              setMap(next);
            }}
          />
        </div>

        <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pe-1">
          {PERMISSION_SECTIONS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-lg border border-border p-2.5"
            >
              <span className="text-sm">{s.label}</span>
              <Switch
                checked={!!map[s.key]}
                onCheckedChange={(v) => setMap((m) => ({ ...m, [s.key]: v }))}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      await resetStaffPasswordFn({ data: { userId, password } });
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور");
      setOpen(false);
      setPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" />
          كلمة المرور
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تعيين كلمة مرور جديدة</DialogTitle>
          <DialogDescription>لحساب «{name}»</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>كلمة المرور الجديدة</Label>
          <Input
            dir="ltr"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 أحرف على الأقل"
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={password.trim().length < 6 || save.isPending}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewStaffDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    fullName: string;
    email: string;
    password: string;
    phone: string;
    role: StaffRole;
  }>({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    role: "receptionist",
  });
  const [sections, setSections] = useState<Record<string, boolean>>(defaultSectionPermissions());

  const reset = () => {
    setForm({ fullName: "", email: "", password: "", phone: "", role: "receptionist" });
    setSections(defaultSectionPermissions());
  };

  const create = useMutation({
    mutationFn: async () => {
      await createStaffFn({
        data: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
          role: form.role,
          sections,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إنشاء حساب الموظف");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["staff-list"] });
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid =
    form.fullName.trim().length >= 2 &&
    /.+@.+\..+/.test(form.email.trim()) &&
    form.password.trim().length >= 6;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>موظف جديد</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة موظف</DialogTitle>
          <DialogDescription>
            سيستخدم الموظف هذا الإيميل وكلمة المرور لتسجيل الدخول إلى النظام.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>الاسم الكامل</Label>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input
                dir="ltr"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>كلمة المرور</Label>
              <Input
                dir="ltr"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>الجوال (اختياري)</Label>
              <Input
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>الدور</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>صلاحيات الوصول إلى الأقسام</Label>
            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
              {PERMISSION_SECTIONS.map((s) => (
                <label
                  key={s.key}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="text-sm">{s.label}</span>
                  <Switch
                    checked={sections[s.key] !== false}
                    onCheckedChange={(v) => setSections((m) => ({ ...m, [s.key]: v }))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
