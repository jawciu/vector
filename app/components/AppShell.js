"use client";

import { usePathname } from "next/navigation";
import SignOut from "./SignOut";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <SignOut />
      </header>
      {children}
    </>
  );
}
