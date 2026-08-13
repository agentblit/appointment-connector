"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DashboardSidebar,
  DashboardTopBar,
  useSidebarCollapsed,
} from "@/components/dashboard-sidebar";
import { useWorkspace } from "@/lib/dashboard/workspace-context";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { email, loading, ready, signOut } = useWorkspace();
  const { collapsed, onCollapsedChange } = useSidebarCollapsed();

  if (loading && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardTopBar
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        email={email}
        onSignOut={() => void signOut()}
        themeToggle={<ThemeToggle />}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <DashboardSidebar collapsed={collapsed} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
