"use client";

import { useState } from "react";
import Button from "../ui/Button";

const CONTACT_ROLES = ["Champion", "Technical Lead", "IT Admin", "Exec Sponsor"];

export default function ContactsPanel({ onboardingId, contacts, onContactsChange }) {
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

  function renderForm(onSubmit, submitLabel) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        {error && (
          <div
            className="text-xs px-2 py-1.5 rounded"
            style={{
              color: "var(--danger)",
              background: "rgba(255, 137, 155, 0.1)",
              border: "1px solid var(--danger)",
            }}
          >
            {error}
          </div>
        )}
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          required
          autoFocus
          className="py-1.5 px-2 text-xs w-full rounded outline-none"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={formData.email}
          onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
          className="py-1.5 px-2 text-xs w-full rounded outline-none"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
        <select
          value={formData.role}
          onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}
          className="py-1.5 px-2 text-xs w-full rounded outline-none"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: formData.role ? "var(--text)" : "var(--text-muted)",
          }}
        >
          <option value="">Role (optional)</option>
          {CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button type="submit" size="xs" disabled={loading}>
            {loading ? "Saving…" : submitLabel}
          </Button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="py-1 px-2 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          Contacts
        </h3>
        {!adding && editingId === null && (
          <button
            onClick={startAdd}
            className="text-xs transition-opacity hover:opacity-80"
            style={{ color: "var(--action)", background: "none", border: "none" }}
          >
            + Add
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No contacts yet.
        </p>
      )}

      {contacts.map((contact) =>
        editingId === contact.id ? (
          <div
            key={contact.id}
            className="rounded-lg"
            style={{
              border: "1px solid var(--action)",
              background: "var(--surface)",
              padding: "8px 12px",
            }}
          >
            {renderForm(handleUpdate, "Save")}
            <button
              type="button"
              onClick={() => handleDelete(contact.id)}
              className="mt-2 text-xs transition-opacity hover:opacity-80"
              style={{ color: "var(--danger)", background: "none", border: "none" }}
            >
              Delete contact
            </button>
          </div>
        ) : (
          <div
            key={contact.id}
            className="flex items-center gap-2 rounded-lg cursor-pointer hover:opacity-80"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "8px 12px",
            }}
            onClick={() => startEdit(contact)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                  {contact.name}
                </span>
                {contact.role && (
                  <span
                    className="text-[10px] font-medium rounded-full shrink-0"
                    style={{
                      paddingLeft: 6,
                      paddingRight: 6,
                      paddingTop: 1,
                      paddingBottom: 1,
                      background: "var(--surface-hover)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {contact.role}
                  </span>
                )}
              </div>
              {contact.email && (
                <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                  {contact.email}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {adding && (
        <div
          className="rounded-lg"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "8px 12px",
          }}
        >
          {renderForm(handleCreate, "Add")}
        </div>
      )}
    </div>
  );
}
