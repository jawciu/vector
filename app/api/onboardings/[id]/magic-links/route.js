import { NextResponse } from "next/server";
import { getMagicLinksForOnboarding, createMagicLink, markMagicLinkSent, getOnboarding } from "@/lib/db";
import { sendPortalInvite } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export async function GET(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const links = await getMagicLinksForOnboarding(id);
    return NextResponse.json(links);
  } catch (error) {
    console.error("[GET /api/onboardings/:id/magic-links]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch magic links" },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!body.contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

    const link = await createMagicLink(body.contactId, id, body.expiresInDays || 30);
    if (!link) {
      return NextResponse.json({ error: "Failed to create magic link" }, { status: 500 });
    }

    let sendStatus = "skipped_no_email";
    if (link.contact?.email) {
      const onboarding = await getOnboarding(id);
      const result = await sendPortalInvite({
        to: link.contact.email,
        contactName: link.contact.name,
        companyName: onboarding?.companyName || "",
        token: link.token,
        expiresAt: link.expiresAt,
      });
      if (result.ok) {
        const updated = await markMagicLinkSent(link.id, link.contact.email);
        return NextResponse.json({ ...link, sentAt: updated.sentAt, sentTo: updated.sentTo }, { status: 201 });
      }
      sendStatus = result.error || "email_failed";
    }

    return NextResponse.json({ ...link, emailStatus: sendStatus }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/onboardings/:id/magic-links]", error);
    return NextResponse.json(
      { error: error.message || "Failed to create magic link" },
      { status: 500 }
    );
  }
}
