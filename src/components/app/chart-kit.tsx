import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/** Same semantic colors used by status/source badges app-wide, so a generic
 *  multi-series chart never introduces a color that doesn't mean anything
 *  elsewhere in the product. */
export const CHART_COLORS = [
  "var(--color-info)",
  "var(--color-success-emphasis)",
  "var(--color-warning)",
  "var(--color-chat-emphasis)",
  "var(--color-primary-emphasis)",
  "var(--color-highlight-emphasis)",
  "var(--color-destructive)",
  "var(--color-muted-foreground)",
];

export const axisTick = {
  fontSize: 11,
  fill: "var(--color-muted-foreground)",
} as const;

export const axisLine = { stroke: "var(--color-border)" } as const;

export const gridProps = {
  strokeDasharray: "4 4",
  stroke: "var(--color-border)",
  vertical: false,
} as const;

type TooltipPayloadItem = {
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
};

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  formatter?: (value: number | string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label != null && <p className="mb-1 font-bold text-foreground">{label}</p>}
      <div className="space-y-1">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: item.color ?? "var(--color-primary)" }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="tabular ms-auto font-semibold text-foreground">
              {formatter ? formatter(item.value ?? 0) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartFrame({
  height = 288,
  children,
  className,
}: {
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; value?: string | number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs">
          <span className="size-2.5 rounded-[4px]" style={{ background: it.color }} />
          <span className="text-muted-foreground">{it.label}</span>
          {it.value != null && (
            <span className="tabular font-semibold text-foreground">{it.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}
