"use client";

import type { ComponentType, CSSProperties } from "react";
import Sparkle from "./Sparkle";

/**
 * Icons — shared DS icon components
 * All icons use currentColor — set color via parent's CSS color property.
 * Default to --text-muted by wrapping in an element with that color.
 *
 * 2026-08-11 icon sweep: the registry grew from 7 to ~35 icons harvested
 * from the scattered inline SVGs in feature code (call-site migration is
 * DS-PLAN Phases 7/8 — the feature copies still exist until then).
 * Sweep icons carry NO colour of their own: pure `currentColor`, inherited
 * from the parent element. (The original 7 above bake `--text-muted` as a
 * default via inline style — kept untouched for their existing call sites.)
 */

interface IconProps {
  className?: string;
  style?: CSSProperties;
}

interface SizedIconProps extends IconProps {
  size?: number;
}

export function CalendarIcon({ className, style }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color: "var(--text-muted)", ...style }} aria-hidden>
      <path d="M0.777344 2.72046C0.777344 2.46767 0.859288 2.22524 1.00515 2.0465C1.15101 1.86775 1.34884 1.76733 1.55512 1.76733H12.444C12.6503 1.76733 12.8481 1.86775 12.994 2.0465C13.1398 2.22524 13.2218 2.46767 13.2218 2.72046V6.53296H0.777344V2.72046Z" stroke="currentColor" strokeLinejoin="round"/>
      <path d="M3.88867 2.83333V0.5M10.1109 2.83333V0.5" stroke="currentColor" strokeLinecap="round"/>
      <path d="M0.777344 6.53296H13.2218V11.7642C13.2218 11.9184 13.1398 12.0662 12.994 12.1752C12.8481 12.2842 12.6503 12.3455 12.444 12.3455H1.55512C1.34884 12.3455 1.15101 12.2842 1.00515 12.1752C0.859288 12.0662 0.777344 11.9184 0.777344 11.7642V6.53296Z" stroke="currentColor" strokeLinejoin="round"/>
    </svg>
  );
}

/** Canonical task priority values (lib/constants.js PRIORITIES). */
export type TaskPriority = "low" | "medium" | "high";

interface PriorityIconProps extends IconProps {
  priority?: TaskPriority | null;
  size?: number;
}

/**
 * PriorityIcon
 * priority: "low" | "medium" | "high" | null
 * - null/undefined: all bars in --icon-tertiary (muted placeholder)
 * - low: bottom bar --action, rest --icon-tertiary
 * - medium: bottom + middle --action, top --icon-tertiary
 * - high: all bars --action
 */
