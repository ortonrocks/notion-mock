import { deletePage, getPage, updatePage, VersionConflictError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const page = getPage(id);
  if (!page) return Response.json({ error: "找不到頁面" }, { status: 404 });
  return Response.json({ page });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { version, ...patch } = (await req.json()) as {
    title?: string;
    icon?: string | null;
    content?: unknown[];
    parentId?: string | null;
    version?: number;
  };

  try {
    const page = updatePage(id, patch, version);
    if (!page) return Response.json({ error: "找不到頁面" }, { status: 404 });
    return Response.json({ page });
  } catch (error) {
    // The caller's copy is stale. Hand back the current page so the client can
    // show what is actually stored instead of silently overwriting it.
    if (error instanceof VersionConflictError) {
      return Response.json(
        { error: error.message, code: error.code, page: error.current },
        { status: 409 },
      );
    }
    return Response.json({ error: error instanceof Error ? error.message : "更新失敗" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!deletePage(id)) return Response.json({ error: "找不到頁面" }, { status: 404 });
  return Response.json({ ok: true });
}
