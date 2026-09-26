import { createFileRoute } from "@tanstack/react-router";
import { checkApiKey, getAdmin, json } from "@/lib/n8n.server";

export const Route = createFileRoute("/api/public/integrations/n8n/availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const doctorId = url.searchParams.get("doctor_id");
        const date = url.searchParams.get("date");
        const duration = Number(url.searchParams.get("duration") ?? "30");

        if (!doctorId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json({ error: "doctor_id and date (YYYY-MM-DD) are required" }, 400);
        }

        const admin = await getAdmin();
        const { data, error } = await admin.rpc("get_available_slots", {
          _doctor_id: doctorId,
          _date: date,
          _duration: Number.isFinite(duration) ? duration : 30,
        });
        if (error) return json({ error: error.message }, 400);

        return json({
          doctor_id: doctorId,
          date,
          duration,
          slots: (data ?? []).map((s) => s.slot_time),
        });
      },
    },
  },
});
