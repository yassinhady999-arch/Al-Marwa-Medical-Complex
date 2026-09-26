import {
  Globe,
  MessageCircle,
  Phone,
  PenLine,
  Users,
  Clock,
  BadgeCheck,
  LogIn,
  Stethoscope,
  CheckCircle2,
  XCircle,
  UserX,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TONE_DOT,
  TONE_SOFT,
  STATUS_META,
  SOURCE_META,
  CONVERSATION_STATUS_META,
  type Tone,
  type AppointmentStatus,
  type BookingSource,
  type ConversationStatus,
} from "@/lib/clinic";

/** Booking channel, shown by icon + neutral text — never color — so it can
 *  never be mistaken for the color-coded StatusBadge sitting next to it. */
const SOURCE_ICONS: Record<BookingSource, React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  website: Globe,
  phone: Phone,
  manual: PenLine,
  referral: Users,
};

/** Each status gets its own icon shape (not just a dot) so it reads even
 *  without color — pairs with the tone from STATUS_META. */
const STATUS_ICONS: Record<AppointmentStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  confirmed: BadgeCheck,
  checked_in: LogIn,
  in_progress: Stethoscope,
  completed: CheckCircle2,
  cancelled: XCircle,
  no_show: UserX,
  rescheduled: CalendarClock,
};

export function ToneBadge({
  tone,
  children,
  dot = true,
  pulse = false,
  icon: Icon,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  dot?: boolean | undefined;
  pulse?: boolean | undefined;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONE_SOFT[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon className={cn("size-3.5", pulse && "live-dot")} />
      ) : (
        dot && <span className={cn("size-1.5 rounded-full", TONE_DOT[tone], pulse && "live-dot")} />
      )}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string | undefined;
}) {
  const meta = STATUS_META[status];
  return (
    <ToneBadge
      tone={meta.tone}
      icon={STATUS_ICONS[status]}
      pulse={status === "in_progress"}
      className={className}
    >
      {meta.label}
    </ToneBadge>
  );
}

export function SourceBadge({ source, className }: { source: BookingSource; className?: string }) {
  const meta = SOURCE_META[source];
  const Icon = SOURCE_ICONS[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function ConversationStatusBadge({
  status,
  className,
}: {
  status: ConversationStatus;
  className?: string | undefined;
}) {
  const meta = CONVERSATION_STATUS_META[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <ToneBadge tone={meta.tone} className={className}>
      {meta.label}
    </ToneBadge>
  );
}
