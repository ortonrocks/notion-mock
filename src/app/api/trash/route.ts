import { emptyTrash, listTrash } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ entries: listTrash() });
}

/** Permanently deletes everything in the trash. */
export async function DELETE() {
  return Response.json({ purged: emptyTrash() });
}
