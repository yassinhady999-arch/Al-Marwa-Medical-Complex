import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Layers } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { ToneBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/specialties")({
  head: () => ({
    meta: [
      { title: "التخصصات | نظام تشغيل العيادة" },
      { name: "description", content: "إدارة تخصصات العيادة المرتبطة بالأطباء والخدمات." },
      { property: "og:title", content: "التخصصات | نظام تشغيل العيادة" },
      { property: "og:description", content: "إدارة تخصصات العيادة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpecialtiesPage,
});

function SpecialtiesPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();

  const { data, isLoading } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id, name, description, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean; name: string }) => {
      const { error } = await supabase.from("specialties").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void logActivity({
        action: "update",
        section: "specialties",
        description: `${vars.is_active ? "تفعيل" : "إيقاف"} تخصص: ${vars.name}`,
        entityType: "specialty",
        entityId: vars.id,
      });
      qc.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="التخصصات"
      description="تخصصات العيادة المستخدمة في التوجيه والحجز"
      section="specialties"
      actions={me?.isAdmin ? <NewSpecialtyDialog /> : undefined}
    >
      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Layers}
          title="لا توجد تخصصات"
          hint="أضف تخصصًا لربطه بالأطباء والخدمات."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((s, i) => (
            <div
              key={s.id}
              className="surface-raised animate-rise rounded-2xl p-4"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-emphasis">
                  <Layers className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">{s.name}</p>
                    <ToneBadge tone={s.is_active ? "success" : "neutral"}>
                      {s.is_active ? "مفعّل" : "متوقف"}
                    </ToneBadge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {s.description ?? "—"}
                  </p>
                </div>
              </div>
              {me?.isAdmin && (
                <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => toggle.mutate({ id: s.id, is_active: v, name: s.name })}
                  />
                  <span className="text-xs text-muted-foreground">مفعّل</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NewSpecialtyDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .insert({
          name: form.name.trim(),
          description: form.description.trim() || null,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void logActivity({
        action: "create",
        section: "specialties",
        description: `إضافة تخصص: ${data?.name ?? form.name.trim()}`,
        entityType: "specialty",
        entityId: data?.id ?? null,
      });
      toast.success("تمت إضافة التخصص");
      setOpen(false);
      setForm({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>تخصص جديد</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة تخصص</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>الاسم</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>الوصف</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
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
