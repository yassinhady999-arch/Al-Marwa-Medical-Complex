import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, mounted } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الليلي"}
      className={cn(
        "relative grid size-10 place-items-center rounded-xl border border-border bg-surface text-muted-foreground shadow-xs transition-all duration-200 hover:-translate-y-px hover:bg-accent hover:text-foreground hover:shadow-sm",
        className,
      )}
    >
      <Moon
        className={cn(
          "absolute size-[18px] transition-all duration-300",
          mounted && isDark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
      <Sun
        className={cn(
          "absolute size-[18px] transition-all duration-300",
          mounted && isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0",
        )}
      />
    </button>
  );
}
