import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Users,
  MessagesSquare,
  Headset,
  Stethoscope,
  Layers,
  Sparkles,
  BarChart3,
  Workflow,
  Bot,
  BrainCircuit,
  Settings,
  UserCog,
  History,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProfile, signOut, type AppRole } from "@/hooks/use-auth";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { ThemeToggle } from "@/components/app/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_ONLY_SECTIONS, type SectionKey } from "@/lib/access";
import { initials } from "@/lib/clinic";
import { useHandoffWaitingCount } from "@/lib/handoff";
import { BRAND } from "@/lib/brand";

export { EmptyState } from "@/components/app/empty-state";

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; section: SectionKey }[] = [
  { to: "/dashboard", label: "لوحة التشغيل", icon: LayoutDashboard, section: "dashboard" },
  { to: "/appointments", label: "المواعيد", icon: CalendarDays, section: "appointments" },
  { to: "/calendar", label: "التقويم", icon: CalendarRange, section: "calendar" },
  { to: "/forms", label: "نماذج الحجز", icon: ClipboardList, section: "forms" },
  { to: "/patients", label: "المرضى", icon: Users, section: "patients" },
  { to: "/conversations", label: "المحادثات", icon: MessagesSquare, section: "conversations" },
  { to: "/handoff", label: "التدخل البشري", icon: Headset, section: "handoff" },
  { to: "/doctors", label: "الأطباء", icon: Stethoscope, section: "doctors" },
  { to: "/specialties", label: "التخصصات", icon: Layers, section: "specialties" },
  { to: "/services", label: "الخدمات", icon: Sparkles, section: "services" },
  { to: "/analytics", label: "التقارير", icon: BarChart3, section: "analytics" },
  { to: "/automation", label: "الأتمتة والتكامل", icon: Workflow, section: "automation" },
  {
    to: "/chatbot-training",
    label: "تدريب الشات بوت",
    icon: Bot,
    section: "chatbot_training",
  },
  { to: "/ai-assistant", label: "المساعد الذكي", icon: BrainCircuit, section: "ai_assistant" },
  { to: "/staff", label: "الموظفون", icon: UserCog, section: "staff" },
  { to: "/activity", label: "سجل النشاط", icon: History, section: "activity" },
  { to: "/settings", label: "الإعدادات", icon: Settings, section: "settings" },
];

const GROUPS: { label: string; sections: SectionKey[] }[] = [
  {
    label: "التشغيل",
    sections: [
      "dashboard",
      "appointments",
      "calendar",
      "forms",
      "patients",
      "conversations",
      "handoff",
    ],
  },
  { label: "الكوادر والخدمات", sections: ["doctors", "specialties", "services"] },
  {
    label: "التحليل والربط",
    sections: ["analytics", "automation", "chatbot_training", "ai_assistant"],
  },
  { label: "الإدارة", sections: ["staff", "activity", "settings"] },
];

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "المالك",
  admin: "مدير",
  receptionist: "موظف استقبال",
  doctor: "طبيب",
  viewer: "اطّلاع فقط",
};

type HeaderSlots = { title: HTMLElement | null; actions: HTMLElement | null };

// The header containers AppFrame renders, so each page's AppShell can fill them.
const HeaderSlotsContext = createContext<HeaderSlots>({ title: null, actions: null });

