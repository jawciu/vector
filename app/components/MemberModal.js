"use client";

import { useState, useEffect, useRef } from "react";
import Button from "../ui/Button";
import FieldPill from "../ui/FieldPill";
import { MembersIcon } from "../ui/Icons";
import { MenuList, MenuOption } from "./Menu";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { CONTACT_ROLES } from "@/lib/constants";

function CloseIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-muted)" }}>
      <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PillClearButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center shrink-0 ml-2! cursor-pointer border-none bg-transparent p-0"
    >
      <CloseIcon size={9} />
    </button>
  );
}

export default function MemberModal({ open, mode, contact, onboardingId, onClose, onSaved }) {
  const [formData, setFormData] = useState({ name: "", email: "", role: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roleOpen, setRoleOpen] = useState(false);

  const nameRef = useRef(null);
  const roleRef = useRef(null);

  useClickOutside(roleRef, () => setRoleOpen(false), roleOpen);

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && contact) {
      setFormData({
        name: contact.name || "",
        email: contact.email || "",
        role: contact.role || "",
      });
    } else {
      setFormData({ name: "", email: "", role: "" });
    }
    setError("");
    setRoleOpen(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [open, mode, contact]);

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const url =
        mode === "edit"
          ? `/api/contacts/${contact.id}`
          : `/api/onboardings/${onboardingId}/contacts`;
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const saved = await res.json();
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const title = mode === "edit" ? "Edit member" : "New member";
  const submitLabel = mode === "edit" ? "Save" : "Add member";
  const submittingLabel = mode === "edit" ? "Saving…" : "Adding…";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-8 w-full max-w-[480px] rounded-[20px]"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-5 h-5 rounded icon-btn"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-6">
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

          {/* Name + Email */}
          <div className="flex flex-col gap-2">
            <input
              ref={nameRef}
              type="text"
              placeholder="Member name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="text-base w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                padding: 0,
              }}
            />
            <input
              type="email"
              placeholder="name@company.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="text-sm w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: formData.email ? "var(--text)" : "var(--text-muted)",
                padding: 0,
              }}
            />
          </div>

          {/* Role */}
          <div ref={roleRef} className="relative">
            <FieldPill
              icon={<MembersIcon style={{ flexShrink: 0 }} />}
              active={roleOpen}
              onClick={() => setRoleOpen((o) => !o)}
            >
              <span
                className="text-sm flex-1"
                style={{ color: formData.role || roleOpen ? "var(--text)" : "var(--text-muted)" }}
              >
                {formData.role || "Role"}
              </span>
              {formData.role && (
                <PillClearButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChange("role", "");
                  }}
                />
              )}
            </FieldPill>
            {roleOpen && (
              <MenuList style={{ background: "var(--bg-elevated)", width: "100%" }}>
                {CONTACT_ROLES.map((r) => (
                  <MenuOption
                    key={r}
                    active={formData.role === r}
                    onClick={() => {
                      handleChange("role", formData.role === r ? "" : r);
                      setRoleOpen(false);
                    }}
                  >
                    {r}
                  </MenuOption>
                ))}
              </MenuList>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
