import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { updateTaskAsPortalUser } from "@/lib/db";
import { TASK_STATUSES } from "@/lib/constants";

export async function PATCH(request, { params }) {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;
    const body = await request.json();

    if (body.status && !TASK_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${TASK_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await updateTaskAsPortalUser(
      taskId,
      session.magicLink.onboardingId,
      body
    );

    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/portal/tasks/:taskId]", error);
    return NextResponse.json(
      { error: error.message || "Failed to update task" },
      { status: 500 }
    );
  }
}
