import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/clinic";
import { TONE_DOT } from "@/lib/clinic";

export type TimelineItem = {
  title: string;
  meta?: string;
  tone?: Tone;
};

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-4 ps-5", className)}>
      <span className="absolute inset-y-1 start-[5px] w-px bg-border" aria-hidden="true" />
      {items.map((item, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute -start-[calc(1.25rem-1px)] top-1 size-2.5 -translate-x-1/2 rounded-full ring-4 ring-surface",
              TONE_DOT[item.tone ?? "primary"],
            )}
          />
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {item.meta && <p className="mt-0.5 text-xs text-muted-foreground">{item.meta}</p>}
        </li>
      ))}
    </ol>
  );
}
