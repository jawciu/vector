import type { DsMeta } from "./ds-meta";

export const meta: DsMeta = {
  status: "stable",
  useWhen: [
    "Showing a company identity mark anywhere a company appears: workspaces table, task drawer, create-onboarding modal, portal shell, portfolio insights hero.",
    "Pass `logoUrl` when the company has one (app-relative, e.g. \"/logos/fal.png\"); the initials + deterministic palette colour fallback handles the rest — never roll a separate fallback.",
    "`radius`/`fontSize` overrides exist only so call sites converted from inline JSX keep their exact previous rendering.",
  ],
  dontUseWhen: [
    "People — person avatars are circles (`rounded-full` is for avatar circles only) with their own AVATAR_IMAGES mapping; CompanyAvatar is deliberately square.",
    "Status or category colour-coding — the avatar palette (mint/rose/sunset/lilac/sky/candy) rotates by name hash and carries no meaning (DESIGN.md: never for status or action).",
    "Standalone identification — it is aria-hidden, so it must sit next to the visible company name, never replace it.",
  ],
  a11y: [
    "`aria-hidden=\"true\"` on both branches — the avatar is decorative; the adjacent company name text is the accessible identification. Don't drop the name and rely on the logo/initials.",
    "Logo <Image> has empty alt inside the hidden span; initials use textDark on the palette colour for contrast.",
  ],
  tokens: ["border", "textDark", "mint", "rose", "sunset", "lilac", "sky", "candy"],
};
