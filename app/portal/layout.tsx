import type { ReactNode } from "react";

export const metadata = {
  title: "Customer Portal",
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      {children}
    </div>
  );
}
