"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";

const FILTERS = ["Active", "Completed", "Paused", "All"];

export default function OnboardingsActionBar() {
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

  const label = current === "All" ? "All Onboardings" : `${current} Onboardings`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border pl-2 pr-1 py-0.5 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <svg width="12" height="12" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
            <path d="M2 7.5C1.45 7.5 0.979333 7.30433 0.588 6.913C0.196667 6.52167 0.000666667 6.05067 0 5.5V2C0 1.45 0.196 0.979333 0.588 0.588C0.98 0.196667 1.45067 0.000666667 2 0H5.5C6.05 0 6.521 0.196 6.913 0.588C7.305 0.98 7.50067 1.45067 7.5 2V5.5C7.5 6.05 7.30433 6.521 6.913 6.913C6.52167 7.305 6.05067 7.50067 5.5 7.5H2ZM2 18C1.45 18 0.979333 17.8043 0.588 17.413C0.196667 17.0217 0.000666667 16.5507 0 16V12.5C0 11.95 0.196 11.4793 0.588 11.088C0.98 10.6967 1.45067 10.5007 2 10.5H5.5C6.05 10.5 6.521 10.696 6.913 11.088C7.305 11.48 7.50067 11.9507 7.5 12.5V16C7.5 16.55 7.30433 17.021 6.913 17.413C6.52167 17.805 6.05067 18.0007 5.5 18H2ZM12.5 7.5C11.95 7.5 11.4793 7.30433 11.088 6.913C10.6967 6.52167 10.5007 6.05067 10.5 5.5V2C10.5 1.45 10.696 0.979333 11.088 0.588C11.48 0.196667 11.9507 0.000666667 12.5 0H16C16.55 0 17.021 0.196 17.413 0.588C17.805 0.98 18.0007 1.45067 18 2V5.5C18 6.05 17.8043 6.521 17.413 6.913C17.0217 7.305 16.5507 7.50067 16 7.5H12.5ZM12.5 18C11.95 18 11.4793 17.8043 11.088 17.413C10.6967 17.0217 10.5007 16.5507 10.5 16V12.5C10.5 11.95 10.696 11.4793 11.088 11.088C11.48 10.6967 11.9507 10.5007 12.5 10.5H16C16.55 10.5 17.021 10.696 17.413 11.088C17.805 11.48 18.0007 11.9507 18 12.5V16C18 16.55 17.8043 17.021 17.413 17.413C17.0217 17.805 16.5507 18.0007 16 18H12.5Z" />
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
                {f === "All" ? "All Onboardings" : `${f}`}
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
        + Add Onboarding
      </button>
    </div>
  );
}
