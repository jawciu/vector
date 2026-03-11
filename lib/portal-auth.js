import { cookies } from "next/headers";
import { getMagicLinkByToken } from "./db.js";

const COOKIE_NAME = "portal_token";

/**
 * Validate portal access from the portal_token cookie.
 * Returns { contact, onboarding, magicLink } or null if invalid.
 * Optionally checks that the onboardingId matches (for route protection).
 */
export async function validatePortalAccess(onboardingId) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const link = await getMagicLinkByToken(token);
  if (!link) return null;

  // If onboardingId is provided, verify it matches the token's scope
  if (onboardingId !== undefined) {
    const oId = Number(onboardingId);
    if (link.onboardingId !== oId) return null;
  }

  return {
    contact: link.contact,
    onboarding: link.onboarding,
    magicLink: link,
  };
}

/**
 * Set the portal_token cookie after validating a magic link URL.
 * Returns the magic link data or null if invalid.
 */
export async function setPortalCookie(token) {
  const link = await getMagicLinkByToken(token);
  if (!link) return null;

  const cookieStore = await cookies();
  const maxAge = Math.floor((link.expiresAt.getTime() - Date.now()) / 1000);

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(maxAge, 0),
  });

  return link;
}
