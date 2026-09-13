"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import Drawer from "@/app/ui/Drawer";
import Badge from "@/app/ui/Badge";
import Button from "@/app/ui/Button";
import CompanyAvatar from "@/app/ui/CompanyAvatar";
import Sparkle from "@/app/ui/Sparkle";
import TaskIdChip from "@/app/ui/TaskIdChip";
import Tooltip from "@/app/ui/Tooltip";
import { CalendarIcon, ClockIcon } from "@/app/ui/Icons";
import { AVATAR_IMAGES, avatarColor, avatarInitials } from "@/lib/avatar";

/**
 * Meeting transcript drawer. Renders inside the shared `Drawer`
 * primitive so it matches the kanban TaskDrawer's look (slide-in,
 * 520px right-edge panel, no dimmed backdrop) — Caroline wants the
 * two surfaces visually consistent.
 *
 * Triggered by clicking a meeting row or a draft's meeting pill.
 * Always mounted by the parent; `eventId` controls the open state.
 *
 * Reading order, top to bottom (the 2026-09-13 hierarchy pass):
 *   header    — title as a real 18px heading, date + duration as one muted
 *               meta line, attendees as avatar chips with the customer side
 *               marked by the company logo.
 *   summary   — AI prose under the gradient rule, capped at 70ch.
 *   actions   — the extracted claims as cards: numbered marker, claim at
 *               14/500, firmness as a Badge, the source quote behind a
 *               "Show quote" toggle, and the task code when the item became
 *               a task.
 *   drafts    — AIDraftInbox's row shape: action Badge, title, status Badge.
 *   transcript— collapsed by default; it is the source, not the summary.
 *
 * The three AI-authored sections carry the Vector sparkle and the
 * `.ai-divider` gradient rule; the transcript carries a plain rule. Layout
 * lives in the `.mtg-*` block in globals.css.
 *
 * Speed:
 *   - In-component cache (id → fetched body) so re-opening the same
 *     meeting is instant.
 *   - Optional `seed` prop: when the caller already has the meeting
 *     payload (MeetingsTab does), pass it through and the drawer paints
 *     immediately. A background fetch still runs to fill the richer
 *     fields (`extractionActionItems`, `siblingDrafts`, draft task codes).
 *
 * ESC + outside-click close via the Drawer primitive.
 */
