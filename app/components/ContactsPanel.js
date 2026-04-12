"use client";

import React, { useState, useRef, useCallback } from "react";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { MenuList, MenuOption } from "./Menu";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { CONTACT_ROLES } from "@/lib/constants";

const GRID_COLUMNS = "1fr 1.3fr 140px 200px 140px 48px";
const HEADERS = ["Name", "Email", "Role", "Portal", "Link", ""];

function formatExpiry(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date - now;
  if (diffMs <= 0) return "Expired";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function activeLinkFor(contactId, magicLinks) {
  return magicLinks.find(
    (l) => l.contactId === contactId && !l.revokedAt && new Date(l.expiresAt) > new Date()
  );
}

export default function ContactsPanel({ onboardingId, contacts, onContactsChange, magicLinks = [] }) {
  const [links, setLinks] = useState(magicLinks);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

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
    setOpenMenuId(null);
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
    setOpenMenuId(null);
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

  async function handleGenerate(contactId) {
    try {
      const res = await fetch(`/api/onboardings/${onboardingId}/magic-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      if (!res.ok) throw new Error("Failed to generate link");
      const newLink = await res.json();
      setLinks((prev) =>
        prev
          .map((l) =>
            l.contactId === contactId && !l.revokedAt
              ? { ...l, revokedAt: new Date().toISOString() }
              : l
          )
          .concat(newLink)
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCopy(link) {
    const url = `${window.location.origin}/api/portal/auth?token=${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopiedId(link.id);
    setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
  }

  async function handleRevoke(link) {
    try {
      const res = await fetch(
        `/api/onboardings/${onboardingId}/magic-links/${link.id}`,
        { method: "PATCH" }
      );
      if (!res.ok) throw new Error("Failed to revoke link");
      setLinks((prev) =>
        prev.map((l) =>
          l.id === link.id ? { ...l, revokedAt: new Date().toISOString() } : l
        )
      );
    } catch (err) {
      console.error(err);
    }
  }

  const inputStyle = {
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
  };

  function cellStyle(colIdx, isLast) {
    return {
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: colIdx === 0 ? 20 : 12,
      paddingRight: colIdx === HEADERS.length - 1 ? 20 : 12,
      borderBottom: isLast ? undefined : "1px solid var(--border-subtle)",
      borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
      display: "flex",
      alignItems: "center",
      minWidth: 0,
    };
  }

  function renderInlineForm(onSubmit, submitLabel) {
    return (
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "10px 20px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
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
            className="py-1.5 px-2 text-sm rounded outline-none"
            style={{ ...inputStyle, flex: "1 1 120px", minWidth: 100 }}
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            className="py-1.5 px-2 text-sm rounded outline-none"
            style={{ ...inputStyle, flex: "1 1 160px", minWidth: 120 }}
          />
          <select
            value={formData.role}
            onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}
            className="py-1.5 px-2 text-sm rounded outline-none"
            style={{
              ...inputStyle,
              flex: "0 1 140px",
              color: formData.role ? "var(--text)" : "var(--text-muted)",
            }}
          >
            <option value="">Role</option>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Saving…" : submitLabel}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      <div
        className="flex items-center justify-between w-full"
        style={{ padding: "12px 16px" }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          Members
        </h3>
        {!adding && editingId === null && (
          <Button variant="primary" size="sm" onClick={startAdd}>
            + Add
          </Button>
        )}
      </div>

      <div
        className="w-full grid text-sm"
        style={{
          gridTemplateColumns: GRID_COLUMNS,
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Header row */}
        {HEADERS.map((label, i) => (
          <span
            key={i}
            className="font-medium text-sm"
            style={{
              color: "var(--text-muted)",
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: i === 0 ? 20 : 12,
              paddingRight: i === HEADERS.length - 1 ? 20 : 12,
              borderBottom: "1px solid var(--border)",
              borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
            }}
          >
            {label}
          </span>
        ))}

        {/* Empty state */}
        {contacts.length === 0 && !adding && (
          <span
            className="text-sm text-center"
            style={{
              gridColumn: "1 / -1",
              padding: "20px 12px",
              color: "var(--text-muted)",
            }}
          >
            No members yet. Click + Add to get started.
          </span>
        )}

        {/* Data rows */}
        {contacts.map((contact, rowIdx) => {
          const isLast = rowIdx === contacts.length - 1 && !adding;
          if (editingId === contact.id) {
            return (
              <React.Fragment key={contact.id}>
                {renderInlineForm(handleUpdate, "Save")}
              </React.Fragment>
            );
          }
          const link = activeLinkFor(contact.id, links);
          return (
            <ContactRow
              key={contact.id}
              contact={contact}
              link={link}
              isLast={isLast}
              cellStyle={cellStyle}
              menuOpen={openMenuId === contact.id}
              onToggleMenu={() =>
                setOpenMenuId((id) => (id === contact.id ? null : contact.id))
              }
              onCloseMenu={() => setOpenMenuId(null)}
              onEdit={() => startEdit(contact)}
              onDelete={() => handleDelete(contact.id)}
              onGenerate={() => handleGenerate(contact.id)}
              onCopy={() => link && handleCopy(link)}
              onRevoke={() => link && handleRevoke(link)}
              copied={link && copiedId === link.id}
            />
          );
        })}

        {/* Inline add form at the bottom */}
        {adding && renderInlineForm(handleCreate, "Add")}
      </div>
    </div>
  );
}

function ContactRow({
  contact,
  link,
  isLast,
  cellStyle,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onEdit,
  onDelete,
  onGenerate,
  onCopy,
  onRevoke,
  copied,
}) {
  const menuRef = useRef(null);
  const closeMenu = useCallback(() => onCloseMenu(), [onCloseMenu]);
  useClickOutside(menuRef, closeMenu, menuOpen);

  return (
    <React.Fragment>
      {/* Name */}
      <span style={{ ...cellStyle(0, isLast), color: "var(--text)" }}>
        {contact.name}
      </span>
      {/* Email */}
      <span
        style={{ ...cellStyle(1, isLast), color: "var(--text)" }}
        className="truncate"
      >
        {contact.email || "—"}
      </span>
      {/* Role */}
      <span style={cellStyle(2, isLast)}>
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
              borderColor: "var(--sky)",
              color: "var(--sky)",
            }}
          >
            {contact.role}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </span>
      {/* Portal */}
      <span
        style={{
          ...cellStyle(3, isLast),
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        {link ? (
          <>
            <span className="text-sm" style={{ color: "var(--success)" }}>
              Portal active
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatExpiry(link.expiresAt)}
            </span>
          </>
        ) : (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Portal inactive
          </span>
        )}
      </span>
      {/* Link */}
      <span style={cellStyle(4, isLast)}>
        {link ? (
          <div className="flex items-center gap-3">
            <button onClick={onCopy} className="text-btn text-btn-action text-sm">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={onRevoke} className="text-btn text-btn-danger text-sm">
              Revoke
            </button>
          </div>
        ) : (
          <button onClick={onGenerate} className="text-btn text-btn-action text-sm">
            Generate
          </button>
        )}
      </span>
      {/* Actions */}
      <span style={cellStyle(5, isLast)}>
        <div ref={menuRef} className="relative">
          <IconButton
            onClick={onToggleMenu}
            isActive={menuOpen}
            aria-label="Member actions"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </IconButton>
          {menuOpen && (
            <MenuList
              role="menu"
              style={{ left: "auto", right: 0, width: "160px" }}
            >
              <MenuOption
                role="menuitem"
                onClick={onEdit}
                style={{ color: "var(--text)", fontWeight: 400 }}
              >
                Edit
              </MenuOption>
              <MenuOption
                role="menuitem"
                onClick={onDelete}
                style={{ color: "var(--danger)", fontWeight: 400 }}
              >
                Delete
              </MenuOption>
            </MenuList>
          )}
        </div>
      </span>
    </React.Fragment>
  );
}
