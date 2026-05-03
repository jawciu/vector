"use client";

import { useState } from "react";

/**
 * Team section on /settings. Manages VendorUser rows — your Vector team.
 *
 * Adding a member here doesn't create a Supabase auth account; it just
 * pre-creates the row. When the new member signs in with the same email,
 * `getOrCreateVendorUser` links their auth identity to this row.
 */
export default function TeamPanel({ initialUsers, currentVendorUserId }) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vendor-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setUsers((prev) => [...prev, json.user]);
      setName("");
      setEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this team member? Their tasks will lose the owner.")) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/vendor-users/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          Team
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.5 }}>
          People on your Vector team. Set them as Owner on tasks. New members can sign in with the same email later — their account links automatically.
        </p>
      </header>

      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <Field label="Name" style={{ flex: 1 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. Tom Okafor"
            style={inputStyle}
          />
        </Field>
        <Field label="Email" style={{ flex: 1.4 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            required
            placeholder="tom@vector.example"
            style={inputStyle}
          />
        </Field>
        <button
          type="submit"
          disabled={busy || !email}
          className="btn-primary text-sm rounded-lg"
          style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, opacity: busy ? 0.5 : 1 }}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </form>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "var(--danger)",
            background: "rgba(255, 137, 155, 0.1)",
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {users.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No team members yet. Add someone above.
          </p>
        ) : (
          users.map((u) => {
            const isMe = u.id === currentVendorUserId;
            const signedUp = !!u.authUserId;
            return (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "var(--text)", display: "flex", gap: 8, alignItems: "center" }}>
                    <strong>{u.name}</strong>
                    {isMe && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4 }}>
                        you
                      </span>
                    )}
                    {!signedUp && !isMe && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4 }}>
                        invited
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{u.email}</div>
                </div>
                {!isMe && (
                  <button
                    onClick={() => handleDelete(u.id)}
                    disabled={deletingId === u.id}
                    className="btn-secondary text-sm rounded-lg"
                    style={{ padding: "4px 10px", fontSize: 12, opacity: deletingId === u.id ? 0.5 : 1 }}
                  >
                    {deletingId === u.id ? "…" : "Remove"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  background: "var(--bg-elevated)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  outline: "none",
};

function Field({ label, style, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
