import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { FilterX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "all";

export type AppointmentFilters = {
  specialty: string;
  doctor: string;
  service: string;
};

/** Minimal appointment shape the filters need — add `doctor_id, service_id, specialty_id` to the query's select. */
export type FilterableAppointment = {
  doctor_id?: string | null;
  service_id?: string | null;
  specialty_id?: string | null;
};

type Option = { id: string; name: string; specialty_id: string | null };

export const EMPTY_FILTERS: AppointmentFilters = { specialty: ALL, doctor: ALL, service: ALL };

/** Specialties / doctors / services used to populate the filter dropdowns. */
export function useFilterOptions() {
  return useQuery({
    queryKey: ["appointment-filter-options"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [sp, dr, sv] = await Promise.all([
        supabase.from("specialties").select("id, name").order("name"),
        supabase.from("doctors").select("id, name, specialty_id").order("name"),
        supabase.from("services").select("id, name, specialty_id").order("name"),
      ]);
      return {
        specialties: (sp.data ?? []) as { id: string; name: string }[],
        doctors: (dr.data ?? []) as Option[],
        services: (sv.data ?? []) as Option[],
      };
    },
  });
}

/** Filter state + a predicate that resolves an appointment's specialty via its service/doctor. */
export function useAppointmentFilters() {
  const [filters, setFilters] = useState<AppointmentFilters>(EMPTY_FILTERS);
  const { data: options } = useFilterOptions();

  const specialtyOf = useMemo(() => {
    const byDoctor = new Map((options?.doctors ?? []).map((d) => [d.id, d.specialty_id]));
    const byService = new Map((options?.services ?? []).map((s) => [s.id, s.specialty_id]));
    return (a: FilterableAppointment) =>
      a.specialty_id ??
      (a.service_id ? byService.get(a.service_id) : null) ??
      (a.doctor_id ? byDoctor.get(a.doctor_id) : null) ??
      null;
  }, [options]);

  const matches = useCallback(
    (a: FilterableAppointment) =>
      (filters.doctor === ALL || a.doctor_id === filters.doctor) &&
      (filters.service === ALL || a.service_id === filters.service) &&
      (filters.specialty === ALL || specialtyOf(a) === filters.specialty),
    [filters, specialtyOf],
  );

  const active = filters.specialty !== ALL || filters.doctor !== ALL || filters.service !== ALL;

  return { filters, setFilters, matches, active, options };
}

type FieldsProps = {
  filters: AppointmentFilters;
  onChange: (next: AppointmentFilters) => void;
  className?: string | undefined;
  triggerClassName?: string | undefined;
};

/**
 * Specialty → doctor → service selects. Picking a specialty narrows the doctor and service
 * lists to that specialty (and clears picks that no longer fit).
 */
export function AppointmentFilterFields({
  filters,
  onChange,
  className,
  triggerClassName = "w-full sm:w-44",
}: FieldsProps) {
  const { data: options } = useFilterOptions();
  const inSpecialty = (o: Option) =>
    filters.specialty === ALL || !o.specialty_id || o.specialty_id === filters.specialty;
  const doctors = (options?.doctors ?? []).filter(inSpecialty);
  const services = (options?.services ?? []).filter(inSpecialty);
  const active = filters.specialty !== ALL || filters.doctor !== ALL || filters.service !== ALL;

  const setSpecialty = (specialty: string) => {
    const fits = (list: Option[], id: string) =>
      id === ALL ||
      specialty === ALL ||
      list.some((o) => o.id === id && (!o.specialty_id || o.specialty_id === specialty));
    onChange({
      specialty,
      doctor: fits(options?.doctors ?? [], filters.doctor) ? filters.doctor : ALL,
      service: fits(options?.services ?? [], filters.service) ? filters.service : ALL,
    });
  };

  return (
    <div className={cn("contents", className)}>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">القسم / التخصص</Label>
        <Select value={filters.specialty} onValueChange={setSpecialty}>
          <SelectTrigger className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الأقسام</SelectItem>
            {(options?.specialties ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">الطبيب</Label>
        <Select value={filters.doctor} onValueChange={(doctor) => onChange({ ...filters, doctor })}>
          <SelectTrigger className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الأطباء</SelectItem>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">الخدمة</Label>
        <Select
          value={filters.service}
          onValueChange={(service) => onChange({ ...filters, service })}
        >
          <SelectTrigger className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الخدمات</SelectItem>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="self-end text-muted-foreground"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <FilterX className="size-4" />
          مسح الفلاتر
        </Button>
      )}
    </div>
  );
}

/** Standalone filter bar (card) for pages that don't already have a filter row. */
export function AppointmentFilterBar({
  filters,
  onChange,
  summary,
  className,
}: {
  filters: AppointmentFilters;
  onChange: (next: AppointmentFilters) => void;
  summary?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "surface-raised mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
    >
      <AppointmentFilterFields filters={filters} onChange={onChange} />
      {summary != null && (
        <p className="tabular text-xs text-muted-foreground sm:ms-auto">{summary}</p>
      )}
    </div>
  );
}
