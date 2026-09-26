# تكامل n8n / WhatsApp

كل النقاط تحت المسار `/api/public/integrations/n8n/` ومحميّة بمفتاح ثابت.

## المصادقة

أرسل المفتاح مع كل طلب بأحد الشكلين:

```
x-api-key: <N8N_API_KEY>
Authorization: Bearer <N8N_API_KEY>
```

بدون مفتاح صحيح يرجع `401 {"error":"unauthorized"}`.
المفتاح مخزّن كسرّ باسم `N8N_API_KEY` في الواجهة الخلفية.

## النقاط

### 1) التوفّر — `GET /availability`

Query: `doctor_id` (uuid, مطلوب)، `date` (YYYY-MM-DD, مطلوب)، `duration` (دقائق، افتراضي 30).

```json
{ "doctor_id": "...", "date": "2026-09-01", "duration": 30, "slots": ["09:00:00", "09:30:00"] }
```

### 2) المواعيد — `POST /appointments`

ينشئ المريض إن لم يكن موجودًا (مطابقة برقم الجوال بعد التوحيد `+9665…`) ثم ينشئ الموعد.

```json
{
  "idempotency_key": "wa-<message-id>",
  "patient": { "full_name": "أحمد", "phone": "0551234567", "gender": "male" },
  "doctor_id": "uuid",
  "service_id": "uuid",
  "appointment_date": "2026-09-01",
  "start_time": "09:30",
  "duration_minutes": 30,
  "source": "whatsapp",
  "notes": "..."
}
```

- تكرار نفس `idempotency_key` يرجع `{"ok":true,"duplicate":true,...}` دون إنشاء موعد جديد.
- تعارض الوقت أو الخروج عن ساعات عمل الطبيب يرجع `409` مع رسالة (`DOUBLE_BOOKING`, `OUTSIDE_WORKING_HOURS`, `DURING_BREAK`, `DOCTOR_NOT_WORKING`).
- مدة الموعد تُؤخذ من الخدمة إن لم تُرسل.

### 3) تحديث حالة موعد — `PATCH /appointments`

```json
{ "appointment_id": "uuid", "status": "confirmed", "notes": "..." }
```

يمكن استخدام `appointment_number` بدل `appointment_id`. الحالات: `pending, confirmed, checked_in, in_progress, completed, cancelled, no_show, rescheduled`.

### 4) الرسائل — `POST /messages`

يستقبل رسائل واتساب (واردة/صادرة)، ينشئ/يربط المحادثة والمريض ويحدّث آخر رسالة.

```json
{
  "external_conversation_id": "wa-966555...",
  "external_message_id": "wamid...",
  "phone": "0551234567",
  "full_name": "أحمد",
  "direction": "inbound",
  "sender_type": "patient",
  "message_type": "text",
  "content": "أبغى موعد بكرة"
}
```

`external_message_id` يمنع التكرار.

حقول اختيارية للتحويل إلى موظف: `request_human: true` و`handoff_reason: "..."` (انظر القسم 6).

الاستجابة تتضمن حالة المحادثة، ويجب على n8n فحص `conversation.bot_active` قبل تشغيل الذكاء الاصطناعي:

```json
{
  "ok": true,
  "duplicate": false,
  "message": { "id": "...", "conversation_id": "...", "created_at": "..." },
  "conversation": {
    "id": "uuid",
    "status": "human_support",
    "bot_active": false,
    "assigned_to": null,
    "handoff_reason": "أبي أكلم موظف",
    "handoff_requested_at": "2026-09-26T09:12:00Z"
  }
}
```

### 5) الأحداث الصادرة — `GET /events` و `POST /events`

- `GET /events?limit=50` يسحب الأحداث المعلّقة (`appointment.created`, `appointment.confirmed`, `patient.created` …).
- `POST /events` لتأكيد المعالجة:

```json
{ "event_ids": ["uuid"], "status": "delivered" }
```

أو `"status": "failed"` مع `error_message`.

