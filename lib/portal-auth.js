import { cookies } from "next/headers";
import { getMagicLinkByToken, getMagicLinkRaw } from "./db.js";

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
 * Validate portal access and return the failure reason if invalid.
 * Returns { session, error } — session is the same shape as validatePortalAccess,
 * error is "expired" | "revoked" | "invalid" | null.
 */
export async function validatePortalWithReason(onboardingId) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { session: null, error: "invalid" };

  // Single raw lookup to determine status
  const rawLink = await getMagicLinkRaw(token);
  if (!rawLink) return { session: null, error: "invalid" };
  if (rawLink.revokedAt) return { session: null, error: "revoked" };
  if (rawLink.expiresAt < new Date()) return { session: null, error: "expired" };

  if (onboardingId !== undefined) {
    const oId = Number(onboardingId);
    if (rawLink.onboardingId !== oId) return { session: null, error: "invalid" };
  }

  // Token is valid — get the full link with relations
  const link = await getMagicLinkByToken(token);
  if (!link) return { session: null, error: "invalid" };

  return {
    session: {
      contact: link.contact,
      onboarding: link.onboarding,
      magicLink: link,
    },
    error: null,
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
