import { MAX_UPLOAD_BYTES, saveUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "缺少檔案" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `檔案太大（上限 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB）` },
      { status: 413 },
    );
  }

  const { name } = await saveUpload(file);
  return Response.json({ url: `/api/files/${name}` }, { status: 201 });
}
