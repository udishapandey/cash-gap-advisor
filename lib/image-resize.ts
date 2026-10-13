// Shrink a phone photo in the browser before it is uploaded, so it stays well under the hosting limit (about 4.5 MB per request).
// Browser only. The photo is never stored or logged.

export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.8;

/** The size to draw an image at so its long edge is at most `max` pixels. Never makes it bigger. */
export function fitWithin(width: number, height: number, max = MAX_EDGE_PX): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A PNG or JPG, resized to at most 1600px on its long edge and saved as a JPEG at 0.8. Returns the original file if it
 * is not an image, or the browser cannot decode it, or the result would be larger.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // a transparent PNG becomes white, not black, as a JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
