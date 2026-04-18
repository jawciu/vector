import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { validatePortalAccess } from "@/lib/portal-auth";
import { getFileForPortal, deleteFile } from "@/lib/db";

const BUCKET_NAME = "portal-files";

/** Admin Supabase client for storage (bypasses RLS — portal users have no Supabase session). */
function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(url, key);
}

export async function GET(request, { params }) {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await params;
    const onboardingId = session.magicLink.onboardingId;

    const file = await getFileForPortal(fileId, onboardingId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const supabase = getStorageClient();
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(file.storagePath);

    if (error) {
      console.error("[GET /api/portal/tasks/:taskId/files/:fileId] Storage error:", error);
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    return new NextResponse(data, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Content-Length": String(file.fileSize),
      },
    });
  } catch (error) {
    console.error("[GET /api/portal/tasks/:taskId/files/:fileId]", error);
    return NextResponse.json(
      { error: error.message || "Failed to download file" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await validatePortalAccess();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await params;
    const onboardingId = session.magicLink.onboardingId;

    const file = await getFileForPortal(fileId, onboardingId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const supabase = getStorageClient();
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([file.storagePath]);

    if (storageError) {
      console.error("[DELETE /api/portal/tasks/:taskId/files/:fileId] Storage error:", storageError);
    }

    await deleteFile(file.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/portal/tasks/:taskId/files/:fileId]", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete file" },
      { status: 500 }
    );
  }
}
