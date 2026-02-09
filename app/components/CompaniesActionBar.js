"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";

const FILTERS = ["Active", "Completed", "Paused", "All"];

export default function CompaniesActionBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") || "Active";
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function select(value) {
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "Active") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  const label = current === "All" ? "All Companies" : `${current} Companies`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:opacity-90"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          {label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }} aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div
            className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border py-1 shadow-lg"
            style={{
              background: "var(--bg)",
              borderColor: "var(--border)",
            }}
            role="listbox"
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={f === current}
                onClick={() => select(f)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                style={{
                  color: f === current ? "var(--text)" : "var(--text-muted)",
                  fontWeight: f === current ? 600 : 400,
                  background: "transparent",
                }}
              >
                {f === current && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {f !== current && <span style={{ width: 14 }} />}
                {f === "All" ? "All Companies" : `${f}`}
              </button>
            ))}
          </div>
        )}
      </div>
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
