import { NextResponse } from "next/server";
import { getContactsForOnboarding, createContact } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const contacts = await getContactsForOnboarding(id);
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("[GET /api/onboardings/:id/contacts]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: Omit<Parameters<typeof createContact>[0], "onboardingId"> & { name?: string } = await request.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "Contact name is required" },
        { status: 400 }
      );
    }

    const contact = await createContact({ ...body, onboardingId: id });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("[POST /api/onboardings/:id/contacts]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create contact" },
      { status: 500 }
    );
  }
}
