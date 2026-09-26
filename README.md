# ClinicFlow Hub

Build a Production-Ready Clinic Operations Dashboard

أريد منك بناء منصة ويب احترافية لإدارة وتشغيل العيادات الطبية.

هذه المنصة ليست SaaS كامل.

لا أريد:

Multi-Tenant Architecture

Subscription System

Billing System

SaaS Pricing

Organization Management

Multiple Companies

Complex Tenant Isolation

أنا أريد نسخة تشغيلية جاهزة لعيادة واحدة / مؤسسة طبية واحدة، تكون مبنية من البداية بحيث يمكن ربطها بسهولة مع:

WhatsApp

n8n

AI Chatbot

Supabase

المنصة نفسها ستكون الـ Management Dashboard والـ Operational System.

أما WhatsApp وAI Automation فسيكونان خارج المنصة ويتم تشغيلهما من خلال n8n.

01 — فكرة النظام

النظام عبارة عن منصة مركزية لإدارة عيادة طبية.

المريض يتواصل مع العيادة عبر WhatsApp.

مثال:

المريض:

"السلام عليكم، أريد حجز موعد مع دكتور أسنان."

n8n يستقبل الرسالة.

ثم AI Chatbot يتعامل مع المريض.

يقوم بجمع المعلومات المطلوبة مثل:

اسم المريض

رقم الهاتف

التخصص المطلوب

الطبيب المطلوب إن وجد

نوع الخدمة

سبب الزيارة

اليوم المناسب

الوقت المناسب

أي معلومات إضافية مطلوبة

بعد ذلك:

n8n يستعلم من قاعدة بيانات Supabase عن المواعيد المتاحة.

ثم يعرض للمريض المواعيد المناسبة.

المريض يختار الموعد.

n8n ينشئ Appointment حقيقي داخل Supabase.

بعد ذلك يظهر الموعد مباشرة داخل Dashboard.

02 — Architecture

الـ Architecture الأساسية يجب أن تكون:

Patient

↓

WhatsApp

↓

n8n

↓

AI Chatbot

↓

Integration Layer

↓

Supabase

↓

Clinic Dashboard

والعكس:

Clinic Dashboard

↓

Supabase

↓

Integration Event

↓

n8n

↓

WhatsApp

↓

Patient

03 — مسؤولية كل جزء

WhatsApp

قناة التواصل مع المرضى.

AI

مسؤول عن المحادثة وجمع البيانات والإجابة على الأسئلة البسيطة.

n8n

مسؤول عن:

استقبال رسائل WhatsApp

تشغيل AI

إدارة Conversation Flow

البحث عن المرضى

إنشاء المرضى

البحث عن المواعيد

إنشاء الحجوزات

إرسال التأكيدات

إرسال التذكيرات

تحديث البيانات

تشغيل Automations

Supabase

هي مصدر البيانات الأساسي.

تخزن:

Patients

Conversations

Messages

Doctors

Specialties

Services

Appointments

Medical Notes الأساسية التي يسمح بها النظام

Analytics data

Automation Events

Dashboard

مسؤولة عن:

إدارة المواعيد

إدارة المرضى

إدارة الأطباء

إدارة الخدمات

إدارة المحادثات

متابعة التشغيل

الإحصائيات

إعدادات العيادة

04 — أهم قاعدة

لا تجعل n8n هو قاعدة البيانات.

ولا تجعل WhatsApp هو قاعدة البيانات.

ولا تجعل Frontend يخزن البيانات محليًا.

Supabase هي:

SOURCE OF TRUTH

أي أن جميع البيانات المهمة يجب أن تكون موجودة في Supabase.

05 — التقنية

استخدم:

React

TypeScript

Tailwind CSS

shadcn/ui أو UI Components احترافية

Supabase

PostgreSQL

Supabase Realtime

Recharts أو مكتبة Charts مناسبة

Lucide Icons

06 — اللغة

المنصة موجهة للعيادات في السعودية.

اللغة الأساسية:

العربية

Direction:

RTL

Currency:

SAR

Timezone:

Asia/Riyadh

يجب أن يكون التصميم عربيًا من البداية.

لكن لا تجعل النصوص موزعة Hard-coded في كل Components.

جهز Structure يسمح بإضافة English مستقبلًا.

07 — تصميم الواجهة

أريد تصميمًا:

Modern

Premium

Clean

Professional

Minimal

Medical

Trustworthy

