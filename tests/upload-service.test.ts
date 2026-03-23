import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getCatalogSnapshot } from "@/lib/services/catalog";
import { uploadAsset } from "@/lib/services/upload";
import { setTestEnv } from "@/tests/helpers";

const { uploadObject, setObjectPublic } = vi.hoisted(() => ({
  uploadObject: vi.fn<() => Promise<void>>(),
  setObjectPublic: vi.fn<() => Promise<void>>()
}));

vi.mock("@/lib/services/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/s3")>("@/lib/services/s3");

  return {
    ...actual,
    uploadObject,
    setObjectPublic
  };
});

describe("upload service", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    uploadObject.mockReset();
    setObjectPublic.mockReset();
    uploadObject.mockResolvedValue(undefined);
    setObjectPublic.mockResolvedValue(undefined);
    cleanup = setTestEnv().cleanup;
  });

  afterEach(() => {
    cleanup?.();
  });

  test("deduplicates an identical file and creates a second usage", async () => {
    const buffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 30, g: 40, b: 50 }
      }
    })
      .png()
      .toBuffer();

    const first = await uploadAsset({
      file: buffer,
      originalFilename: "hero.png",
      mimeType: "image/png",
      byteSize: buffer.byteLength,
      postSlug: "blog/first-post",
      altText: "Hero image",
      tags: ["hero"]
    });

    const second = await uploadAsset({
      file: buffer,
      originalFilename: "hero.png",
      mimeType: "image/png",
      byteSize: buffer.byteLength,
      postSlug: "blog/second-post",
      caption: "Second usage"
    });

    const catalog = await getCatalogSnapshot();

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.usageCount).toBe(2);
    expect(catalog[0]?.lastUsedPostSlug).toBe("blog/second-post");
    expect(setObjectPublic).not.toHaveBeenCalled();
  });

  test("requests a public ACL for new uploads and reused assets when asked", async () => {
    const buffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 90, g: 40, b: 120 }
      }
    })
      .png()
      .toBuffer();

    await uploadAsset({
      file: buffer,
      originalFilename: "hero.png",
      mimeType: "image/png",
      byteSize: buffer.byteLength,
      postSlug: "blog/public-first",
      makePublic: true
    });

    await uploadAsset({
      file: buffer,
      originalFilename: "hero.png",
      mimeType: "image/png",
      byteSize: buffer.byteLength,
      postSlug: "blog/public-second",
      makePublic: true
    });

    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        makePublic: true
      })
    );
    expect(setObjectPublic).toHaveBeenCalledTimes(1);
  });
});
