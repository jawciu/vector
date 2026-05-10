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
  const [timedOut, setTimedOut] = useState(false);
  // Most recent server-side view of the event row — `processedAt` and
  // `error` come from /api/admin/event-debug. Lets us surface the
  // orchestrator's failure reason as soon as it's persisted instead of
  // waiting for the 90s polling deadline.
  const [eventStatus, setEventStatus] = useState(null);
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
        // Fetch the drafts list AND the event row's orchestrator status
        // in parallel so we can surface a concrete error string the
        // moment the assign-route catch-handler persists it (instead of
        // waiting 90s for the spinner to give up).
        const [draftsRes, statusRes] = await Promise.all([
          fetch(
            `/api/ai-drafts?status=pending&onboardingId=${onboardingId}&limit=100`,
            { cache: "no-store" }
          ),
          fetch(`/api/admin/event-debug/${eventId}`, { cache: "no-store" }),
        ]);

        let mine = [];
        if (draftsRes.ok) {
          const body = await draftsRes.json();
          const all = body.drafts ?? [];
          mine = all.filter((d) => d.sourceEventId === eventId);
          setDrafts(mine);
        }

        let status = null;
        if (statusRes.ok) {
          status = await statusRes.json();
          setEventStatus(status);
        }

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

        // Orchestrator persisted an error (catch-handler in the assign
        // route), or finished cleanly with zero drafts. Both terminal,
        // both worth surfacing immediately rather than waiting 90s.
        if (status?.error) {
          stopPolling();
          onDraftsArrived?.();
          return;
        }
        if (status?.processedAt && mine.length === 0) {
          stopPolling();
          onDraftsArrived?.();
          return;
        }
      } catch {
        // swallow + retry
      }
      if (Date.now() < pollDeadline.current) {
        pollTimer.current = setTimeout(tick, 2500);
      } else {
        // 90s elapsed without a single draft landing. Almost always
        // means the orchestrator threw or got killed before it could
        // write tool calls — the spinner alone gives the user nothing
        // to act on, so flip into an explicit timeout state with a
        // refresh hint and let the parent stop the streaming border.
        stopPolling();
        if (!seenAtLeastOne.current) {
          setTimedOut(true);
          onDraftsArrived?.();
        }
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

  // Orchestrator threw and the assign route's catch-handler persisted
  // the message onto ExternalEvent.error — surface it verbatim so the
  // user can see the actual cause instead of the generic timeout.
  if (eventStatus?.error && !seenAtLeastOne.current) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--danger)",
          background: "rgba(255, 137, 155, 0.08)",
          border: "1px solid var(--danger)",
          padding: "10px 14px",
          borderRadius: 8,
          lineHeight: 1.5,
          wordBreak: "break-word",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Orchestrator error</strong>
        <span>{eventStatus.error}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Full Pass 1 / Pass 2 trace at{" "}
          <a
            href={`/admin/ai?tab=pipeline`}
            style={{ color: "var(--action)" }}
          >
            /admin/ai → Pipeline
          </a>
          .
        </span>
      </div>
    );
  }

  // Orchestrator finished cleanly but had nothing actionable — Pass 2
  // returned zero tool calls. Don't make the user wait 90s for this.
  if (
    eventStatus?.processedAt &&
    !eventStatus.error &&
    !seenAtLeastOne.current &&
    drafts != null &&
    drafts.length === 0
  ) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          padding: "12px 0",
          lineHeight: 1.5,
        }}
      >
        Vector finished but didn&rsquo;t find any concrete actions in this meeting.
      </div>
    );
  }

  if (timedOut && !seenAtLeastOne.current) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "12px 0", lineHeight: 1.5 }}>
        Vector didn&rsquo;t produce drafts within 90 seconds — the orchestrator
        likely errored. Refresh the page to retry, or check{" "}
        <a href="/admin/ai" style={{ color: "var(--action)" }}>
          /admin/ai
        </a>{" "}
        for the failed run.
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
        <span className="ai-text-shimmer">Generating action draft…</span>
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

