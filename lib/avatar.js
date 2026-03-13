/**
 * Avatar utilities — shared across all components that render user/company avatars.
 */

export const AVATAR_COLORS = [
  "var(--sunset)",
  "var(--lilac)",
  "var(--sky)",
  "var(--candy)",
  "var(--mint)",
  "var(--rose)",
  "var(--alert)",
  "var(--success)",
];

export const AVATAR_IMAGES = {
  "Lena Marsh":  "/avatar-lena.png",
  "Jordan Cole": "/avatar-jordan.png",
  "Priya Nair":  "/avatar-priya.png",
  "Tom Okafor":  "/avatar-tom.png",
  "Dana Fox":    "/avatar-dana.png",
};

/** Deterministic color from a name string. */
export function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const n = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

/** First-letter initials from a name (max 2 chars). */
export function avatarInitials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
