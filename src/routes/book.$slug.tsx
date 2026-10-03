import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { CalendarX2, MapPin, Phone, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingFormView } from "@/components/booking/booking-form-view";
import { parsePublicForm } from "@/lib/booking-forms";

export const Route = createFileRoute("/book/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "حجز موعد" },
      { name: "description", content: "احجز موعدك في العيادة واختر الوقت المناسب لك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicBookingPage,
});

function PublicBookingPage() {
  const { slug } = Route.useParams();
  const {
    data: form,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["public-booking-form", slug],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_booking_form", { _slug: slug });
      if (error) throw error;
      return parsePublicForm(data);
    },
  });

  useEffect(() => {
    if (form) document.title = [form.title, form.clinic?.name].filter(Boolean).join(" | ");
  }, [form]);

  const clinic = form?.clinic;

  return (
    <div className="app-canvas min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-4 flex items-center gap-3">
          {clinic?.logo_url ? (
            <img src={clinic.logo_url} alt="" className="size-11 rounded-xl object-cover" />
          ) : (
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary-emphasis">
              <Stethoscope className="size-6" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-foreground">
              {clinic?.name ?? (isLoading ? "…" : "حجز موعد")}
            </p>
            {(clinic?.city || clinic?.phone) && (
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {clinic?.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {clinic.city}
                  </span>
                )}
                {clinic?.phone && (
                  <a
                    href={`tel:${clinic.phone}`}
                    className="inline-flex items-center gap-1"
                    dir="ltr"
                  >
                    <Phone className="size-3" />
                    {clinic.phone}
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        <main className="surface-raised rounded-2xl p-5 sm:p-7">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-full" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-10 text-center">
              <p className="font-bold text-foreground">تعذّر تحميل النموذج</p>
              <p className="mt-1 text-sm text-muted-foreground">تحقّق من اتصالك بالإنترنت.</p>
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-primary-emphasis underline"
                onClick={() => void refetch()}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : !form ? (
            <div className="py-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <CalendarX2 className="size-7" />
              </span>
              <p className="mt-4 font-bold text-foreground">هذا النموذج غير متاح حاليًا</p>
              <p className="mt-1 text-sm text-muted-foreground">
                قد يكون الرابط قديمًا أو أوقفته العيادة. تواصل مع العيادة للحصول على رابط جديد.
              </p>
            </div>
          ) : (
            <BookingFormView form={form} />
          )}
        </main>
      </div>
    </div>
  );
}
