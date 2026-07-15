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

  test("persists image metadata, tags, URL, and snippet for a new upload", async () => {
    const buffer = await sharp({
      create: {
        width: 300,
        height: 200,
        channels: 3,
        background: { r: 12, g: 34, b: 56 }
      }
    })
      .webp()
      .toBuffer();

    const result = await uploadAsset({
      file: buffer,
      originalFilename: "Feature Image.webp",
      mimeType: "image/webp",
      byteSize: buffer.byteLength,
      postSlug: "Blog/Feature Post",
      altText: "Feature image",
      caption: "A useful caption",
      tags: ["feature", " hero ", "feature"]
    });

    expect(result.deduped).toBe(false);
    expect(result.asset).toMatchObject({
      originalFilename: "Feature Image.webp",
      s3Key: "posts/blog/feature-post/feature-image.webp",
      publicUrl: "https://cdn.example.com/posts/blog/feature-post/feature-image.webp",
      mimeType: "image/webp",
      width: 300,
      height: 200,
      tags: ["feature", "hero"],
      usageCount: 1,
      lastUsedPostSlug: "Blog/Feature Post"
    });
    expect(result.snippet).toContain('alt="Feature image"');
    expect(result.snippet).toContain('caption="A useful caption"');
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "posts/blog/feature-post/feature-image.webp",
        body: buffer,
        contentType: "image/webp"
      })
    );
  });

  test("rejects non-image content before calling S3", async () => {
    await expect(
      uploadAsset({
        file: Buffer.from("not an image"),
        originalFilename: "notes.txt",
        mimeType: "text/plain",
        byteSize: 12,
        postSlug: "blog/notes"
      })
    ).rejects.toThrow("Only image files are supported.");

    expect(uploadObject).not.toHaveBeenCalled();
  });

  test("adds a suffix when a different image would reuse an existing object key", async () => {
    const firstBuffer = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "red" }
    })
      .png()
      .toBuffer();
    const secondBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "blue" }
    })
      .png()
      .toBuffer();

    await uploadAsset({
      file: firstBuffer,
      originalFilename: "diagram.png",
      mimeType: "image/png",
      byteSize: firstBuffer.byteLength,
      postSlug: "blog/key-collision"
    });
    const second = await uploadAsset({
      file: secondBuffer,
      originalFilename: "diagram.png",
      mimeType: "image/png",
      byteSize: secondBuffer.byteLength,
      postSlug: "blog/key-collision"
    });

    expect(second.asset.s3Key).toBe("posts/blog/key-collision/diagram-2.png");
    expect(uploadObject).toHaveBeenCalledTimes(2);
  });
});
