"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MenuTriggerButton, MenuList, MenuOption } from "./Menu";
import AIDraftInbox from "./AIDraftInbox";

const STATUSES = [
  { id: "pending", label: "Pending" },
  { id: "applied", label: "Applied" },
  { id: "rejected", label: "Rejected" },
];

/**
 * Per-onboarding "Actions" tab — shows AI drafts (create_task,
 * match_existing, update_status, draft_followup) for THIS onboarding.
 *
 * Status filter uses the same pill-button + menu pattern as the home
 * onboardings filter (no nested tabs).
 *
 * Realtime: subscribes to PendingAIChange INSERTs (mirrors the sidebar
 * badge) so new drafts arriving while the tab is open auto-refresh the
 * list. Owner-scoping for draft_followup is preserved server-side.
 */
export default function ActionsTab({
  onboardingId,
  vendorUsers = [],
  contacts = [],
  phases = [],
  openTasks = [],
}) {
  const [status, setStatus] = useState("pending");
  const [drafts, setDrafts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef(null);

  const refetch = useCallback(async () => {
    // Clear immediately so the (memoised) AIDraftInbox below doesn't render
    // with stale drafts under the new status label while the fetch is in
    // flight. Without this the filter looks like it shows arbitrary results
    // because key={status} remounts the inbox with the old list.
    setDrafts(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ai-drafts?status=${encodeURIComponent(status)}&onboardingId=${onboardingId}&limit=200`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = await res.json();
      setDrafts(json.drafts ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, onboardingId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function handle(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // Realtime push: refresh when a new draft lands for any onboarding;
  // refetch filters by this onboardingId server-side so we only pay for it
  // when relevant.
  useEffect(() => {
    let cancelled = false;
    let client = null;
    let channel = null;
    (async () => {
      const supabase = await createClient();
      if (cancelled || !supabase) return;
      client = supabase;
      channel = supabase
        .channel(`actions-tab-${onboardingId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "PendingAIChange" },
          () => refetch()
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel && client) client.removeChannel(channel);
    };
  }, [refetch, onboardingId]);

  const currentLabel = STATUSES.find((s) => s.id === status)?.label ?? "Pending";
  const visibleDrafts = drafts ?? [];
  const isPending = status === "pending";

  async function handleDismissAll() {
    if (visibleDrafts.length === 0) return;
    const ok = typeof window !== "undefined"
      ? window.confirm(
          `Dismiss all ${visibleDrafts.length} draft${visibleDrafts.length === 1 ? "" : "s"} for this onboarding?`
        )
      : true;
    if (!ok) return;
    for (const draft of visibleDrafts) {
      try {
        await fetch(`/api/ai-drafts/${draft.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "dismiss all" }),
        });
      } catch (err) {
        console.warn(`[actions] dismiss-all failed for draft ${draft.id}`, err);
      }
    }
    refetch();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "16px 0",
        // Cap the review column so paragraph prose in follow-up drafts stays
        // in the readable measure (~70-90 chars). The status filter,
        // search bar, and draft cards all inherit this width.
        maxWidth: 720,
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div ref={menuRef} className="relative">
            <MenuTriggerButton
              active={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
            >
              <span className="flex items-center gap-2">
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Showing</span>
                {currentLabel}
              </span>
            </MenuTriggerButton>
            {menuOpen && (
              <MenuList>
                {STATUSES.map((s) => (
                  <MenuOption
                    key={s.id}
                    active={s.id === status}
                    onClick={() => { setStatus(s.id); setMenuOpen(false); }}
                  >
                    {s.label}
                  </MenuOption>
                ))}
              </MenuList>
            )}
          </div>
          <SearchInput value={query} onChange={setQuery} />
        </div>
        {isPending && visibleDrafts.length > 0 && (
          <button
            type="button"
            onClick={handleDismissAll}
            className="btn-secondary text-sm rounded-lg"
            style={{ padding: "4px 10px", fontSize: 13, whiteSpace: "nowrap" }}
          >
            Dismiss all
          </button>
        )}
      </header>

      {loading && drafts == null && (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>
      )}
      {drafts != null && drafts.length === 0 && !loading && (
        <EmptyState status={status} />
      )}
      {drafts != null && drafts.length > 0 && (
        <AIDraftInbox
          key={status}
          initialDrafts={drafts}
          mode={status}
          query={query}
          vendorUsers={vendorUsers}
          contacts={contacts}
          phases={phases}
          openTasks={openTasks}
        />
      )}
    </div>
  );
}

/** Inline search input — sits in the ActionsTab header next to the
 *  status filter. Caps at 400px wide so it doesn't dominate. */
function SearchInput({ value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        width: 300,
        maxWidth: "100%",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }}>
        <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search task, follow-up title, meeting…"
        aria-label="Search drafts"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: 13,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="text-btn"
          style={{ padding: "2px 6px", fontSize: 12, color: "var(--text-muted)" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function EmptyState({ status }) {
  const messages = {
    pending: {
      title: "Nothing pending here.",
      sub: "Vector queues drafts when something new comes in — Miniti meetings, scanner runs, etc.",
    },
    applied: { title: "No applied drafts yet.", sub: "Drafts you approve will be archived here." },
    rejected: { title: "No rejected drafts yet.", sub: "Drafts you reject will be archived here." },
  };
  const m = messages[status] ?? messages.pending;
  return (
    <div
      style={{
        padding: "32px 20px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 14, color: "var(--text)", margin: "0 0 6px" }}>{m.title}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{m.sub}</p>
    </div>
  );
}
