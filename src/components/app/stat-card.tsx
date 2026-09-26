import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";
import { Sparkline } from "@/components/app/sparkline";
import { cn } from "@/lib/utils";
import { TONE_HEX, type Tone } from "@/lib/clinic";

const TONE_CHIP: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary-emphasis",
  success: "bg-success-soft text-success-emphasis",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-destructive-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-highlight-soft text-highlight-emphasis",
  chat: "bg-chat-soft text-chat-emphasis",
};

export type StatCardProps = {
  label: string;
  value: number | string;
  /** When value is a number, animate a count-up. */
  numeric?: boolean;
  suffix?: string;
  hint?: string | undefined;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  delta?: number | null | undefined;
  /** Comparison phrase shown after the delta percentage, e.g. "من أمس". */
  deltaLabel?: string | undefined;
  spark?: number[];
  index?: number;
  className?: string;
  /** Numeral script for the big value + delta percentage. Defaults to Arabic-Indic. */
  digits?: "ar" | "en";
};

export function StatCard({
  label,
  value,
  numeric = typeof value === "number",
  suffix,
  hint,
  icon: Icon,
  tone = "primary",
  delta,
  deltaLabel,
  spark,
  index = 0,
  className,
  digits = "ar",
}: StatCardProps) {
  const locale = digits === "en" ? "en-US" : "ar-EG";
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useCountUp(numeric ? numericValue : 0);
  const shown = numeric ? Math.round(animated).toLocaleString(locale) : String(value);

  const deltaUp = (delta ?? 0) >= 0;

  return (
    <div
      className={cn(
        "animate-rise surface-raised relative flex flex-col gap-3.5 overflow-hidden rounded-2xl p-6",
        className,
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONE_CHIP[tone])}
          >
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>

      <div className="flex items-end gap-1.5">
        <span className="tabular text-3xl font-bold leading-none text-foreground">{shown}</span>
        {suffix && (
          <span className="pb-0.5 text-sm font-medium text-muted-foreground">{suffix}</span>
        )}
      </div>

      {spark && spark.length > 1 && <Sparkline data={spark} stroke={TONE_HEX[tone]} />}

      <div className="flex items-center gap-1.5 text-xs">
        {delta != null ? (
          <>
            <span
              className={cn(
                "tabular inline-flex items-center gap-0.5 font-semibold",
                deltaUp ? "text-success-emphasis" : "text-destructive",
              )}
            >
              {deltaUp ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta).toLocaleString(locale)}٪
            </span>
            {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
          </>
        ) : (
          hint && <span className="text-muted-foreground">{hint}</span>
        )}
      </div>
    </div>
  );
}
