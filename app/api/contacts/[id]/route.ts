import { NextResponse } from "next/server";
import { updateContact, deleteContact } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: Parameters<typeof updateContact>[1] = await request.json();

    const contact = await updateContact(id, body);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json(contact);
  } catch (error) {
    console.error("[PATCH /api/contacts/:id]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await deleteContact(id);
    if (!result) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/contacts/:id]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete contact" },
      { status: 500 }
    );
  }
}
