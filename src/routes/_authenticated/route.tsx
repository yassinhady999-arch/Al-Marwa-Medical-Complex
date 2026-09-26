import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // `beforeLoad` re-runs on every navigation within this layout (dashboard ->
  // appointments -> patients, ...). `getSession()` reads the already-verified
  // session from local storage; `getUser()` makes a network round-trip to
  // Supabase's Auth server every time, which is what was causing the visible
  // stall/stutter between every page change.
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  staleTime: 60_000,
  component: () => <Outlet />,
});
