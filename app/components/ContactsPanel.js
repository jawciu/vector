"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { MenuList, MenuOption } from "./Menu";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import MemberModal from "./MemberModal";
import BulkActionBar from "./BulkActionBar";

const GRID_COLUMNS = "40px 1fr 1.3fr 140px 220px 140px 48px";
const HEADERS = ["", "Name", "Email", "Role", "Portal", "Link", ""];

function formatExpiry(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date - now;
  if (diffMs <= 0) return "Expired";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function formatRelative(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const diffMs = Date.now() - then.getTime();
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function activeLinkFor(contactId, magicLinks) {
  return magicLinks.find(
    (l) => l.contactId === contactId && !l.revokedAt && new Date(l.expiresAt) > new Date()
  );
}

function Checkbox({ checked, indeterminate, disabled, onClick, ariaLabel, title }) {
  return (
    <button
      type="button"
      className="member-checkbox"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      aria-label={ariaLabel}
      title={title}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        {checked ? (
          <path
            d="M10 0C12.2091 0 14 1.79086 14 4V10C14 12.2091 12.2091 14 10 14H4C1.79086 14 9.66399e-08 12.2091 0 10V4C0 1.79086 1.79086 9.66384e-08 4 0H10ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z"
            fill="var(--action)"
          />
        ) : indeterminate ? (
          <>
            <rect x="0.5" y="0.5" width="13" height="13" rx="3.5" stroke="var(--action)" />
            <rect x="3" y="6.5" width="8" height="1" rx="0.5" fill="var(--action)" />
          </>
        ) : (
          <rect x="0.5" y="0.5" width="13" height="13" rx="3.5" stroke="#5D565D" />
        )}
      </svg>
    </button>
  );
}

function WarningIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="5.5" stroke="var(--danger)" />
      <path d="M6 3.5V6.5" stroke="var(--danger)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="6" cy="8.5" r="0.6" fill="var(--danger)" />
    </svg>
  );
}

