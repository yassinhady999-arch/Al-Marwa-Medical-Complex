// Human handoff (التدخل البشري): shared client helpers for the queue page, the
// inbox and the sidebar badge.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tone } from "@/lib/clinic";

/** A waiting patient turns amber after this many minutes, and red after the second. */
export const WAIT_WARN_MINUTES = 10;
export const WAIT_URGENT_MINUTES = 30;

/** Every handoff query key starts with this, so one invalidation refreshes them all. */
export const HANDOFF_KEY = "handoff";

export function invalidateHandoff(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: [HANDOFF_KEY] });
  void qc.invalidateQueries({ queryKey: ["conversations"] });
  void qc.invalidateQueries({ queryKey: ["messages"] });
}

export function minutesSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function waitTone(minutes: number): Tone {
  if (minutes >= WAIT_URGENT_MINUTES) return "danger";
  if (minutes >= WAIT_WARN_MINUTES) return "warning";
  return "info";
}

export function formatWait(minutes: number): string {
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} س ${minutes % 60} د` : `${hours} س`;
  return `${Math.floor(hours / 24)} ي`;
}

/** Current time, refreshed every `intervalMs` so wait timers tick without refetching. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Conversations waiting for a staff member to pick them up — drives the sidebar badge. */
export function useHandoffWaitingCount(enabled: boolean): number {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: [HANDOFF_KEY, "waiting-count"],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "human_support")
        .is("assigned_to", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!enabled) return;
    // Unique topic per mount: AppShell remounts on every navigation, and reusing a
    // topic would hand back the previous page's channel while it is still closing.
    const channel = supabase
      .channel(`handoff-badge-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void qc.invalidateQueries({ queryKey: [HANDOFF_KEY, "waiting-count"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);

  return data ?? 0;
}
