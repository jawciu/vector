import { NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/portal-auth";
import { getFileForPortal } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const BUCKET_NAME = "portal-files";

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

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(file.storagePath);

    if (error) {
      console.error("Storage download error:", error);
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
    console.error("Portal file download error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to download file" },
      { status: 500 }
    );
  }
}
