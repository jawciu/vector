export default async function PortalAuthPage({ searchParams }) {
  const { error } = await searchParams;

  const messages = {
    expired: {
      title: "Link expired",
      body: "This portal link has expired. Please ask your vendor for a new one.",
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: "var(--alert)" }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    revoked: {
      title: "Access revoked",
      body: "Your access to this portal has been revoked. Please contact your vendor if this is unexpected.",
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: "var(--danger)" }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    invalid: {
      title: "Invalid link",
      body: "This portal link is not valid. Please check the URL or ask your vendor for a new link.",
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-muted)" }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
      ),
    },
  };

  const msg = messages[error];

  return (
    <main
      style={{
        padding: 32,
        textAlign: "center",
        maxWidth: 400,
        margin: "80px auto",
      }}
    >
      {msg ? (
        <>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>{msg.icon}</div>
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--text)", marginBottom: 8 }}
          >
            {msg.title}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
            {msg.body}
          </p>
        </>
      ) : (
        <>
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--text)", marginBottom: 8 }}
          >
            Customer Portal
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Please use the link provided by your vendor to access the portal.
          </p>
        </>
      )}
    </main>
  );
}
