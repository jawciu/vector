import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { updateTaskAsPortalUser } from "@/lib/db";

export async function PATCH(request, { params }) {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;
    const body = await request.json();

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
    console.error("Portal task update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update task" },
      { status: 500 }
    );
  }
}
