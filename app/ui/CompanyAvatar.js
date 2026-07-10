import Image from "next/image";
import { avatarColor, avatarInitials } from "@/lib/avatar";

/**
 * Square company avatar. Renders the company logo when `logoUrl` is set
 * (app-relative path, e.g. "/logos/fal.png"), otherwise falls back to the
 * deterministic colour + initials pill. Matches the inline pattern used in
 * TaskDrawer, TaskCard, CreateOnboardingModal, etc. — extracted as a
 * primitive so all surfaces get a consistent look without re-rolling the JSX.
 *
 * `radius` / `fontSize` exist so call sites converted from inline JSX can
 * keep their exact previous rendering (some used rounded-[3px] / text-[8px]).
 */
export default function CompanyAvatar({ name, logoUrl, size = 16, radius = 4, fontSize }) {
  if (logoUrl) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          border: "1px solid var(--border)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <Image
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </span>
    );
  }
  const fs = fontSize ?? (size <= 16 ? 10 : size <= 20 ? 11 : 12);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: avatarColor(name),
        color: "var(--text-dark)",
        fontSize: fs,
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
