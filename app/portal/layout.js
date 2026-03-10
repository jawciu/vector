export const metadata = {
  title: "Customer Portal",
};

export default function PortalLayout({ children }) {
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