لا أريد تصميمًا تقليديًا قديمًا للـ Admin Dashboards.

لا تستخدم ألوانًا صارخة.

اجعل التصميم مناسبًا للقطاع الطبي.

الـ Dashboard يجب أن يشعر المستخدم أنه يستخدم نظامًا احترافيًا حقيقيًا لعيادة حديثة.

08 — Main Navigation

Sidebar:

الرئيسية

المواعيد

التقويم

المرضى

المحادثات

الأطباء

التخصصات

الخدمات

الإحصائيات

الأتمتة

الإعدادات

09 — Dashboard الرئيسية

الصفحة الرئيسية يجب أن تعطي الإدارة نظرة فورية على حالة العيادة.

اعرض:

Today's Appointments

عدد المواعيد اليوم.

Upcoming Appointments

المواعيد القادمة.

New Patients

عدد المرضى الجدد.

Completed Appointments

المواعيد المكتملة.

Cancelled Appointments

المواعيد الملغاة.

WhatsApp Conversations

عدد المحادثات.

AI Resolution Rate

نسبة المحادثات التي تعامل معها AI بدون تدخل بشري.

Appointment Conversion

عدد المواعيد الناتجة من محادثات WhatsApp.

10 — Dashboard Charts

أريد Charts حقيقية تعتمد على Supabase.

Chart 1

المواعيد خلال:

7 أيام

30 يوم

90 يوم

12 شهر

Chart 2

Appointments by Status

Confirmed

Pending

Completed

Cancelled

No Show

Chart 3

Appointments by Source

WhatsApp

Website

Phone

Manual

Chart 4

New Patients

عدد المرضى الجدد يوميًا.

Chart 5

WhatsApp Conversations

Inbound

Outbound

AI

Human

Chart 6

Appointments by Doctor

عدد المواعيد لكل طبيب.

11 — Today's Schedule

اعرض جدول اليوم.

مثلاً:

08:00 محمد أحمد د. أحمد أسنان كشف

09:00 سارة محمد د. خالد جلدية متابعة

وهكذا.

كل Appointment يجب أن يحتوي على:

اسم المريض

الطبيب

التخصص

الخدمة

الوقت

الحالة

المصدر

12 — Appointments

أنشئ صفحة:

/appointments

تحتوي على جدول كامل للمواعيد.

Columns:

Appointment ID

المريض

رقم الهاتف

الطبيب

التخصص

الخدمة

التاريخ

الوقت

الحالة

المصدر

Created At

Actions

13 — Appointment Filters

أضف:

Search

Date

Date Range

Doctor

Specialty

Service

Status

Source

14 — Appointment Status

الحالات:

pending

confirmed

checked_in

in_progress

completed

cancelled

no_show

rescheduled

15 — Appointment Details

عند الضغط على الموعد:

افتح Appointment Details.

اعرض:

Appointment Number

Status

Patient

Doctor

Specialty

Service

Date

Time

Duration

Source

Notes

Created At

Updated At

16 — Appointment Timeline

اعرض Timeline.

مثال:

Appointment Created

↓

Appointment Confirmed

↓

Reminder Sent

↓

Patient Checked In

↓

Appointment Started

↓

Appointment Completed

كل تغيير يجب تسجيله.

17 — Appointment Status History

أنشئ جدول:

appointment_status_history

Fields:

id

appointment_id

old_status

new_status

changed_by

changed_at

notes

18 — Appointment Creation

يجب أن يستطيع الموظف إنشاء Appointment يدويًا.

Flow:

Select Patient

أو

Create New Patient

ثم:

Specialty

Doctor

Service

Date

Time

Notes

Source

ثم:

Create Appointment

ويتم الحفظ في Supabase.

19 — Calendar

أنشئ Calendar حقيقي.

Views:

Day

Week

Month

كل موعد يظهر داخل Calendar.

يمكن الضغط على الموعد وفتح التفاصيل.

يمكن تعديل:

Date

Time

Doctor

Status

20 — Doctor Availability

جهز النظام ليكون قادرًا على معرفة مواعيد الطبيب.

كل طبيب له:

Working Days

Working Hours

Breaks

Appointments

Availability

21 — Availability API

يجب تجهيز API يستطيع n8n استخدامه.

مثال:

GET

/api/integrations/n8n/availability

Parameters:

doctor_id

service_id

date

specialty_id

ويعيد:

Available Slots

22 — Prevent Double Booking

هذه نقطة مهمة جدًا.

