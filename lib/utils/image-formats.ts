export const TRANSFORM_FORMATS = ["jpeg", "png", "webp", "avif", "gif"] as const;

export type TransformFormat = (typeof TRANSFORM_FORMATS)[number];

export const MAX_TRANSFORM_DIMENSION = 10_000;

export const FORMAT_LABELS: Record<TransformFormat, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  gif: "GIF"
};

export const FORMAT_EXTENSIONS: Record<TransformFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  gif: "gif"
};

export function formatToMimeType(format: TransformFormat) {
  return `image/${format}`;
}
