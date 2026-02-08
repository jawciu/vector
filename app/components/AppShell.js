"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar />
      <main className="flex-1 overflow-auto pt-0 pb-2" style={{ background: "var(--bg)" }}>
        <div className="w-full pt-0 px-6 pb-6 md:px-8 md:pb-8">{children}</div>
      </main>
    </div>
  );
}
