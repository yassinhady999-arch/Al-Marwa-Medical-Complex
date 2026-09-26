// Server-only: the "المساعد الذكي" (AI assistant) chat backend.
// Answers staff questions about live clinic data by giving Claude one
// read-only tool that queries Supabase, then grounding the reply in the
// tool's actual numbers — never inventing figures.
import Anthropic from "@anthropic-ai/sdk";
import type { Admin } from "@/lib/n8n.server";
import { STATUS_LABELS, type AppointmentStatus } from "@/lib/clinic";

const STATUS_VALUES = Object.keys(STATUS_LABELS) as AppointmentStatus[];

export type ChatMessage = { role: "user" | "assistant"; content: string };

let _client: Anthropic | undefined;
function getClient(): Anthropic | null {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

const STATS_TOOL: Anthropic.Tool = {
  name: "get_appointment_stats",
  description:
    "يرجع إحصاءات حقيقية من قاعدة بيانات العيادة: عدد المواعيد (إجمالي وبحسب كل حالة)، " +
    "إيراد المواعيد المكتملة (ر.س)، وإجمالي عدد المرضى المسجّلين. " +
    "استخدمه دائمًا قبل ذكر أي رقم — لا تخترع أرقامًا أبدًا.",
  input_schema: {
    type: "object",
    properties: {
      date_from: {
        type: "string",
        description:
          "تاريخ البداية بصيغة YYYY-MM-DD (بتوقيت الرياض). اتركه فارغًا لإحصاء كل الفترات.",
      },
      date_to: {
        type: "string",
        description:
          "تاريخ النهاية بصيغة YYYY-MM-DD (شامل). لسؤال عن يوم واحد اجعله مطابقًا لـ date_from.",
      },
      status: {
        type: "string",
        enum: STATUS_VALUES,
        description: "لتصفية العدّ على حالة واحدة فقط. اتركه فارغًا لإرجاع تفصيل كل الحالات.",
      },
    },
  },
};

type StatsArgs = { date_from?: string; date_to?: string; status?: AppointmentStatus };

async function runStatsTool(admin: Admin, args: StatsArgs) {
  let query = admin.from("appointments").select("status, price");
  if (args.date_from) query = query.gte("appointment_date", args.date_from);
  if (args.date_to) query = query.lte("appointment_date", args.date_to);
  if (args.status) query = query.eq("status", args.status);
  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data ?? [];
  const byStatus: Record<string, number> = {};
  for (const s of STATUS_VALUES) byStatus[s] = 0;
  let revenue = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status === "completed") revenue += Number(r.price ?? 0);
  }

  const { count: patientsTotal } = await admin
    .from("patients")
    .select("id", { count: "exact", head: true });

  return {
    date_from: args.date_from ?? "كل الفترات",
    date_to: args.date_to ?? "كل الفترات",
    status_filter: args.status ?? null,
    total_appointments: rows.length,
    by_status_count: byStatus,
    by_status_arabic_labels: STATUS_LABELS,
    revenue_completed_sar: revenue,
    total_patients_ever: patientsTotal ?? 0,
  };
}

function todayRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

function buildSystemPrompt(): string {
  return [
    "أنت المساعد الذكي الداخلي لنظام تشغيل عيادة طبية (ClinicFlow Hub). تتحدث مع طاقم العيادة فقط، لا مع المرضى.",
    `تاريخ اليوم بتوقيت الرياض: ${todayRiyadh()} (استخدمه لفهم "اليوم"، "الأسبوع"، "الشهر"، "أمس"، إلخ).`,
    "لديك أداة get_appointment_stats للحصول على أرقام حقيقية من قاعدة البيانات. استخدمها دائمًا قبل ذكر أي رقم — ممنوع تمامًا اختراع أو تقدير أي رقم من عندك.",
    "أجب دائمًا بالعربية، بجملة أو جملتين مباشرة وواضحة، بدون مقدمات طويلة. اذكر الرقم المطلوب بوضوح مع وحدته (موعد، ر.س، مريض).",
    "لو السؤال غامض بخصوص الفترة الزمنية، افترض «اليوم» كافتراض معقول.",
    "لو السؤال خارج نطاق بيانات العيادة (المواعيد، الحالات، الإيراد، المرضى)، وضّح بلطف أنك مخصص لأسئلة بيانات العيادة فقط.",
  ].join("\n");
}

const MAX_TOOL_ITERATIONS = 4;

export async function answerAssistantQuestion(
  admin: Admin,
  question: string,
  history: ChatMessage[],
): Promise<{ answer: string } | { error: string; status: number }> {
  const client = getClient();
  if (!client) return { error: "integration_not_configured", status: 503 };

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools: [STATS_TOOL],
        output_config: { effort: "low" },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return { error: "invalid_api_key", status: 503 };
      }
      if (err instanceof Anthropic.RateLimitError) {
        return { error: "rate_limited", status: 429 };
      }
      return { error: err instanceof Error ? err.message : "assistant_failed", status: 502 };
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content.find((b) => b.type === "text");
      return { answer: text && text.type === "text" ? text.text : "" };
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result =
        block.name === "get_appointment_stats"
          ? await runStatsTool(admin, block.input as StatsArgs)
          : { error: "unknown_tool" };
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { answer: "تعذّر إيجاد إجابة دقيقة الآن، حاول إعادة صياغة السؤال." };
}