export function PriorityIcon({ priority, size = 14, className, style }: PriorityIconProps) {
  const active = "var(--action)";
  const muted = "var(--icon-tertiary)";

  const colorMap: Record<string, [string, string, string]> = {
    low:    [muted,  muted,  active],  // [top, middle, bottom]
    medium: [muted,  active, active],
    high:   [active, active, active],
  };

  // When no priority selected, show all bars muted
  const [top, mid, bot] = priority
    ? (colorMap[priority.toLowerCase()] || [muted, muted, muted])
    : [muted, muted, muted];

  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M1.45801 5.24996L6.99967 1.16663L12.5413 5.24996" stroke={top} strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.45801 8.74996L6.99967 4.66663L12.5413 8.74996" stroke={mid} strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.45801 12.25L6.99967 8.16663L12.5413 12.25"     stroke={bot} strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function StatusIcon({ className, style }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color: "var(--text-muted)", ...style }} aria-hidden>
      <g clipPath="url(#status-clip)">
        <path d="M1 10.3333C1 9.435 1 8.98583 1.20242 8.65567C1.31558 8.47075 1.47075 8.31558 1.65567 8.20242C1.98525 8 2.435 8 3.33333 8C4.23167 8 4.68083 8 5.011 8.20242C5.19592 8.31558 5.35108 8.47075 5.46425 8.65567C5.66667 8.98525 5.66667 9.435 5.66667 10.3333C5.66667 11.2317 5.66667 11.6808 5.46425 12.0116C5.35108 12.1959 5.19592 12.3511 5.011 12.4643C4.68142 12.6667 4.23167 12.6667 3.33333 12.6667C2.435 12.6667 1.98583 12.6667 1.65567 12.4643C1.47095 12.3513 1.31563 12.1962 1.20242 12.0116C1 11.6808 1 11.2317 1 10.3333ZM8 10.3333C8 9.435 8 8.98583 8.20242 8.65567C8.31558 8.47075 8.47075 8.31558 8.65567 8.20242C8.98525 8 9.435 8 10.3333 8C11.2317 8 11.6808 8 12.0116 8.20242C12.1959 8.31558 12.3511 8.47075 12.4643 8.65567C12.6667 8.98525 12.6667 9.435 12.6667 10.3333C12.6667 11.2317 12.6667 11.6808 12.4643 12.0116C12.351 12.1959 12.1959 12.351 12.0116 12.4643C11.6808 12.6667 11.2317 12.6667 10.3333 12.6667C9.435 12.6667 8.98583 12.6667 8.65567 12.4643C8.47095 12.3513 8.31563 12.1962 8.20242 12.0116C8 11.6808 8 11.2317 8 10.3333ZM1 3.33333C1 2.435 1 1.98583 1.20242 1.65567C1.31558 1.47075 1.47075 1.31558 1.65567 1.20242C1.98525 1 2.435 1 3.33333 1C4.23167 1 4.68083 1 5.011 1.20242C5.19592 1.31558 5.35108 1.47075 5.46425 1.65567C5.66667 1.98525 5.66667 2.435 5.66667 3.33333C5.66667 4.23167 5.66667 4.68083 5.46425 5.011C5.35108 5.19592 5.19592 5.35108 5.011 5.46425C4.68142 5.66667 4.23167 5.66667 3.33333 5.66667C2.435 5.66667 1.98583 5.66667 1.65567 5.46425C1.47089 5.35111 1.31556 5.19578 1.20242 5.011C1 4.68142 1 4.23167 1 3.33333ZM8 3.33333C8 2.435 8 1.98583 8.20242 1.65567C8.31558 1.47075 8.47075 1.31558 8.65567 1.20242C8.98525 1 9.435 1 10.3333 1C11.2317 1 11.6808 1 12.0116 1.20242C12.1959 1.31558 12.3511 1.47075 12.4643 1.65567C12.6667 1.98525 12.6667 2.435 12.6667 3.33333C12.6667 4.23167 12.6667 4.68083 12.4643 5.011C12.3511 5.19592 12.1959 5.35108 12.0116 5.46425C11.6808 5.66667 11.2317 5.66667 10.3333 5.66667C9.435 5.66667 8.98583 5.66667 8.65567 5.46425C8.47089 5.35111 8.31556 5.19578 8.20242 5.011C8 4.68142 8 4.23167 8 3.33333Z" stroke="currentColor" strokeWidth="0.878906"/>
      </g>
      <defs>
        <clipPath id="status-clip">
          <rect width="13.6667" height="13.6667" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

export function OwnerIcon({ className, style }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color: "var(--text-muted)", ...style }} aria-hidden>
      <path d="M11.1248 11.3571C11.3669 11.5864 11.5915 11.834 11.7928 12.1006C10.5402 13.2782 8.85576 14.0017 7.00089 14.0017C5.14576 14.0017 3.46063 13.2785 2.20801 12.1006C2.40924 11.834 2.63397 11.5864 2.87603 11.3571C3.95146 12.3759 5.40268 13.0021 7.00089 13.0021C8.59884 13.0021 10.0494 12.3756 11.1248 11.3571Z" fill="currentColor"/>
      <circle cx="7.00129" cy="7.00169" r="6.5" transform="rotate(-14.7562 7.00129 7.00169)" stroke="currentColor" strokeMiterlimit="1.9416"/>
      <path d="M7.00098 8.71252C9.09081 8.71253 10.9654 9.62949 12.248 11.0817C12.0268 11.3322 11.7888 11.5671 11.5342 11.7838C10.4341 10.5155 8.81171 9.71253 7.00098 9.71252C5.19002 9.71252 3.56692 10.5153 2.4668 11.7838C2.21226 11.5671 1.9741 11.3322 1.75293 11.0817C3.03555 9.62921 4.91091 8.71252 7.00098 8.71252Z" fill="currentColor"/>
      <circle cx="7.00106" cy="5.56564" r="2.14238" stroke="currentColor" strokeWidth="1.00448"/>
    </svg>
  );
}

