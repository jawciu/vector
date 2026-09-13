"use client";

/**
 * The glyph for an AI draft's kind (create task, due date, reassign, status,
 * follow-up…). Shared by AIDraftInbox's cards and MeetingDrawer's draft rows
 * so the same draft reads the same everywhere. Lives in its own module
 * because the drawer is itself mounted by the inbox; importing from the
 * inbox would make the two files a cycle.
 */
/** Inline SVG action icon, 14×14, no background, `var(--icon-tertiary)`.
 *  For `match_existing`, branches on `payload.action` so the icon matches
 *  the sub-action. For `create_task`, uses the same "not done" circle+check
 *  shape as the Kanban CheckboxButton so the card reads as an unfinished
 *  task. */
export function ActionIcon({ action, payload }) {
  let icon;
  if (action === "create_task") {
    icon = <NotDoneCheckIcon />;
  } else if (action === "match_existing") {
    const sub = payload?.action;
    if (sub === "update_due_date") icon = <ActionCalendarIcon />;
    else if (sub === "reassign") icon = <ActionPersonIcon />;
    else if (sub === "reprioritise") icon = <ActionFlagIcon />;
    else if (sub === "comment_only") icon = <ActionCommentIcon />;
    else icon = <ActionGridIcon />;
  } else if (action === "update_status") {
    icon = <ActionCycleIcon />;
  } else if (action === "draft_followup") {
    icon = <ActionEnvelopeIcon />;
  } else {
    icon = <ActionGridIcon />;
  }
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        // Match the card-type title (the verb span uses --text-muted) so the
        // icon and its label read as one unit.
        color: "var(--text-muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </span>
  );
}

/** Same "not done" circle+ghost-check as TaskCardView CheckboxButton.
 *  Used by ActionIcon's create_task fallback branch. */
function NotDoneCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
      <path d="M3.5 7L6.5 9.5L10.5 4.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function ActionCalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="3" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 6h10" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 1.5v2M9 1.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ActionPersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.5 12.25c.6-2.1 2.4-3.25 4.5-3.25s3.9 1.15 4.5 3.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ActionFlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 1.5v11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M3.5 2h7l-1.5 2.25L10.5 6.5h-7" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function ActionCommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 12 4v4a1.5 1.5 0 0 1-1.5 1.5H6.5L4 12V9.5h-.5A1.5 1.5 0 0 1 2 8V4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function ActionGridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="2" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8" y="2" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="2" y="8" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8" y="8" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function ActionCycleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7a4.5 4.5 0 0 1 7.7-3.2L12 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2v3.5h-3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 7a4.5 4.5 0 0 1-7.7 3.2L2 8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12V8.5h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActionEnvelopeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="11" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 4l5 4 5-4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
