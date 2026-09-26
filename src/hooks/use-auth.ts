import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { canAccessSection, type SectionKey } from "@/lib/access";
import { logActivity } from "@/lib/activity";

export type AppRole = "owner" | "admin" | "receptionist" | "doctor" | "viewer";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }, { data: perm }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
        supabase.from("staff_permissions").select("sections").eq("user_id", user!.id).maybeSingle(),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const isAdmin = roleList.some((r) => r === "owner" || r === "admin");
      const permissions = ((perm?.sections ?? {}) as Record<string, boolean>) ?? {};
      return {
        profile,
        roles: roleList,
        isAdmin,
        canWrite: roleList.some((r) => r === "owner" || r === "admin" || r === "receptionist"),
        permissions,
        can: (section: SectionKey) => canAccessSection(section, isAdmin, permissions),
      };
    },
  });
}

export async function signOut() {
  await logActivity({
    action: "logout",
    section: "dashboard",
    description: "تسجيل خروج من النظام",
  });
  await supabase.auth.signOut();
  window.location.href = "/auth";
}