export function AssigneeIcon({ className, style }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color: "var(--text-muted)", ...style }} aria-hidden>
      <path d="M11.1248 11.3571C11.3669 11.5864 11.5915 11.834 11.7928 12.1006C10.5402 13.2782 8.85576 14.0017 7.00089 14.0017C5.14576 14.0017 3.46063 13.2785 2.20801 12.1006C2.40924 11.834 2.63397 11.5864 2.87603 11.3571C3.95146 12.3759 5.40268 13.0021 7.00089 13.0021C8.59884 13.0021 10.0494 12.3756 11.1248 11.3571Z" fill="currentColor"/>
      <circle cx="7.00129" cy="7.00169" r="6.5" transform="rotate(-14.7562 7.00129 7.00169)" stroke="currentColor" strokeMiterlimit="1.9416" strokeDasharray="2.11 2.11"/>
      <path d="M7.00098 8.71252C9.09081 8.71253 10.9654 9.62949 12.248 11.0817C12.0268 11.3322 11.7888 11.5671 11.5342 11.7838C10.4341 10.5155 8.81171 9.71253 7.00098 9.71252C5.19002 9.71252 3.56692 10.5153 2.4668 11.7838C2.21226 11.5671 1.9741 11.3322 1.75293 11.0817C3.03555 9.62921 4.91091 8.71252 7.00098 8.71252Z" fill="currentColor"/>
      <circle cx="7.00106" cy="5.56564" r="2.14238" stroke="currentColor" strokeWidth="1.00448"/>
    </svg>
  );
}

export function MembersIcon({ className, style }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color: "var(--text-muted)", ...style }} aria-hidden>
      <path d="M9.33301 11.6667V11.0833C9.33301 10.4645 9.08717 9.871 8.64959 9.43342C8.21201 8.99583 7.61851 8.75 6.99967 8.75H2.91634C2.2975 8.75 1.70401 8.99583 1.26643 9.43342C0.82884 9.871 0.583008 10.4645 0.583008 11.0833V11.6667M9.04134 6.41667C9.66018 6.41667 10.2537 6.17083 10.6913 5.73325C11.1288 5.29566 11.3747 4.70217 11.3747 4.08333C11.3747 3.46449 11.1288 2.871 10.6913 2.43342C10.2537 1.99583 9.66018 1.75 9.04134 1.75M13.4163 11.6667V11.0833C13.4163 10.4645 13.1705 9.871 12.7329 9.43342C12.2953 8.99583 11.7018 8.75 11.083 8.75M7.29134 4.08333C7.29134 4.70217 7.04551 5.29566 6.60792 5.73325C6.17034 6.17083 5.57685 6.41667 4.95801 6.41667C4.33917 6.41667 3.74568 6.17083 3.30809 5.73325C2.87051 5.29566 2.62467 4.70217 2.62467 4.08333C2.62467 3.46449 2.87051 2.871 3.30809 2.43342C3.74568 1.99583 4.33917 1.75 4.95801 1.75C5.57685 1.75 6.17034 1.99583 6.60792 2.43342C7.04551 2.871 7.29134 3.46449 7.29134 4.08333Z" stroke="currentColor" strokeWidth="1.16667" strokeLinecap="square"/>
    </svg>
  );
}

