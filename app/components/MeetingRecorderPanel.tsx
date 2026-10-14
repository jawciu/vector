"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import FieldPill from "@/app/ui/FieldPill";
import { OwnerIcon } from "@/app/ui/Icons";
import { MenuList, MenuOption } from "./Menu";

/** Anchor the inbox links to when a draft's owner was the unknown recorder. */
export const MEETING_RECORDER_ANCHOR = "meeting-recorder";

type TeamMember = { id: number; name: string; email: string; role: string };
type Recorder = { id: number; name: string } | null;

type MeetingRecorderPanelProps = {
  /** Team members; only those who can own work (admin / member) are offered. */
  users: TeamMember[];
  initialRecorder: Recorder;
};

/**
 * Meetings section on /settings: who records Miniti meetings.
 *
 * Miniti labels the person recording a call "You" and sends no attendee for
 * them. Saying who that is lets Vector give them what they promise on the
 * call. Saved on pick through PUT /api/integrations/miniti/recorder; the X
 * (or "Nobody") clears it, and the inbox then asks for an owner per draft.
 *
 * Keyboard: the pill is a native button; opening moves focus to the selected
 * person (or the first), Arrow Up/Down/Home/End move between options,
 * Enter/Space pick, Escape or Tab-out closes and focus returns to the pill.
 */
export default function MeetingRecorderPanel({ users, initialRecorder }: MeetingRecorderPanelProps) {
  const [recorder, setRecorder] = useState<Recorder>(initialRecorder);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const labelId = useId();

  const people = users.filter((u) => u.role === "admin" || u.role === "member");

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    // Focus the selected option (or the first) once the list is on screen.
    const options = optionsIn(wrapRef.current);
    const selected = options.find((o) => o.getAttribute("aria-selected") === "true");
    (selected ?? options?.[0])?.focus();
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function focusTrigger() {
    wrapRef.current?.querySelector<HTMLElement>(".field-main")?.focus();
  }

  function close() {
    setOpen(false);
    focusTrigger();
  }

  async function save(vendorUserId: number | null) {
    setOpen(false);
    focusTrigger();
    if ((recorder?.id ?? null) === vendorUserId) return;
    const previous = recorder;
    setRecorder(vendorUserId == null ? null : { id: vendorUserId, name: people.find((p) => p.id === vendorUserId)?.name ?? "" });
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/integrations/miniti/recorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Couldn't save (${res.status})`);
      setRecorder(json.recorder ? { id: json.recorder.id, name: json.recorder.name } : null);
      setStatus({ kind: "saved", text: "Saved" });
    } catch (err) {
      setRecorder(previous);
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const options = optionsIn(wrapRef.current);
    const i = options.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      options[(to + options.length) % options.length]?.focus();
    };
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(options.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") setOpen(false);
  }

  return (
    <section id={MEETING_RECORDER_ANCHOR} aria-labelledby={headingId} className="flex scroll-mt-6 flex-col gap-4">
      <header>
        <h2 id={headingId} className="text-base font-semibold text-text">
          Meetings
        </h2>
        <p className="mt-1 text-sm leading-normal text-text-muted">
          Miniti calls the person recording a meeting &ldquo;You&rdquo;. Tell Vector who that is, so whatever they
          promise on the call is drafted with them as owner. Nobody set: those drafts arrive without an owner and ask
          you to pick one.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <span id={labelId} className="text-sm text-text-secondary">Meetings are recorded by</span>
        <div ref={wrapRef} role="group" aria-labelledby={labelId} className="relative flex max-w-sm">
          <FieldPill
            icon={<OwnerIcon />}
            label="Nobody set"
            active={open}
            popup="listbox"
            onClick={() => !saving && setOpen((o) => !o)}
            onClear={() => save(null)}
          >
            {recorder ? (
              <span className="text-sm break-words text-text">{recorder.name}</span>
            ) : null}
          </FieldPill>
          {open && (
            <MenuList aria-label="Meetings are recorded by" className="min-w-full" onKeyDown={onListKeyDown}>
              {people.map((p) => (
                <MenuOption key={p.id} active={recorder?.id === p.id} onClick={() => save(p.id)}>
                  <span className="break-words">{p.name || p.email}</span>
                </MenuOption>
              ))}
              <MenuOption active={recorder === null} onClick={() => save(null)}>
                Nobody, ask on each draft
              </MenuOption>
            </MenuList>
          )}
        </div>
        <p aria-live="polite" className="min-h-5 text-sm">
          {saving ? (
            <span className="text-text-muted">Saving…</span>
          ) : status ? (
            <span className={status.kind === "error" ? "text-danger" : "text-success"}>{status.text}</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}

function optionsIn(root: HTMLElement | null): HTMLElement[] {
  return Array.from(root?.querySelectorAll<HTMLElement>("[role=listbox] [role=option]") ?? []);
}
