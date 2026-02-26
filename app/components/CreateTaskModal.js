"use client";

import { useState, useEffect, useRef } from "react";
import Button from "../ui/Button";
import FieldPill from "../ui/FieldPill";
import FieldRow from "../ui/FieldRow";
import CalendarDropdown from "../ui/CalendarDropdown";
import { CalendarIcon, PriorityIcon, StatusIcon, OwnerIcon, MembersIcon, DependenciesIcon } from "../ui/Icons";
import { MenuList, MenuOption } from "./Menu";

const TASK_STATUSES = ["Not started", "In progress", "Under investigation", "Blocked", "Done"];
const PRIORITIES = ["low", "medium", "high"];

const AVATAR_COLORS = [
  "var(--sunset)", "var(--lilac)", "var(--sky)", "var(--candy)",
  "var(--mint)", "var(--rose)", "var(--alert)", "var(--success)",
];

function companyInitials(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase();
}

function companyLogoColor(name) {
  const n = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function ChevronIcon() {
  return (
    <svg width="6" height="11" viewBox="0 0 6 11" fill="none" style={{ color: "var(--text-muted)" }}>
      <path d="M1 1L5 5.5L1 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      className="flex items-center justify-center flex-shrink-0"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <CloseIcon size={9} />
    </button>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="#999599" strokeWidth="1.1" fill="none" />
      <line x1="4" y1="5" x2="10" y2="5" stroke="#999599" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4" y1="7.5" x2="10" y2="7.5" stroke="#999599" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4" y1="10" x2="7.5" y2="10" stroke="#999599" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export default function CreateTaskModal({
  open,
  onClose,
  onboardingId,
  phaseId,
  phaseName,
  companyName,
  onTaskCreated,
  people = [],
  allTasks = [],
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "Not started",
    priority: null,
    due: "",
    owner: "",
    members: [],
    notes: "",
    blockedByTaskId: null,
  });

  // Dropdown states
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersSearch, setMembersSearch] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dependenciesOpen, setDependenciesOpen] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  // Refs for outside-click detection
  const calendarRef = useRef(null);
  const priorityRef = useRef(null);
  const statusRef = useRef(null);
  const ownerRef = useRef(null);
  const membersRef = useRef(null);
  const membersSearchRef = useRef(null);
  const dependenciesRef = useRef(null);

  useEffect(() => {
    if (open && titleRef.current) {
      titleRef.current.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close any open dropdown when clicking outside its container
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (calendarOpen && calendarRef.current && !calendarRef.current.contains(e.target)) setCalendarOpen(false);
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(e.target)) setPriorityOpen(false);
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
      if (ownerOpen && ownerRef.current && !ownerRef.current.contains(e.target)) setOwnerOpen(false);
      if (membersOpen && membersRef.current && !membersRef.current.contains(e.target)) { setMembersOpen(false); setMembersSearch(""); }
      if (dependenciesOpen && dependenciesRef.current && !dependenciesRef.current.contains(e.target)) setDependenciesOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, calendarOpen, priorityOpen, statusOpen, ownerOpen, membersOpen, dependenciesOpen]);

  // Close all dropdowns (used before opening a new one)
  function closeAll() {
    setCalendarOpen(false);
    setPriorityOpen(false);
    setStatusOpen(false);
    setOwnerOpen(false);
    setMembersOpen(false);
    setMembersSearch("");
    setDependenciesOpen(false);
  }

  // Toggle a dropdown: close all others, then toggle this one
  function toggleDropdown(name, currentlyOpen, setter) {
    const wasOpen = currentlyOpen;
    closeAll();
    if (!wasOpen) setter(true);
  }

  function resetForm() {
    setFormData({
      title: "",
      description: "",
      status: "Not started",
      priority: null,
      due: "",
      owner: "",
      members: [],
      notes: "",
      blockedByTaskId: null,
    });
    setError("");
    closeAll();
    setViewDate(new Date());
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingId,
          phaseId,
          title: formData.title,
          description: formData.description,
          status: formData.status,
          priority: formData.priority,
          due: formData.due,
          owner: formData.owner,
          members: formData.members,
          notes: formData.notes,
          blockedByTaskId: formData.blockedByTaskId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create task");
      }

      const newTask = await response.json();
      handleClose();
      if (onTaskCreated) onTaskCreated(newTask);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-8 w-full max-w-[640px] rounded-[20px]"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: breadcrumbs + close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span
                className="flex shrink-0 w-3.5 h-3.5 rounded-[3px] items-center justify-center text-[8px] font-semibold"
                style={{ background: companyLogoColor(companyName), color: "var(--text-dark)" }}
                aria-hidden
              >
                {companyInitials(companyName)}
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {companyName}
              </span>
            </div>
            <ChevronIcon />
            <span className="text-sm" style={{ color: "var(--text)" }}>{phaseName}</span>
            <ChevronIcon />
            <span className="text-sm" style={{ color: "var(--text)" }}>New task</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-5 h-5 rounded icon-btn"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Form body */}
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

          {/* Title + Description */}
          <div className="flex flex-col gap-2">
            <input
              ref={titleRef}
              type="text"
              placeholder="Task name"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
              className="text-base w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                padding: 0,
              }}
            />
            <input
              type="text"
              placeholder="Add a short description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              className="text-sm w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: formData.description ? "var(--text)" : "var(--text-muted)",
                padding: 0,
              }}
            />
          </div>

          {/* Target / Priority / Status row */}
          <div className="flex items-center gap-2">
            {/* Target (due date) */}
            <div ref={calendarRef} className="flex-1 relative">
              <FieldPill
                icon={<CalendarIcon style={{ flexShrink: 0 }} />}
                active={calendarOpen}
                onClick={() => toggleDropdown("calendar", calendarOpen, setCalendarOpen)}
              >
                <span className="text-sm flex-1" style={{ color: formData.due || calendarOpen ? "var(--text)" : "var(--text-muted)" }}>
                  {formData.due
                    ? new Date(formData.due + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "Target"}
                </span>
                {formData.due && (
                  <PillClearButton onClick={(e) => { e.stopPropagation(); handleChange("due", ""); }} />
                )}
              </FieldPill>
              {calendarOpen && (
                <CalendarDropdown
                  value={formData.due}
                  viewDate={viewDate}
                  onViewDateChange={setViewDate}
                  onChange={(date) => { handleChange("due", date); setCalendarOpen(false); }}
                  onClear={() => { handleChange("due", ""); setCalendarOpen(false); }}
                  onClose={() => setCalendarOpen(false)}
                />
              )}
            </div>

            {/* Priority */}
            <div ref={priorityRef} className="flex-1 relative">
              <FieldPill
                icon={<PriorityIcon priority={formData.priority} style={{ flexShrink: 0 }} />}
                active={priorityOpen}
                onClick={() => toggleDropdown("priority", priorityOpen, setPriorityOpen)}
              >
                <span className="text-sm capitalize flex-1" style={{ color: formData.priority || priorityOpen ? "var(--text)" : "var(--text-muted)" }}>
                  {formData.priority || "Priority"}
                </span>
                {formData.priority && (
                  <PillClearButton onClick={(e) => { e.stopPropagation(); handleChange("priority", null); }} />
                )}
              </FieldPill>
              {priorityOpen && (
                <MenuList style={{ background: "var(--bg-elevated)", width: "100%" }}>
                  {PRIORITIES.map((p) => (
                    <MenuOption
                      key={p}
                      active={formData.priority === p}
                      onClick={() => { handleChange("priority", formData.priority === p ? null : p); setPriorityOpen(false); }}
                      className="capitalize"
                    >
                      {p}
                    </MenuOption>
                  ))}
                </MenuList>
              )}
            </div>

            {/* Status */}
            <div ref={statusRef} className="flex-1 relative">
              <FieldPill
                icon={<StatusIcon style={{ flexShrink: 0 }} />}
                active={statusOpen}
                onClick={() => toggleDropdown("status", statusOpen, setStatusOpen)}
              >
                <span className="text-sm flex-1" style={{ color: formData.status === "Not started" && !statusOpen ? "var(--text-muted)" : "var(--text)" }}>
                  {formData.status}
                </span>
                {formData.status !== "Not started" && (
                  <PillClearButton onClick={(e) => { e.stopPropagation(); handleChange("status", "Not started"); }} />
                )}
              </FieldPill>
              {statusOpen && (
                <MenuList style={{ background: "var(--bg-elevated)", width: "100%" }}>
                  {TASK_STATUSES.map((s) => (
                    <MenuOption
                      key={s}
                      active={formData.status === s}
                      onClick={() => { handleChange("status", s); setStatusOpen(false); }}
                    >
                      {s}
                    </MenuOption>
                  ))}
                </MenuList>
              )}
            </div>
          </div>

          {/* Owner */}
          <div ref={ownerRef} className="relative">
            <FieldRow
              icon={<OwnerIcon style={{ flexShrink: 0 }} />}
              active={ownerOpen}
              onClick={() => toggleDropdown("owner", ownerOpen, setOwnerOpen)}
            >
              {formData.owner ? (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {formData.owner}
                  </span>
                  <PillClearButton onClick={(e) => { e.stopPropagation(); handleChange("owner", ""); }} />
                </div>
              ) : (
                <span className="text-sm" style={{ color: ownerOpen ? "var(--text)" : "var(--text-muted)" }}>Owner</span>
              )}
            </FieldRow>
            {ownerOpen && (
              <MenuList style={{ background: "var(--bg-elevated)", width: "100%", maxHeight: 160, overflowY: "auto" }}>
                {people.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No people available</div>
                ) : (
                  people.map((person) => (
                    <MenuOption
                      key={person}
                      active={formData.owner === person}
                      onClick={() => { handleChange("owner", formData.owner === person ? "" : person); setOwnerOpen(false); }}
                    >
                      {person}
                    </MenuOption>
                  ))
                )}
              </MenuList>
            )}
          </div>

          {/* Members */}
          <div ref={membersRef} className="relative">
            <FieldRow
              icon={<MembersIcon style={{ flexShrink: 0 }} />}
              active={membersOpen}
              onClick={() => {
                const wasOpen = membersOpen;
                toggleDropdown("members", membersOpen, setMembersOpen);
                if (!wasOpen) setTimeout(() => membersSearchRef.current?.focus(), 0);
              }}
            >
              {formData.members.length > 0 ? (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {formData.members.length === 1
                      ? formData.members[0]
                      : `${formData.members.length} members`}
                  </span>
                  <PillClearButton onClick={(e) => { e.stopPropagation(); handleChange("members", []); }} />
                </div>
              ) : (
                <span className="text-sm" style={{ color: membersOpen ? "var(--text)" : "var(--text-muted)" }}>Members</span>
              )}
            </FieldRow>
            {membersOpen && (
              <div
                className="absolute left-0 z-10 rounded border flex flex-col shadow-lg"
                style={{
                  top: "calc(100% + 4px)",
                  background: "var(--bg-elevated)",
                  borderColor: "var(--button-secondary-border)",
                  width: "100%",
                }}
              >
                {/* Search */}
                <div
                  className="flex items-center gap-2.5 px-1.5 py-1.5"
                  style={{ borderBottom: "1px solid var(--button-secondary-border)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="6" cy="6" r="4.5" stroke="var(--text-muted)" strokeWidth="1.2" />
                    <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <input
                    ref={membersSearchRef}
                    type="text"
                    placeholder="Search"
                    value={membersSearch}
                    onChange={(e) => setMembersSearch(e.target.value)}
                    className="text-sm w-full outline-none"
                    style={{ background: "transparent", border: "none", color: "var(--text)", padding: 0 }}
                  />
                </div>
                {/* People list */}
                <div className="flex flex-col gap-0.5 px-0.5 pt-1 pb-0.5" style={{ maxHeight: 200, overflowY: "auto" }}>
                  {people.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No people available</div>
                  ) : (
                    people
                      .filter((p) => p.toLowerCase().includes(membersSearch.toLowerCase()))
                      .map((person) => {
                        const isSelected = formData.members.includes(person);
                        return (
                          <button
                            key={person}
                            type="button"
                            className="group flex w-full items-center gap-2.5 rounded p-1 text-left text-sm transition-colors"
                            style={{
                              background: isSelected ? "var(--list-item-selected, var(--surface-hover))" : "transparent",
                              color: isSelected ? "var(--text)" : "var(--text-muted)",
                            }}
                            onClick={() => {
                              handleChange(
                                "members",
                                isSelected
                                  ? formData.members.filter((m) => m !== person)
                                  : [...formData.members, person]
                              );
                            }}
                          >
                            {/* Checkbox */}
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                              {isSelected ? (
                                <path d="M10 0C12.2091 0 14 1.79086 14 4V10C14 12.2091 12.2091 14 10 14H4C1.79086 14 9.66399e-08 12.2091 0 10V4C0 1.79086 1.79086 9.66384e-08 4 0H10ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z" fill="#C098FF"/>
                              ) : (
                                <>
                                  <rect x="0.5" y="0.5" width="13" height="13" rx="3.5" stroke="#5D565D" className="group-hover:hidden" />
                                  <rect x="0.5" y="0.5" width="13" height="13" rx="3.5" stroke="#C098FF" className="hidden group-hover:block" />
                                </>
                              )}
                            </svg>
                            {/* Avatar */}
                            <span
                              className="flex shrink-0 w-[18px] h-[18px] rounded-full items-center justify-center text-[8px] font-semibold"
                              style={{ background: companyLogoColor(person), color: "var(--text-dark)" }}
                            >
                              {companyInitials(person)}
                            </span>
                            {person}
                          </button>
                        );
                      })
                  )}
                  {people.length > 0 && people.filter((p) => p.toLowerCase().includes(membersSearch.toLowerCase())).length === 0 && (
                    <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No matches</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dependencies */}
          <div ref={dependenciesRef} className="relative">
            <FieldRow
              icon={<DependenciesIcon style={{ flexShrink: 0 }} />}
              active={dependenciesOpen}
              onClick={() => toggleDropdown("dependencies", dependenciesOpen, setDependenciesOpen)}
            >
              {formData.blockedByTaskId ? (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-sm truncate" style={{ color: "var(--text)" }}>
                    {allTasks.find((t) => t.id === formData.blockedByTaskId)?.title || "Task"}
                  </span>
                  <PillClearButton onClick={(e) => { e.stopPropagation(); handleChange("blockedByTaskId", null); }} />
                </div>
              ) : (
                <span className="text-sm" style={{ color: dependenciesOpen ? "var(--text)" : "var(--text-muted)" }}>Dependencies</span>
              )}
            </FieldRow>
            {dependenciesOpen && (
              <MenuList style={{ background: "var(--bg-elevated)", width: "100%", maxHeight: 160, overflowY: "auto" }}>
                {allTasks.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No other tasks</div>
                ) : (
                  allTasks.map((t) => (
                    <MenuOption
                      key={t.id}
                      active={formData.blockedByTaskId === t.id}
                      onClick={() => {
                        handleChange("blockedByTaskId", formData.blockedByTaskId === t.id ? null : t.id);
                        setDependenciesOpen(false);
                      }}
                    >
                      {t.title}
                    </MenuOption>
                  ))
                )}
              </MenuList>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-2">
              <NotesIcon />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Notes</span>
            </div>
            <textarea
              placeholder="Write your notes here"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              onFocus={() => setNotesFocused(true)}
              onBlur={() => setNotesFocused(false)}
              rows={3}
              className="text-sm w-full outline-none resize-vertical rounded-lg notes-textarea"
              style={{
                background: "var(--bg-elevated)",
                border: `1px solid ${notesFocused ? "var(--action)" : "var(--button-secondary-border)"}`,
                color: "var(--text)",
                padding: "8px 12px",
              }}
            />
          </div>
        </div>

        {/* Footer: Cancel + Create task */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Creating…" : "Create task"}
          </Button>
        </div>
      </form>
    </div>
  );
}