export function DependenciesIcon({ className, style }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ color: "var(--text-muted)", ...style }} aria-hidden>
      <g clipPath="url(#dep-clip)">
        <path d="M10.9668 2.33335C11.1813 2.33335 11.3937 2.3756 11.5918 2.45768C11.79 2.53977 11.9701 2.66008 12.1217 2.81175C12.2734 2.96341 12.3937 3.14347 12.4758 3.34164C12.5579 3.5398 12.6001 3.75219 12.6001 3.96669C12.6001 4.18118 12.5579 4.39357 12.4758 4.59174C12.3937 4.7899 12.2734 4.96996 12.1217 5.12163C11.9701 5.2733 11.79 5.39361 11.5918 5.47569C11.3937 5.55777 11.1813 5.60002 10.9668 5.60002C10.5336 5.60002 10.1182 5.42794 9.81186 5.12163C9.50555 4.81532 9.33347 4.39987 9.33347 3.96669C9.33347 3.5335 9.50555 3.11805 9.81186 2.81175C10.1182 2.50544 10.5336 2.33335 10.9668 2.33335ZM8.44213 4.43335C8.55981 5.06181 8.90773 5.62376 9.41784 6.00925C9.92794 6.39474 10.5635 6.57604 11.2002 6.51768C11.8369 6.45932 12.429 6.1655 12.8605 5.6937C13.292 5.2219 13.532 4.60607 13.5335 3.96669C13.5345 3.32579 13.2958 2.70768 12.8642 2.2339C12.4326 1.76013 11.8393 1.46497 11.2011 1.40647C10.5629 1.34797 9.92584 1.53036 9.41528 1.91778C8.90473 2.3052 8.5576 2.86961 8.44213 3.50002H8.40013C7.90506 3.50002 7.43027 3.69669 7.0802 4.04675C6.73013 4.39682 6.53347 4.87162 6.53347 5.36669V8.63335C6.53347 8.88089 6.43513 9.11828 6.2601 9.29332C6.08507 9.46835 5.84767 9.56669 5.60013 9.56669H5.55813C5.44046 8.93822 5.09254 8.37628 4.58243 7.99079C4.07233 7.6053 3.43675 7.424 2.80003 7.48236C2.16332 7.54072 1.57129 7.83454 1.13976 8.30634C0.708235 8.77814 0.468266 9.39397 0.4668 10.0334C0.465736 10.6743 0.704485 11.2924 1.1361 11.7661C1.56771 12.2399 2.16096 12.5351 2.79919 12.5936C3.43741 12.6521 4.07443 12.4697 4.58498 12.0823C5.09553 11.6948 5.44267 11.1304 5.55813 10.5H5.60013C6.0952 10.5 6.57 10.3034 6.92007 9.95328C7.27013 9.60322 7.4668 9.12842 7.4668 8.63335V5.36669C7.4668 5.11915 7.56513 4.88175 7.74017 4.70672C7.9152 4.53169 8.1526 4.43335 8.40013 4.43335H8.44213ZM4.6668 10.0334C4.6668 10.4665 4.49472 10.882 4.18841 11.1883C3.8821 11.4946 3.46665 11.6667 3.03347 11.6667C2.60028 11.6667 2.18484 11.4946 1.87853 11.1883C1.57222 10.882 1.40013 10.4665 1.40013 10.0334C1.40013 9.60017 1.57222 9.18472 1.87853 8.87841C2.18484 8.5721 2.60028 8.40002 3.03347 8.40002C3.46665 8.40002 3.8821 8.5721 4.18841 8.87841C4.49472 9.18472 4.6668 9.60017 4.6668 10.0334Z" fill="currentColor"/>
      </g>
      <defs>
        <clipPath id="dep-clip">
          <rect width="14" height="14" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 2026-08-11 icon sweep — harvested from feature code (see JSDoc per  */
/* icon for the home surface). Pure currentColor, no baked default.    */
/* ------------------------------------------------------------------ */

/** Bar-chart glyph — Overview tab (OnboardingTabs). */
export function OverviewIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <g clipPath="url(#icons-overview-clip)">
        <path d="M3.1396 7.21616H1.93426C1.54826 7.21616 1.2356 7.5295 1.2356 7.91483V12.4682C1.2356 12.8535 1.54893 13.1668 1.93426 13.1668H3.14026C3.52693 13.1668 3.8396 12.8535 3.8396 12.4675V7.91483C3.83942 7.72941 3.76568 7.55163 3.63457 7.42052C3.50346 7.28941 3.32568 7.21567 3.14026 7.2155M7.60293 0.833496H6.3976C6.01093 0.833496 5.69826 1.14683 5.69826 1.53283V12.4668C5.69826 12.8535 6.0116 13.1662 6.39826 13.1662H7.60293C7.9896 13.1662 8.30226 12.8528 8.30226 12.4668V1.5335C8.30226 1.14683 7.98893 0.834163 7.60226 0.834163M12.0663 4.28483H10.8603C10.4736 4.28483 10.1609 4.59816 10.1609 4.98483V12.4668C10.1609 12.8535 10.4743 13.1662 10.8603 13.1662H12.0656C12.251 13.166 12.4288 13.0922 12.5599 12.9611C12.691 12.83 12.7648 12.6522 12.7649 12.4668V4.98416C12.7649 4.5975 12.4516 4.28483 12.0649 4.28483" stroke="currentColor" strokeWidth="0.866667" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="icons-overview-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Clipboard-with-tick — Tasks tab (OnboardingTabs), portal All Tasks (PortalShell), AI-draft breadcrumb (AIDraftInbox). */
export function TasksIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <g clipPath="url(#icons-tasks-clip)">
        <path fillRule="evenodd" clipRule="evenodd" d="M2.625 11.8125C2.50897 11.8125 2.39769 11.7664 2.31564 11.6844C2.23359 11.6023 2.1875 11.491 2.1875 11.375V2.625C2.1875 2.50897 2.23359 2.39769 2.31564 2.31564C2.39769 2.23359 2.50897 2.1875 2.625 2.1875H10.7188C10.8928 2.1875 11.0597 2.11836 11.1828 1.99529C11.3059 1.87222 11.375 1.7053 11.375 1.53125C11.375 1.3572 11.3059 1.19028 11.1828 1.06721C11.0597 0.94414 10.8928 0.875 10.7188 0.875H2.625C2.16087 0.875 1.71575 1.05937 1.38756 1.38756C1.05937 1.71575 0.875 2.16087 0.875 2.625V11.375C0.875 11.8391 1.05937 12.2842 1.38756 12.6124C1.71575 12.9406 2.16087 13.125 2.625 13.125H11.375C11.8391 13.125 12.2842 12.9406 12.6124 12.6124C12.9406 12.2842 13.125 11.8391 13.125 11.375V8.53125C13.125 8.3572 13.0559 8.19028 12.9328 8.06721C12.8097 7.94414 12.6428 7.875 12.4688 7.875C12.2947 7.875 12.1278 7.94414 12.0047 8.06721C11.8816 8.19028 11.8125 8.3572 11.8125 8.53125V11.375C11.8125 11.491 11.7664 11.6023 11.6844 11.6844C11.6023 11.7664 11.491 11.8125 11.375 11.8125H2.625ZM13.8075 4.095C13.9234 3.9706 13.9865 3.80606 13.9835 3.63604C13.9805 3.46603 13.9117 3.30382 13.7914 3.18358C13.6712 3.06334 13.509 2.99447 13.339 2.99147C13.1689 2.98847 13.0044 3.05158 12.88 3.1675L8.01675 8.02988L6.37788 6.33588C6.31808 6.2734 6.24653 6.22335 6.16733 6.18862C6.08813 6.15388 6.00284 6.13515 5.91638 6.13349C5.82991 6.13182 5.74397 6.14727 5.66349 6.17893C5.58302 6.21059 5.50959 6.25785 5.44744 6.31798C5.38529 6.37812 5.33564 6.44994 5.30133 6.52933C5.26703 6.60872 5.24876 6.6941 5.24757 6.78058C5.24638 6.86705 5.26229 6.95291 5.29439 7.03321C5.3265 7.11351 5.37415 7.18668 5.43462 7.2485L7.53725 9.422C7.59775 9.48475 7.67014 9.53481 7.7502 9.56927C7.83026 9.60374 7.91638 9.62191 8.00354 9.62272C8.0907 9.62354 8.17714 9.60698 8.25783 9.57402C8.33852 9.54106 8.41184 9.49235 8.4735 9.43075L13.8075 4.095Z" fill="currentColor" />
      </g>
      <defs>
        <clipPath id="icons-tasks-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/**
 * Details tab (OnboardingTabs) and the filter-menu trigger (TaskFilterMenu,
 * OnboardingsActionBar) draw the exact same four-squares glyph as StatusIcon —
 * aliased rather than duplicated. Note: StatusIcon bakes `--text-muted`.
 */
export const DetailsIcon = StatusIcon;

/**
 * Meetings tab (OnboardingTabs) draws the exact same glyph as CalendarIcon —
 * aliased rather than duplicated. Note: CalendarIcon bakes `--text-muted`.
 */
export const MeetingsIcon = CalendarIcon;

/** Three connected boxes (org-chart) — Actions tab (OnboardingTabs). */
export function ActionsIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <rect x="1" y="1" width="4.5" height="4.5" rx="1" />
      <rect x="8.5" y="1" width="4.5" height="4.5" rx="1" />
      <rect x="4.75" y="8.5" width="4.5" height="4.5" rx="1" />
      <path d="M3.25 5.75 v1.25 h7.5 v-1.25" />
      <path d="M7 7 v1.5" />
    </svg>
  );
}

