import { searchPages } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ hits: searchPages(query) });
}
