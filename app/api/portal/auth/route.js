import { NextResponse } from "next/server";
import { getMagicLinkByToken } from "@/lib/db";

const COOKIE_NAME = "portal_token";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/portal/auth", request.url));
  }

  const link = await getMagicLinkByToken(token);

  if (!link) {
    return NextResponse.redirect(
      new URL("/portal/auth?error=invalid", request.url)
    );
  }

  const maxAge = Math.floor((link.expiresAt.getTime() - Date.now()) / 1000);

  const redirectUrl = new URL(`/portal/${link.onboardingId}`, request.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(maxAge, 0),
  });

  return response;
}