لا تسمح بإنشاء Appointment لنفس الطبيب في نفس الوقت.

قبل إنشاء الموعد:

تحقق من:

Doctor Availability

Existing Appointments

Working Hours

Appointment Duration

إذا كان الوقت غير متاح:

Return clear error.

23 — Patients

أنشئ:

/patients

Table:

Patient ID

Name

Phone

WhatsApp

Gender

Date of Birth

City

Last Appointment

Total Appointments

Source

Created At

24 — Patient Profile

عند فتح المريض:

اعرض:

Personal Information

Full Name

Phone

WhatsApp

Email

Gender

Date of Birth

City

Address

Appointment History

كل مواعيد المريض.

Conversation History

كل محادثاته عبر WhatsApp.

Patient Timeline

مثلاً:

Patient Created

Appointment Created

Appointment Confirmed

Appointment Completed

Notes

ملاحظات إدارية مسموح بها.

25 — Patient Database

قاعدة المرضى يجب أن تكون CRM بسيطة.

يجب أن نعرف:

من هو المريض؟

متى تواصل أول مرة؟

كم مرة حجز؟

آخر موعد؟

ما الطبيب الذي زاره؟

ما الخدمات التي حجزها؟

هل هو عميل جديد أم متكرر؟

26 — Patient Deduplication

عند وصول رسالة من WhatsApp:

n8n يبحث باستخدام:

normalized_phone

إذا وجد المريض:

Update existing patient.

إذا لم يوجد:

Create new patient.

لا تنشئ Patient جديدًا لكل رسالة.

27 — Phone Normalization

أضف:

normalized_phone

يجب دعم أرقام السعودية.

مثلاً:

+9665XXXXXXXX

يجب تخزين الرقم بطريقة موحدة.

ولا تعتمد على:

05XXXXXXXX

و

+9665XXXXXXXX

كأنهما شخصان مختلفان.

28 — Doctors

أنشئ:

/doctors

اعرض:

Name

Specialty

Phone

Status

Working Days

Working Hours

Appointments Today

Total Appointments

29 — Doctor Profile

عند فتح الطبيب:

اعرض:

Name

Photo

Specialty

Description

Phone

Working Hours

Weekly Schedule

Upcoming Appointments

Completed Appointments

30 — Doctor Schedule

يجب أن يستطيع Admin تحديد:

Saturday

Sunday

Monday

Tuesday

Wednesday

Thursday

Friday

ولكل يوم:

Enabled

Start Time

End Time

Break Start

Break End

31 — Specialties

أنشئ:

/specialties

أمثلة:

Dentistry

Dermatology

Pediatrics

Internal Medicine

Orthopedics

General Medicine

Ophthalmology

يمكن للـ Admin:

Create

Edit

Deactivate

32 — Services

أنشئ:

/services

Fields:

Name

Description

Specialty

Duration

Price

Is Active

33 — Service Examples

مثلاً:

كشف أسنان

تنظيف أسنان

كشف جلدية

استشارة

متابعة

فحص

جلسة علاج

لكن لا تجعل هذه البيانات ثابتة.

Admin يستطيع تعديلها.

34 — Conversations

أنشئ:

/conversations

واجهة تشبه WhatsApp Inbox.

Left Side:

Conversation List

Right Side:

Conversation Details

اعرض:

Patient

Phone

Last Message

Unread

Status

Assigned Staff

Appointment Status

35 — Messages

أنشئ جدول:

messages

Fields:

id

conversation_id

patient_id

direction

sender_type

message_type

content

external_message_id

status

metadata

created_at

36 — Message Types

دعم:

text

image

audio

document

location

interactive

37 — Message Direction

inbound

outbound

38 — Sender Type

patient

ai

human

system

39 — Conversation Status

active

waiting_patient

human_support

appointment_created

closed

40 — AI / Human Handover

يجب أن يستطيع الموظف الضغط:

"استلام المحادثة"

عندها:

conversation.status = human_support

ويتم إنشاء Event:

human_takeover

ويجب أن يعرف n8n أن AI لا يجب أن يستمر في الرد بشكل تلقائي على هذه المحادثة.

41 — Return to AI

أضف:

"إعادة إلى AI"

عند الضغط:

conversation.status = active

Event:

ai_resume

42 — WhatsApp Architecture

لا تبني WhatsApp API داخل Frontend.

WhatsApp سيتم التعامل معه عن طريق:

n8n

المنصة فقط تحفظ:

