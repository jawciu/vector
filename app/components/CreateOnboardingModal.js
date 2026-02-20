"use client";

import { useState, useEffect, useRef } from "react";
import Button from "../ui/Button";

export default function CreateOnboardingModal({ open, onClose, onCreated }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingCompanies, setFetchingCompanies] = useState(false);
  const [error, setError] = useState("");

  const [companyMode, setCompanyMode] = useState("existing"); // "existing" | "new"
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [owner, setOwner] = useState("");
  const [targetGoLive, setTargetGoLive] = useState("");

  const modalRef = useRef(null);

  // Fetch companies when modal opens
  useEffect(() => {
    if (!open) return;
    setFetchingCompanies(true);
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCompanies(data);
        }
      })
      .catch(() => {})
      .finally(() => setFetchingCompanies(false));
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  function resetForm() {
    setCompanyMode("existing");
    setSelectedCompanyId("");
    setNewCompanyName("");
    setOwner("");
    setTargetGoLive("");
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let companyId = selectedCompanyId;

      // Create new company if needed
      if (companyMode === "new") {
        if (!newCompanyName.trim()) {
          setError("Company name is required");
          setLoading(false);
          return;
        }

        const companyRes = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCompanyName.trim() }),
        });

        if (!companyRes.ok) {
          const err = await companyRes.json();
          throw new Error(err.error || "Failed to create company");
        }

        const newCompany = await companyRes.json();
        companyId = newCompany.id;
      }

      if (!companyId) {
        setError("Please select or create a company");
        setLoading(false);
        return;
      }

      // Create the onboarding
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
        throw new Error(err.error || "Failed to create onboarding");
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
            New Onboarding
          </h2>
          <button
            type="button"
            onClick={() => { resetForm(); onClose(); }}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Company selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Company
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompanyMode("existing")}
                className="text-xs font-medium rounded-md"
                style={{
                  paddingTop: 4,
                  paddingBottom: 4,
                  paddingLeft: 10,
                  paddingRight: 10,
                  color: companyMode === "existing" ? "var(--text)" : "var(--text-muted)",
                  background: companyMode === "existing" ? "var(--surface-hover)" : "transparent",
                  border: companyMode === "existing" ? "1px solid var(--border)" : "1px solid transparent",
                }}
              >
                Existing
              </button>
              <button
                type="button"
                onClick={() => setCompanyMode("new")}
                className="text-xs font-medium rounded-md"
                style={{
                  paddingTop: 4,
                  paddingBottom: 4,
                  paddingLeft: 10,
                  paddingRight: 10,
                  color: companyMode === "new" ? "var(--text)" : "var(--text-muted)",
                  background: companyMode === "new" ? "var(--surface-hover)" : "transparent",
                  border: companyMode === "new" ? "1px solid var(--border)" : "1px solid transparent",
                }}
              >
                New
              </button>
            </div>

            {companyMode === "existing" ? (
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="py-2.5 px-3 rounded-lg text-sm w-full"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: selectedCompanyId ? "var(--text)" : "var(--text-muted)",
                }}
              >
                <option value="">
                  {fetchingCompanies ? "Loading..." : "Select a company"}
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Company name"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                autoFocus
                className="py-2.5 px-3 rounded-lg text-sm w-full"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
            )}
          </div>

          {/* Owner */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Owner
            </label>
            <input
              type="text"
              placeholder="Who's responsible for this onboarding?"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="py-2.5 px-3 rounded-lg text-sm w-full"
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* Target go-live date */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Target go-live date
            </label>
            <input
              type="date"
              value={targetGoLive}
              onChange={(e) => setTargetGoLive(e.target.value)}
              className="py-2.5 px-3 rounded-lg text-sm w-full"
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: targetGoLive ? "var(--text)" : "var(--text-muted)",
                colorScheme: "dark",
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => { resetForm(); onClose(); }} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
