export default async function PortalAuthPage({ searchParams }) {
  const { error } = await searchParams;

  const isInvalid = error === "invalid";

  return (
    <main
      style={{
        padding: 32,
        textAlign: "center",
        maxWidth: 400,
        margin: "80px auto",
      }}
    >
      <h1
        className="text-lg font-semibold"
        style={{ color: "var(--text)", marginBottom: 8 }}
      >
        {isInvalid ? "Link expired or revoked" : "Customer Portal"}
      </h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {isInvalid
          ? "This portal link is no longer valid. Please ask your vendor for a new link."
          : "Please use the link provided by your vendor to access the portal."}
      </p>
    </main>
  );
}
