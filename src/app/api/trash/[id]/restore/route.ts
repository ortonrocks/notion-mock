import { NotATrashRootError, restorePage } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const result = restorePage(id);
    if (result.restored === 0) {
      return Response.json({ error: "垃圾桶裡沒有這一頁" }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    // Restoring a page that was deleted as part of a subtree is incoherent on
    // its own — its parent is still in the trash. Hand back the root so the
    // UI can offer that instead.
    if (error instanceof NotATrashRootError) {
      return Response.json(
        { error: error.message, code: error.code, root: error.root },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "還原失敗" },
      { status: 400 },
    );
  }
}