### 6) التدخل البشري — `GET /handoff` و `POST /handoff`

عندما يطلب المريض التحدث مع موظف تنتقل المحادثة إلى قسم «التدخل البشري» في اللوحة
(`conversations.status = human_support`)، **ويجب أن يتوقف البوت عن الرد** حتى يعيدها الموظف.

تنتقل المحادثة إلى التدخل البشري بإحدى الطرق:

1. **الذكاء الاصطناعي يقرر:** أرسل `request_human: true` (مع `handoff_reason` اختياريًا) في `POST /messages`، أو استدعِ `POST /handoff`.
2. **طلب صريح من المريض:** المنصة تكتشف تلقائيًا الرسائل الواردة الصريحة مثل «أبي أكلم موظف» أو «موظف لو سمحت» أو «حوّلني لخدمة العملاء». الاكتشاف ضيق عمدًا، أما الشكاوى والمشاكل الأعم فيحوّلها الذكاء الاصطناعي بنفسه.
3. **الموظف يستلم المحادثة** من صفحة المحادثات أو من قسم التدخل البشري.

`POST /handoff` (مناسب كأداة Tool لوكيل الذكاء الاصطناعي):

```json
{ "external_conversation_id": "wa-966555...", "reason": "شكوى من فاتورة التأمين" }
```

يمكن استخدام `conversation_id` بدل `external_conversation_id`. الاستجابة:
`{ "ok": true, "queued": true, "conversation": { ..., "bot_active": false } }`، و`queued: false` إذا كانت المحادثة محوّلة مسبقًا.

`GET /handoff?external_conversation_id=wa-966555...` يعيد حالة المحادثة فقط (`bot_active`).

#### أحداث التدخل البشري (عبر `GET /events`)

| الحدث                            | متى                               | المطلوب من n8n                                                       |
| -------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `conversation.handoff_requested` | دخلت المحادثة قائمة الانتظار      | إيقاف البوت، واختياريًا إرسال «تم تحويلك لأحد موظفينا»               |
| `conversation.human_takeover`    | استلمها موظف (`assigned_to_name`) | اختياريًا: «معك الآن {assigned_to_name} من فريق العيادة»             |
| `message.send`                   | موظف كتب ردًا من اللوحة           | إرسال `payload.content` إلى `payload.whatsapp_number` ثم تأكيد الحدث |
| `conversation.ai_resume`         | أعاد الموظف المحادثة للبوت        | استئناف ردود الذكاء الاصطناعي                                        |

كل الأحداث تحمل: `conversation_id`، `external_conversation_id`، `bot_active`، `status`، `handoff_reason`،
`assigned_to`، `assigned_to_name`، `patient_id`، `patient_name`، `phone`، `whatsapp_number`.
ويضيف `message.send`: `message_id`، `content`، `sent_by_name`.

- تأكيد `message.send` عبر `POST /events` بحالة `delivered` يعلّم الرسالة «أُرسلت» في اللوحة، و`failed` يعلّمها «فشل الإرسال».
- **لا تُعد إرسال ردود الموظفين إلى `POST /messages`**، فهي محفوظة مسبقًا وإعادة إرسالها تكرّرها.
- ردود الموظف تصل عند سحب الأحداث التالي، لذا اجعل جدولة `GET /events` كل 10 إلى 15 ثانية لتجربة محادثة حيّة.

## نمط سير العمل في n8n

1. Webhook واتساب → `POST /messages`.
2. **IF** `conversation.bot_active = false` → توقّف (الموظف يرد من اللوحة).
3. عقدة AI تقرأ المحادثة → `GET /availability` → `POST /appointments`. إذا طلب المريض موظفًا أو احتاج تدخلًا بشريًا → `POST /handoff`.
4. جدولة كل 10 إلى 15 ثانية → `GET /events` → إرسال رسائل واتساب (بما فيها `message.send`) → `POST /events` للتأكيد.

كل استدعاء يُسجَّل في `automation_logs` ويظهر في صفحة «الأتمتة» داخل اللوحة.
