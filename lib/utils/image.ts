import sharp from "sharp";

export type ImageDetails = {
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
};

export async function extractImageDetails(buffer: Buffer, fallbackMimeType?: string): Promise<ImageDetails> {
  const { data, info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  const format = info.format === "svg" ? "svg+xml" : info.format;
  const mimeType = fallbackMimeType || (format ? `image/${format}` : "application/octet-stream");

  if (!info.width || !info.height) {
    throw new Error("Unable to determine image dimensions.");
  }

  return {
    width: info.width,
    height: info.height,
    mimeType,
    byteSize: data.byteLength
  };
}
