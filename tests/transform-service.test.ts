import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getCatalogSnapshot } from "@/lib/services/catalog";
import { transformAsset } from "@/lib/services/transform";
import { uploadAsset } from "@/lib/services/upload";
import { setTestEnv } from "@/tests/helpers";

const { uploadObject, setObjectPublic, downloadObject } = vi.hoisted(() => ({
  uploadObject: vi.fn<(input: { key: string; body: Buffer; contentType: string; makePublic?: boolean }) => Promise<void>>(),
  setObjectPublic: vi.fn<() => Promise<void>>(),
  downloadObject: vi.fn<(key: string) => Promise<{ buffer: Buffer; contentType: string; byteSize: number }>>()
}));

vi.mock("@/lib/services/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/s3")>("@/lib/services/s3");

  return {
    ...actual,
    uploadObject,
    setObjectPublic,
    downloadObject
  };
});

describe("transform service", () => {
  let cleanup: (() => void) | undefined;
  let original: Buffer;

  async function uploadOriginal() {
    const result = await uploadAsset({
      file: original,
      originalFilename: "Hero Shot.jpg",
      mimeType: "image/jpeg",
      byteSize: original.byteLength,
      postSlug: "blog/launch",
      tags: ["hero"]
    });

    downloadObject.mockResolvedValue({ buffer: original, contentType: "image/jpeg", byteSize: original.byteLength });

    return result.asset;
  }

  beforeEach(async () => {
    uploadObject.mockReset();
    setObjectPublic.mockReset();
    downloadObject.mockReset();
    uploadObject.mockResolvedValue(undefined);
    setObjectPublic.mockResolvedValue(undefined);
    cleanup = setTestEnv().cleanup;
    original = await sharp({ create: { width: 1200, height: 600, channels: 3, background: { r: 200, g: 80, b: 40 } } })
      .jpeg()
      .toBuffer();
  });

  afterEach(() => {
    cleanup?.();
  });

  test("stores the resized copy next to the original and leaves the original untouched", async () => {
    const source = await uploadOriginal();

    const result = await transformAsset({ assetId: source.id, width: 300 });

    expect(result.deduped).toBe(false);
    expect(result.asset).toMatchObject({
      originalFilename: "Hero Shot-300x150.jpg",
      s3Key: "posts/blog/launch/hero-shot-300x150.jpg",
      publicUrl: "https://cdn.example.com/posts/blog/launch/hero-shot-300x150.jpg",
      mimeType: "image/jpeg",
      width: 300,
      height: 150,
      usageCount: 0
    });
    expect(downloadObject).toHaveBeenCalledWith(source.s3Key);
    expect(uploadObject).toHaveBeenCalledTimes(2);
    expect(uploadObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "posts/blog/launch/hero-shot-300x150.jpg", contentType: "image/jpeg" })
    );

    const catalog = await getCatalogSnapshot();
    const untouched = catalog.find((entry) => entry.id === source.id);

    expect(catalog).toHaveLength(2);
    expect(untouched).toMatchObject({ width: 1200, height: 600, byteSize: original.byteLength, s3Key: source.s3Key });
  });

  test("converts the format and uses the new extension and MIME type", async () => {
    const source = await uploadOriginal();

    const result = await transformAsset({ assetId: source.id, format: "png" });

    expect(result.asset).toMatchObject({
      originalFilename: "Hero Shot.png",
      s3Key: "posts/blog/launch/hero-shot.png",
      mimeType: "image/png",
      width: 1200,
      height: 600
    });
    const uploaded = uploadObject.mock.calls.at(-1)?.[0];
    expect((await sharp(uploaded?.body).metadata()).format).toBe("png");
  });

  test("reuses the existing asset when the same transform is repeated", async () => {
    const source = await uploadOriginal();

    const first = await transformAsset({ assetId: source.id, width: 300 });
    const second = await transformAsset({ assetId: source.id, width: 300 });

    expect(second.deduped).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(uploadObject).toHaveBeenCalledTimes(2);
    expect(await getCatalogSnapshot()).toHaveLength(2);
  });

  test("requests a public ACL only when asked", async () => {
    const source = await uploadOriginal();

    await transformAsset({ assetId: source.id, width: 300, makePublic: true });
    await transformAsset({ assetId: source.id, width: 300, makePublic: true });

    expect(uploadObject).toHaveBeenLastCalledWith(expect.objectContaining({ makePublic: true }));
    expect(setObjectPublic).toHaveBeenCalledTimes(1);
  });

  test("avoids a key already used by another asset in the folder", async () => {
    const source = await uploadOriginal();
    const other = await sharp({ create: { width: 300, height: 150, channels: 3, background: "green" } })
      .jpeg()
      .toBuffer();
    await uploadAsset({
      file: other,
      originalFilename: "Hero Shot-300x150.jpg",
      mimeType: "image/jpeg",
      byteSize: other.byteLength,
      postSlug: "blog/launch"
    });

    const result = await transformAsset({ assetId: source.id, width: 300 });

    expect(result.asset.s3Key).toBe("posts/blog/launch/hero-shot-300x150-2.jpg");
  });

  test("rejects an unknown asset before touching S3", async () => {
    await expect(transformAsset({ assetId: 999, width: 100 })).rejects.toThrow("Asset 999 was not found.");

    expect(downloadObject).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  test("does not create a catalog row when the S3 upload fails", async () => {
    const source = await uploadOriginal();
    uploadObject.mockRejectedValueOnce(new Error("S3 unavailable"));

    await expect(transformAsset({ assetId: source.id, width: 300 })).rejects.toThrow("S3 unavailable");

    expect(await getCatalogSnapshot()).toHaveLength(1);
  });
});
