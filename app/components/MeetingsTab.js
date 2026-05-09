"use client";

import { useState, useMemo, useRef } from "react";
import Image from "next/image";
import CalendarDropdown from "@/app/ui/CalendarDropdown";
import { CalendarIcon } from "@/app/ui/Icons";
import { AVATAR_IMAGES, avatarColor, avatarInitials } from "@/lib/avatar";
import MeetingDrawer from "./MeetingDrawer";

/**
 * Per-onboarding "Meetings" tab.
 *
 * Server-fetched list of `getMeetingsForOnboarding(onboardingId)` rows
 * passed in as `meetings`. Test-run events are filtered server-side,
 * so this only ever shows real Miniti meetings.
 *
 * Each row shows: title + date + 1-line summary + attendee chips.
 * Click a row to open the shared `MeetingDrawer` (same drawer the
 * Actions tab opens from a draft's meeting pill).
 *
 * Filters:
 *   - Search (client-side substring across title + summary + attendee names).
 *     Transcript text is intentionally NOT searched so we stay snappy on
 *     onboardings with hundreds of meetings; if you need it, we'll add
 *     Postgres FTS at that point.
 *   - Date picker (single date) — show only meetings on that day.
 *
 * Caroline can also navigate here from an Actions draft card by
 * clicking the meeting title pill in the breadcrumb (which opens the
 * MeetingDrawer; deep-linking into this tab is a future enhancement).
 */
export default function MeetingsTab({ meetings = [] }) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [drawerEventId, setDrawerEventId] = useState(null);

  const filtered = useMemo(() => {
    let list = meetings;
    if (date) {
      list = list.filter((m) => m.occurredAt.slice(0, 10) === date);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const transcriptText = (m.transcript ?? [])
          .map((t) => `${t.speaker ?? ""} ${t.text ?? ""}`)
          .join(" ");
        const haystacks = [
          m.meetingTitle,
          m.summary ?? "",
          transcriptText,
          ...(m.attendees ?? []).map((a) => a.name ?? ""),
          ...(m.attendees ?? []).map((a) => a.email ?? ""),
        ];
        return haystacks.some((s) => typeof s === "string" && s.toLowerCase().includes(q));
      });
    }
    return list;
  }, [meetings, query, date]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "16px 0",
        maxWidth: 720,
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SearchInput value={query} onChange={setQuery} />
          <DateFilterPill value={date} onChange={setDate} />
          {(query || date) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDate("");
              }}
              className="text-btn"
              style={{ padding: "2px 6px", fontSize: 12, color: "var(--text-muted)" }}
            >
              Clear
            </button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {filtered.length} of {meetings.length} meeting{meetings.length === 1 ? "" : "s"}
        </span>
      </header>

      {meetings.length === 0 && (
        <EmptyState>
          No meetings yet. When Miniti delivers a meeting that matches this
          onboarding it&rsquo;ll appear here with summary, attendees, and the
          full transcript.
        </EmptyState>
      )}

      {meetings.length > 0 && filtered.length === 0 && (
        <EmptyState>No meetings match your filters.</EmptyState>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((m) => (
          <MeetingRow
            key={m.id}
            meeting={m}
            onClick={() => setDrawerEventId(m.id)}
          />
        ))}
      </ul>

      <MeetingDrawer
        eventId={drawerEventId}
        onClose={() => setDrawerEventId(null)}
      />
    </div>
  );
}

function MeetingRow({ meeting, onClick }) {
  const dateLabel = formatDate(meeting.occurredAt);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="meeting-card"
        style={{
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            {meeting.meetingTitle}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {dateLabel}</span>
        </div>
        {meeting.summary && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "var(--text-secondary)" }}>
            {meeting.summary}
          </p>
        )}
        {meeting.attendees.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {meeting.attendees.map((a, i) => (
              <AttendeeChip key={i} name={a.name} email={a.email} />
            ))}
          </div>
        )}
      </button>
    </li>
  );
}

export function AttendeeChip({ name, email }) {
  const display = name || email || "Attendee";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px 2px 2px",
        background: "var(--surface-hover)",
        borderRadius: 12,
        fontSize: 12,
        color: "var(--text)",
      }}
    >
      <AttendeeAvatar name={name} email={email} />
      {display}
      {name && email && (
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{email}</span>
      )}
    </span>
  );
}

function AttendeeAvatar({ name, email, size = 18 }) {
  const key = name || email || "?";
  if (name && AVATAR_IMAGES[name]) {
    return (
      <Image
        src={AVATAR_IMAGES[name]}
        alt={name}
        title={name}
        width={size}
        height={size}
        className="rounded-full flex-shrink-0 object-cover"
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: avatarColor(key),
        color: "var(--text-dark)",
        fontSize: 9,
        fontWeight: 600,
      }}
      title={key}
    >
      {avatarInitials(key)}
    </span>
  );
}

/** Calendar-pill date filter — uses the DS CalendarDropdown so the
 *  Meetings tab matches every other date picker in the app. */
function DateFilterPill({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const ref = useRef(null);

  const label = value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-lg"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          fontSize: 13,
          color: label ? "var(--text)" : "var(--text-muted)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          cursor: "pointer",
        }}
      >
        <CalendarIcon style={{ flexShrink: 0 }} />
        <span>{label ?? "Any date"}</span>
      </button>
      {open && (
        <CalendarDropdown
          value={value}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClear={() => {
            onChange("");
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

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
        placeholder="Search title, summary, attendees…"
        aria-label="Search meetings"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: 13,
        }}
      />
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div
      style={{
        padding: "32px 20px",
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        textAlign: "center",
        fontSize: 13,
        color: "var(--text-muted)",
      }}
    >
      {children}
    </div>
  );
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
