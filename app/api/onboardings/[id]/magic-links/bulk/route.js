import { NextResponse } from "next/server";
import { createMagicLinksBulk, markMagicLinkSent, getOnboarding } from "@/lib/db";
import { sendPortalInvite } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!Array.isArray(body.contactIds) || body.contactIds.length === 0) {
      return NextResponse.json(
        { error: "contactIds (non-empty array) is required" },
        { status: 400 }
      );
    }

    const onboarding = await getOnboarding(id);
    if (!onboarding) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }

    const { created, skipped } = await createMagicLinksBulk(
      body.contactIds,
      id,
      body.expiresInDays || 30
    );

    const results = await Promise.allSettled(
      created.map((link) =>
        sendPortalInvite({
          to: link.contact?.email,
          contactName: link.contact?.name,
          companyName: onboarding.companyName,
          token: link.token,
          expiresAt: link.expiresAt,
        })
      )
    );

    const succeeded = [];
    const failed = [];
    await Promise.all(
      results.map(async (result, i) => {
        const link = created[i];
        const value = result.status === "fulfilled" ? result.value : { ok: false, error: "email_failed" };
        if (value.ok) {
          const sentTo = link.contact?.email || null;
          await markMagicLinkSent(link.id, sentTo);
          succeeded.push({
            id: link.id,
            contactId: link.contactId,
            token: link.token,
            expiresAt: link.expiresAt,
            revokedAt: null,
            sentAt: new Date().toISOString(),
            sentTo,
          });
        } else {
          failed.push({ contactId: link.contactId, reason: value.error || "email_failed" });
        }
      })
    );

    return NextResponse.json(
      { created: succeeded, skipped, failed },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/onboardings/:id/magic-links/bulk]", error);
    return NextResponse.json(
      { error: error.message || "Failed to create magic links" },
      { status: 500 }
    );
  }
}
