import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Supabase/PostgREST errors carry a code (missing table, RLS denial, bad filter)
// and fail the same way on every attempt, so retrying them only kept the skeleton
// up for ~7 s before the error showed. Network failures get one retry.
function shouldRetry(failureCount: number, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return failureCount < 1 && !(typeof code === "string" && code !== "");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Load a section's code while the pointer rests on its link, before the click.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
