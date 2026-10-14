import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Inbox,
  Lock,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/app/empty-state";
import { RowsSkeleton } from "@/components/app/state";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ShareLink } from "@/components/app/share-link";
import { EditAppointmentDialog } from "@/components/app/edit-appointment-dialog";
import { BookingFormView } from "@/components/booking/booking-form-view";
import { cn } from "@/lib/utils";
import {
  DOCTOR_DEPARTMENTS,
  dbErrorMessage,
  departmentIds,
  formatDate,
  formatRelative,
  formatTime,
} from "@/lib/clinic";
import type { AppointmentStatus } from "@/lib/clinic";
import {
  CUSTOM_FIELD_META,
  CUSTOM_FIELD_TYPES,
  SYSTEM_FIELD_META,
  bookingLink,
  fieldMeta,
  hasOptions,
  isLockedField,
  newCustomField,
  parseFields,
  parseSettings,
  systemField,
  validateForm,
  type FormField,
  type FormSettings,
  type PublicBookingForm,
  type SystemFieldType,
} from "@/lib/booking-forms";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/forms/$formId")({
  head: () => ({ meta: [{ title: "تصميم نموذج الحجز | نظام تشغيل العيادة" }] }),
  component: FormBuilderPage,
});

const OPTIONAL_SYSTEM_TYPES: SystemFieldType[] = [
  "email",
  "gender",
  "date_of_birth",
  "city",
  "notes",
];
const TEXT_TYPES = new Set([
  "full_name",
  "phone",
  "email",
  "city",
  "notes",
  "text",
  "textarea",
  "number",
]);

