import { readFile } from "fs/promises";
import { join } from "path";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Super Admin only: the project source with its folders, ready to upload to GitHub / Vercel. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "super_admin") return new Response("Not found.", { status: 404 });
  try {
    const data = await readFile(join(process.cwd(), "exports", "dprinceportal-source.zip"));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="dprinceportal-source.zip"', "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("The project package is not available on this server.", { status: 404 });
  }
}
