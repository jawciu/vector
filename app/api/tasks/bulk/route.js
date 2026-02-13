import { NextResponse } from "next/server";
import { bulkUpdateTasks } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskIds, data } = await request.json();

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "taskIds array is required" },
        { status: 400 }
      );
    }

    const result = await bulkUpdateTasks(taskIds, data);
    return NextResponse.json({ count: result.count });
  } catch (error) {
    console.error("Error bulk updating tasks:", error);
    return NextResponse.json(
      { error: error.message || "Failed to bulk update tasks" },
      { status: 500 }
    );
  }
}
