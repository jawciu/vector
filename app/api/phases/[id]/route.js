import { NextResponse } from "next/server";
import { updatePhase, deletePhase } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const phase = await updatePhase(id, body);
    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }
    return NextResponse.json(phase);
  } catch (error) {
    console.error("Error updating phase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update phase" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await deletePhase(id);
    if (!result) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting phase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete phase" },
      { status: 500 }
    );
  }
}
