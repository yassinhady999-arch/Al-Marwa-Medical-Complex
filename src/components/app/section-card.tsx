import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  bodyClassName,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={cn("surface-raised overflow-hidden rounded-2xl", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-emphasis">
                <Icon className="size-[18px]" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="truncate text-base font-bold text-foreground">{title}</h2>}
              {description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("p-6", bodyClassName)}>{children}</div>
    </section>
  );
}
