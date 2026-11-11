import { getCurrentUser } from "@/lib/auth";
import { buildKitFile, KIT_FILES, type KitFile } from "@/lib/vercel-kit";

export const dynamic = "force-dynamic";

/** Super Admin only: one of the 4 kit files for publishing on Vercel. */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "super_admin") return new Response("Not found.", { status: 404 });
  if (process.env.VERCEL) return new Response("Download the kit from the original server, not from the Vercel copy.", { status: 404 });
  const which = new URL(req.url).searchParams.get("file") as KitFile | null;
  if (!which || !(which in KIT_FILES)) return new Response("Unknown file.", { status: 400 });
  const data = buildKitFile(which);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": KIT_FILES[which].type, "Content-Disposition": `attachment; filename="${KIT_FILES[which].name}"`, "Cache-Control": "private, no-store" },
  });
}