async function fetchRefs() {
  const [specialties, services, doctors, clinic] = await Promise.all([
    supabase.from("specialties").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("services")
      .select("id, name, specialty_id, duration_minutes, price, price_from, description")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("doctors")
      .select(
        `id, name, specialty_id, hide_name, ${DOCTOR_DEPARTMENTS}, doctor_schedules(is_active)`,
      )
      .eq("status", "active")
      .order("name"),
    supabase
      .from("clinic_settings")
      .select("clinic_name, phone, address, city, logo_url")
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    specialties: specialties.data ?? [],
    services: (services.data ?? []).map((s) => ({ ...s, price: Number(s.price ?? 0) })),
    doctors: (doctors.data ?? []).map(({ doctor_specialties, doctor_schedules, ...d }) => ({
      ...d,
      specialty_ids: departmentIds({ ...d, doctor_specialties }),
      scheduled: (doctor_schedules ?? []).some((s) => s.is_active),
    })),
    clinic: clinic.data
      ? {
          name: clinic.data.clinic_name,
          phone: clinic.data.phone,
          address: clinic.data.address,
          city: clinic.data.city,
          logo_url: clinic.data.logo_url,
        }
      : null,
  };
}

type Refs = Awaited<ReturnType<typeof fetchRefs>>;

function FormBuilderPage() {
  const { formId } = Route.useParams();
  const { data: form, isLoading } = useQuery({
    queryKey: ["booking-form", formId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_forms")
        .select("*")
        .eq("id", formId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: refs } = useQuery({ queryKey: ["booking-form-refs"], queryFn: fetchRefs });

  if (isLoading || (form && !refs)) {
    return (
      <AppShell title="نموذج الحجز" section="forms">
        <RowsSkeleton rows={5} />
      </AppShell>
    );
  }
  if (!form || !refs) {
    return (
      <AppShell title="نموذج الحجز" section="forms">
        <EmptyState
          icon={ClipboardList}
          title="النموذج غير موجود"
          hint="ربما حُذف. ارجع لقائمة النماذج."
          action={
            <Button asChild variant="outline">
              <Link to="/forms">كل النماذج</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }
  return <FormBuilder key={form.id} form={form} refs={refs} />;
}

type Draft = {
  title: string;
  description: string;
  is_active: boolean;
  fields: FormField[];
  settings: FormSettings;
};

type FormRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_active: boolean;
  fields: Json;
  settings: Json;
};

/** What the public page would show for this draft (mirrors get_public_booking_form). */
function toPreview(draft: Draft, refs: Refs, form: FormRecord): PublicBookingForm {
  const { specialty_ids, service_ids } = draft.settings;
  const allowSpecialty = (id: string | null) =>
    specialty_ids.length === 0 || (id !== null && specialty_ids.includes(id));
  // Only doctors with a weekly schedule can be booked; hidden ones are booked but never named.
  const bookable = refs.doctors.filter(
    (d) =>
      d.scheduled &&
      (specialty_ids.length === 0 || d.specialty_ids.some((id) => allowSpecialty(id))),
  );
  const hasDoctor = (id: string) => bookable.some((d) => d.specialty_ids.includes(id));
  const doctors = bookable
    .filter((d) => !d.hide_name)
    .map(({ id, name, specialty_id, specialty_ids }) => ({
      id,
      name,
      specialty_id,
      specialty_ids,
    }));
  return {
    id: form.id,
    slug: form.slug,
    title: draft.title || "نموذج بدون عنوان",
    description: draft.description || null,
    fields: draft.fields,
    settings: draft.settings,
    clinic: refs.clinic,
    specialties: refs.specialties.filter((s) => allowSpecialty(s.id) && hasDoctor(s.id)),
    services: refs.services.filter(
      (s) =>
        allowSpecialty(s.specialty_id) &&
        (service_ids.length === 0 || service_ids.includes(s.id)) &&
        (s.specialty_id === null || hasDoctor(s.specialty_id)),
    ),
    doctors,
  };
}

function FormBuilder({ form, refs }: { form: FormRecord; refs: Refs }) {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const canWrite = !!me?.canWrite;
  const initial: Draft = {
    title: form.title,
    description: form.description ?? "",
    is_active: form.is_active,
    fields: parseFields(form.fields),
    settings: parseSettings(form.settings),
  };
  const [original, setOriginal] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [tab, setTab] = useState("fields");
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("لديك تغييرات غير محفوظة على النموذج. هل تريد المغادرة بدون حفظ؟"),
    enableBeforeUnload: () => dirty,
  });

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateSettings = (patch: Partial<FormSettings>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const save = useMutation({
    mutationFn: async () => {
      const problems = validateForm(draft);
      if (problems.length) throw new Error(problems[0]);
      const saved: Draft = {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        fields: draft.fields.map((f) =>
          hasOptions(f.type)
            ? {
                ...f,
                options: [...new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean))],
              }
            : f,
        ),
      };
      const { error } = await supabase
        .from("booking_forms")
        .update({
          title: saved.title,
          description: saved.description || null,
          is_active: saved.is_active,
          fields: saved.fields as Json,
          settings: saved.settings as Json,
        })
        .eq("id", form.id);
      if (error) throw error;
      return saved;
    },
    onSuccess: (saved) => {
      setDraft(saved);
      setOriginal(saved);
      void logActivity({
        action: "update",
        section: "forms",
        description: `تعديل نموذج الحجز «${saved.title}»`,
        entityType: "booking_form",
        entityId: form.id,
      });
      toast.success("تم حفظ النموذج");
      void qc.invalidateQueries({ queryKey: ["booking-forms"] });
      void qc.invalidateQueries({ queryKey: ["booking-form", form.id] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const preview = toPreview(draft, refs, form);

  return (
    <AppShell
      title={draft.title || "نموذج بدون عنوان"}
      description="صمّم الحقول التي يملؤها العميل، ثم شارك الرابط"
      section="forms"
      actions={
        canWrite ? (
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="hidden text-xs font-semibold text-warning-foreground sm:inline">
                تغييرات غير محفوظة
              </span>
            )}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <Link
        to="/forms"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" />
        كل النماذج
      </Link>

      <div className="surface-raised mb-5 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            رابط النموذج — أرسله للعميل ليحجز بنفسه
          </p>
          <ShareLink url={bookingLink(form.slug)} muted={!draft.is_active} />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold sm:ps-3">
          <Switch
            checked={draft.is_active}
            disabled={!canWrite}
            onCheckedChange={(v) => update({ is_active: v })}
          />
          {draft.is_active ? "يستقبل حجوزات" : "متوقف"}
        </label>
      </div>
      {!canWrite && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
          <Lock className="size-4" />
          لديك صلاحية اطّلاع فقط على هذا النموذج.
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="fields">
            <ClipboardList className="size-4" />
            الحقول
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="size-4" />
            الإعدادات
          </TabsTrigger>
          <TabsTrigger value="submissions">
            <Inbox className="size-4" />
            الحجوزات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="mt-4">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
            <fieldset disabled={!canWrite} className="min-w-0">
              <FieldsEditor
                fields={draft.fields}
                onChange={(fields) => update({ fields })}
                onOpenSettings={() => setTab("settings")}
              />
            </fieldset>
            <aside className="xl:sticky xl:top-24 xl:self-start">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                معاينة مباشرة — هكذا يراه العميل
              </p>
              <div className="surface-raised max-h-[calc(100vh-9rem)] overflow-y-auto rounded-3xl border-4 border-muted p-5">
                <BookingFormView form={preview} preview />
              </div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <fieldset disabled={!canWrite}>
            <SettingsPanel
              draft={draft}
              refs={refs}
              onChange={update}
              onSettings={updateSettings}
            />
          </fieldset>
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          <SubmissionsPanel formId={form.id} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function FieldsEditor({
  fields,
  onChange,
  onOpenSettings,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  onOpenSettings: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const uid = useId();
  const present = new Set(fields.map((f) => f.type));
  const missingSystem = OPTIONAL_SYSTEM_TYPES.filter((t) => !present.has(t));

  const set = (id: string, patch: Partial<FormField>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const move = (index: number, delta: number) => {
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  };
  const add = (field: FormField) => {
    onChange([...fields, field]);
    setExpanded(field.id);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {fields.map((field, index) => {
          const meta = fieldMeta(field.type);
          const locked = isLockedField(field);
          const open = expanded === field.id;
          return (
            <li key={field.id} className="surface-raised rounded-2xl">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-emphasis">
                  <meta.icon className="size-[18px]" />
                </span>
                <Input
                  value={field.label}
                  onChange={(e) => set(field.id, { label: e.target.value })}
                  aria-label="عنوان الحقل"
                  maxLength={120}
                  className="h-9 min-w-40 flex-1"
                />
                <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground md:inline">
                  {meta.label}
                </span>
                <label
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    locked && "text-muted-foreground",
                  )}
                  title={locked ? "حقل أساسي لإتمام الحجز" : undefined}
                >
                  <Switch
                    checked={field.required}
                    disabled={locked}
                    onCheckedChange={(v) => set(field.id, { required: v })}
                    aria-label="حقل مطلوب"
                  />
                  مطلوب
                </label>
                <div className="flex items-center">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="تحريك لأعلى"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="تحريك لأسفل"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="خيارات الحقل"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : field.id)}
                  >
                    <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                  </Button>
                  {locked ? (
                    <span
                      className="grid size-8 place-items-center text-muted-foreground/60"
                      title="حقل أساسي"
                    >
                      <Lock className="size-3.5" />
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="حذف الحقل"
                      className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                      onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>

              {open && (
                <div className="grid gap-3 border-t border-border/70 p-3 sm:grid-cols-2">
                  {field.type === "appointment" ? (
                    <div className="space-y-2 sm:col-span-2">
                      <p className="text-sm text-muted-foreground">
                        يعرض للعميل التخصص والخدمة والطبيب، ثم الأيام والأوقات المتاحة فعلًا. أي وقت
                        يُحجز يختفي فورًا من الرابط فلا يحجزه عميل آخر.
                      </p>
                      <Button type="button" size="sm" variant="outline" onClick={onOpenSettings}>
                        <Settings2 />
                        إعدادات الموعد
                      </Button>
                    </div>
                  ) : (
                    <>
                      {TEXT_TYPES.has(field.type) && (
                        <div className="grid gap-1.5">
                          <Label className="text-xs" htmlFor={`${uid}-${field.id}-ph`}>
                            نص توضيحي داخل الحقل
                          </Label>
                          <Input
                            id={`${uid}-${field.id}-ph`}
                            value={field.placeholder ?? ""}
                            maxLength={120}
                            onChange={(e) =>
                              set(field.id, { placeholder: e.target.value || undefined })
                            }
                          />
                        </div>
                      )}
                      <div className="grid gap-1.5">
                        <Label className="text-xs" htmlFor={`${uid}-${field.id}-help`}>
                          ملاحظة أسفل الحقل
                        </Label>
                        <Input
                          id={`${uid}-${field.id}-help`}
                          value={field.help ?? ""}
                          maxLength={200}
                          onChange={(e) => set(field.id, { help: e.target.value || undefined })}
                        />
                      </div>
                      {hasOptions(field.type) && (
                        <OptionsEditor
                          options={field.options ?? []}
                          onChange={(options) => set(field.id, { options })}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full border-dashed">
            <Plus />
            إضافة حقل
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-60">
          {missingSystem.length > 0 && (
            <>
              <DropdownMenuLabel>بيانات المريض</DropdownMenuLabel>
              {missingSystem.map((type) => {
                const meta = SYSTEM_FIELD_META[type];
                return (
                  <DropdownMenuItem key={type} onClick={() => add(systemField(type))}>
                    <meta.icon className="size-4" />
                    {meta.label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>حقول مخصصة</DropdownMenuLabel>
          {CUSTOM_FIELD_TYPES.map((type) => {
            const meta = CUSTOM_FIELD_META[type];
            return (
              <DropdownMenuItem key={type} onClick={() => add(newCustomField(type))}>
                <meta.icon className="size-4" />
                {meta.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const uid = useId();
  return (
    <div className="grid gap-1.5 sm:col-span-2" role="group" aria-labelledby={`${uid}-options`}>
      <p id={`${uid}-options`} className="text-xs font-medium">
        الخيارات
      </p>
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={option}
            maxLength={80}
            aria-label={`الخيار ${i + 1}`}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? e.target.value : o)))}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="حذف الخيار"
            disabled={options.length <= 1}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="justify-self-start"
        disabled={options.length >= 30}
        onClick={() => onChange([...options, `خيار ${options.length + 1}`])}
      >
        <Plus />
        إضافة خيار
      </Button>
    </div>
  );
}

function SettingsPanel({
  draft,
  refs,
  onChange,
  onSettings,
}: {
  draft: Draft;
  refs: Refs;
  onChange: (patch: Partial<Draft>) => void;
  onSettings: (patch: Partial<FormSettings>) => void;
}) {
  const { settings } = draft;
  const uid = useId();
  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const specialtyName = (id: string | null) => refs.specialties.find((s) => s.id === id)?.name;
  const servicesInScope = refs.services.filter(
    (s) =>
      settings.specialty_ids.length === 0 ||
      (s.specialty_id !== null && settings.specialty_ids.includes(s.specialty_id)),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard icon={ClipboardList} title="معلومات النموذج">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-1`}>عنوان النموذج</Label>
            <Input
              id={`${uid}-1`}
              value={draft.title}
              maxLength={120}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-2`}>وصف يظهر أعلى النموذج</Label>
            <Textarea
              id={`${uid}-2`}
              rows={3}
              value={draft.description}
              maxLength={600}
              placeholder="مثال: احجز موعد كشف الأسنان في دقيقة واحدة."
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-3`}>رسالة تظهر بعد الحجز</Label>
            <Textarea
              id={`${uid}-3`}
              rows={2}
              value={settings.success_message}
              maxLength={300}
              onChange={(e) => onSettings({ success_message: e.target.value })}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={CalendarCheck} title="الموعد">
        <div className="grid gap-5">
          <div className="grid gap-2" role="group" aria-labelledby={`${uid}-specialties`}>
            <p id={`${uid}-specialties`} className="text-sm font-medium">
              التخصصات المتاحة في النموذج
            </p>
            <p className="text-xs text-muted-foreground">
              {settings.specialty_ids.length === 0
                ? "لم تحدد شيئًا: كل التخصصات متاحة."
                : `${settings.specialty_ids.length} تخصص محدد.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {refs.specialties.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
                >
                  <Checkbox
                    checked={settings.specialty_ids.includes(s.id)}
                    onCheckedChange={() =>
                      onSettings({
                        specialty_ids: toggleId(settings.specialty_ids, s.id),
                        service_ids: [],
                      })
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          {servicesInScope.length > 0 && (
            <div className="grid gap-2" role="group" aria-labelledby={`${uid}-services`}>
              <p id={`${uid}-services`} className="text-sm font-medium">
                الخدمات
              </p>
              <p className="text-xs text-muted-foreground">
                {settings.service_ids.length === 0
                  ? "لم تحدد شيئًا: كل خدمات التخصصات المختارة متاحة."
                  : `${settings.service_ids.length} خدمة محددة.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {servicesInScope.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
                  >
                    <Checkbox
                      checked={settings.service_ids.includes(s.id)}
                      onCheckedChange={() =>
                        onSettings({ service_ids: toggleId(settings.service_ids, s.id) })
                      }
                    />
                    {s.name}
                    {specialtyName(s.specialty_id) && (
                      <span className="text-[11px] text-muted-foreground">
                        · {specialtyName(s.specialty_id)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">العميل يختار الطبيب</span>
              <span className="text-xs text-muted-foreground">
                عند الإيقاف يُحجز تلقائيًا مع الطبيب الأقل انشغالًا المتاح في الوقت المختار.
              </span>
            </span>
            <Switch
              checked={settings.choose_doctor}
              onCheckedChange={(v) => onSettings({ choose_doctor: v })}
            />
          </label>

          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">عرض أسعار الخدمات</span>
              <span className="text-xs text-muted-foreground">يظهر السعر بجانب كل خدمة.</span>
            </span>
            <Switch
              checked={settings.show_prices}
              onCheckedChange={(v) => onSettings({ show_prices: v })}
            />
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-4`}>يستطيع العميل الحجز خلال (أيام)</Label>
            <Input
              id={`${uid}-4`}
              type="number"
              min={1}
              max={60}
              className="w-32"
              value={settings.booking_window_days}
              onChange={(e) => {
                const days = Math.round(Number(e.target.value));
                if (Number.isFinite(days))
                  onSettings({ booking_window_days: Math.min(60, Math.max(1, days)) });
              }}
            />
            <p className="text-xs text-muted-foreground">من اليوم وحتى 60 يومًا كحد أقصى.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function SubmissionsPanel({ formId, canWrite }: { formId: string; canWrite: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["booking-form-submissions", formId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_form_submissions")
        .select(
          "id, created_at, answers, appointment_id, appointments(appointment_number, appointment_date, start_time, status), patients(full_name, phone)",
        )
        .eq("form_id", formId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <RowsSkeleton rows={4} />;
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="لا توجد حجوزات من هذا النموذج بعد"
        hint="عندما يحجز عميل من الرابط يظهر هنا مع إجاباته، ويُضاف تلقائيًا إلى صفحة المواعيد."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const appt = row.appointments as unknown as {
          appointment_number: string;
          appointment_date: string;
          start_time: string;
          status: AppointmentStatus;
        } | null;
        const patient = row.patients as unknown as { full_name: string; phone: string } | null;
        const answers = (Array.isArray(row.answers) ? row.answers : []) as {
          type?: string;
          label?: string;
          value?: string;
        }[];
        const extra = answers.filter((a) => a.type !== "full_name" && a.type !== "phone");
        return (
          <article key={row.id} className="surface-raised rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {patient?.full_name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span dir="ltr">{patient?.phone ?? ""}</span> · أُرسل{" "}
                  {formatRelative(row.created_at)}
                </p>
              </div>
              {appt ? (
                <>
                  <span className="tabular text-sm font-semibold text-foreground">
                    {formatDate(appt.appointment_date)} · {formatTime(appt.start_time)}
                  </span>
                  <StatusBadge status={appt.status} />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">الموعد محذوف</span>
              )}
              {canWrite && row.appointment_id && appt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(row.appointment_id)}
                >
                  <Pencil />
                  تعديل الموعد
                </Button>
              )}
            </div>
            {extra.length > 0 && (
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-border/70 pt-3 text-sm sm:grid-cols-2">
                {extra.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{a.label}:</dt>
                    <dd className="min-w-0 break-words text-foreground">
                      {a.type === "checkbox"
                        ? "نعم"
                        : a.type === "gender"
                          ? a.value === "female"
                            ? "أنثى"
                            : "ذكر"
                          : a.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        );
      })}
      <EditAppointmentDialog
        appointmentId={editingId}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
    </div>
  );
}
