import { purgePage } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Permanently deletes one trashed page and its subtree. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const purged = purgePage(id);
  if (purged === 0) {
    return Response.json({ error: "垃圾桶裡沒有這一頁" }, { status: 404 });
  }
  return Response.json({ purged });
}