Messages

Conversations

Patients

Appointments

Integration Events

43 — n8n Integration

يجب أن تكون المنصة جاهزة للربط مع n8n.

جهز Integration Layer.

أمثلة:

POST

/api/integrations/n8n/patient

POST

/api/integrations/n8n/conversation

POST

/api/integrations/n8n/message

POST

/api/integrations/n8n/appointment

POST

/api/integrations/n8n/appointment/update

GET

/api/integrations/n8n/availability

POST

/api/integrations/n8n/event

44 — Create Patient API

Endpoint:

POST

/api/integrations/n8n/patient

Input:

name

phone

whatsapp_number

email

gender

date_of_birth

city

address

source

Output:

success

patient_id

45 — Find Patient API

Endpoint:

GET

/api/integrations/n8n/patient

Parameters:

phone

يجب أن يبحث عن:

organization / clinic

normalized_phone

ويرجع بيانات المريض.

46 — Create Conversation API

POST:

/api/integrations/n8n/conversation

Fields:

patient_id

external_conversation_id

channel

status

47 — Save Message API

POST:

/api/integrations/n8n/message

Fields:

conversation_id

patient_id

direction

sender_type

message_type

content

external_message_id

status

metadata

48 — Create Appointment API

POST:

/api/integrations/n8n/appointment

Fields:

patient_id

conversation_id

doctor_id

specialty_id

service_id

appointment_date

start_time

end_time

source

notes

49 — Update Appointment API

POST:

/api/integrations/n8n/appointment/update

Fields:

appointment_id

status

doctor_id

appointment_date

start_time

end_time

notes

50 — Appointment Availability API

يجب أن يستطيع n8n إرسال:

doctor_id

specialty_id

service_id

date

ثم يحصل على:

available slots

مثلاً:

09:00

09:30

10:30

12:00

17:00

51 — Integration Events

أنشئ جدول:

integration_events

Fields:

id

event_type

entity_type

entity_id

payload

status

attempts

processed_at

error_message

created_at

52 — Events

دعم Events:

patient.created

patient.updated

conversation.created

message.received

message.sent

appointment.created

appointment.confirmed

appointment.cancelled

appointment.rescheduled

appointment.completed

appointment.no_show

human_takeover

ai_resume

53 — Automation Logs

أنشئ:

automation_logs

Fields:

id

workflow_name

event_type

status

appointment_id

patient_id

execution_id

request_payload

response_payload

error_message

created_at

54 — Automation Page

أنشئ:

/automation

اعرض:

n8n Status

WhatsApp Status

Last Successful Event

Last Failed Event

Total Events

Failed Events

55 — Automation Logs UI

Table:

Workflow

Event

Patient

Appointment

Status

Execution ID

Created At

56 — Event Details

عند فتح Event:

اعرض:

Request Payload

Response Payload

Error Message

Execution ID

Timestamp

57 — Retry Failed Event

إذا فشل Event:

أظهر:

Retry

يمكن الضغط لإعادة محاولة إرسال Event.

58 — Idempotency

هذا مهم جدًا.

لا تسمح بتكرار:

Patient

Message

Conversation

Appointment

بسبب إعادة إرسال Webhook.

استخدم:

external_message_id

external_conversation_id

idempotency_key

وUnique Constraints المناسبة.

59 — Realtime

استخدم Supabase Realtime.

إذا قام n8n بإنشاء Appointment:

Dashboard يجب أن تتحدث تلقائيًا.

إذا وصلت WhatsApp Message:

Conversation Inbox تتحدث تلقائيًا.

إذا تغير Appointment Status:

يظهر التغيير فورًا.

60 — Analytics

أنشئ:

/analytics

مع Date Range:

Today

Yesterday

Last 7 Days

Last 30 Days

This Month

Last Month

Last 90 Days

Custom Range

61 — Appointment Analytics

اعرض:

Total Appointments

Confirmed

Completed

Cancelled

No Show

Rescheduled

Completion Rate

Cancellation Rate

No Show Rate

62 — Patient Analytics

اعرض:

New Patients

Returning Patients

Total Patients

Patients by Source

Patients by City

Average Appointments per Patient

63 — WhatsApp Analytics

اعرض:

Total Conversations

Inbound Messages

Outbound Messages

AI Conversations

Human Conversations

AI Resolution Rate

Human Handover Rate

Average Response Time

Appointments Generated

WhatsApp Conversion Rate

64 — Doctor Analytics

