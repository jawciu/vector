"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Onboardings", icon: OnboardingsIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const iconSize = 14;

function OnboardingsIcon({ className, style }) {
  return (
    <svg className={className} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M2 20h20M6 20V8l6-4 6 4v12M6 12h12" />
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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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
      className="flex flex-col h-full border-r transition-colors shrink-0"
      style={{
        width: 240,
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
      }}
    >
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((open) => !open)}
          className="flex w-full items-center gap-3 border-b py-2 px-2 text-left transition-colors hover:opacity-90"
          style={{
            height: "44px",
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: "8px",
            paddingRight: "8px",
            borderColor: "var(--border)",
          }}
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={{ background: "var(--surface-hover)", color: "var(--text)" }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
              {label}
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {dropdownOpen && (
          <div
            className="absolute left-2 right-2 top-full z-10 mt-1 rounded-lg border py-1 shadow-lg"
            style={{
              background: "var(--bg)",
              borderColor: "var(--border)",
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
      <nav className="flex-1 flex flex-col gap-0.5 p-2" style={{ padding: "8px" }}>
        {navItems.map(({ href, label: itemLabel, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-fit items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--surface-hover)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              }`}
              style={{ padding: "4px 8px" }}
            >
              <Icon className="shrink-0" style={{ color: "var(--text-muted)" }} />
              {itemLabel}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
