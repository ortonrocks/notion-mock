import "server-only";
import { readUpload } from "@/lib/uploads";

/** Media types Claude accepts as image input. */
const VISION_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
type VisionMediaType = (typeof VISION_MEDIA_TYPES)[number];

/** Keeps a screenshot-heavy page from blowing past the request size limit. */
const MAX_IMAGES_PER_REQUEST = 8;

const UPLOAD_URL = /\/api\/files\/([0-9a-f-]{36}\.[a-z0-9]{1,8})/g;

export type PromptImage = { name: string; mediaType: VisionMediaType; base64: string };

function isVisionMediaType(type: string): type is VisionMediaType {
  return (VISION_MEDIA_TYPES as readonly string[]).includes(type);
}

/** Pulls the stored upload names out of any text that embeds our file URLs. */
export function findUploadNames(text: string): string[] {
  return [...new Set([...text.matchAll(UPLOAD_URL)].map((match) => match[1]))];
}

/**
 * Loads the uploads referenced by a document so they can be sent to Claude as
 * real image input. Anything that is not a readable image Claude can see — a
 * PDF, an SVG, a deleted file — is skipped rather than failing the request.
 */
export async function loadPromptImages(names: string[]): Promise<PromptImage[]> {
  const images: PromptImage[] = [];
  for (const name of names.slice(0, MAX_IMAGES_PER_REQUEST)) {
    const file = await readUpload(name);
    if (!file || !isVisionMediaType(file.contentType)) continue;
    images.push({ name, mediaType: file.contentType, base64: file.body.toString("base64") });
  }
  return images;
}

/** Convenience wrapper: find the uploads a document mentions and load them. */
export function loadImagesFromText(text: string): Promise<PromptImage[]> {
  return loadPromptImages(findUploadNames(text));
}