اعرض:

Appointments per Doctor

Completed per Doctor

Cancelled per Doctor

No Show per Doctor

Doctor Utilization

65 — Service Analytics

اعرض:

Most Requested Services

Appointments by Service

Revenue by Service

Average Appointment Value

66 — Revenue Preparation

جهز النظام لتسجيل:

price

estimated_price

final_price

لكن لا تبنِ Payment Gateway الآن.

الهدف هو أن تكون البيانات جاهزة مستقبلًا.

67 — Appointment Source

كل Appointment يجب أن يحتوي على:

source

Possible:

whatsapp

website

phone

manual

referral

68 — Patient Source

Patient source:

whatsapp

website

phone

manual

referral

69 — Medical Data Boundary

هذا النظام في النسخة الأولى يجب أن يركز على:

Appointments

Patients

Doctors

Services

Communications

Operations

Analytics

لا تبنِ نظام Medical Records كامل أو تشخيص طبي أو وصفات طبية.

إذا أضفت Notes، اجعلها Administrative / operational notes وليست بديلًا عن نظام السجل الطبي الإلكتروني.

70 — Notifications

جهز Events لـ:

Appointment Created

Appointment Confirmed

Appointment Rescheduled

Appointment Cancelled

Appointment Reminder

Appointment Completed

لكن إرسال WhatsApp نفسه يكون عبر n8n.

Dashboard تقوم فقط بإنشاء Event.

71 — Reminder Architecture

جهز النظام بحيث يمكن لاحقًا لـ n8n تنفيذ:

24 ساعة قبل الموعد

2 ساعة قبل الموعد

لكن لا تجعل Scheduler داخل Frontend.

n8n سيكون مسؤولًا عن Automation.

72 — Operational Alerts

Dashboard يجب أن تعرض Alerts مثل:

موعد بدون طبيب

موعد قريب بدون تأكيد

موعد تم إلغاؤه

فشل n8n Event

WhatsApp disconnected

Doctor unavailable

Double booking attempt

73 — Notification Center

أنشئ Notification Center.

أمثلة:

"موعد جديد من WhatsApp"

"تم تأكيد موعد"

"فشل إرسال Automation Event"

"المريض محمد لديه موعد بعد ساعتين"

74 — Search

Global Search في:

Patients

Appointments

Doctors

Conversations

Services

ابحث باستخدام:

Name

Phone

Appointment Number

Message Content

75 — Loading States

استخدم:

Skeleton

Loading

Empty States

Error States

Retry

76 — Error Handling

لا تعرض أخطاء تقنية للمستخدم.

بدل:

PostgrestException

اعرض:

"حدث خطأ أثناء تحميل البيانات، حاول مرة أخرى."

لكن احتفظ بالتفاصيل في Logs.

77 — Security

استخدم:

Supabase Auth

Role-based permissions

RLS إذا كان هناك مستخدمون متعددون داخل نفس العيادة.

لا تستخدم Service Role Key داخل Frontend.

لا تضع:

API Keys

WhatsApp Tokens

n8n Secrets

داخل Frontend.

78 — Roles

بما أن النظام لعيادة واحدة، لا نحتاج Multi-Tenant.

لكن نحتاج Roles:

Owner

Admin

Receptionist

Doctor

Viewer

79 — Permissions

Owner:

كل شيء.

Admin:

إدارة النظام.

Receptionist:

Patients

Appointments

Conversations

Calendar

Doctor schedules

Doctor:

مواعيده ومرضاه المرتبطون بالمواعيد.

Viewer:

قراءة فقط.

80 — Database Schema

أنشئ Database حقيقية.

clinic_settings

Fields:

id

clinic_name

logo_url

phone

email

address

city

timezone

currency

created_at

updated_at

profiles

Fields:

id

full_name

email

phone

role

avatar_url

is_active

created_at

updated_at

patients

Fields:

id

full_name

phone

normalized_phone

whatsapp_number

email

gender

date_of_birth

city

district

address

source

notes

first_contact_at

last_contact_at

created_at

updated_at

doctors

Fields:

id

name

phone

email

specialty_id

bio

avatar_url

status

created_at

updated_at

specialties

Fields:

id

name

description

is_active

created_at

updated_at

services

Fields:

id

name

description

specialty_id

duration_minutes

price

is_active

created_at

updated_at

doctor_schedules

Fields:

id

doctor_id

day_of_week

start_time

end_time

break_start

break_end

is_active

