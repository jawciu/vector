import { NextResponse } from "next/server";
import { getMagicLinksForOnboarding, createMagicLink } from "@/lib/db";
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
    console.error("Error fetching magic links:", error);
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
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("Error creating magic link:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create magic link" },
      { status: 500 }
    );
  }
}
