import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getCatalogSnapshot, importFromS3 } from "@/lib/services/catalog";
import { uploadAsset } from "@/lib/services/upload";
import { setTestEnv } from "@/tests/helpers";

const { listObjects, downloadObject, uploadObject } = vi.hoisted(() => ({
  listObjects: vi.fn(),
  downloadObject: vi.fn(),
  uploadObject: vi.fn<() => Promise<void>>()
}));

vi.mock("@/lib/services/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/s3")>("@/lib/services/s3");

  return {
    ...actual,
    listObjects,
    downloadObject,
    uploadObject
  };
});

describe("importFromS3", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    cleanup = setTestEnv().cleanup;
    listObjects.mockReset();
    downloadObject.mockReset();
    uploadObject.mockReset();
    uploadObject.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup?.();
  });

  test("imports new S3 objects and skips ones already in the catalog", async () => {
    const existingBuffer = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 20, g: 20, b: 20 }
      }
    })
      .jpeg()
      .toBuffer();

    await uploadAsset({
      file: existingBuffer,
      originalFilename: "existing.jpg",
      mimeType: "image/jpeg",
      byteSize: existingBuffer.byteLength,
      postSlug: "blog/original"
    });

    const importedBuffer = await sharp({
      create: {
        width: 800,
        height: 500,
        channels: 3,
        background: { r: 120, g: 80, b: 30 }
      }
    })
      .png()
      .toBuffer();

    listObjects.mockResolvedValue([
      { Key: "posts/blog/original/existing.jpg", LastModified: new Date("2025-01-01T00:00:00.000Z") },
      { Key: "legacy/new-image.png", LastModified: new Date("2025-01-02T00:00:00.000Z") }
    ]);

    downloadObject.mockResolvedValue({
      buffer: importedBuffer,
      contentType: "image/png",
      byteSize: importedBuffer.byteLength
    });

    const results = await importFromS3();
    const catalog = await getCatalogSnapshot();

    expect(results.filter((item) => item.imported)).toHaveLength(1);
    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(catalog).toHaveLength(2);
    expect(catalog.some((asset) => asset.s3Key === "legacy/new-image.png")).toBe(true);
  });
});