/** Document with text lines — notes indicator (TaskDrawer, TaskCardView, AIDraftInbox). */
export function NotesIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <g clipPath="url(#icons-notes-clip)">
        <path d="M3.45675 3.89835H8.94754M3.45675 7.26357H10.6029M3.45675 10.494H7.72288M11.8948 2.83855L9.9266 0.85352C9.8046 0.731724 9.6598 0.635161 9.50047 0.56935C9.34114 0.503539 9.1704 0.46977 8.99801 0.469972H2.43732C2.26179 0.474361 2.09493 0.547188 1.97235 0.672907C1.84978 0.798626 1.7812 0.967278 1.78125 1.14286V12.9521C1.7812 13.1277 1.84978 13.2963 1.97235 13.4221C2.09493 13.5478 2.26179 13.6206 2.43732 13.625H11.6223C11.8007 13.625 11.9719 13.5541 12.0981 13.4279C12.2243 13.3017 12.2952 13.1306 12.2952 12.9521V3.76714C12.2932 3.59357 12.2568 3.42212 12.188 3.26273C12.1193 3.10333 12.0196 2.95915 11.8948 2.83855Z" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="icons-notes-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Speech bubble (double outline) — comment count (TaskDrawer, TaskCardView, PortalTaskCard, PortalDrawer). */
