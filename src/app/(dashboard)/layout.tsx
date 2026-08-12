"use client";

import { Suspense, type ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WorkspaceProvider } from "@/lib/dashboard/workspace-context";

function DashboardLayoutInner({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
