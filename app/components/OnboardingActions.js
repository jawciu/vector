"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MenuList, MenuOption } from "./Menu";

export default function OnboardingActions({ onboarding, onUpdated }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef(null);
  const modalRef = useRef(null);

  const [editForm, setEditForm] = useState({
    owner: onboarding.owner || "",
    status: onboarding.status || "Active",
    targetGoLive: onboarding.targetGoLive
      ? onboarding.targetGoLive.split("T")[0]
      : "",
  });

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close modal on click outside
  useEffect(() => {
    if (!editOpen) return;
    function handleClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) setEditOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editOpen]);

  // Close modal on Escape
  useEffect(() => {
    if (!editOpen) return;
    function handleKey(e) {
      if (e.key === "Escape") setEditOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [editOpen]);

  async function handleEdit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/onboardings/${onboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: editForm.owner,
          status: editForm.status,
          targetGoLive: editForm.targetGoLive || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }

      const updated = await res.json();
      setEditOpen(false);
      if (onUpdated) onUpdated(updated);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    setMenuOpen(false);
    if (!confirm("Archive this onboarding? It will be hidden from the active list.")) return;

    try {
      const res = await fetch(`/api/onboardings/${onboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Archived" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to archive");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    if (!confirm("Delete this onboarding and all its tasks? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/onboardings/${onboarding.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDuplicate() {
    setMenuOpen(false);

    try {
      const res = await fetch(`/api/onboardings/${onboarding.id}/duplicate`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to duplicate");
      }

      const newOnboarding = await res.json();
      router.push(`/onboardings/${newOnboarding.id}`);
    } catch (err) {
      alert(err.message);
    }
  }

  const STATUSES = ["Active", "Completed", "Paused", "Archived"];

  return (
    <>
      {/* Three-dot menu trigger */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{ color: "var(--text-muted)" }}
          aria-label="Onboarding actions"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>

        {menuOpen && (
          <MenuList
            role="menu"
            style={{
              left: "auto",
              right: 0,
              width: "180px",
            }}
          >
            <MenuOption
              role="menuitem"
              onClick={() => { setMenuOpen(false); setEditOpen(true); }}
              style={{ color: "var(--text)", fontWeight: 400 }}
            >
              Edit onboarding
            </MenuOption>
            <MenuOption
              role="menuitem"
              onClick={handleDuplicate}
              style={{ color: "var(--text)", fontWeight: 400 }}
            >
              Duplicate
            </MenuOption>
            <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
            <MenuOption
              role="menuitem"
              onClick={handleArchive}
              style={{ color: "var(--alert)", fontWeight: 400 }}
            >
              Archive
            </MenuOption>
            <MenuOption
              role="menuitem"
              onClick={handleDelete}
              style={{ color: "var(--danger)", fontWeight: 400 }}
            >
              Delete
            </MenuOption>
          </MenuList>
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
        >
          <div
            ref={modalRef}
            className="w-full max-w-md rounded-xl flex flex-col gap-5"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              padding: "24px",
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
                Edit Onboarding
              </h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex items-center justify-center w-6 h-6 rounded"
                style={{ color: "var(--text-muted)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {error && (
              <div
                className="text-xs px-3 py-2 rounded"
                style={{
                  color: "var(--danger)",
                  background: "rgba(255, 137, 155, 0.1)",
                  border: "1px solid var(--danger)",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleEdit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Company
                </label>
                <div
                  className="py-2.5 px-3 rounded-lg text-sm"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  {onboarding.companyName}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Owner
                </label>
                <input
                  type="text"
                  value={editForm.owner}
                  onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
                  placeholder="Owner name"
                  className="py-2.5 px-3 rounded-lg text-sm w-full"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                  }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="py-2.5 px-3 rounded-lg text-sm w-full"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Target go-live date
                </label>
                <input
                  type="date"
                  value={editForm.targetGoLive}
                  onChange={(e) => setEditForm((f) => ({ ...f, targetGoLive: e.target.value }))}
                  className="py-2.5 px-3 rounded-lg text-sm w-full"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: editForm.targetGoLive ? "var(--text)" : "var(--text-muted)",
                    colorScheme: "dark",
                  }}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  disabled={loading}
                  className="py-2 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="py-2 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
                  style={{
                    background: "var(--action)",
                    color: "var(--action-text)",
                  }}
                >
                  {loading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