export function CommentIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <g clipPath="url(#icons-comment-clip)">
        <path d="M1.83778 1.24799C1.88502 1.24523 1.93284 1.24385 1.98125 1.24385H10.5418C11.2073 1.24385 11.8455 1.50821 12.316 1.97876C12.7866 2.44931 13.0509 3.08752 13.0509 3.75298V9.36163C13.0509 9.41004 13.0496 9.45806 13.0468 9.50569C13.3195 9.3324 13.544 9.09307 13.6996 8.80986C13.8551 8.52666 13.9366 8.20877 13.9365 7.88567V3.75298C13.9365 3.30718 13.8487 2.86575 13.6781 2.45389C13.5075 2.04202 13.2575 1.66779 12.9422 1.35256C12.627 1.03734 12.2528 0.787283 11.8409 0.616683C11.429 0.446083 10.9876 0.358276 10.5418 0.358276H3.45721C3.13421 0.358284 2.81644 0.439831 2.53335 0.59536C2.25026 0.750889 2.01101 0.975366 1.83778 1.24799ZM2.8314 13.5652C2.93767 13.6183 3.04984 13.6419 3.16202 13.6419H3.16792C3.32142 13.6419 3.47492 13.5947 3.6048 13.4943L6.58034 11.2804H10.5418C11.5986 11.2804 12.4606 10.4184 12.4606 9.36163V3.75298C12.4606 2.6962 11.5986 1.83424 10.5418 1.83424H1.98125C0.924461 1.83424 0.0625 2.6962 0.0625 3.75298V9.36163C0.0625 10.4184 0.924461 11.2804 1.98125 11.2804H2.42404V12.9039C2.42404 13.1873 2.57754 13.4412 2.8314 13.5652ZM0.948076 3.75298C0.948076 3.18622 1.41448 2.71981 1.98125 2.71981H10.5418C11.1086 2.71981 11.575 3.18622 11.575 3.75298V9.36163C11.575 9.9284 11.1086 10.3948 10.5418 10.3948H6.28515L3.30961 12.6087V10.3948H1.98125C1.41448 10.3948 0.948076 9.9284 0.948076 9.36163V3.75298Z" fill="currentColor" />
      </g>
      <defs>
        <clipPath id="icons-comment-clip">
          <rect width="14" height="14" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Clock — due-date chip on task cards (TaskCardView, PortalTaskCard). ViewBox is 15 as harvested. */
export function ClockIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M7.00712 13.1381C3.62623 13.1381 0.875977 10.3879 0.875977 7.007C0.875977 3.62611 3.62623 0.875854 7.00712 0.875854C10.388 0.875854 13.1383 3.62611 13.1383 7.007C13.1383 10.3879 10.388 13.1381 7.00712 13.1381ZM7.00712 1.75173C4.10796 1.75173 1.75185 4.10784 1.75185 7.007C1.75185 9.90615 4.10796 12.2623 7.00712 12.2623C9.90627 12.2623 12.2624 9.90615 12.2624 7.007C12.2624 4.10784 9.90627 1.75173 7.00712 1.75173Z" fill="currentColor" />
      <path d="M8.75948 9.19674C8.68065 9.19674 8.60182 9.17923 8.53175 9.13543L6.34205 7.82162C6.27749 7.78231 6.2242 7.72697 6.18737 7.66097C6.15053 7.59498 6.1314 7.52057 6.13184 7.44499V3.94148C6.13184 3.69623 6.32454 3.50354 6.56978 3.50354C6.81503 3.50354 7.00772 3.69623 7.00772 3.94148V7.19974L8.9872 8.38218C9.06874 8.43215 9.13176 8.50734 9.16671 8.59635C9.20166 8.68536 9.20664 8.78334 9.18089 8.87544C9.15514 8.96754 9.10007 9.04873 9.02403 9.10671C8.94798 9.16469 8.8551 9.1963 8.75948 9.19674Z" fill="currentColor" />
    </svg>
  );
}

