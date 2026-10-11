"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import DesktopOnlyOverlay from "./DesktopOnlyOverlay";

type AppShellProps = { children: ReactNode };

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isPortal = pathname.startsWith("/portal");

  if (isPortal) {
    return <>{children}</>;
  }

  if (isLogin) {
    return (
      <>
        <DesktopOnlyOverlay />
        {children}
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <DesktopOnlyOverlay />
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden relative" style={{ background: "var(--bg)" }}>
        <div
          className="absolute z-30 flex items-center"
          style={{ top: 14, right: 16, height: 20 }}
        >
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
