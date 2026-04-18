import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getFile } from "@/lib/db";

const BUCKET_NAME = "portal-files";

/** Admin Supabase client for storage. */
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await params;
    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const storage = getStorageClient();
    const { data, error } = await storage.storage
      .from(BUCKET_NAME)
      .download(file.storagePath);

    if (error) {
      console.error("[GET /api/tasks/:taskId/files/:fileId] Storage error:", error);
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
    console.error("[GET /api/tasks/:taskId/files/:fileId]", error);
    return NextResponse.json(
      { error: error.message || "Failed to download file" },
      { status: 500 }
    );
  }
}
