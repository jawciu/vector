"use client";

import { useState } from "react";
import Button from "../ui/Button";
import MagicLinkActions from "./MagicLinkActions";
import { CONTACT_ROLES } from "@/lib/constants";

export default function ContactsPanel({ onboardingId, contacts, onContactsChange, magicLinks = [] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({ name: "", email: "", role: "" });

  function resetForm() {
    setFormData({ name: "", email: "", role: "" });
    setError("");
  }

  function startAdd() {
    setEditingId(null);
    resetForm();
    setAdding(true);
  }

  function startEdit(contact) {
    setAdding(false);
    setFormData({ name: contact.name, email: contact.email, role: contact.role });
    setEditingId(contact.id);
  }

  function handleCancel() {
    setAdding(false);
    setEditingId(null);
    resetForm();
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/onboardings/${onboardingId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create contact");
      }

      const newContact = await res.json();
      onContactsChange([...contacts, newContact]);
      setAdding(false);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/contacts/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update contact");
      }

      const updated = await res.json();
      onContactsChange(contacts.map((c) => (c.id === updated.id ? updated : c)));
      setEditingId(null);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(contactId) {
    if (!confirm("Delete this contact?")) return;

    try {
      const res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete contact");
      }
      onContactsChange(contacts.filter((c) => c.id !== contactId));
      if (editingId === contactId) {
        setEditingId(null);
        resetForm();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const inputStyle = {
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
  };

  function renderInlineForm(onSubmit, submitLabel) {
    return (
      <tr>
        <td colSpan={5} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
          <form onSubmit={onSubmit} className="flex items-center gap-2 flex-wrap">
            {error && (
              <span className="text-xs w-full" style={{ color: "var(--danger)" }}>
                {error}
              </span>
            )}
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              required
              autoFocus
              className="py-1.5 px-2 text-xs rounded outline-none"
              style={{ ...inputStyle, flex: "1 1 120px", minWidth: 100 }}
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
              className="py-1.5 px-2 text-xs rounded outline-none"
              style={{ ...inputStyle, flex: "1 1 160px", minWidth: 120 }}
            />
            <select
              value={formData.role}
              onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}
              className="py-1.5 px-2 text-xs rounded outline-none"
              style={{
                ...inputStyle,
                flex: "0 1 120px",
                color: formData.role ? "var(--text)" : "var(--text-muted)",
              }}
            >
              <option value="">Role</option>
              {CONTACT_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" size="xs" disabled={loading}>
                {loading ? "Saving…" : submitLabel}
              </Button>
              <Button variant="secondary" size="xs" onClick={handleCancel} disabled={loading}>
                Cancel
              </Button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingId)}
                  className="text-xs"
                  style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          Members
        </h3>
        {!adding && editingId === null && (
          <Button variant="primary" size="sm" onClick={startAdd}>
            + Add
          </Button>
        )}
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)", margin: "0 auto", width: "100%" }}
      >
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Name", "Email", "Role", "Portal"].map((col) => (
                <th
                  key={col}
                  className="text-xs font-medium text-left"
                  style={{
                    padding: "8px 12px",
                    color: "var(--text-muted)",
                  }}
                >
                  {col}
                </th>
              ))}
              <th
                className="text-xs font-medium text-left"
                style={{
                  padding: "8px 12px",
                  color: "var(--text-muted)",
                  width: 1,
                }}
              />
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && !adding && (
              <tr>
                <td
                  colSpan={5}
                  className="text-xs text-center"
                  style={{ padding: "20px 12px", color: "var(--text-muted)" }}
                >
                  No members yet. Click + Add to get started.
                </td>
              </tr>
            )}

            {contacts.map((contact) =>
              editingId === contact.id ? (
                renderInlineForm(handleUpdate, "Save")
              ) : (
                <tr
                  key={contact.id}
                  className="cursor-pointer"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onClick={() => startEdit(contact)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "8px 12px", color: "var(--text)" }}>
                    {contact.name}
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>
                    {contact.email || "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {contact.role ? (
                      <span
                        className="inline-flex h-fit rounded text-xs font-medium"
                        style={{
                          paddingTop: 2,
                          paddingBottom: 2,
                          paddingLeft: 4,
                          paddingRight: 4,
                          borderRadius: 6,
                          borderWidth: "0.5px",
                          borderStyle: "solid",
                          borderColor: "var(--text-muted)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {contact.role}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }} onClick={(e) => e.stopPropagation()}>
                    <MagicLinkActions
                      contactId={contact.id}
                      onboardingId={onboardingId}
                      magicLinks={magicLinks.filter((l) => l.contactId === contact.id)}
                    />
                  </td>
                  <td style={{ padding: "8px 12px", width: 1 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(contact);
                      }}
                      className="text-xs"
                      style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            )}

            {adding && renderInlineForm(handleCreate, "Add")}
          </tbody>
        </table>
      </div>
    </div>
  );
}
