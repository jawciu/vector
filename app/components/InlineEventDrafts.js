"use client";

import { useEffect, useRef, useState } from "react";
import { CreateTaskCard, FollowupCard, DraftCard, FollowupSparkleIcon } from "./AIDraftInbox";

/**
 * Renders drafts inline below an unmatched-event card on /ai-drafts
 * after the user clicks Assign + process. Polls the drafts list for
 * this onboarding/event combo, shows them with full Approve / Edit /
 * Dismiss controls, and notifies the parent when the inline list is
 * empty (so the parent can auto-collapse the unmatched card — option
 * (a) per Caroline).
 *
 * Drafts ALSO appear on the onboarding's Actions tab — this surface
 * is just a convenience preview, the source of truth is /api/ai-drafts.
 */
export default function InlineEventDrafts({ eventId, onboardingId, onAllHandled, onDraftsArrived }) {
  const [options, setOptions] = useState(null);
  const [drafts, setDrafts] = useState(null); // null = loading, [] = none yet
  const [busyIds, setBusyIds] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const pollTimer = useRef(null);
  const pollDeadline = useRef(0);
  const startedAt = useRef(Date.now());
  const seenAtLeastOne = useRef(false);

  // Fetch the lookup lists once, in parallel with starting the draft poll.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onboardings/${onboardingId}/draft-options`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Options load failed (${res.status})`);
        const body = await res.json();
        if (!cancelled) setOptions(body);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onboardingId]);

  // Poll for drafts. Stop polling once we've seen drafts AND the most
  // recent fetch found none (= we used to have drafts, they've all been
  // approved or dismissed). Also stop after 90s of nothing — that's the
  // orchestrator either failing or being unusually slow, and the user
  // should refresh manually.
  useEffect(() => {
    pollDeadline.current = Date.now() + 90_000;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/ai-drafts?status=pending&onboardingId=${onboardingId}&limit=100`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const body = await res.json();
          const all = body.drafts ?? [];
          // Only the drafts produced by THIS event (sourceEventId match).
          const mine = all.filter((d) => d.sourceEventId === eventId);
          setDrafts(mine);
          if (mine.length > 0 && !seenAtLeastOne.current) {
            seenAtLeastOne.current = true;
            // Tell the parent the streaming border can fade — the
            // inline draft cards now carry the AI signal.
            onDraftsArrived?.();
          }
          if (seenAtLeastOne.current && mine.length === 0) {
            // All inline drafts handled.
            stopPolling();
            onAllHandled?.();
            return;
          }
        }
      } catch {
        // swallow + retry
      }
      if (Date.now() < pollDeadline.current) {
        pollTimer.current = setTimeout(tick, 2500);
      } else {
        stopPolling();
      }
    };
    tick();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, onboardingId]);

  function stopPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }

  function setBusy(id, busy) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleApprove(draft, overrides = {}) {
    setBusy(draft.id, true);
    setErrors((e) => ({ ...e, [draft.id]: null }));
    try {
      const res = await fetch(`/api/ai-drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Approve failed (${res.status})`);
      }
      // Optimistically drop from the inline list. The next poll will
      // confirm — when the inline list is empty, the parent collapses.
      setDrafts((prev) => (prev ?? []).filter((d) => d.id !== draft.id));
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: err.message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function handleReject(draft) {
    setBusy(draft.id, true);
    setErrors((e) => ({ ...e, [draft.id]: null }));
    try {
      const res = await fetch(`/api/ai-drafts/${draft.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "inline-from-unmatched" }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Reject failed (${res.status})`);
      }
      setDrafts((prev) => (prev ?? []).filter((d) => d.id !== draft.id));
    } catch (err) {
      setErrors((e) => ({ ...e, [draft.id]: err.message }));
    } finally {
      setBusy(draft.id, false);
    }
  }

  if (error) {
    return (
      <div style={{ fontSize: 12, color: "var(--danger)", padding: 10 }}>
        Couldn&rsquo;t load draft options: {error}
      </div>
    );
  }

  // Initial state — assigned but orchestrator hasn't yielded drafts yet.
  // Friendly "Vector is thinking" indicator using a twinkling sparkle —
  // the gradient border on the parent card carries the heavier visual
  // signal, this just confirms what's about to land.
  if (drafts == null || (drafts.length === 0 && !seenAtLeastOne.current)) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          padding: "12px 0",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="ai-sparkle-twinkle" style={{ display: "inline-flex" }}>
          <FollowupSparkleIcon />
        </span>
        <span className="ai-text-shimmer" data-text="Generating action draft…">
          Generating action draft…
        </span>
      </div>
    );
  }

  if (!options) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
        Loading draft options…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {drafts.length} draft{drafts.length === 1 ? "" : "s"} from this meeting
      </div>
      {drafts.map((draft) => {
        const busy = busyIds.has(draft.id);
        const err = errors[draft.id];
        if (draft.action === "draft_followup") {
          return (
            <FollowupCard
              key={draft.id}
              draft={draft}
              mode="pending"
              busy={busy}
              error={err}
              onApprove={(overrides) => handleApprove(draft, overrides)}
              onReject={() => handleReject(draft)}
            />
          );
        }
        if (draft.action === "create_task") {
          return (
            <CreateTaskCard
              key={draft.id}
              draft={draft}
              mode="pending"
              busy={busy}
              error={err}
              onApprove={(overrides) => handleApprove(draft, overrides)}
              onReject={() => handleReject(draft)}
              vendorUsers={options.vendorUsers}
              contacts={options.contacts}
              phases={options.phases}
              openTasks={options.openTasks}
            />
          );
        }
        return (
          <DraftCard
            key={draft.id}
            draft={draft}
            mode="pending"
            busy={busy}
            error={err}
            selected={false}
            onToggleSelect={() => {}}
            onApprove={(overrides) => handleApprove(draft, overrides)}
            onReject={() => handleReject(draft)}
            onStartEdit={() => {}}
            onCancelEdit={() => {}}
          />
        );
      })}
    </div>
  );
}