/**
 * The signed-in chrome: sidebar, header bar and notifications. The `_authenticated`
 * layout mounts it once, so moving between sections only swaps the content area
 * instead of rebuilding the sidebar, header and their realtime channels on every click.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  // `location` switches as soon as a link is clicked, which keeps the sidebar
  // responsive. The content area keys on the page actually rendered: keying it on
  // `location` remounted the old page once more while the new one was loading.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pagePath = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.pathname });
  const navigating = useRouterState({ select: (s) => s.isLoading });
  const { data } = useProfile();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const slots = useMemo(
    () => ({ title: titleSlot, actions: actionsSlot }),
    [titleSlot, actionsSlot],
  );

  const visibleNav = NAV.filter((item) =>
    data ? data.can(item.section) : !ADMIN_ONLY_SECTIONS.includes(item.section),
  );

  const handoffWaiting = useHandoffWaitingCount(!!data?.can("handoff"));

  const displayName = data?.profile?.full_name || data?.profile?.email || "مستخدم";
  const role = data?.roles?.[0];

  const groups = GROUPS.map((g) => ({
    label: g.label,
    items: visibleNav.filter((n) => g.sections.includes(n.section)),
  })).filter((g) => g.items.length > 0);

  return (
    <HeaderSlotsContext.Provider value={slots}>
      <div className="app-canvas min-h-screen">
        <aside
          className={cn(
            "glass-sidebar fixed inset-y-0 right-0 z-50 flex w-[300px] flex-col text-sidebar-foreground shadow-xl transition-transform duration-300 lg:translate-x-0 lg:border-s lg:border-sidebar-border lg:shadow-none",
            open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex items-center gap-3 px-5 pb-6 pt-7">
            <img
              src={BRAND.mark}
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-2xl bg-white object-contain p-0.5 shadow-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-sidebar-foreground">
                {BRAND.name}
              </p>
              <p className="truncate text-[10px] text-sidebar-muted" dir="ltr">
                {BRAND.nameEn}
              </p>
            </div>
            <button
              className="ms-auto rounded-lg p-1 text-sidebar-muted hover:text-sidebar-foreground lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="إغلاق القائمة"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-2 text-[11px] font-medium tracking-wide text-sidebar-muted/75">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground/70 hover:-translate-y-px hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:shadow-sm",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-1.5 -start-0.5 w-[2.5px] rounded-full bg-sidebar-primary transition-all duration-200 ease-out",
                            active ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <item.icon
                          className={cn(
                            "size-5 shrink-0 transition-all duration-200",
                            active
                              ? "text-sidebar-primary"
                              : "text-sidebar-muted group-hover:scale-105 group-hover:text-sidebar-foreground",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.section === "handoff" && handoffWaiting > 0 && (
                          <span
                            className="tabular ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground"
                            title="محادثات بانتظار موظف"
                          >
                            {handoffWaiting}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-surface text-xs font-bold text-white">
                {initials(displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-[11px] text-sidebar-muted">
                  {role ? ROLE_LABELS[role] : "—"}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors duration-200 hover:bg-destructive/12 hover:text-destructive"
            >
              <LogOut className="size-4" />
              تسجيل الخروج
            </button>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <div className="min-w-0 lg:ps-[300px]">
          <header className="glass sticky top-0 z-30 border-b border-border">
            <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <button
                className="rounded-xl border border-border bg-surface p-2 text-muted-foreground hover:bg-accent lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="فتح القائمة"
              >
                <Menu className="size-5" />
              </button>
              <div ref={setTitleSlot} className="min-w-0 flex-1" />
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success-emphasis md:inline-flex">
                  <span className="size-1.5 rounded-full bg-success live-dot" />
                  متصل
                </span>
                <div ref={setActionsSlot} className="contents" />
                <ThemeToggle />
                <NotificationsBell />
                <UserMenu displayName={displayName} role={role} />
              </div>
            </div>
            {navigating && <div className="nav-progress" aria-hidden />}
          </header>

          <main
            key={pagePath}
            className="animate-fade mx-auto w-full max-w-[1400px] min-w-0 px-4 py-6 sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </HeaderSlotsContext.Provider>
  );
}

/**
 * A page inside AppFrame: puts its title, description and actions in the frame's
 * header and blocks the content for users without access to the section.
 */
export function AppShell({
  title,
  description,
  actions,
  children,
  section,
  adminOnly,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  section?: SectionKey;
  adminOnly?: boolean;
}) {
  const slots = useContext(HeaderSlotsContext);
  const { data } = useProfile();

  const denied =
    !!data && (((section && !data.can(section)) || (adminOnly && !data.isAdmin)) ?? false);

  return (
    <>
      {slots.title &&
        createPortal(
          <>
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-[28px]">
              {title}
            </h1>
            {description && (
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>
            )}
          </>,
          slots.title,
        )}
      {actions && slots.actions && createPortal(actions, slots.actions)}
      {denied ? <AccessDenied /> : children}
    </>
  );
}

function UserMenu({ displayName, role }: { displayName: string; role?: AppRole | undefined }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hidden items-center gap-2.5 rounded-xl border border-border bg-surface py-1.5 ps-1.5 pe-2.5 shadow-xs transition-all duration-200 hover:-translate-y-px hover:bg-accent hover:shadow-sm sm:flex">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
            {initials(displayName)}
          </span>
          <span className="min-w-0 text-start">
            <span className="block max-w-28 truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {role ? ROLE_LABELS[role] : "—"}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem asChild>
          <Link to="/settings">الإعدادات</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-muted-foreground hover:text-destructive"
        >
          <LogOut className="size-4" />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccessDenied() {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-dashed border-border bg-surface-2/60 p-10 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-destructive-soft text-destructive">
        <ShieldAlert className="size-7" />
      </div>
      <p className="font-bold text-foreground">لا تملك صلاحية الوصول إلى هذا القسم</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        تواصل مع مدير النظام لمنحك صلاحية الوصول.
      </p>
      <Link
        to="/dashboard"
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:-translate-y-0.5"
      >
        العودة للوحة التشغيل
      </Link>
    </div>
  );
}

export function PageButton({ children, ...rest }: React.ComponentProps<typeof Button>) {
  return <Button {...rest}>{children}</Button>;
}
