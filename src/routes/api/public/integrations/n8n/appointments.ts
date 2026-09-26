import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { addMinutes, checkApiKey, getAdmin, json, logAutomation } from "@/lib/n8n.server";

const createSchema = z.object({
  idempotency_key: z.string().min(6),
  patient: z.object({
    full_name: z.string().min(2),
    phone: z.string().min(6),
    gender: z.enum(["male", "female"]).optional(),
    email: z.string().email().optional(),
  }),
  doctor_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  specialty_id: z.string().uuid().optional(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  notes: z.string().optional(),
  source: z.enum(["whatsapp", "website", "phone", "manual", "referral"]).optional(),
  conversation_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  appointment_id: z.string().uuid().optional(),
  appointment_number: z.string().optional(),
  status: z.enum([
    "pending",
    "confirmed",
    "checked_in",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
    "rescheduled",
  ]),
  notes: z.string().optional(),
});

export const Route = createFileRoute("/api/public/integrations/n8n/appointments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const raw = await request.json().catch(() => null);
        const parsed = createSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.issues }, 400);
        }
        const body = parsed.data;
        const admin = await getAdmin();

        // Idempotency: return the existing appointment instead of creating a duplicate.
        const { data: existing } = await admin
          .from("appointments")
          .select("id, appointment_number, status, appointment_date, start_time, end_time")
          .eq("idempotency_key", body.idempotency_key)
          .maybeSingle();
        if (existing) return json({ ok: true, duplicate: true, appointment: existing });

        const { data: normalized, error: phoneErr } = await admin.rpc("normalize_sa_phone", {
          p: body.patient.phone,
        });
        if (phoneErr) return json({ error: phoneErr.message }, 400);

        let patientId: string | undefined;
        const { data: foundPatient } = await admin
          .from("patients")
          .select("id")
          .eq("normalized_phone", normalized as string)
          .maybeSingle();

        if (foundPatient) {
          patientId = foundPatient.id;
          await admin
            .from("patients")
            .update({ last_contact_at: new Date().toISOString() })
            .eq("id", patientId);
        } else {
          const { data: created, error: insErr } = await admin
            .from("patients")
            .insert({
              full_name: body.patient.full_name,
              phone: body.patient.phone,
              normalized_phone: "",
              gender: body.patient.gender ?? null,
              email: body.patient.email ?? null,
              source: body.source ?? "whatsapp",
            })
            .select("id")
            .single();
          if (insErr || !created) return json({ error: insErr?.message ?? "patient_failed" }, 400);
          patientId = created.id;
        }

        let duration = body.duration_minutes ?? 30;
        let price: number | null = null;
        if (body.service_id) {
          const { data: service } = await admin
            .from("services")
            .select("duration_minutes, price, specialty_id")
            .eq("id", body.service_id)
            .maybeSingle();
          if (service) {
            duration = body.duration_minutes ?? service.duration_minutes ?? duration;
            price = service.price ?? null;
          }
        }

        const startTime = body.start_time.length === 5 ? `${body.start_time}:00` : body.start_time;
        const endTime = addMinutes(startTime, duration);

        const { data: appointment, error } = await admin
          .from("appointments")
          .insert({
            appointment_number: "",
            patient_id: patientId!,
            doctor_id: body.doctor_id ?? null,
            service_id: body.service_id ?? null,
            specialty_id: body.specialty_id ?? null,
            appointment_date: body.appointment_date,
            start_time: startTime,
            end_time: endTime,
            price,
            notes: body.notes ?? null,
            source: body.source ?? "whatsapp",
            conversation_id: body.conversation_id ?? null,
            idempotency_key: body.idempotency_key,
          })
          .select("id, appointment_number, status, appointment_date, start_time, end_time")
          .single();

        if (error) {
          await logAutomation(admin, {
            workflow_name: "n8n.appointments.create",
            event_type: "appointment.create",
            status: "failed",
            request_payload: body,
            error_message: error.message,
            patient_id: patientId ?? null,
          });
          return json({ error: error.message }, 409);
        }

        await logAutomation(admin, {
          workflow_name: "n8n.appointments.create",
          event_type: "appointment.create",
          status: "success",
          request_payload: body,
          response_payload: appointment,
          appointment_id: appointment.id,
          patient_id: patientId ?? null,
        });

        return json({ ok: true, duplicate: false, appointment });
      },

      PATCH: async ({ request }) => {
        const denied = checkApiKey(request);
        if (denied) return denied;

        const raw = await request.json().catch(() => null);
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.issues }, 400);
        }
        const { appointment_id, appointment_number, status, notes } = parsed.data;
        if (!appointment_id && !appointment_number) {
          return json({ error: "appointment_id or appointment_number required" }, 400);
        }

        const admin = await getAdmin();
        let query = admin
          .from("appointments")
          .update({
            status,
            ...(notes !== undefined ? { notes } : {}),
            ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
          })
          .select("id, appointment_number, status");
        query = appointment_id
          ? query.eq("id", appointment_id)
          : query.eq("appointment_number", appointment_number!);

        const { data, error } = await query.maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!data) return json({ error: "not_found" }, 404);

        await logAutomation(admin, {
          workflow_name: "n8n.appointments.update",
          event_type: `appointment.${status}`,
          status: "success",
          request_payload: parsed.data,
          response_payload: data,
          appointment_id: data.id,
        });

        return json({ ok: true, appointment: data });
      },
    },
  },
});
