import sharp, { type Metadata } from "sharp";

import { TRANSFORM_FORMATS, formatToMimeType, type TransformFormat } from "@/lib/utils/image-formats";

const SVG_BASE_DENSITY = 72;

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

export type TransformOptions = {
  width?: number;
  height?: number;
  /** When false and both dimensions are given, the image is stretched to exactly width × height. */
  keepAspectRatio?: boolean;
  /** Defaults to the source format. */
  format?: TransformFormat;
};

export type TransformedImage = ImageDetails & {
  buffer: Buffer;
  format: TransformFormat;
};

function toTransformFormat(metadata: Metadata): TransformFormat | null {
  // sharp reports AVIF files as "heif"; only the AV1 flavour can be written back out.
  const format = metadata.format === "heif" && metadata.compression === "av1" ? "avif" : metadata.format;

  return TRANSFORM_FORMATS.find((candidate) => candidate === format) ?? null;
}

export async function transformImage(buffer: Buffer, options: TransformOptions): Promise<TransformedImage> {
  const { width, height } = options;
  const metadata = await sharp(buffer).metadata();
  const format = options.format ?? toTransformFormat(metadata);

  if (!format) {
    throw new Error(`Cannot keep the ${metadata.format ?? "source"} format. Choose a format to convert to.`);
  }

  // Only animation-capable outputs may read every frame; otherwise sharp stacks the frames into one tall image.
  const animated = (metadata.pages ?? 1) > 1 && (format === "webp" || format === "gif");
  let density: number | undefined;

  if (metadata.format === "svg" && metadata.width && metadata.height) {
    // Vector input is rasterised at its intrinsic size unless asked for more, which would blur upscales.
    const scale = Math.max(width ? width / metadata.width : 0, height ? height / metadata.height : 0, 1);
    density = Math.ceil(SVG_BASE_DENSITY * scale);
  }

  let pipeline = sharp(buffer, { animated, density }).rotate();

  if (width || height) {
    pipeline = pipeline.resize({
      width,
      height,
      fit: options.keepAspectRatio === false ? "fill" : "inside"
    });
  }

  if (format === "jpeg") {
    // JPEG has no alpha channel; without this, transparent pixels turn black.
    pipeline = pipeline.flatten({ background: "#ffffff" });
  }

  const output = await pipeline.toFormat(format).toBuffer();
  // Read the result back rather than trusting the pipeline info, which reports stacked height for animations.
  const outputMetadata = await sharp(output).metadata();

  if (!outputMetadata.width || !outputMetadata.height) {
    throw new Error("Unable to determine image dimensions.");
  }

  return {
    buffer: output,
    format,
    width: outputMetadata.width,
    height: outputMetadata.height,
    mimeType: formatToMimeType(format),
    byteSize: output.byteLength
  };
}
