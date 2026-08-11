"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
} from "react";

/**
 * Menu primitives — DS layer (moved from app/components/Menu.js, DS-PLAN
 * Phase 5 step 4; that file is now a re-export shim so no call site changed).
 *
 *   MenuTriggerButton — styled trigger that opens a menu (`.menu-trigger-pill`)
 *   MenuList          — absolutely-positioned dropdown container (listbox)
 *   MenuOption        — one row (role="option", aria-selected from `active`)
 *
 * Every dropdown/popover MUST use MenuList + MenuOption (DESIGN.md): that is
 * what guarantees the consistent 4px container padding, 4px row gap,
 * hover/active states and border.
 *
 * RENDERED OUTPUT IS BYTE-IDENTICAL to the JS original. Deliberately kept:
 *  - class strings concatenated with `${base} ${className}`.trim()` — NOT
 *    cn()/twMerge, which could reorder or dedupe classes and change the
 *    emitted attribute;
 *  - inline styles spread-merged `{ ...baseStyle, ...style }` so callers
 *    override individual properties (14 call sites rely on this, e.g.
 *    `style={{ minWidth: "100%" }}` on MenuList);
 *  - JSX attribute order, so the serialised DOM matches.
 *
 * No keyboard navigation yet — see the meta's honest gap. Adding it is a
 * separate reviewed change, not part of the Phase 5 move.
 */

export interface MenuTriggerButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Persistent open/active state — styles via `[data-active="true"]`. */
  active?: boolean;
}

export function MenuTriggerButton({
  type = "button",
  className = "",
  active = false,
  style,
  children,
  ...rest
}: MenuTriggerButtonProps) {
  const baseClassName =
    "menu-trigger-pill flex items-center gap-2 rounded-lg border text-sm font-medium";
  const baseStyle: CSSProperties = {
    borderColor: "var(--button-secondary-border)",
    color: "var(--text)",
    paddingLeft: "8px",
    paddingRight: "8px",
    paddingTop: "4px",
    paddingBottom: "4px",
    height: "fit-content",
  };

  return (
    <button
      type={type}
      className={`${baseClassName} ${className}`.trim()}
      data-active={active ? "true" : undefined}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

export type MenuListProps = HTMLAttributes<HTMLDivElement>;

export function MenuList({
  role = "listbox",
  className = "",
  style,
  children,
  ...rest
}: MenuListProps) {
  const baseClassName =
    "absolute left-0 z-10 rounded-lg border px-1 py-1 shadow-lg flex flex-col gap-1";
  const baseStyle: CSSProperties = {
    top: "calc(100% + 4px)",
    background: "var(--bg-elevated)",
    borderColor: "var(--border)",
    width: "144px",
    padding: "4px",
  };

  return (
    <div
      role={role}
      className={`${baseClassName} ${className}`.trim()}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface MenuOptionProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Currently-selected option — drives aria-selected + the active style. */
  active?: boolean;
}

export function MenuOption({
  type = "button",
  active = false,
  className = "",
  style,
  children,
  ...rest
}: MenuOptionProps) {
  const baseClassName =
    "flex w-full items-center rounded text-left text-sm transition-colors menu-option";
  const activeClassName = active ? "menu-option-active" : "";
  const baseStyle: CSSProperties = {
    color: active ? "var(--text)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400,
    padding: "4px 8px",
  };

  return (
    <button
      type={type}
      role="option"
      aria-selected={active}
      className={`${baseClassName} ${activeClassName} ${className}`.trim()}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