/** Document with folded corner — file attachment (TaskDrawer, PortalDrawer). */
export function FileIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M8 1.5H4a1.5 1.5 0 00-1.5 1.5v8A1.5 1.5 0 004 12.5h6a1.5 1.5 0 001.5-1.5V5L8 1.5z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M8 1.5V5h3.5" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}

/** Arrow-into-tray — file download (TaskDrawer, PortalDrawer). */
export function DownloadIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Circular arrow: regenerate / refresh (InsightCard regenerate). */
export function RefreshIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M11.5 7A4.5 4.5 0 1 1 9.9 3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 1.5v2.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Two stacked sheets — copy to clipboard (AIDraftInbox follow-up message). */
export function CopyIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <rect x="3.5" y="3.5" width="8" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.5 10V2.5C2.5 1.67157 3.17157 1 4 1H9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Bin — delete a file / attachment (PortalDrawer, TaskDrawer file rows). */
export function TrashIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M2.5 3.75h9M5.25 3.75V2.75a1 1 0 011-1h1.5a1 1 0 011 1v1M4 3.75v7.5a1 1 0 001 1h4a1 1 0 001-1v-7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6v4M8 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Bare tick — the "mark done" button check (TaskDrawer, PortalDrawer). */
export function CheckIcon({ size = 12, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M2.5 6.5L5 9L9.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Circled tick, outline — task not-yet-done state (TaskCardView, PortalTaskCard, AIDraftInbox). */
export function CheckCircleIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
      <path d="M3.5 7L6.5 9.5L10.5 4.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

/** Circled tick, solid fill — task complete (TaskCardView, PortalTaskCard, InsightCard, AIDraftInbox). Colour via parent (e.g. `--success`). */
export function CheckCircleSolidIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M7 0C10.866 0 14 3.13401 14 7C14 10.866 10.866 14 7 14C3.13401 14 0 10.866 0 7C0 3.13401 3.13401 0 7 0ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z" fill="currentColor" />
    </svg>
  );
}

/** Rounded-square tick, solid fill — checked checkbox state (TaskDrawer, CreateTaskModal, ContactsPanel). Colour via parent (e.g. `--action`). */
export function CheckSquareIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M10 0C12.2091 0 14 1.79086 14 4V10C14 12.2091 12.2091 14 10 14H4C1.79086 14 9.66399e-08 12.2091 0 10V4C0 1.79086 1.79086 9.66384e-08 4 0H10ZM10.8125 4.10938C10.5969 3.93687 10.2819 3.97187 10.1094 4.1875L6.42773 8.78906L3.82031 6.61621C3.60827 6.43951 3.29304 6.46781 3.11621 6.67969C2.93951 6.89173 2.96781 7.20696 3.17969 7.38379L6.17969 9.88379L6.57129 10.2109L6.89062 9.8125L10.8906 4.8125C11.0631 4.59687 11.0281 4.28188 10.8125 4.10938Z" fill="currentColor" />
    </svg>
  );
}

