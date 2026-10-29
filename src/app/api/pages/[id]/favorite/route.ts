import { setFavorite } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!setFavorite(id, true)) return Response.json({ error: "找不到頁面" }, { status: 404 });
  return Response.json({ favorite: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!setFavorite(id, false)) return Response.json({ error: "找不到頁面" }, { status: 404 });
  return Response.json({ favorite: false });
}
