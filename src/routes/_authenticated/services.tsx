import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Clock, Wallet, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToneBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { dbErrorMessage, priceLabel } from "@/lib/clinic";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/services")({
  head: () => ({
    meta: [
      { title: "الخدمات | نظام تشغيل العيادة" },
      { name: "description", content: "خدمات العيادة وأسعارها ومددها الزمنية المستخدمة في الحجز." },
      { property: "og:title", content: "الخدمات | نظام تشغيل العيادة" },
      { property: "og:description", content: "خدمات العيادة وأسعارها ومددها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  specialty_id: string | null;
  specialties: { name: string } | null;
};

const NO_DEPARTMENT = "عام";

function ServicesPage() {
  const { data: me } = useProfile();
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, description, duration_minutes, price, is_active, specialty_id, specialties(name)",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((s) => ({ ...s, price: Number(s.price ?? 0) })) as Service[];
    },
  });

  // One section per department, so a long price list stays easy to scan.
  const groups = new Map<string, Service[]>();
  for (const s of data ?? []) {
    const key = s.specialties?.name ?? NO_DEPARTMENT;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const sections = [...groups.entries()].sort(([a], [b]) =>
    a === NO_DEPARTMENT ? 1 : b === NO_DEPARTMENT ? -1 : a.localeCompare(b, "ar"),
  );

  return (
    <AppShell
      title="الخدمات"
      description="كتالوج خدمات العيادة والأسعار"
      section="services"
      actions={
        me?.isAdmin ? <Button onClick={() => setEditing("new")}>خدمة جديدة</Button> : undefined
      }
    >
      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="لا توجد خدمات"
          hint="أضف الخدمات لتفعيل التسعير والمدة في الحجز."
        />
      ) : (
        <div className="space-y-6">
          {sections.map(([department, services]) => (
            <section key={department} aria-label={department}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                {department}
                <span className="tabular rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                  {services.length}
                </span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {services.map((s, i) => (
                  <div
                    key={s.id}
                    className="surface-raised animate-rise flex flex-col rounded-2xl p-4"
                    style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-emphasis">
                        <Sparkles className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold text-foreground">{s.name}</p>
                          <ToneBadge tone={s.is_active ? "success" : "neutral"}>
                            {s.is_active ? "مفعّلة" : "متوقفة"}
                          </ToneBadge>
                        </div>
                        {s.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {s.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto flex items-center gap-4 border-t border-border/70 pt-3 text-sm">
                      <span className="tabular inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <Clock className="size-4 text-muted-foreground" />
                        {s.duration_minutes} د
                      </span>
                      <span
                        className={
                          s.price > 0
                            ? "tabular inline-flex items-center gap-1.5 font-semibold text-foreground"
                            : "inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                        }
                      >
                        <Wallet className="size-4 text-muted-foreground" />
                        {priceLabel(s.price)}
                      </span>
                      {me?.isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ms-auto"
                          aria-label={`تعديل ${s.name}`}
                          onClick={() => setEditing(s)}
                        >
                          <Pencil className="size-3.5" />
                          تعديل
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ServiceDialog
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </AppShell>
  );
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const uid = useId();
  const [form, setForm] = useState({
    name: service?.name ?? "",
    specialty_id: service?.specialty_id ?? "",
    duration_minutes: String(service?.duration_minutes ?? 30),
    price: String(service?.price ?? 0),
    description: service?.description ?? "",
    is_active: service?.is_active ?? true,
  });

  const { data: specialties } = useQuery({
    queryKey: ["specialties-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const duration = Number(form.duration_minutes);
  const price = Number(form.price);
  const problems = [
    ...(!form.name.trim() ? ["اكتب اسم الخدمة"] : []),
    ...(!Number.isInteger(duration) || duration < 5 || duration > 480
      ? ["المدة بين 5 و480 دقيقة"]
      : []),
    ...(!Number.isFinite(price) || price < 0 ? ["السعر غير صحيح"] : []),
  ];

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        name: form.name.trim(),
        specialty_id: form.specialty_id || null,
        duration_minutes: duration,
        price,
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      if (service) {
        const { error } = await supabase.from("services").update(values).eq("id", service.id);
        if (error) throw error;
        return { id: service.id, name: values.name };
      }
      const { data, error } = await supabase
        .from("services")
        .insert(values)
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void logActivity({
        action: service ? "update" : "create",
        section: "services",
        description: `${service ? "تعديل" : "إضافة"} خدمة: ${data?.name ?? form.name.trim()}`,
        entityType: "service",
        entityId: data?.id ?? service?.id ?? null,
      });
      toast.success(service ? "تم حفظ الخدمة" : "تمت إضافة الخدمة");
      void qc.invalidateQueries({ queryKey: ["services"] });
      void qc.invalidateQueries({ queryKey: ["appointment-refs"] });
      void qc.invalidateQueries({ queryKey: ["appointment-filter-options"] });
      onClose();
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? `تعديل: ${service.name}` : "إضافة خدمة"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-name`}>الاسم</Label>
            <Input
              id={`${uid}-name`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-dept`}>القسم</Label>
            <Select
              value={form.specialty_id}
              onValueChange={(v) => setForm({ ...form, specialty_id: v })}
            >
              <SelectTrigger id={`${uid}-dept`}>
                <SelectValue placeholder="اختر القسم" />
              </SelectTrigger>
              <SelectContent>
                {(specialties ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-duration`}>المدة (دقيقة)</Label>
              <Input
                id={`${uid}-duration`}
                type="number"
                min={5}
                max={480}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-price`}>السعر (ر.س)</Label>
              <Input
                id={`${uid}-price`}
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            اترك السعر 0 ليظهر للعملاء «السعر عند الاستفسار». المدة تحدد طول الموعد عند الحجز.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-desc`}>الوصف</Label>
            <Textarea
              id={`${uid}-desc`}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${uid}-active`}
              checked={form.is_active}
              onCheckedChange={(is_active) => setForm({ ...form, is_active })}
            />
            <Label htmlFor={`${uid}-active`}>مفعّلة وتظهر للعملاء</Label>
          </div>
          {problems.length > 0 && form.name.trim() !== "" && (
            <ul className="space-y-1 rounded-xl bg-destructive-soft px-3 py-2 text-xs text-destructive">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button disabled={problems.length > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
