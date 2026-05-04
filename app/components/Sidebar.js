"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Onboardings", icon: OnboardingsIcon },
  { href: "/ai-drafts", label: "Vector suggests", icon: SparkleIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const iconSize = 14;
const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 56;
const STORAGE_KEY = "sidebarCollapsed";

function OnboardingsIcon({ className, style }) {
  return (
    <svg className={className} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M2 20h20M6 20V8l6-4 6 4v12M6 12h12" />
    </svg>
  );
}

function SparkleIcon({ className, style }) {
  return (
    <svg className={className} width={iconSize} height={iconSize} viewBox="0 0 14 14" fill="currentColor" style={style}>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" />
    </svg>
  );
}

function SettingsIcon({ className, style }) {
  return (
    <svg className={className} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChevronIcon({ size = 14, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={style}>
      <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Right-positioned tooltip used when the sidebar is collapsed.
 * Standard pattern for icon-only nav (Linear, VS Code, etc).
 */
function NavTooltip({ label, enabled, children }) {
  const [visible, setVisible] = useState(false);
  const [top, setTop] = useState(0);
  const ref = useRef(null);

  if (!enabled) return children;

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setTop(rect.top + rect.height / 2);
    setVisible(true);
  }

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      style={{ position: "relative", display: "block" }}
    >
      {children}
      {visible && (
        <span
          style={{
            position: "fixed",
            top,
            left: COLLAPSED_WIDTH + 8,
            transform: "translateY(-50%)",
            zIndex: 9999,
            pointerEvents: "none",
            padding: "5px 10px",
            background: "var(--surface-hover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const dropdownRef = useRef(null);

  // Sidebar inbox-count badge.
  //   Push: subscribe to PendingAIChange INSERTs via Supabase Realtime
  //   (mirrors NotificationBell). New Miniti drafts / cron-generated
  //   follow-ups light up the badge within ~1s.
  //   Fallback: refetch on window focus, in case the realtime channel
  //   dropped while the tab was backgrounded. No polling interval —
  //   focus refetch + push covers it.
  useEffect(() => {
    let cancelled = false;
    let client = null;
    let channel = null;

    async function fetchCount() {
      try {
        const res = await fetch("/api/ai-drafts/badge", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setInboxCount(body.count ?? 0);
      } catch {
        // Silent — badge is best-effort.
      }
    }

    fetchCount();

    function onFocus() { fetchCount(); }
    window.addEventListener("focus", onFocus);

    (async () => {
      const supabase = await createClient();
      if (cancelled || !supabase) return;
      client = supabase;
      channel = supabase
        .channel("ai-drafts-badge")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "PendingAIChange" },
          () => fetchCount()
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel && client) client.removeChannel(channel);
    };
  }, []);

  // Load collapse state from localStorage once on mount. Can't read storage
  // during SSR so we hydrate to the saved value here, then transition normally.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === "true") setCollapsed(true);
    } catch {
      // Blocked storage — keep default (expanded)
    }
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      // Close the dropdown if it was open — its position changes with width.
      setDropdownOpen(false);
      return next;
    });
  }

  useEffect(() => {
    let subscription;
    createClient().then((supabase) => {
      if (!supabase) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      });
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_e, session) => {
        setUser(session?.user ?? null);
      });
      subscription = sub;
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  async function handleSignOut() {
    const supabase = await createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setDropdownOpen(false);
    router.push("/login");
    router.refresh();
  }

  const initial = user?.email?.[0]?.toUpperCase() ?? "?";
  const label = user?.email ?? "Account";

  return (
    <aside
      className="flex flex-col h-full border-r shrink-0"
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        // Suppress transition until hydration so we don't animate from the
        // SSR-default expanded width to the user's saved collapsed width.
        transition: hydrated ? "width 0.2s ease" : "none",
        overflow: "hidden",
      }}
    >
      {/* User dropdown trigger */}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((open) => !open)}
          className="flex w-full items-center gap-3 border-b py-2 px-2 text-left transition-colors hover:opacity-90"
          style={{
            height: "44px",
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: collapsed ? 0 : "8px",
            paddingRight: collapsed ? 0 : "8px",
            justifyContent: collapsed ? "center" : "flex-start",
            borderColor: "var(--border)",
          }}
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined}
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={{ background: "var(--surface-hover)", color: "var(--text)" }}
          >
            {initial}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                  {label}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </>
          )}
        </button>
        {dropdownOpen && (
          <div
            className="absolute top-full z-10 mt-1 rounded-lg border py-1 shadow-lg"
            style={{
              background: "var(--bg)",
              borderColor: "var(--border)",
              left: collapsed ? COLLAPSED_WIDTH - 4 : 8,
              right: collapsed ? "auto" : 8,
              width: collapsed ? 160 : "auto",
            }}
          >
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:opacity-90"
              style={{ color: "var(--text)" }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5" style={{ padding: "8px" }}>
        {navItems.map(({ href, label: itemLabel, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          const badge = href === "/ai-drafts" && inboxCount > 0 ? inboxCount : 0;
          return (
            <NavTooltip key={href} label={badge > 0 ? `${itemLabel} (${badge})` : itemLabel} enabled={collapsed}>
              <Link
                href={href}
                className={`flex h-fit items-center rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--surface-hover)] text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
                style={{
                  padding: collapsed ? "6px" : "4px 8px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: collapsed ? 0 : 6,
                  position: "relative",
                }}
                aria-label={collapsed ? itemLabel : undefined}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <Icon className="shrink-0" style={{ color: "var(--text-muted)" }} />
                  {collapsed && badge > 0 && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: -3,
                        right: -3,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--action)",
                        border: "1px solid var(--bg-elevated)",
                      }}
                    />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{itemLabel}</span>
                    {badge > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 9999,
                          background: "var(--action)",
                          color: "var(--action-text)",
                          minWidth: 18,
                          textAlign: "center",
                        }}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            </NavTooltip>
          );
        })}
      </nav>

      {/* Collapse / expand toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="border-t flex items-center transition-colors hover:bg-[var(--bg-hover)]"
        style={{
          height: 36,
          padding: collapsed ? 0 : "0 12px",
          justifyContent: collapsed ? "center" : "flex-end",
          background: "none",
          color: "var(--text-muted)",
          borderColor: "var(--border)",
          cursor: "pointer",
        }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronIcon
          style={{
            transform: collapsed ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
    </aside>
  );
}