created_at

updated_at

appointments

Fields:

id

appointment_number

patient_id

doctor_id

specialty_id

service_id

conversation_id

appointment_date

start_time

end_time

status

source

price

notes

created_at

updated_at

appointment_status_history

Fields:

id

appointment_id

old_status

new_status

changed_by

notes

created_at

conversations

Fields:

id

patient_id

external_conversation_id

channel

status

assigned_to

started_at

last_message_at

created_at

updated_at

messages

Fields:

id

conversation_id

patient_id

direction

sender_type

message_type

content

external_message_id

status

metadata

created_at

integration_events

Fields:

id

event_type

entity_type

entity_id

payload

status

attempts

processed_at

error_message

created_at

automation_logs

Fields:

id

workflow_name

event_type

status

appointment_id

patient_id

execution_id

request_payload

response_payload

error_message

created_at

notifications

Fields:

id

type

title

message

entity_type

entity_id

is_read

created_at

audit_logs

Fields:

id

user_id

action

entity_type

entity_id

old_data

new_data

created_at

81 — Database Relationships

Patient

↓

Appointments

↓

Doctor

↓

Specialty

↓

Service

Patient

↓

Conversation

↓

Messages

Appointment

↓

Status History

Integration Event

↓

Automation Log

82 — Database Indexes

أنشئ Indexes على:

normalized_phone

phone

appointment_date

doctor_id

patient_id

status

conversation_id

external_message_id

external_conversation_id

created_at

83 — Dashboard Realtime

Realtime subscriptions يجب أن تشمل:

appointments

messages

conversations

notifications

integration_events

84 — Clinic Settings

صفحة:

/settings

تحتوي على:

Clinic Information

Working Hours

Doctors

Services

WhatsApp Integration

n8n Integration

System Status

85 — Working Hours

أضف:

Saturday

Sunday

Monday

Tuesday

Wednesday

Thursday

Friday

كل يوم:

Enabled

Start

End

86 — Integration Settings

صفحة:

/settings/integrations

اعرض:

n8n Connection

Webhook Status

WhatsApp Status

Supabase Status

Last Event

87 — Health Check

أضف صفحة:

/settings/system

تعرض:

Database

Realtime

n8n

WhatsApp

Integration API

الحالة:

Connected

Disconnected

Warning

88 — Onboarding

لا أريد SaaS onboarding.

فقط Setup بسيط للعيادة عند أول تشغيل.

مثلاً:

Clinic Name

Logo

Phone

City

Working Hours

Doctors

Services

ثم Dashboard.

89 — No SaaS

مرة أخرى:

لا تبني:

Subscriptions

Plans

Billing

Tenants

Organizations

Usage Limits

SaaS Pricing

Multi-company switching

هذه المنصة هي نسخة تشغيلية لعيادة واحدة.

90 — No Fake Backend

لا تستخدم:

Mock API

Fake Database

LocalStorage

Static Analytics

Hardcoded Appointments

Hardcoded Patients

البيانات يجب أن تأتي من Supabase.

91 — API Documentation

أنشئ Documentation واضحة للـ Integration API.

يجب أن أعرف:

Endpoint

Method

Headers

Authentication

Request

Response

Errors

Example

92 — Authentication

استخدم Supabase Auth.

Login

Logout

Forgot Password

Session Persistence

Protected Routes

93 — Protected Routes

لا يستطيع المستخدم فتح Dashboard بدون تسجيل دخول.

94 — API Security

أي Endpoint خاص بـ n8n يجب حمايته باستخدام:

API Key

أو

Webhook Secret

ولا تسمح بالوصول المجهول.

95 — Validation

استخدم Form Validation.

خصوصًا:

Phone

Date

Time

Doctor

Service

Appointment

96 — Appointment Number

ولّد رقمًا readable.

مثلاً:

APT-26-000001

97 — Appointment Conflict Logic

قبل إنشاء Appointment:

تحقق أن الطبيب يعمل في هذا اليوم.

تحقق أن الوقت داخل ساعات العمل.

تحقق من Break.

تحقق من عدم وجود Appointment متعارض.

إذا كان الوقت متاحًا، أنشئ Appointment.

إذا غير متاح، Return error.

98 — Patient Booking Flow

الـ n8n يجب أن يستطيع تنفيذ:

Find Patient

↓

Find Specialty

↓

Find Doctor

↓

Find Service

↓

Check Availability

↓

Return Available Slots

↓

