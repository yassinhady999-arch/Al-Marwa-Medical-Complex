import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Search, Users, Phone, MapPin, Download, Upload, FileSpreadsheet, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SourceBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { CardsSkeleton } from "@/components/app/state";
import { InitialsAvatar } from "@/components/app/avatar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { GENDER_LABELS, SOURCE_LABELS, formatDateTime, todayRiyadh } from "@/lib/clinic";
import type { BookingSource } from "@/lib/clinic";
import { useProfile } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "المرضى | نظام تشغيل العيادة" },
      { name: "description", content: "سجل المرضى: بيانات التواصل، المصدر، وتاريخ آخر تواصل." },
      { property: "og:title", content: "المرضى | نظام تشغيل العيادة" },
      { property: "og:description", content: "سجل المرضى وبيانات التواصل." },
    ],
  }),
  component: PatientsPage,
});

type PatientRow = {
  id: string;
  full_name: string;
  phone: string;
  whatsapp_number: string | null;
  email: string | null;
  gender: string | null;
  city: string | null;
  source: string;
  last_contact_at: string;
  created_at: string;
};

const GENDER_OPTIONS = [
  { value: "all", label: "كل الأجناس" },
  { value: "male", label: "ذكر" },
  { value: "female", label: "أنثى" },
] as const;

const SOURCE_OPTIONS: { value: "all" | BookingSource; label: string }[] = [
  { value: "all", label: "كل المصادر" },
  { value: "whatsapp", label: "واتساب" },
  { value: "website", label: "الموقع" },
  { value: "phone", label: "هاتف" },
  { value: "manual", label: "إدخال يدوي" },
  { value: "referral", label: "إحالة" },
];

