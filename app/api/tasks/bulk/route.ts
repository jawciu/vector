import { NextResponse } from "next/server";
import { bulkUpdateTasks } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskIds, data }: {
      taskIds?: Parameters<typeof bulkUpdateTasks>[0];
      data: Parameters<typeof bulkUpdateTasks>[1];
    } = await request.json();

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "taskIds array is required" },
        { status: 400 }
      );
    }

    const result = await bulkUpdateTasks(taskIds, data);
    return NextResponse.json({ count: result.count });
  } catch (error) {
    console.error("[PATCH /api/tasks/bulk]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to bulk update tasks" },
      { status: 500 }
    );
  }
}
