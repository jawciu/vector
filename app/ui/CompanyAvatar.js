import { avatarColor, avatarInitials } from "@/lib/avatar";

/**
 * Square company avatar with deterministic colour + initials.
 * Matches the inline pattern used in TaskDrawer, TaskCard,
 * CreateOnboardingModal, etc. — extracted as a primitive so new
 * surfaces (PortfolioInsightsHero) get a consistent look without
 * re-rolling the JSX.
 */
export default function CompanyAvatar({ name, size = 16 }) {
  const fontSize = size <= 16 ? 10 : size <= 20 ? 11 : 12;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: avatarColor(name),
        color: "var(--text-dark)",
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {avatarInitials(name)}
    </span>
  );
}
