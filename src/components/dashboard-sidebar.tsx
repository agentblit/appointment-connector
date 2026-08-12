"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/dashboard/workspace-context";

const SIDEBAR_KEY = "appointment-sidebar-collapsed";

function pluralizeLabel(label: string) {
  if (label.toLowerCase().endsWith("s")) return label;
  return `${label}s`;
}

export function DashboardSidebar({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { entityLabel } = useWorkspace();
  const entitiesLabel = pluralizeLabel(entityLabel.trim() || "Entity");

  const navItems = [
    { href: "/entities", label: entitiesLabel, icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/api-keys", label: "API keys", icon: KeyRound },
  ] as const;

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 ${
        collapsed ? "w-[68px]" : "w-56"
      }`}
    >
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`inline-flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function DashboardTopBar({
  collapsed,
  onCollapsedChange,
  email,
  onSignOut,
  themeToggle,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  email: string;
  onSignOut: () => void;
  themeToggle: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border bg-card/90 backdrop-blur-sm">
      <div
        className={`flex h-full shrink-0 items-center border-r border-border transition-[width] duration-200 ${
          collapsed ? "w-[68px] justify-center px-2" : "w-56 justify-between px-3"
        }`}
      >
        {!collapsed ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Calendar className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="truncate text-sm font-semibold text-foreground">
                Appointment
              </span>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => onCollapsedChange(true)}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => onCollapsedChange(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav className="flex h-full min-w-0 flex-1 items-center justify-end gap-2 px-4 sm:gap-3">
        <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground sm:block">
          {email}
        </span>
        {themeToggle}
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  function onCollapsedChange(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return { collapsed: hydrated ? collapsed : false, onCollapsedChange };
}
