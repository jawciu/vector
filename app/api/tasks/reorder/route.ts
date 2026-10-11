import { NextResponse } from "next/server";
import { reorderTask } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId, targetPhaseId, sortOrder }: {
      taskId?: number | string | null;
      targetPhaseId?: number | string | null;
      sortOrder?: number | null;
    } = await request.json();

    if (taskId == null || targetPhaseId == null || sortOrder == null) {
      return NextResponse.json(
        { error: "taskId, targetPhaseId, and sortOrder are required" },
        { status: 400 }
      );
    }

    const task = await reorderTask(taskId, targetPhaseId, sortOrder);
    return NextResponse.json(task);
  } catch (error) {
    console.error("[POST /api/tasks/reorder]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to reorder task" },
      { status: 500 }
    );
  }
}
