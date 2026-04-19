"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isPortal = pathname.startsWith("/portal");

  if (isLogin || isPortal) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
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
