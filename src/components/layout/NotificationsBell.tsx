import { Bell, BellOff } from "lucide-react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelative } from "@/lib/clinic";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("notifications-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const unread = items.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative grid size-10 place-items-center rounded-xl border border-border bg-surface text-muted-foreground shadow-xs transition-all duration-200 hover:-translate-y-px hover:bg-accent hover:text-foreground hover:shadow-sm"
          aria-label="الإشعارات"
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="tabular absolute -top-1 -end-1 grid min-w-[15px] h-[15px] place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-surface">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 overflow-hidden rounded-2xl p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-sm font-bold text-foreground">الإشعارات</p>
          {unread > 0 && (
            <button
              className="text-xs font-semibold text-primary-emphasis hover:underline"
              onClick={markAllRead}
            >
              تعليم الكل كمقروء
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <BellOff className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">لا توجد إشعارات</p>
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex gap-2.5 border-b border-border/60 px-4 py-3 text-sm last:border-0",
                  n.is_read && "opacity-55",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.is_read ? "bg-muted-foreground/40" : "bg-primary",
                  )}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{n.title}</p>
                  {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatRelative(n.created_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
