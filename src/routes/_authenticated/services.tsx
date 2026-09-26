import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Clock, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { currency } from "@/lib/clinic";
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

function ServicesPage() {
  const { data: me } = useProfile();

  const { data, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes, price, is_active, specialties(name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title="الخدمات"
      description="كتالوج خدمات العيادة والأسعار"
      section="services"
      actions={me?.isAdmin ? <NewServiceDialog /> : undefined}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((s, i) => (
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
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {s.specialties?.name ?? "عام"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 border-t border-border/70 pt-3 text-sm">
                <span className="tabular inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <Clock className="size-4 text-muted-foreground" />
                  {s.duration_minutes} د
                </span>
                <span className="tabular inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <Wallet className="size-4 text-muted-foreground" />
                  {currency(s.price)}
                </span>
              </div>

              {s.description && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NewServiceDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    specialty_id: "",
    duration_minutes: "30",
    price: "0",
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

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .insert({
          name: form.name.trim(),
          specialty_id: form.specialty_id || null,
          duration_minutes: Number(form.duration_minutes) || 30,
          price: Number(form.price) || 0,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void logActivity({
        action: "create",
        section: "services",
        description: `إضافة خدمة: ${data?.name ?? form.name.trim()}`,
        entityType: "service",
        entityId: data?.id ?? null,
      });
      toast.success("تمت إضافة الخدمة");
      setOpen(false);
      setForm({ name: "", specialty_id: "", duration_minutes: "30", price: "0" });
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>خدمة جديدة</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة خدمة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>الاسم</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>التخصص</Label>
            <Select
              value={form.specialty_id}
              onValueChange={(v) => setForm({ ...form, specialty_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر التخصص" />
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
              <Label>المدة (دقيقة)</Label>
              <Input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>السعر (ر.س)</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
