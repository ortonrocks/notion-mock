import { notFound } from "next/navigation";
import Workspace from "@/components/Workspace";
import { ensureSeeded, getAncestors, getBacklinks, getPage, listFavorites, listTree } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  ensureSeeded();
  const { id } = await params;
  const page = getPage(id);
  if (!page) notFound();

  return (
    <Workspace
      key={page.id}
      page={page}
      initialTree={listTree()}
      initialFavorites={listFavorites()}
      initialBacklinks={getBacklinks(page.id)}
      ancestors={getAncestors(page.id)}
    />
  );
}
