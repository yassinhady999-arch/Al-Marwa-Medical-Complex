import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { BookingRequestsPanel } from "@/components/app/booking-requests";

// «الحجوزات»: every booking a customer sends from the booking form (a «حجز محتمل» until
// the clinic confirms its time). Confirmed appointments themselves live in «التقويم».
export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "الحجوزات | نظام تشغيل العيادة" },
      {
        name: "description",
        content: "الحجوزات المحتملة من نموذج الحجز: التواصل مع العميل عبر واتساب ثم تأكيد موعده.",
      },
      { property: "og:title", content: "الحجوزات | نظام تشغيل العيادة" },
      { property: "og:description", content: "الحجوزات المحتملة من نموذج الحجز وحالاتها." },
    ],
  }),
  component: BookingsPage,
});

function BookingsPage() {
  return (
    <AppShell
      title="الحجوزات"
      description="كل من طلب استكمال الحجز عبر واتساب: تواصل معه ثم أكّد موعده"
      section="appointments"
    >
      <BookingRequestsPanel />
    </AppShell>
  );
}
