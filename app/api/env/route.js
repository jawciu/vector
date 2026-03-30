import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const runtime = "nodejs";

function getProjectRoot() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, ".env"))) return cwd;
  let dir;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch (error) {
    console.warn("[GET /api/env] Failed to resolve project root:", error.message);
    return cwd;
  }
  for (let i = 0; i < 15; i++) {
    if (fs.existsSync(path.join(dir, ".env"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

function readEnvFromFile() {
  const root = getProjectRoot();
  const envPath = path.join(root, ".env");
  const out = { url: "", key: "" };
  try {
    if (!fs.existsSync(envPath)) return out;
    const content = fs.readFileSync(envPath, "utf8").replace(/\uFEFF/g, "");
    const urlMatch = content.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*([^\s\r\n]+)/);
    const keyMatch = content.match(/NEXT_PUBLIC_SUPABASE_(?:ANON_KEY|PUBLISHABLE_KEY)\s*=\s*([^\s\r\n]+)/);
    if (urlMatch) out.url = urlMatch[1].replace(/^["']|["']$/g, "").trim();
    if (keyMatch) out.key = keyMatch[1].replace(/^["']|["']$/g, "").trim();
  } catch (error) {
    console.warn("[GET /api/env] Failed to read .env file:", error.message);
  }
  return out;
}

/**
 * Returns public Supabase env for the client. Reads .env from disk, fallback to process.env.
 * Add ?debug=1 to see what the server sees (paths, file exists, etc.).
 */
export async function GET(request) {
  const file = readEnvFromFile();
  const url =
    file.url ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const key =
    file.key ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  const debug = request.nextUrl?.searchParams?.get("debug") === "1";
  if (!debug) {
    return NextResponse.json({ url, key });
  }

  return NextResponse.json({
    url: url ? "(set)" : "",
    key: key ? "(set)" : "",
    debug: {
      source: {
        fileUrl: !!file.url,
        fileKey: !!file.key,
        processEnvUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        processEnvKey: !!(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ),
      },
      processEnvHasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      processEnvHasKey: !!(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ),
    },
  });
}