/** Bell — notification trigger (NotificationBell, PortalNotificationBell). */
export function BellIcon({ size = 16, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** Vertical three-dot kebab — meatball menus (PhaseHeader, ContactsPanel, OnboardingActions). */
export function ThreeDotsIcon({ size = 12, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden>
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

/** Plus — add-task button (PhaseHeader) and other add affordances. */
export function PlusIcon({ size = 11, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <line x1="5.5" y1="1" x2="5.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Funnel — filter control (OnboardingDetailClient toolbar). */
export function FilterIcon({ size = 12, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M1 2h12l-4.5 5.5V12l-3-1.5V7.5L1 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Three shrinking lines — sort control (OnboardingDetailClient toolbar). */
export function SortIcon({ size = 12, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Magnifier — search inputs (MeetingsTab, ActionsTab, TaskDrawer, CreateTaskModal). */
export function SearchIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** X — close buttons (Modal header; the modal family's dismiss glyph). */
export function CloseIcon({ size = 10, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Chevron-to-bar collapse glyph — Drawer / PortalDrawer header close. */
export function PanelCloseIcon({ size = 11, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M1.32129 10.1182L6.2296 5.40892L1.32129 0.600098" stroke="currentColor" strokeWidth="1.06126" strokeLinecap="round" />
      <path d="M9.67871 0.583496L9.67871 10.4167" stroke="currentColor" strokeWidth="1.06126" strokeLinecap="round" />
    </svg>
  );
}

/** Chevron down — dropdown/picker triggers (UnmatchedEvents, TestWebhookPanel, Sidebar footer). */
export function ChevronDownIcon({ size = 10, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Chevron up — derived mirror of ChevronDownIcon (feature code rotates the down chevron; no harvested source). */
export function ChevronUpIcon({ size = 10, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Trend direction — the AI insight pill's arrow. */
export type TrendDirection = "improving" | "steady" | "declining";

const TREND_ROTATION: Record<TrendDirection, number> = {
  improving: -45,
  steady: 0,
  declining: 45,
};

interface TrendArrowIconProps extends SizedIconProps {
  direction?: TrendDirection;
}

/**
 * Arrow — the direction of travel on the AI insight pill (`InsightStatusPill`).
 * One glyph rotated three ways: up-right for improving, flat for steady,
 * down-right for declining. The arrow is what tells a trend pill apart from a
 * health pill at a glance, so it is never optional there; it stays
 * `aria-hidden` like every registry icon, and the pill supplies the words.
 */
export function TrendArrowIcon({ direction = "steady", size = 14, className, style }: TrendArrowIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ transform: `rotate(${TREND_ROTATION[direction]}deg)`, ...style }}
      aria-hidden
    >
      <path d="M2 7H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 3.5L11.5 7L8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Chevron left — month-back button (CalendarDropdown). */
export function ChevronLeftIcon({ size = 10, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Chevron right — month-forward button (CalendarDropdown), breadcrumbs (AIDraftInbox), expanders (NotificationBell). */
export function ChevronRightIcon({ size = 10, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden>
      <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** House-over-baseline — sidebar Workspace nav (Sidebar OnboardingsIcon). */
export function WorkspaceIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d="M2 20h20M6 20V8l6-4 6 4v12M6 12h12" />
    </svg>
  );
}

/** Gear — sidebar Settings nav (Sidebar). */
export function SettingsIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Monochrome 4-point star — sidebar Actions nav (Sidebar SparkleIcon).
 * The currentColor sibling of the gradient `Sparkle` mark; use `Sparkle`
 * itself wherever Vector "speaks" (AI attribution).
 */
export function SparkleMonoIcon({ size = 14, className, style }: SizedIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" className={className} style={style} aria-hidden>
      <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Category maps — drive the Storybook grids (Icons.stories.tsx).     */
/* Add every new icon to a map so it shows up in the story with zero  */
/* story edits.                                                       */
/* ------------------------------------------------------------------ */

type AnyIcon = ComponentType<IconProps & { size?: number }>;

/** Every generic (non-AI) icon in the registry, keyed by export name. */
export const GENERIC_ICONS: Record<string, AnyIcon> = {
  CalendarIcon,
  PriorityIcon,
  StatusIcon,
  OwnerIcon,
  AssigneeIcon,
  MembersIcon,
  DependenciesIcon,
  OverviewIcon,
  TasksIcon,
  DetailsIcon,
  MeetingsIcon,
  ActionsIcon,
  NotesIcon,
  CommentIcon,
  ClockIcon,
  FileIcon,
  DownloadIcon,
  RefreshIcon,
  CopyIcon,
  TrashIcon,
  CheckIcon,
  CheckCircleIcon,
  CheckCircleSolidIcon,
  CheckSquareIcon,
  BellIcon,
  ThreeDotsIcon,
  PlusIcon,
  FilterIcon,
  SortIcon,
  SearchIcon,
  CloseIcon,
  PanelCloseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrendArrowIcon,
  WorkspaceIcon,
  SettingsIcon,
  SparkleMonoIcon,
};

/**
 * AI-attribution marks. `Sparkle` (app/ui/Sparkle.tsx) stays its own module —
 * it carries the fixed AI gradient and is deliberately NOT currentColor —
 * but it belongs with the icons, so it is co-presented here.
 */
export const AI_ICONS: Record<string, AnyIcon> = {
  Sparkle,
};
