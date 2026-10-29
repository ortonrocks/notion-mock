import { movePage } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Re-parents and/or reorders a page.
 *
 * The body names the neighbours it should land between rather than a position,
 * because the browser's tree can be out of date and the server is the only
 * thing that knows the real ordering values.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    afterId?: string | null;
    beforeId?: string | null;
  };

  try {
    const page = movePage(id, {
      parentId: body.parentId ?? null,
      afterId: body.afterId ?? null,
      beforeId: body.beforeId ?? null,
    });
    if (!page) return Response.json({ error: "找不到頁面" }, { status: 404 });
    return Response.json({ page });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "移動失敗" },
      { status: 400 },
    );
  }
}
