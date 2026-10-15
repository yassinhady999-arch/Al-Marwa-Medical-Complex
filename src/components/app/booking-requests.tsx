// «الحجوزات»: requests sent from the public booking form («حجز محتمل»). A request is not an
// appointment: staff contact the patient (usually on WhatsApp), then either confirm a
// time — which books the real appointment — or cancel it.
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  CalendarCheck,
  Inbox,
  LoaderCircle,
  MessageCircle,
  Phone,
  Search,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { RowsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import {
  DOCTOR_DEPARTMENTS,
  dbErrorMessage,
  formatDate,
  formatDateTime,
  formatRelative,
  formatTime,
  todayRiyadh,
  worksIn,
} from "@/lib/clinic";
import { whatsappNumber } from "@/lib/chatbot";
import { REQUEST_STATUS_META, requestStatus, type BookingRequestStatus } from "@/lib/booking-forms";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

const REQUEST_FIELDS =
  "id, request_number, status, created_at, form_title, answers, appointment_id, specialty_id, service_id, doctor_id, specialties(name), services(name), doctors(name), appointments(appointment_number, appointment_date, start_time)";

type Answer = { type?: string; label?: string; value?: string };

type BookingRequest = {
  id: string;
  request_number: string | null;
  status: BookingRequestStatus;
  created_at: string;
  form_title: string;
  answers: Answer[];
  appointment_id: string | null;
  specialty_id: string | null;
  service_id: string | null;
  doctor_id: string | null;
  specialty: string | null;
  service: string | null;
  doctor: string | null;
  appointment: { appointment_number: string; appointment_date: string; start_time: string } | null;
};

type Filter = "open" | BookingRequestStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "open", label: "قيد المتابعة" },
  { value: "pending_contact", label: REQUEST_STATUS_META.pending_contact.label },
  { value: "contacted", label: REQUEST_STATUS_META.contacted.label },
  { value: "confirmed", label: REQUEST_STATUS_META.confirmed.label },
  { value: "cancelled", label: REQUEST_STATUS_META.cancelled.label },
];

const name = (v: unknown) => (v as { name?: string } | null)?.name ?? null;

function toRequest(row: Record<string, unknown>): BookingRequest {
  return {
    id: String(row["id"]),
    request_number: (row["request_number"] as string | null) ?? null,
    status: requestStatus(row["status"] as string),
    created_at: String(row["created_at"]),
    form_title: String(row["form_title"] ?? ""),
    answers: (Array.isArray(row["answers"]) ? row["answers"] : []) as Answer[],
    appointment_id: (row["appointment_id"] as string | null) ?? null,
    specialty_id: (row["specialty_id"] as string | null) ?? null,
    service_id: (row["service_id"] as string | null) ?? null,
    doctor_id: (row["doctor_id"] as string | null) ?? null,
    specialty: name(row["specialties"]),
    service: name(row["services"]),
    doctor: name(row["doctors"]),
    appointment: (row["appointments"] as BookingRequest["appointment"]) ?? null,
  };
}

function answer(r: BookingRequest, type: string): string | null {
  return r.answers.find((a) => a.type === type)?.value ?? null;
}

function answerText(a: Answer): string {
  if (a.type === "checkbox") return "نعم";
  if (a.type === "gender") return a.value === "female" ? "أنثى" : "ذكر";
  return a.value ?? "";
}

