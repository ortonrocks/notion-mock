import { redirect } from "next/navigation";
import { createPage, ensureSeeded, listRecent } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  ensureSeeded();
  const [mostRecent] = listRecent(1);
  const target = mostRecent ?? createPage({ title: "" });
  redirect(`/page/${target.id}`);
}
