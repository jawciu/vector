/**
 * Full-screen "open on desktop" blocker for the vendor app.
 * Rendered on every vendor path (AppShell); the customer portal is
 * excluded — it was designed mobile-first and works on phones.
 *
 * Visibility is pure CSS (`md:hidden`): below 768px this covers the
 * whole viewport and hides the not-yet-responsive vendor UI; at md
 * and up it is display:none, so desktop rendering is untouched.
 *
 * The icon is a one-off brand illustration: a monitor running the
 * kanban board with a lilac vector-arrow swooshing off it (action
 * ramp only — the AI gradient/sparkle is reserved for AI surfaces).
 * Animation classes (`dg-*`) live in globals.css.
 */
export default function DesktopOnlyOverlay() {
  return (
    <div
      className="fixed inset-0 md:hidden flex flex-col items-center justify-center px-8 text-center"
      style={{ background: "var(--bg)", zIndex: 10000 }}
    >
      <div className="dg-float">
        <svg width="150" height="120" viewBox="0 0 150 120" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="dg-arrow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--action-active)" />
              <stop offset="1" stopColor="var(--action-hover)" />
            </linearGradient>
            <radialGradient id="dg-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="var(--action)" stopOpacity="0.18" />
              <stop offset="1" stopColor="var(--action)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ambient glow + floating dots */}
          <ellipse cx="75" cy="50" rx="72" ry="48" fill="url(#dg-glow)" />
          <circle className="dg-dot" cx="18" cy="36" r="2.5" fill="var(--action)" />
          <circle className="dg-dot dg-dot--2" cx="133" cy="60" r="2" fill="var(--action)" />
          <circle className="dg-dot dg-dot--3" cx="124" cy="7" r="1.5" fill="var(--action)" />

          {/* monitor */}
          <rect
            x="25" y="12" width="100" height="70" rx="8"
            fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5"
          />
          <path
            d="M63 102h24M75 82v20"
            stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round"
          />

          {/* tiny kanban board on screen */}
          <g fill="var(--surface)">
            <rect x="35" y="22" width="24" height="13" rx="3" />
            <rect x="35" y="39" width="24" height="13" rx="3" />
            <rect x="35" y="56" width="24" height="13" rx="3" />
            <rect x="63" y="22" width="24" height="13" rx="3" />
            <rect x="63" y="39" width="24" height="13" rx="3" />
            <rect x="91" y="22" width="24" height="13" rx="3" />
          </g>

          {/* the vector: a lilac arrow taking off across the board */}
          <path
            className="dg-arrow-draw"
            d="M38 70 C 68 74, 74 42, 108 28"
            stroke="url(#dg-arrow)" strokeWidth="3" strokeLinecap="round"
          />
          <path
            className="dg-head-fade"
            d="M100 21.5 L110.5 27 L103 35.5"
            stroke="var(--action-hover)" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>

      <p className="text-lg font-semibold mt-6" style={{ color: "var(--text)" }}>
        Vector is built for desktop
      </p>
      <p className="text-sm mt-2" style={{ color: "var(--text-muted)", maxWidth: 320, lineHeight: 1.5 }}>
        This screen is too small for the workspace. Please open Vector in a
        desktop browser.
      </p>
    </div>
  );
}
