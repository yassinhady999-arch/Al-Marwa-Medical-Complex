import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Stethoscope, RotateCcw, ArrowRight } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

// Set the theme class before first paint to avoid a flash.
// Light by default; only go dark when the user has explicitly chosen it.
const THEME_SCRIPT = `(function(){try{if(localStorage.getItem('cf-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-4">
      <div className="animate-rise max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary-emphasis">
          <Stethoscope className="size-7" />
        </div>
        <p className="mt-6 text-6xl font-extrabold tracking-tight text-foreground tabular">404</p>
        <h1 className="mt-3 text-lg font-bold text-foreground">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          الرابط الذي تحاول الوصول إليه غير متاح أو تم نقله.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          العودة للرئيسية
          <ArrowRight className="size-4 flip-x" />
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-4">
      <div className="animate-rise max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive-soft text-destructive">
          <RotateCcw className="size-7" />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-foreground">
          تعذّر تحميل هذه الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <RotateCcw className="size-4" />
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "نظام تشغيل العيادة" },
      {
        name: "description",
        content: "منصة تشغيل العيادات الطبية: المواعيد، المرضى، المحادثات والأتمتة.",
      },
      { name: "theme-color", content: "#0d6f7d" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/brand/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors dir="rtl" />
    </QueryClientProvider>
  );
}
