import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Pasted and dropped files are kept on disk next to the database rather than
 * inlined into the document, so a screenshot-heavy page stays small.
 */
const UPLOAD_DIR = process.env.NOTION_MOCK_UPLOADS ?? path.join(process.cwd(), "data", "uploads");

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_TYPE).map(([type, extension]) => [extension, type]),
);

/** Stored names are generated, so anything else is a traversal attempt. */
const STORED_NAME = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function extensionFor(file: File): string {
  const fromType = EXTENSION_BY_TYPE[file.type];
  if (fromType) return fromType;
  const fromName = path.extname(file.name).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(fromName) ? fromName : "bin";
}

export async function saveUpload(file: File): Promise<{ name: string }> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${extensionFor(file)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return { name };
}

export async function readUpload(name: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!STORED_NAME.test(name)) return null;
  try {
    const body = await fs.readFile(path.join(UPLOAD_DIR, name));
    const extension = path.extname(name).slice(1).toLowerCase();
    return { body, contentType: CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