Patient Selects Slot

↓

Create Appointment

↓

Send Confirmation

99 — WhatsApp Conversation Flow Example

المريض:

"أريد حجز موعد أسنان."

n8n:

يبحث عن Patient.

إذا غير موجود:

Create Patient.

ثم:

حدد Specialty = Dentistry.

ثم يسأل عن الطبيب إذا كان مطلوبًا.

ثم يعرض الخدمات.

ثم يستعلم عن Availability.

ثم يعرض المواعيد.

المريض يختار.

n8n:

Create Appointment.

Supabase:

Save Appointment.

Dashboard:

Realtime update.

ثم:

n8n sends confirmation.

100 — Confirmation

بعد إنشاء الموعد:

Appointment Status:

confirmed

ويتم إنشاء Integration Event:

appointment.confirmed

حتى يستطيع n8n إرسال رسالة WhatsApp للمريض.

101 — Reschedule

إذا قام الموظف بتغيير موعد:

Update Appointment.

Create Event:

appointment.rescheduled

ثم n8n يمكنه إرسال رسالة للمريض.

102 — Cancellation

إذا ألغى الموظف الموعد:

status = cancelled

Create Event:

appointment.cancelled

103 — Completion

بعد انتهاء الموعد:

status = completed

يتم تسجيل:

completion time

وأي Notes تشغيلية.

104 — No Show

إذا لم يحضر المريض:

status = no_show

يظهر في Analytics.

105 — AI Analytics

أريد معرفة:

كم محادثة بدأها المرضى؟

كم محادثة أكملها AI؟

كم محادثة تحولت إلى موظف؟

كم Appointment تم إنشاؤه من WhatsApp؟

ما نسبة التحويل؟

106 — Business KPIs

Dashboard يجب أن تعرض KPIs:

Appointments

New Patients

Returning Patients

WhatsApp Leads

WhatsApp Conversion

AI Resolution

Human Handover

Cancellation Rate

No Show Rate

Doctor Utilization

107 — Performance

استخدم:

Pagination

Debounced Search

Database Indexes

Server-side filtering

Efficient Queries

لا تسحب آلاف الرسائل دفعة واحدة.

108 — Responsive

Desktop

Tablet

Mobile

يجب أن تعمل المنصة بشكل ممتاز على كل المقاسات.

109 — Mobile

على Mobile:

Sidebar تتحول إلى Drawer.

Tables تصبح Cards أو Horizontal Scroll مناسب.

Calendar يكون usable.

Conversation UI تكون مريحة.

110 — Dark Mode

أضف:

Light Mode

Dark Mode

مع حفظ preference.

111 — Component Architecture

أنشئ Components قابلة لإعادة الاستخدام:

StatCard

AppointmentTable

AppointmentStatusBadge

PatientTable

PatientCard

DoctorCard

ServiceCard

ConversationList

MessageBubble

Calendar

DateRangePicker

FilterBar

SearchInput

NotificationCenter

AutomationStatus

AnalyticsChart

112 — Code Organization

نظم المشروع بشكل واضح:

src/

components/

pages/

layouts/

hooks/

lib/

services/

integrations/

types/

utils/

constants/

supabase/

113 — TypeScript

استخدم TypeScript بشكل كامل.

أنشئ Types:

Patient

Doctor

Specialty

Service

Appointment

Conversation

Message

IntegrationEvent

AutomationLog

Notification

114 — No unnecessary complexity

لا تبنِ Features غير مطلوبة.

ركز على:

Patients

Appointments

Doctors

Services

Conversations

WhatsApp Integration

n8n Integration

Analytics

Dashboard

115 — Future Ready

Architecture يجب أن تسمح مستقبلًا بإضافة:

Online Payment

Patient Portal

Doctor Portal

Google Calendar

SMS

Email

Voice AI

Website Booking Widget

Mobile App

Invoices

Subscriptions

لكن لا تبنِ هذه الأشياء الآن.

116 — Testing

اختبر:

Login

Create Patient

Find Patient by Phone

Create Conversation

Save Message

Create Appointment

Check Availability

Prevent Double Booking

Update Appointment

Reschedule

Cancel

Complete

Realtime Update

Create Integration Event

n8n Event

Duplicate Event

Role Permissions

117 — Critical End-to-End Test

أريد أن يكون هذا السيناريو قابلًا للتنفيذ:

Patient sends WhatsApp message.

↓

n8n receives message.

↓

Find Patient.

↓

