"use client";

import { useState, useEffect, useRef } from "react";
import Button from "../ui/Button";
import FieldPill from "../ui/FieldPill";
import CalendarDropdown from "../ui/CalendarDropdown";
import { CalendarIcon, OwnerIcon, MembersIcon } from "../ui/Icons";
import { MenuList, MenuOption } from "./Menu";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import CompanyAvatar from "@/app/ui/CompanyAvatar";

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
      className="flex items-center justify-center shrink-0 ml-2! cursor-pointer border-none bg-transparent p-0"
    >
      <CloseIcon size={9} />
    </button>
  );
}

export default function CreateOnboardingModal({ open, onClose, onCreated }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingCompanies, setFetchingCompanies] = useState(false);
  const [error, setError] = useState("");

  const [companyMode, setCompanyMode] = useState("new"); // "new" | "existing"
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [owner, setOwner] = useState("");
  const [targetGoLive, setTargetGoLive] = useState("");

  const [companyOpen, setCompanyOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const companyRef = useRef(null);
  const calendarRef = useRef(null);

  useClickOutside(companyRef, () => setCompanyOpen(false), companyOpen);
  useClickOutside(calendarRef, () => setCalendarOpen(false), calendarOpen);

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setFetchingCompanies(true);
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCompanies(data);
      })
      .catch(() => {})
      .finally(() => setFetchingCompanies(false));
  }, [open]);

  function resetForm() {
    setCompanyMode("new");
    setSelectedCompanyId("");
    setNewCompanyName("");
    setDomain("");
    setOwner("");
    setTargetGoLive("");
    setError("");
    setCompanyOpen(false);
    setCalendarOpen(false);
    setViewDate(new Date());
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const selectedCompany = companies.find((c) => String(c.id) === String(selectedCompanyId));

  // When user picks an existing company, prefill the domain from its record
  // so they can see/edit it without a second click.
  useEffect(() => {
    if (companyMode === "existing" && selectedCompany) {
      setDomain(selectedCompany.domain ?? "");
    }
  }, [companyMode, selectedCompany]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let companyId = selectedCompanyId;
      const trimmedDomain = domain.trim().toLowerCase() || null;

      if (companyMode === "new") {
        if (!newCompanyName.trim()) {
          setError("Company name is required");
          setLoading(false);
          return;
        }
        const companyRes = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCompanyName.trim(), domain: trimmedDomain }),
        });
        if (!companyRes.ok) {
          const err = await companyRes.json();
          throw new Error(err.error || "Failed to create company");
        }
        const newCompany = await companyRes.json();
        companyId = newCompany.id;
      } else if (selectedCompany && (selectedCompany.domain ?? null) !== trimmedDomain) {
        // Existing company selected and the user changed the domain — patch it.
        const patchRes = await fetch(`/api/companies/${companyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: trimmedDomain }),
        });
        if (!patchRes.ok) {
          const err = await patchRes.json();
          throw new Error(err.error || "Failed to update company domain");
        }
      }

      if (!companyId) {
        setError("Please select or create a company");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/onboardings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          owner: owner.trim(),
          targetGoLive: targetGoLive || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create workspace");
      }

      const onboarding = await res.json();
      resetForm();
      onClose();
      if (onCreated) onCreated(onboarding);
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
        className="flex flex-col gap-8 w-full max-w-[480px] rounded-[20px]"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            New workspace
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-5 h-5 rounded icon-btn"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
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

          {/* Company mode toggle */}
          <div className="flex items-center gap-1">
            <ModeToggle
              label="New"
              active={companyMode === "new"}
              onClick={() => setCompanyMode("new")}
            />
            <ModeToggle
              label="Existing"
              active={companyMode === "existing"}
              onClick={() => setCompanyMode("existing")}
            />
          </div>

          {/* Company selector */}
          {companyMode === "existing" ? (
            <div ref={companyRef} className="relative">
              <FieldPill
                icon={<MembersIcon style={{ flexShrink: 0 }} />}
                active={companyOpen}
                onClick={() => setCompanyOpen((o) => !o)}
              >
                {selectedCompany ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <CompanyAvatar
                      name={selectedCompany.name}
                      logoUrl={selectedCompany.logoUrl}
                      size={16}
                      radius={3}
                      fontSize={8}
                    />
                    <span className="text-sm" style={{ color: "var(--text)" }}>
                      {selectedCompany.name}
                    </span>
                    <PillClearButton
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCompanyId("");
                      }}
                    />
                  </div>
                ) : (
                  <span
                    className="text-sm flex-1"
                    style={{ color: companyOpen ? "var(--text)" : "var(--text-muted)" }}
                  >
                    {fetchingCompanies ? "Loading…" : "Company"}
                  </span>
                )}
              </FieldPill>
              {companyOpen && (
                <MenuList
                  style={{
                    background: "var(--bg-elevated)",
                    width: "100%",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {companies.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                      No companies yet
                    </div>
                  ) : (
                    companies.map((c) => (
                      <MenuOption
                        key={c.id}
                        active={String(selectedCompanyId) === String(c.id)}
                        onClick={() => {
                          setSelectedCompanyId(c.id);
                          setCompanyOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <CompanyAvatar
                            name={c.name}
                            logoUrl={c.logoUrl}
                            size={18}
                            radius={3}
                            fontSize={8}
                          />
                          {c.name}
                        </div>
                      </MenuOption>
                    ))
                  )}
                </MenuList>
              )}
            </div>
          ) : (
            <input
              type="text"
              placeholder="Company name"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              autoFocus
              className="text-base w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                padding: 0,
              }}
            />
          )}

          {/* Domain — used to match meeting attendees to this company (Miniti integration) */}
          <FieldPill icon={<DomainIcon style={{ flexShrink: 0 }} />}>
            <input
              type="text"
              placeholder="Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="text-sm w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                padding: 0,
              }}
            />
            {domain && (
              <PillClearButton
                onClick={(e) => {
                  e.stopPropagation();
                  setDomain("");
                }}
              />
            )}
          </FieldPill>

          {/* Owner */}
          <FieldPill icon={<OwnerIcon style={{ flexShrink: 0 }} />}>
            <input
              type="text"
              placeholder="Owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="text-sm w-full outline-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                padding: 0,
              }}
            />
            {owner && (
              <PillClearButton
                onClick={(e) => {
                  e.stopPropagation();
                  setOwner("");
                }}
              />
            )}
          </FieldPill>

          {/* Target go-live */}
          <div ref={calendarRef} className="relative">
            <FieldPill
              icon={<CalendarIcon style={{ flexShrink: 0 }} />}
              active={calendarOpen}
              onClick={() => setCalendarOpen((o) => !o)}
            >
              <span
                className="text-sm flex-1"
                style={{ color: targetGoLive || calendarOpen ? "var(--text)" : "var(--text-muted)" }}
              >
                {targetGoLive
                  ? new Date(targetGoLive + "T00:00:00").toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Target go-live"}
              </span>
              {targetGoLive && (
                <PillClearButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setTargetGoLive("");
                  }}
                />
              )}
            </FieldPill>
            {calendarOpen && (
              <CalendarDropdown
                value={targetGoLive}
                viewDate={viewDate}
                onViewDateChange={setViewDate}
                onChange={(date) => {
                  setTargetGoLive(date);
                  setCalendarOpen(false);
                }}
                onClear={() => {
                  setTargetGoLive("");
                  setCalendarOpen(false);
                }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DomainIcon({ style }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-muted)", ...style }}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1" />
      <path d="M1.5 7H12.5M7 1.5C8.5 3 9.5 5 9.5 7C9.5 9 8.5 11 7 12.5M7 1.5C5.5 3 4.5 5 4.5 7C4.5 9 5.5 11 7 12.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function ModeToggle({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mode-toggle text-xs font-medium rounded-md transition-colors"
      data-active={active ? "true" : undefined}
      style={{
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 10,
        paddingRight: 10,
        color: active ? "var(--text)" : "var(--text-muted)",
        background: active ? "var(--surface-hover)" : "transparent",
        border: active ? "1px solid var(--border)" : "1px solid transparent",
      }}
    >
      {label}
    </button>
  );
}
