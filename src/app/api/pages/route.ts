import { createPage, ensureSeeded, listFavorites, listTree } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded();
  return Response.json({ tree: listTree(), favorites: listFavorites() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    parentId?: string | null;
    icon?: string | null;
  };
  const page = createPage(body);
  return Response.json({ page }, { status: 201 });
}