export default function MeetingDrawer({ eventId, seed, onClose }) {
  const cacheRef = useRef(new Map());
  const seedFor = seed && seed.id === eventId ? seed : null;
  const cached = eventId != null ? cacheRef.current.get(eventId) : null;
  const [meeting, setMeeting] = useState(cached ?? seedFor ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const open = eventId != null;

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    // Paint immediately from cache or seed; fetch in background.
    const cached = cacheRef.current.get(eventId);
    if (cached) {
      setMeeting(cached);
    } else if (seedFor) {
      setMeeting(seedFor);
    } else {
      setMeeting(null);
    }
    let cancelled = false;
    setLoading(!cached);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/meetings/${eventId}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        const body = await res.json();
        if (cancelled) return;
        cacheRef.current.set(eventId, body);
        setMeeting(body);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // seedFor is derived from props; including `seed` covers it without
    // adding a new identity per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, open, seed]);

  return (
    <Drawer open={open} onClose={onClose} aria-label="Meeting details">
      {/* Body — close button lives in the Drawer primitive (top-right). */}
      <div className="mtg-body">
        {loading && !meeting && <p className="mtg-empty">Loading transcript…</p>}
        {error && <p className="mtg-error">Couldn&rsquo;t load meeting: {error}</p>}
        {meeting && <MeetingBody meeting={meeting} />}
      </div>
    </Drawer>
  );
}

function MeetingBody({ meeting }) {
  const attendees = meeting.attendees ?? [];
  const transcript = meeting.transcript ?? [];
  const actionItems = Array.isArray(meeting.extractionActionItems)
    ? meeting.extractionActionItems
    : [];
  const drafts = Array.isArray(meeting.siblingDrafts) ? meeting.siblingDrafts : [];
  const company = meeting.company ?? null;
  const customerDomain = company?.domain ? company.domain.toLowerCase() : null;

  // An action item and the draft it produced carry the same `sourceQuote`,
  // which is the only link between the two (there is no relation), so the
  // task code an item turned into is looked up by quote.
  const siblingDrafts = meeting.siblingDrafts;
  const taskCodeByQuote = useMemo(() => {
    const map = new Map();
    for (const d of Array.isArray(siblingDrafts) ? siblingDrafts : []) {
      if (d.sourceQuote && d.taskId) map.set(d.sourceQuote, d.taskId);
    }
    return map;
  }, [siblingDrafts]);

  return (
    <>
      <header className="mtg-header">
        <h2 className="mtg-title">{meeting.meetingTitle}</h2>
        <div className="mtg-meta">
          <span className="mtg-meta-item">
            <CalendarIcon />
            {formatDate(meeting.occurredAt)}
          </span>
          {meeting.durationSeconds ? (
            <>
              <MetaDot />
              <span className="mtg-meta-item">
                <ClockIcon size={13} />
                {formatDuration(meeting.durationSeconds)}
              </span>
            </>
          ) : null}
        </div>
        {attendees.length > 0 && (
          <div className="mtg-attendees">
            {attendees.map((a, i) => (
              <AttendeeChip
                key={i}
                attendee={a}
                company={isCustomer(a, customerDomain) ? company : null}
              />
            ))}
          </div>
        )}
        {meeting.onboardingId != null && (
          <Link
            className="mtg-jump"
            href={`/onboardings/${meeting.onboardingId}?tab=meetings`}
          >
            Open in Meetings tab
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </header>

      {meeting.summary && (
        <Section title="Summary" ai>
          <p className="mtg-prose">{meeting.summary}</p>
        </Section>
      )}

      {actionItems.length > 0 && (
        <Section title="Action items" count={actionItems.length} ai>
          <ul className="mtg-items">
            {actionItems.map((item, i) => (
              <ActionItem
                key={i}
                index={i + 1}
                item={item}
                taskCode={item.sourceQuote ? taskCodeByQuote.get(item.sourceQuote) : null}
                onboardingId={meeting.onboardingId}
              />
            ))}
          </ul>
        </Section>
      )}

      {drafts.length > 0 && (
        <Section title="Drafts from this meeting" count={drafts.length} ai>
          <ul className="mtg-drafts">
            {drafts.map((d) => (
              <DraftRow key={d.id} draft={d} onboardingId={meeting.onboardingId} />
            ))}
          </ul>
        </Section>
      )}

      <Transcript
        transcript={transcript}
        attendees={attendees}
        customerDomain={customerDomain}
      />
    </>
  );
}

/**
 * Section shell. Mirrors `InsightSection`: a 14px/600 muted title with 0.5px
 * tracking over a hairline. `ai` swaps that hairline for the gradient
 * `.ai-divider` and adds the Vector sparkle, which is how the rest of the app
 * says "a model wrote this".
 */
function Section({ title, count, ai = false, action, children }) {
  return (
    <section className="mtg-section">
      <div className="mtg-section-head">
        <div className="mtg-section-row">
          <span className="mtg-section-titles">
            {ai && <Sparkle size={14} />}
            <h3 className="mtg-section-title">{title}</h3>
            {count != null && <span className="mtg-section-count">{count}</span>}
          </span>
          {action}
        </div>
        {ai ? (
          <div role="separator" aria-hidden="true" className="ai-divider" />
        ) : (
          <div role="separator" aria-hidden="true" className="mtg-rule" />
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * One extracted claim. The source quote is collapsed rather than always
 * shown: on a typical meeting it repeats the claim almost verbatim and used
 * to run to a third of the panel before the reader reached the drafts.
 * Expanded, it renders as a ruled blockquote so the claim still leads.
 */
function ActionItem({ index, item, taskCode, onboardingId }) {
  const [showQuote, setShowQuote] = useState(false);
  const firm = item.firmness === "firm";
  const hasQuote = Boolean(item.sourceQuote);

  return (
    <li className="mtg-item">
      <span className="mtg-item-index" aria-hidden="true">
        {String(index).padStart(2, "0")}
      </span>
      <div className="mtg-item-main">
        <div className="mtg-item-top">
          <span className="mtg-item-claim">{item.claim}</span>
          {item.firmness && (
            <Badge color={firm ? "success" : "alert"} size="sm">
              {item.firmness}
            </Badge>
          )}
        </div>
        {(hasQuote || taskCode) && (
          <div className="mtg-item-actions">
            {hasQuote && (
              <Button
                variant="tertiary"
                size="xs"
                aria-expanded={showQuote}
                onClick={() => setShowQuote((v) => !v)}
              >
                {showQuote ? "Hide quote" : "Show quote"}
              </Button>
            )}
            {taskCode && (
              <Link href={`/onboardings/${onboardingId}?tab=tasks`} title={`Open ${taskCode}`}>
                <TaskIdChip task={{ taskId: taskCode }} />
              </Link>
            )}
          </div>
        )}
        {showQuote && hasQuote && (
          <blockquote className="mtg-quote">&ldquo;{item.sourceQuote}&rdquo;</blockquote>
        )}
      </div>
    </li>
  );
}

/**
 * Draft row, on AIDraftInbox's shape: what kind of change it is, what it
 * says, and where it got to. Approving from here is deliberately not wired —
 * the inbox owns that state machine (selection, edit-before-approve, bulk
 * approve), so a pending row links across instead of forking it.
 */
function DraftRow({ draft, onboardingId }) {
  const pending = draft.status === "pending";
  return (
    <li className="mtg-draft">
      <Badge color="muted" size="sm">
        {draftActionLabel(draft.action)}
      </Badge>
      <div className="mtg-draft-main">
        <span className="mtg-draft-title">{draft.title ?? "Untitled draft"}</span>
        {(draft.taskId || pending) && (
          <div className="mtg-draft-meta">
            {draft.taskId && (
              <Link
                href={`/onboardings/${onboardingId}?tab=tasks`}
                title={`Open ${draft.taskId}`}
              >
                <TaskIdChip task={{ taskId: draft.taskId }} />
              </Link>
            )}
            {pending && (
              <Link className="mtg-jump" href={`/onboardings/${onboardingId}?tab=actions`}>
                Review in Actions
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        )}
      </div>
      <Badge color={DRAFT_STATUS_COLOR[draft.status] ?? "muted"} size="sm">
        {draft.status}
      </Badge>
    </li>
  );
}

function Transcript({ transcript, attendees, customerDomain }) {
  const [open, setOpen] = useState(false);
  const empty = transcript.length === 0;

  return (
    <Section
      title="Transcript"
      count={empty ? undefined : `${transcript.length} turns`}
      action={
        empty ? null : (
          <Button
            variant="tertiary"
            size="xs"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Show"}
          </Button>
        )
      }
    >
      {empty && <p className="mtg-empty">No transcript on this meeting.</p>}
      {!empty && open && (
        <div className="mtg-turns">
          {transcript.map((t, i) => {
            const customer = speakerIsCustomer(t.speaker, attendees, customerDomain);
            return (
              <div key={i} className={`mtg-turn${customer ? " mtg-turn--customer" : ""}`}>
                <span className="mtg-turn-speaker">{t.speaker}</span>
                <span className="mtg-turn-text">{t.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/**
 * Attendee chip. Pass `company` for a customer attendee and the square
 * company mark replaces the round person avatar — the one visual difference
 * between the two sides. Email sits in the tooltip so the row stays scannable.
 */
function AttendeeChip({ attendee, company }) {
  const { name, email } = attendee;
  const display = name || email || "Attendee";
  const lines = [display];
  if (email && email !== display) lines.push(email);
  if (company?.name) lines.push(company.name);

  return (
    <Tooltip lines={lines}>
      <span className="mtg-attendee">
        {company ? (
          <CompanyAvatar name={company.name} logoUrl={company.logoUrl} size={20} />
        ) : (
          <PersonAvatar name={name} email={email} />
        )}
        {display}
      </span>
    </Tooltip>
  );
}

function PersonAvatar({ name, email, size = 20 }) {
  const key = name || email || "?";
  if (name && AVATAR_IMAGES[name]) {
    return (
      <Image
        src={AVATAR_IMAGES[name]}
        alt=""
        width={size}
        height={size}
        className="rounded-full flex-shrink-0 object-cover"
      />
    );
  }
  // The colour is derived per name, so this one stays an inline style.
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center rounded-full flex-shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        background: avatarColor(key),
        color: "var(--text-dark)",
        fontSize: 10,
        lineHeight: 1,
      }}
    >
      {avatarInitials(key)}
    </span>
  );
}

function MetaDot() {
  return <span aria-hidden="true">·</span>;
}

const DRAFT_STATUS_COLOR = {
  applied: "success",
  pending: "muted",
  rejected: "danger",
};

/** Mirrors AIDraftInbox's action vocabulary, lower-cased for a Badge. */
const DRAFT_ACTION_LABEL = {
  create_task: "task",
  match_existing: "update",
  update_status: "status",
  draft_followup: "follow-up",
};

function draftActionLabel(action) {
  return DRAFT_ACTION_LABEL[action] ?? String(action ?? "draft").replace(/_/g, " ");
}

/** Domain part of an email, lower-cased. Null for anything unparseable. */
function emailDomain(email) {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/** An attendee on the onboarding company's own domain is the customer. */
function isCustomer(attendee, customerDomain) {
  if (!customerDomain) return false;
  const domain = attendee?.domain
    ? String(attendee.domain).toLowerCase()
    : emailDomain(attendee?.email);
  return domain === customerDomain;
}

/** Transcript speakers are attendee names; "You" is always the vendor. */
function speakerIsCustomer(speaker, attendees, customerDomain) {
  if (!speaker || speaker === "You") return false;
  const match = attendees.find((a) => a.name === speaker);
  return match ? isCustomer(match, customerDomain) : false;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Miniti reports seconds; the header wants "16 min" / "1 hr 12 min". */
function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(Number(seconds) / 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hrs} hr ${rest} min` : `${hrs} hr`;
}