Create Patient if needed.

↓

Create Conversation.

↓

Save Message.

↓

AI handles conversation.

↓

n8n asks Supabase for available appointment slots.

↓

Patient selects slot.

↓

n8n creates Appointment.

↓

Supabase stores Appointment.

↓

Dashboard receives Appointment through Realtime.

↓

Appointment appears in:

Dashboard

Appointments

Calendar

Patient Profile

Analytics

↓

Receptionist assigns / confirms appointment if needed.

↓

Integration Event is created.

↓

n8n receives Event.

↓

n8n sends WhatsApp confirmation.

118 — Critical Architecture Rule

لا تجعل Frontend يتعامل مع WhatsApp مباشرة.

لا تجعل Frontend يتعامل مع AI مباشرة.

لا تجعل n8n هو Database.

لا تجعل Supabase مسؤولًا عن AI.

التقسيم:

WhatsApp = Communication

AI = Intelligence

n8n = Automation

Supabase = Database / Source of Truth

Dashboard = Management

Analytics = Business Intelligence

119 — Final UI Requirement

أريد الواجهة النهائية أن تكون جاهزة للاستخدام الحقيقي.

لا أريد:

"Coming Soon"

ولا:

"TODO"

ولا:

Fake Data

ولا:

Empty prototype

إلا في الأماكن التي تحتاج Credentials خارجية مثل WhatsApp أو n8n.

في هذه الحالة:

ابنِ Integration Layer كاملة.

120 — Final Deliverables

في نهاية المشروع يجب أن يكون لدي:

Complete Clinic Dashboard.

Supabase Database.

Database Relationships.

Supabase Auth.

Role Permissions.

Patients Management.

Doctors Management.

Specialties Management.

Services Management.

Appointments Management.

Calendar.

Conversations.

Messages.

Analytics.

Notifications.

Automation Logs.

Integration Events.

n8n-ready API.

Availability API.

Realtime.

Security.

Validation.

Error Handling.

Responsive UI.

Dark Mode.

API Documentation.

121 — Build Order

نفذ المشروع بهذا الترتيب:

PHASE 1

Database Architecture

PHASE 2

Supabase Auth

PHASE 3

Patients

PHASE 4

Doctors

PHASE 5

Specialties

PHASE 6

Services

PHASE 7

Appointments

PHASE 8

Calendar

PHASE 9

Conversations

PHASE 10

Messages

PHASE 11

Dashboard

PHASE 12

Analytics

PHASE 13

Integration Events

PHASE 14

n8n API Layer

PHASE 15

Realtime

PHASE 16

Security

PHASE 17

Testing

PHASE 18

UI Polish

122 — Final Objective

الهدف من النظام:

أن يكون لدى العيادة نظام مركزي يرى فيه الموظف كل شيء يحدث من WhatsApp بدون الحاجة لفتح n8n أو التعامل مع قاعدة البيانات مباشرة.

الموظف يرى:

من تواصل؟

من هو المريض؟

ماذا يريد؟

هل حجز؟

مع أي طبيب؟

متى الموعد؟

ما حالة الموعد؟

هل حضر؟

هل انتهى الموعد؟

وكم عدد الحجوزات؟

وكم عدد المرضى؟

وكم محادثة تعامل معها AI؟

وكم محادثة احتاجت تدخلًا بشريًا؟

وكم حجز جاء من WhatsApp؟

123 — MOST IMPORTANT REQUIREMENT

لا تبني مجرد Dashboard UI.

ابنِ نظامًا حقيقيًا يعتمد على:

Supabase

Real Database

Real CRUD

Real Authentication

Real Realtime

Real Analytics Queries

Real API Contracts

Real Integration Events

Real n8n Integration Architecture

بحيث بعد الانتهاء أستطيع أخذ بيانات الـ API والـ Database Structure وربط n8n وWhatsApp بها مباشرة.

إذا كانت بعض أجزاء التكامل الخارجية تحتاج API Keys أو Credentials غير متوفرة، لا تحاول اختراعها.

بدلًا من ذلك، أنشئ Integration Layer كاملة ووضح Environment Variables المطلوبة.

ابدأ التنفيذ من Database ثم Backend Architecture ثم Frontend.

النتيجة النهائية يجب أن تكون منصة تشغيل حقيقية لعيادة واحدة، جاهزة للربط مع n8n وWhatsApp وSupabase.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/76866e95-3b26-4f36-8e04-67625161b4db).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