/** Requests waiting for a first call — the badge on «الحجوزات» in the sidebar. */
export function useNewRequestsCount(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    // Unique topic per mount (StrictMode and hot reload remount this).
    const ch = supabase
      .channel(`booking-requests-badge-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_form_submissions" },
        () => void qc.invalidateQueries({ queryKey: ["booking-requests", "new-count"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [enabled, qc]);
  return useQuery({
    queryKey: ["booking-requests", "new-count"],
    enabled,
    staleTime: 15_000,
    // Live updates keep it current; this is the fallback when they are unavailable.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_form_submissions")
        .select("id")
        .eq("status", "pending_contact");
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}

/** Live updates for anything showing requests. */
function useRequestsLive() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("booking-requests-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_form_submissions" },
        () => void qc.invalidateQueries({ queryKey: ["booking-requests"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
}

export function RequestStatusBadge({ status }: { status: BookingRequestStatus }) {
  const meta = REQUEST_STATUS_META[status];
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

export function BookingRequestsPanel() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  useRequestsLive();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["booking-requests", "list", filter],
    queryFn: async () => {
      let q = supabase
        .from("booking_form_submissions")
        .select(REQUEST_FIELDS)
        .order("created_at", { ascending: false })
        .limit(300);
      if (filter === "open") q = q.in("status", ["pending_contact", "contacted"]);
      else if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => toRequest(r as unknown as Record<string, unknown>));
    },
  });

  const { data: clinicWhatsApp } = useQuery({
    queryKey: ["clinic_settings", "whatsapp"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinic_settings")
        .select("whatsapp_number, phone")
        .limit(1)
        .maybeSingle();
      return data?.whatsapp_number?.trim() || data?.phone?.trim() || "";
    },
  });

  // The sidebar badge follows what this list shows.
  useEffect(() => {
    if (rows) void qc.invalidateQueries({ queryKey: ["booking-requests", "new-count"] });
  }, [rows, qc]);

  const term = search.trim();
  const shown = (rows ?? []).filter(
    (r) =>
      !term ||
      (r.request_number ?? "").includes(term) ||
      (answer(r, "full_name") ?? "").includes(term) ||
      (answer(r, "phone") ?? "").includes(term),
  );
  const open = rows?.find((r) => r.id === openId) ?? null;

  return (
    <div>
      {clinicWhatsApp === "" ? (
        <div className="mb-4 flex gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            لا يوجد رقم واتساب ولا رقم هاتف للمجمع، فلن يُفتح واتساب للمريض بعد إرسال طلبه (يُسجَّل
            الحجز المحتمل فقط).{" "}
            <Link to="/settings" className="font-semibold underline">
              أضف الرقم من الإعدادات ← بيانات العيادة
            </Link>
          </p>
        </div>
      ) : clinicWhatsApp ? (
        <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="size-3.5" />
          رسائل استكمال الحجز تصل على واتساب المجمع:
          <span dir="ltr" className="tabular font-semibold text-foreground">
            {clinicWhatsApp}
          </span>
          ·
          <Link to="/settings" className="underline">
            تغيير الرقم
          </Link>
        </p>
      ) : null}

      <div className="surface-raised mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">الحالة</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-full sm:w-48" aria-label="حالة الطلب">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label className="text-xs text-muted-foreground">بحث (اسم / جوال / رقم الطلب)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث…"
              className="pe-9"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={5} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="لا توجد حجوزات محتملة"
          hint={
            filter === "all" || filter === "open"
              ? "كل عميل يضغط «استكمال حجزك عبر واتساب» في نموذج الحجز يظهر هنا ببياناته كحجز محتمل، حتى تتواصل معه وتؤكد موعده."
              : "لا توجد حجوزات محتملة بهذه الحالة."
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="tabular font-semibold text-foreground">{shown.length}</span> حجز محتمل
          </p>
          <div className="space-y-3">
            {shown.map((r, i) => {
              const patientName = answer(r, "full_name");
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="surface-raised animate-rise flex w-full flex-wrap items-center gap-4 rounded-2xl p-4 text-start transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  aria-label={`تفاصيل طلب الحجز ${r.request_number ?? ""}`}
                >
                  <InitialsAvatar name={patientName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{patientName ?? "—"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      <span dir="ltr">{answer(r, "phone") ?? "—"}</span>
                      <span className="text-border-strong">·</span>
                      {r.service ?? r.specialty ?? "—"}
                      {r.doctor && (
                        <>
                          <span className="text-border-strong">·</span>
                          {r.doctor}
                        </>
                      )}
                    </p>
                    <p className="tabular mt-1 truncate text-[11px] text-muted-foreground">
                      {r.request_number} · سُجّل {formatRelative(r.created_at)}
                    </p>
                  </div>
                  <ToneBadge tone="chat" dot={false}>
                    حجز محتمل
                  </ToneBadge>
                  <RequestStatusBadge status={r.status} />
                </button>
              );
            })}
          </div>
        </>
      )}

      <RequestDialog
        requestId={openId}
        initial={open}
        canWrite={!!me?.canWrite}
        onOpenChange={(v) => !v && setOpenId(null)}
      />
    </div>
  );
}

/**
 * Loads its own copy of the request, so it stays open (and shows the booked appointment)
 * after confirming, even when the request leaves the list being viewed.
 */
function RequestDialog({
  requestId,
  initial,
  canWrite,
  onOpenChange,
}: {
  requestId: string | null;
  initial: BookingRequest | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data } = useQuery({
    queryKey: ["booking-requests", "one", requestId],
    enabled: !!requestId,
    ...(initial ? { placeholderData: initial } : {}),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_form_submissions")
        .select(REQUEST_FIELDS)
        .eq("id", requestId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toRequest(data as unknown as Record<string, unknown>) : null;
    },
  });
  const request = data ?? initial;
  return (
    <Dialog open={!!requestId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {request && <RequestDetails key={request.id} request={request} canWrite={canWrite} />}
      </DialogContent>
    </Dialog>
  );
}

function RequestDetails({ request: r, canWrite }: { request: BookingRequest; canWrite: boolean }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const phone = answer(r, "phone");
  const wa = phone ? whatsappNumber(phone) : "";
  const extra = r.answers.filter((a) => a.type !== "full_name" && a.type !== "phone");

  const setStatus = useMutation({
    mutationFn: async (next: BookingRequestStatus) => {
      const { error } = await supabase.rpc("set_booking_request_status", {
        _request_id: r.id,
        _status: next,
      });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      void logActivity({
        action: "status_change",
        section: "appointments",
        description: `تغيير حالة طلب الحجز ${r.request_number ?? ""} إلى «${REQUEST_STATUS_META[next].label}»`,
        entityType: "booking_request",
        entityId: r.id,
        metadata: { status: next },
      });
      toast.success("تم تحديث حالة الطلب");
      void qc.invalidateQueries({ queryKey: ["booking-requests"] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  const rows: [string, React.ReactNode][] = [
    ["الاسم", answer(r, "full_name") ?? "—"],
    ["رقم الجوال", <span dir="ltr">{phone ?? "—"}</span>],
    ["القسم", r.specialty ?? "—"],
    ["الخدمة", r.service ?? "—"],
    ["الطبيب المطلوب", r.doctor ?? "أي طبيب متاح"],
    ["وقت تسجيل الطلب", formatDateTime(r.created_at)],
    ["النموذج", r.form_title || "—"],
    ...extra.map((a): [string, React.ReactNode] => [a.label ?? "", answerText(a)]),
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          <span className="tabular">طلب الحجز {r.request_number}</span>
          <ToneBadge tone="chat" dot={false}>
            حجز محتمل
          </ToneBadge>
          <RequestStatusBadge status={r.status} />
        </DialogTitle>
        <DialogDescription>
          الطلب ليس موعدًا مؤكدًا. تواصل مع المريض، ثم أكّد الموعد بعد الاتفاق معه.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex gap-3">
            <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {phone && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
              <Phone />
              اتصال بالمريض
            </a>
          </Button>
          {wa.length >= 10 && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                مراسلة على واتساب
              </a>
            </Button>
          )}
        </div>
      )}

      {r.status === "confirmed" ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-success/25 bg-success-soft p-3 text-sm text-success-emphasis">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            {r.appointment ? (
              <>
                تأكّد وأصبح موعدًا:{" "}
                <span className="tabular font-semibold">
                  {r.appointment.appointment_number} · {formatDate(r.appointment.appointment_date)}{" "}
                  · {formatTime(r.appointment.start_time)}
                </span>
                . أي تعديل يكون على الموعد نفسه من التقويم.
              </>
            ) : (
              "تأكّد هذا الطلب، لكن موعده حُذف لاحقًا."
            )}
          </p>
        </div>
      ) : !canWrite ? (
        <p className="text-sm text-muted-foreground">
          لديك صلاحية اطّلاع فقط على الحجوزات المحتملة.
        </p>
      ) : (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-1.5">
            <Label>حالة المتابعة</Label>
            <Select
              value={r.status}
              disabled={setStatus.isPending}
              onValueChange={(v) => setStatus.mutate(v as BookingRequestStatus)}
            >
              <SelectTrigger aria-label="حالة المتابعة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["pending_contact", "contacted", "cancelled"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {REQUEST_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {confirming ? (
            <ConfirmForm request={r} onCancel={() => setConfirming(false)} />
          ) : (
            <Button className="w-full" onClick={() => setConfirming(true)}>
              <CalendarCheck />
              تأكيد الموعد بعد الاتفاق مع المريض
            </Button>
          )}
        </div>
      )}
    </>
  );
}

const NO_SERVICE = "none";

/** Pick the agreed doctor, day and time; confirming books the real appointment. */
function ConfirmForm({ request: r, onCancel }: { request: BookingRequest; onCancel: () => void }) {
  const qc = useQueryClient();
  const uid = useId();
  const { data: refs } = useQuery({
    queryKey: ["booking-requests", "refs"],
    queryFn: async () => {
      const [doctors, services] = await Promise.all([
        supabase
          .from("doctors")
          .select(`id, name, specialty_id, ${DOCTOR_DEPARTMENTS}`)
          .eq("status", "active")
          .order("name"),
        supabase
          .from("services")
          .select("id, name, duration_minutes, specialty_id")
          .eq("is_active", true)
          .order("name"),
      ]);
      return { doctors: doctors.data ?? [], services: services.data ?? [] };
    },
  });
  const inDept = (refs?.doctors ?? []).filter((d) => !r.specialty_id || worksIn(d, r.specialty_id));
  const doctors = inDept.length > 0 ? inDept : (refs?.doctors ?? []);
  const services = (refs?.services ?? []).filter(
    (s) => !r.specialty_id || s.specialty_id === r.specialty_id || s.id === r.service_id,
  );

  const [doctorId, setDoctorId] = useState(r.doctor_id ?? "");
  const [serviceId, setServiceId] = useState(r.service_id ?? NO_SERVICE);
  const [date, setDate] = useState(todayRiyadh());
  const [time, setTime] = useState("");
  const activeDoctor = doctorId || (doctors.length === 1 ? doctors[0]!.id : "");
  const duration = refs?.services.find((s) => s.id === serviceId)?.duration_minutes ?? 30;

  const slots = useQuery({
    queryKey: ["booking-requests", "slots", activeDoctor, date, duration],
    enabled: !!activeDoctor && !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_available_slots", {
        _doctor_id: activeDoctor,
        _date: date,
        _duration: duration,
      });
      if (error) throw error;
      return ((data ?? []) as { slot_time: string }[]).map((s) => s.slot_time.slice(0, 5));
    },
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!activeDoctor) throw new Error("اختر الطبيب");
      if (!date || !time) throw new Error("اختر يوم ووقت الموعد");
      const { data, error } = await supabase.rpc("confirm_booking_request", {
        _request_id: r.id,
        _doctor_id: activeDoctor,
        _service_id: serviceId === NO_SERVICE ? null : serviceId,
        _date: date,
        _time: time,
      });
      if (error) throw error;
      return data as unknown as { appointment_id: string; appointment_number: string };
    },
    onSuccess: (appt) => {
      void logActivity({
        action: "create",
        section: "appointments",
        description: `تأكيد طلب الحجز ${r.request_number ?? ""} وحجز الموعد ${appt.appointment_number} بتاريخ ${date}`,
        entityType: "appointment",
        entityId: appt.appointment_id,
        metadata: { request_id: r.id },
      });
      toast.success(`تم تأكيد الموعد ${appt.appointment_number} وإضافته للمواعيد`);
      void qc.invalidateQueries({ queryKey: ["booking-requests"] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <p className="text-sm font-semibold text-foreground">تأكيد الموعد المتفق عليه</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-d`}>الطبيب</Label>
          <Select
            value={activeDoctor}
            onValueChange={(v) => {
              setDoctorId(v);
              setTime("");
            }}
          >
            <SelectTrigger id={`${uid}-d`}>
              <SelectValue placeholder="اختر الطبيب" />
            </SelectTrigger>
            <SelectContent>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-s`}>الخدمة</Label>
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger id={`${uid}-s`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SERVICE}>بدون تحديد خدمة</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-date`}>اليوم</Label>
          <Input
            id={`${uid}-date`}
            type="date"
            min={todayRiyadh()}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setTime("");
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-time`}>الوقت</Label>
          <Input
            id={`${uid}-time`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      {activeDoctor && date && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">الأوقات المتاحة للطبيب في هذا اليوم:</p>
          {slots.isLoading ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              جارٍ التحميل…
            </p>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              لا توجد أوقات متاحة (الطبيب لا يعمل في هذا اليوم أو المواعيد ممتلئة).
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(slots.data ?? []).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  aria-pressed={t === time}
                  className={cn(
                    "tabular rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                    t === time
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:bg-accent",
                  )}
                >
                  {formatTime(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
          {confirm.isPending ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}
          {confirm.isPending ? "جارٍ الحجز…" : "تأكيد وحجز الموعد"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={confirm.isPending}>
          رجوع
        </Button>
      </div>
    </div>
  );
}