export default function ContactsPanel({ onboardingId, contacts, onContactsChange, magicLinks = [] }) {
  const [links, setLinks] = useState(magicLinks);
  const [modalState, setModalState] = useState({ open: false, mode: "add", contact: null });
  const [openMenuId, setOpenMenuId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState(null); // null | "success" | "partial"
  const [lastResult, setLastResult] = useState({ succeeded: 0, failed: [] }); // failed: [{contactId, reason}]
  const [failedIds, setFailedIds] = useState(() => new Set());

  // Eligible = contacts without an active link (checkbox enabled)
  const eligibleIds = useMemo(
    () => contacts.filter((c) => !activeLinkFor(c.id, links)).map((c) => c.id),
    [contacts, links]
  );

  const allEligibleSelected =
    eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
  const someEligibleSelected =
    !allEligibleSelected && eligibleIds.some((id) => selected.has(id));

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allEligibleSelected) return new Set();
      const next = new Set(prev);
      eligibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkStatus(null);
  }

  function openAddModal() {
    setModalState({ open: true, mode: "add", contact: null });
  }

  function openEditModal(contact) {
    setOpenMenuId(null);
    setModalState({ open: true, mode: "edit", contact });
  }

  function closeModal() {
    setModalState((s) => ({ ...s, open: false }));
  }

  function handleSaved(saved) {
    if (modalState.mode === "edit") {
      onContactsChange(contacts.map((c) => (c.id === saved.id ? saved : c)));
    } else {
      onContactsChange([...contacts, saved]);
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
    } catch (err) {
      alert(err.message);
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
      if (newLink.emailStatus && newLink.emailStatus !== "skipped_no_email") {
        setFailedIds((prev) => new Set(prev).add(contactId));
      }
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
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.delete(link.contactId);
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function runBulkGenerate(contactIds) {
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/onboardings/${onboardingId}/magic-links/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      if (!res.ok) throw new Error("Bulk generate failed");
      const { created, failed } = await res.json();

      // Merge created links into state. Revoke any existing active links for
      // contacts we just created new ones for (server already did this in DB).
      setLinks((prev) => {
        const newContactIds = new Set(created.map((l) => l.contactId));
        const revoked = prev.map((l) =>
          newContactIds.has(l.contactId) && !l.revokedAt
            ? { ...l, revokedAt: new Date().toISOString() }
            : l
        );
        return [...revoked, ...created];
      });

      // Update failed warnings: remove from failed for successful contacts,
      // add for the new failures.
      setFailedIds((prev) => {
        const next = new Set(prev);
        created.forEach((l) => next.delete(l.contactId));
        failed.forEach((f) => next.add(f.contactId));
        return next;
      });

      // Clear selection for successful contacts only — keep failed ones selected
      // so user can see what needs retrying.
      const successContactIds = new Set(created.map((l) => l.contactId));
      setSelected((prev) => {
        const next = new Set(prev);
        successContactIds.forEach((id) => next.delete(id));
        return next;
      });

      if (failed.length === 0) {
        setBulkStatus("success");
        setLastResult({ succeeded: created.length, failed: [] });
        setTimeout(() => {
          setBulkStatus(null);
          setSelected(new Set());
        }, 3000);
      } else {
        setBulkStatus("partial");
        setLastResult({ succeeded: created.length, failed });
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Bulk generate failed");
    } finally {
      setBulkLoading(false);
    }
  }

  function handleBulkGenerate() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    runBulkGenerate(ids);
  }

  function handleRetry() {
    const ids = lastResult.failed.map((f) => f.contactId);
    if (ids.length === 0) return;
    runBulkGenerate(ids);
  }

  function cellStyle(colIdx, isLast) {
    return {
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: colIdx === 0 ? 12 : 12,
      paddingRight: colIdx === HEADERS.length - 1 ? 20 : 12,
      borderBottom: isLast ? undefined : "1px solid var(--border-subtle)",
      borderLeft: colIdx > 0 ? "1px solid var(--border)" : undefined,
      display: "flex",
      alignItems: "center",
      minWidth: 0,
    };
  }

  const showBulkBar = selected.size > 0 || bulkStatus !== null;

  return (
    <div className="w-full flex flex-col">
      <div
        className="flex items-center justify-between w-full"
        style={{ padding: "12px 16px" }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          Members
        </h3>
        <Button variant="primary" size="sm" onClick={openAddModal}>
          + Add member
        </Button>
      </div>

      {showBulkBar && (
        <BulkActionBar
          selectedCount={selected.size}
          loading={bulkLoading}
          status={bulkStatus}
          successCount={lastResult.succeeded}
          failedCount={lastResult.failed.length}
          onClear={clearSelection}
          onGenerate={handleBulkGenerate}
          onRetry={handleRetry}
        />
      )}

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
              paddingLeft: i === 0 ? 12 : 12,
              paddingRight: i === HEADERS.length - 1 ? 20 : 12,
              borderBottom: "1px solid var(--border)",
              borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
              display: "flex",
              alignItems: "center",
            }}
          >
            {i === 0 ? (
              <Checkbox
                checked={allEligibleSelected}
                indeterminate={someEligibleSelected}
                disabled={eligibleIds.length === 0}
                onClick={toggleSelectAll}
                ariaLabel="Select all members"
              />
            ) : (
              label
            )}
          </span>
        ))}

        {/* Empty state */}
        {contacts.length === 0 && (
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
          const isLast = rowIdx === contacts.length - 1;
          const link = activeLinkFor(contact.id, links);
          return (
            <ContactRow
              key={contact.id}
              contact={contact}
              link={link}
              isLast={isLast}
              cellStyle={cellStyle}
              checked={selected.has(contact.id)}
              onToggleSelect={() => toggleSelect(contact.id)}
              failed={failedIds.has(contact.id)}
              menuOpen={openMenuId === contact.id}
              onToggleMenu={() =>
                setOpenMenuId((id) => (id === contact.id ? null : contact.id))
              }
              onCloseMenu={() => setOpenMenuId(null)}
              onEdit={() => openEditModal(contact)}
              onDelete={() => handleDelete(contact.id)}
              onGenerate={() => handleGenerate(contact.id)}
              onCopy={() => link && handleCopy(link)}
              onRevoke={() => link && handleRevoke(link)}
              copied={link && copiedId === link.id}
            />
          );
        })}
      </div>

      <MemberModal
        open={modalState.open}
        mode={modalState.mode}
        contact={modalState.contact}
        onboardingId={onboardingId}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </div>
  );
}

function ContactRow({
  contact,
  link,
  isLast,
  cellStyle,
  checked,
  onToggleSelect,
  failed,
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

  const hasActiveLink = Boolean(link);
  const checkboxDisabled = hasActiveLink;
  const noEmail = !contact.email;

  return (
    <React.Fragment>
      {/* Checkbox */}
      <span style={cellStyle(0, isLast)}>
        <Checkbox
          checked={checked}
          disabled={checkboxDisabled}
          onClick={onToggleSelect}
          ariaLabel={`Select ${contact.name}`}
          title={checkboxDisabled ? "Portal already active — revoke to regenerate" : undefined}
        />
      </span>
      {/* Name */}
      <span style={{ ...cellStyle(1, isLast), color: "var(--text)" }}>
        {contact.name}
      </span>
      {/* Email */}
      <span
        style={{ ...cellStyle(2, isLast), color: "var(--text)" }}
        className="truncate"
      >
        {contact.email || "—"}
      </span>
      {/* Role */}
      <span style={cellStyle(3, isLast)}>
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
          ...cellStyle(4, isLast),
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        {link ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-sm" style={{ color: "var(--success)" }}>
                Portal active
              </span>
              {failed && (
                <span title="Email failed to send — copy link manually or retry">
                  <WarningIcon />
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatExpiry(link.expiresAt)}
              {link.sentAt && ` · Sent ${formatRelative(link.sentAt)}`}
            </span>
          </>
        ) : (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Portal inactive
          </span>
        )}
      </span>
      {/* Link */}
      <span style={cellStyle(5, isLast)}>
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
          <button
            onClick={onGenerate}
            className="text-btn text-btn-action text-sm"
            disabled={noEmail}
            title={noEmail ? "Add an email to send invite" : undefined}
            style={noEmail ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
          >
            Generate + email
          </button>
        )}
      </span>
      {/* Actions */}
      <span style={cellStyle(6, isLast)}>
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
