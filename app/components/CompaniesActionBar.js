"use client";

export default function CompaniesActionBar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:opacity-90"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        All Companies
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm font-semibold transition-colors hover:opacity-90"
        style={{
          borderColor: "var(--action)",
          background: "var(--action)",
          color: "var(--action-text)",
          paddingTop: "4px",
          paddingBottom: "4px",
          paddingLeft: "8px",
          paddingRight: "8px",
        }}
      >
        + Add Company
      </button>
    </div>
  );
}
