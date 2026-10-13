import { NextResponse } from "next/server";
import { updateTask, deleteTask, DependencyError } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: Parameters<typeof updateTask>[1] = await request.json();

    const task = await updateTask(id, body, { actor: { type: "vendor", authUser: user } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof DependencyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[PATCH /api/tasks/:id]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update task" },
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
    const result = await deleteTask(id);
    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/tasks/:id]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete task" },
      { status: 500 }
    );
  }
}
