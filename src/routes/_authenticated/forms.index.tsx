import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, ClipboardList, CopyPlus, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { ToneBadge } from "@/components/app/status-badge";
import { ShareLink } from "@/components/app/share-link";
import { dbErrorMessage, formatRelative } from "@/lib/clinic";
import { DEFAULT_FIELDS, DEFAULT_SETTINGS, bookingLink } from "@/lib/booking-forms";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/forms/")({
  head: () => ({
    meta: [
      { title: "نماذج الحجز | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "صمّم نماذج حجز وأرسل رابطها للعملاء ليحجزوا مواعيدهم بأنفسهم.",
      },
    ],
  }),
  component: FormsPage,
});

async function fetchForms() {
  const [list, stats] = await Promise.all([
    supabase
      .from("booking_forms")
      .select("id, slug, title, description, is_active, fields, settings, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("booking_form_stats").select("form_id, submissions, last_submission_at"),
  ]);
  if (list.error) throw list.error;
  const byForm = new Map((stats.data ?? []).map((s) => [s.form_id, s]));
  return (list.data ?? []).map((f) => ({
    ...f,
    submissions: byForm.get(f.id)?.submissions ?? 0,
    lastSubmission: byForm.get(f.id)?.last_submission_at ?? null,
  }));
}

type FormRow = Awaited<ReturnType<typeof fetchForms>>[number];

function FormsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useProfile();
  const canWrite = !!me?.canWrite;

  const { data: forms, isLoading } = useQuery({ queryKey: ["booking-forms"], queryFn: fetchForms });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["booking-forms"] });

  const create = useMutation({
    mutationFn: async (source?: FormRow) => {
      const { data, error } = await supabase
        .from("booking_forms")
        .insert({
          title: source ? `${source.title} (نسخة)`.slice(0, 120) : "نموذج حجز جديد",
          description: source?.description ?? null,
          fields: (source?.fields ?? DEFAULT_FIELDS) as Json,
          settings: (source?.settings ?? DEFAULT_SETTINGS) as Json,
          is_active: source ? false : true,
        })
        .select("id, title")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, source) => {
      void logActivity({
        action: "create",
        section: "forms",
        description: source ? `نسخ نموذج الحجز «${source.title}»` : "إنشاء نموذج حجز جديد",
        entityType: "booking_form",
        entityId: data.id,
      });
      invalidate();
      if (source) toast.success("تم نسخ النموذج (متوقف حتى تفعّله)");
      else void navigate({ to: "/forms/$formId", params: { formId: data.id } });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: async (f: FormRow) => {
      const { error } = await supabase
        .from("booking_forms")
        .update({ is_active: !f.is_active })
        .eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: (_d, f) => {
      void logActivity({
        action: f.is_active ? "deactivate" : "activate",
        section: "forms",
        description: `${f.is_active ? "إيقاف" : "تفعيل"} نموذج الحجز «${f.title}»`,
        entityType: "booking_form",
        entityId: f.id,
      });
      toast.success(f.is_active ? "تم إيقاف النموذج — الرابط لن يقبل حجوزات" : "تم تفعيل النموذج");
      invalidate();
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (f: FormRow) => {
      const { error } = await supabase.from("booking_forms").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: (_d, f) => {
      void logActivity({
        action: "delete",
        section: "forms",
        description: `حذف نموذج الحجز «${f.title}»`,
        entityType: "booking_form",
        entityId: f.id,
      });
      toast.success("تم حذف النموذج");
      invalidate();
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <AppShell
      title="نماذج الحجز"
      description="صمّم نموذجًا، وأرسل رابطه للعملاء ليحجزوا مواعيدهم بأنفسهم"
      section="forms"
      actions={
        canWrite ? (
          <Button onClick={() => create.mutate(undefined)} disabled={create.isPending}>
            <Plus />
            نموذج جديد
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <CardsSkeleton count={3} />
      ) : (forms ?? []).length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد نماذج حجز بعد"
          hint="أنشئ نموذجًا، اختر الحقول التي تريد سؤال العميل عنها، ثم انسخ الرابط وأرسله له. كل حجز يصل مباشرة إلى صفحة المواعيد."
          action={
            canWrite ? (
              <Button onClick={() => create.mutate(undefined)} disabled={create.isPending}>
                <Plus />
                إنشاء أول نموذج
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(forms ?? []).map((f, i) => (
            <article
              key={f.id}
              className="surface-raised animate-rise flex flex-col gap-4 rounded-2xl p-5"
              style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-emphasis">
                  <ClipboardList className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/forms/$formId"
                    params={{ formId: f.id }}
                    className="block truncate font-bold text-foreground hover:text-primary-emphasis"
                  >
                    {f.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {f.description || "بدون وصف"}
                  </p>
                </div>
                <ToneBadge tone={f.is_active ? "success" : "neutral"}>
                  {f.is_active ? "مفعّل" : "متوقف"}
                </ToneBadge>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck className="size-3.5" />
                  <span className="tabular font-semibold text-foreground">{f.submissions}</span> حجز
                  من النموذج
                </span>
                {f.lastSubmission && <span>آخر حجز {formatRelative(f.lastSubmission)}</span>}
              </div>

              <ShareLink url={bookingLink(f.slug)} muted={!f.is_active} />

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-3">
                <Button asChild size="sm">
                  <Link to="/forms/$formId" params={{ formId: f.id }}>
                    <Pencil />
                    {canWrite ? "تعديل النموذج" : "عرض"}
                  </Link>
                </Button>
                {canWrite && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate(f)}
                      disabled={toggle.isPending}
                    >
                      <Power />
                      {f.is_active ? "إيقاف" : "تفعيل"}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="نسخ النموذج"
                      title="نسخ النموذج"
                      onClick={() => create.mutate(f)}
                      disabled={create.isPending}
                    >
                      <CopyPlus />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="حذف النموذج"
                          title="حذف النموذج"
                          className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>حذف «{f.title}»؟</AlertDialogTitle>
                          <AlertDialogDescription>
                            سيتوقف الرابط عن العمل فورًا. المواعيد التي حُجزت من خلاله تبقى في صفحة
                            المواعيد ولن تُحذف.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(f)}>
                            حذف
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