function PatientsPage() {
  const [search, setSearch] = useState("");
  const [specialtyId, setSpecialtyId] = useState("all");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [source, setSource] = useState<"all" | BookingSource>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: me } = useProfile();

  const hasActiveFilters =
    !!search ||
    specialtyId !== "all" ||
    gender !== "all" ||
    source !== "all" ||
    !!dateFrom ||
    !!dateTo;

  const clearFilters = () => {
    setSearch("");
    setSpecialtyId("all");
    setGender("all");
    setSource("all");
    setDateFrom("");
    setDateTo("");
  };

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

  const { data, isLoading } = useQuery({
    queryKey: ["patients", debouncedSearch, specialtyId, gender, source, dateFrom, dateTo],
    queryFn: async () => {
      // "فلترة حسب التخصص" لا يوجد عمود مباشر لها في جدول المرضى — نحصر أولًا
      // المرضى اللي عندهم موعد مرتبط بهذا التخصص، ثم نفلتر جدول المرضى بمعرّفاتهم.
      let allowedIds: string[] | null = null;
      if (specialtyId !== "all") {
        const { data: links, error: linkErr } = await supabase
          .from("appointments")
          .select("patient_id")
          .eq("specialty_id", specialtyId);
        if (linkErr) throw linkErr;
        allowedIds = Array.from(
          new Set((links ?? []).map((l) => l.patient_id).filter((x): x is string => !!x)),
        );
        if (allowedIds.length === 0) return [] as PatientRow[];
      }

      let q = supabase
        .from("patients")
        .select(
          "id, full_name, phone, whatsapp_number, email, gender, city, source, last_contact_at, created_at",
        )
        .order("last_contact_at", { ascending: false })
        .limit(200);

      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim();
        q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      if (gender !== "all") q = q.eq("gender", gender);
      if (source !== "all") q = q.eq("source", source);
      if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
      if (allowedIds) q = q.in("id", allowedIds);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PatientRow[];
    },
  });

  const rows = data ?? [];

  return (
    <AppShell
      title="المرضى"
      description="قاعدة بيانات المرضى الموحّدة"
      section="patients"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton rows={rows} />
          {me?.canWrite && <ImportPatientsDialog />}
          {me?.canWrite && <NewPatientDialog />}
        </div>
      }
    >
      <div className="surface-raised mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid flex-1 gap-1.5 sm:min-w-56">
          <Label className="text-xs text-muted-foreground">بحث بالاسم أو الجوال</Label>
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

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">التخصص</Label>
          <Select value={specialtyId} onValueChange={setSpecialtyId}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التخصصات</SelectItem>
              {(specialties ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">الجنس</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">المصدر</Label>
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">مسجّل من تاريخ</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
            <X className="size-3.5" />
            مسح الفلاتر
          </Button>
        )}
      </div>

      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد مرضى"
          hint={
            hasActiveFilters
              ? "لا توجد نتائج مطابقة لهذه الفلاتر."
              : "أضف مريضًا جديدًا أو انتظر تسجيلهم عبر واتساب."
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="tabular font-semibold text-foreground">{rows.length}</span> مريض
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((p, i) => (
              <div
                key={p.id}
                className="surface-raised animate-rise rounded-2xl p-4 transition-shadow hover:shadow-md"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={p.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-foreground">{p.full_name}</p>
                      <SourceBadge source={p.source as BookingSource} />
                    </div>
                    <p
                      className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"
                      dir="ltr"
                    >
                      <Phone className="size-3.5 shrink-0" />
                      {p.phone}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  <span>{p.gender ? GENDER_LABELS[p.gender] : "—"}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {p.city ?? "—"}
                  </span>
                  <span className="ms-auto">آخر تواصل: {formatDateTime(p.last_contact_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ExportButton({ rows }: { rows: PatientRow[] }) {
  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("لا توجد بيانات لتصديرها ضمن الفلاتر الحالية");
      return;
    }
    const sheetRows = rows.map((p) => ({
      "الاسم الكامل": p.full_name,
      "رقم الجوال": p.phone,
      واتساب: p.whatsapp_number ?? "",
      "البريد الإلكتروني": p.email ?? "",
      المدينة: p.city ?? "",
      الجنس: p.gender ? (GENDER_LABELS[p.gender] ?? p.gender) : "",
      المصدر: SOURCE_LABELS[p.source as BookingSource] ?? p.source,
      "آخر تواصل": formatDateTime(p.last_contact_at),
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 15 },
      { wch: 15 },
      { wch: 24 },
      { wch: 14 },
      { wch: 8 },
      { wch: 12 },
      { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المرضى");
    XLSX.writeFile(wb, `مرضى-${todayRiyadh()}.xlsx`);
    toast.success(`تم تصدير ${rows.length} مريض إلى Excel`);
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="size-4" />
      تصدير Excel
    </Button>
  );
}

const GENDER_IMPORT_MAP: Record<string, "male" | "female"> = {
  ذكر: "male",
  male: "male",
  m: "male",
  أنثى: "female",
  انثى: "female",
  female: "female",
  f: "female",
};

const SOURCE_IMPORT_MAP: Record<string, BookingSource> = {
  واتساب: "whatsapp",
  whatsapp: "whatsapp",
  الموقع: "website",
  website: "website",
  هاتف: "phone",
  phone: "phone",
  "إدخال يدوي": "manual",
  manual: "manual",
  إحالة: "referral",
  referral: "referral",
};

function readCell(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function ImportPatientsDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<{
    total: number;
    imported: number;
    skipped: number;
  } | null>(null);

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error("الملف لا يحتوي على أي ورقة بيانات");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet]!, {
        defval: "",
      });

      type ImportRow = {
        full_name: string;
        phone: string;
        normalized_phone: string;
        email: string | null;
        city: string | null;
        gender: "male" | "female" | null;
        source: BookingSource;
      };
      const toInsert: ImportRow[] = [];
      for (const r of rows) {
        const full_name = readCell(r, ["الاسم الكامل", "الاسم", "full_name", "name"]);
        const phone = readCell(r, ["رقم الجوال", "الجوال", "phone", "رقم الهاتف"]);
        if (!full_name || !phone) continue;
        const email = readCell(r, ["البريد الإلكتروني", "email"]) || null;
        const city = readCell(r, ["المدينة", "city"]) || null;
        const genderRaw = readCell(r, ["الجنس", "gender"]).toLowerCase();
        const sourceRaw = readCell(r, ["المصدر", "source"]).toLowerCase();
        toInsert.push({
          full_name,
          phone,
          normalized_phone: phone,
          email,
          city,
          gender: GENDER_IMPORT_MAP[genderRaw] ?? null,
          source: SOURCE_IMPORT_MAP[sourceRaw] ?? "manual",
        });
      }

      if (toInsert.length === 0) {
        throw new Error("لم يتم العثور على صفوف صالحة — الاسم الكامل ورقم الجوال مطلوبان في كل صف");
      }

      const { data, error } = await supabase
        .from("patients")
        .upsert(toInsert, { onConflict: "normalized_phone", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;

      const imported = data?.length ?? 0;
      return { total: rows.length, imported, skipped: toInsert.length - imported };
    },
    onSuccess: (res) => {
      setSummary(res);
      void logActivity({
        action: "create",
        section: "patients",
        description: `استيراد ${res.imported} مريض من ملف Excel`,
      });
      toast.success(
        `تم استيراد ${res.imported} مريض${res.skipped ? ` — تم تخطي ${res.skipped} (مكرر أو ناقص)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    importMut.mutate(file);
    e.target.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSummary(null);
          setFileName("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          استيراد Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>استيراد مرضى من Excel</DialogTitle>
          <DialogDescription>
            الأعمدة المطلوبة: <strong>الاسم الكامل</strong> و<strong>رقم الجوال</strong>. اختياريًا:
            البريد الإلكتروني، المدينة، الجنس، المصدر. الأرقام المكررة يتم تخطّيها تلقائيًا.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/40 hover:bg-accent/50">
          <FileSpreadsheet className="size-8 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {fileName || "اضغط لاختيار ملف Excel أو CSV"}
          </span>
          <span className="text-xs text-muted-foreground">xlsx, xls, csv</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
            disabled={importMut.isPending}
          />
        </label>

        {importMut.isPending && (
          <p className="text-center text-sm text-muted-foreground">جارٍ الاستيراد…</p>
        )}

        {summary && (
          <div className="rounded-xl border border-success/25 bg-success-soft px-3.5 py-2.5 text-sm text-success-emphasis">
            تم استيراد {summary.imported} من أصل {summary.total} صف
            {summary.skipped > 0 && ` — تم تخطي ${summary.skipped} (مكرر أو ناقص البيانات)`}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPatientDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    city: "",
    gender: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.phone.trim()) throw new Error("الاسم والجوال مطلوبان");
      const { data, error } = await supabase
        .from("patients")
        .insert({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          normalized_phone: form.phone.trim(),
          email: form.email || null,
          city: form.city || null,
          gender: form.gender ? (form.gender as "male" | "female") : null,
          source: "manual",
        })
        .select("id, full_name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      void logActivity({
        action: "create",
        section: "patients",
        description: `إضافة مريض: ${data?.full_name ?? form.full_name.trim()}`,
        entityType: "patient",
        entityId: data?.id ?? null,
      });
      toast.success("تم إضافة المريض");
      setOpen(false);
      setForm({ full_name: "", phone: "", email: "", city: "", gender: "" });
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>مريض جديد</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة مريض</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>الاسم الكامل</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>رقم الجوال</Label>
            <Input
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="05xxxxxxxx"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>المدينة</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>الجنس</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">ذكر</SelectItem>
                  <SelectItem value="female">أنثى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
