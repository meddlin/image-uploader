import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getCatalogSnapshot, importObjectFromS3 } from "@/lib/services/catalog";
import { browseBucket, normalizePrefix } from "@/lib/services/s3-browser";
import { setTestEnv } from "@/tests/helpers";

const { listObjectsPage, downloadObject, headObject } = vi.hoisted(() => ({
  listObjectsPage: vi.fn(),
  downloadObject: vi.fn(),
  headObject: vi.fn()
}));

vi.mock("@/lib/services/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/s3")>("@/lib/services/s3");

  return { ...actual, listObjectsPage, downloadObject, headObject };
});

describe("S3 browser service", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    cleanup = setTestEnv().cleanup;
    listObjectsPage.mockReset();
    downloadObject.mockReset();
    headObject.mockReset();
  });

  afterEach(() => {
    cleanup?.();
  });

  test("normalizes prefixes to end with a single trailing slash", () => {
    expect(normalizePrefix("posts")).toBe("posts/");
    expect(normalizePrefix("/posts/")).toBe("posts/");
    expect(normalizePrefix("")).toBe("");
  });

  test("lists one folder level, annotating catalog membership and image-ness", async () => {
    const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#123456" } }).png().toBuffer();
    downloadObject.mockResolvedValue({ buffer, contentType: "image/png", byteSize: buffer.byteLength });
    headObject.mockResolvedValue({ LastModified: new Date("2025-01-01T00:00:00.000Z") });
    await importObjectFromS3("posts/known.png");

    listObjectsPage.mockResolvedValue({
      folders: ["posts/2025/"],
      objects: [
        { Key: "posts/known.png", Size: 2048, LastModified: new Date("2025-01-01T00:00:00.000Z") },
        { Key: "posts/new.jpg", Size: 10 },
        { Key: "posts/notes.txt", Size: 5 }
      ],
      nextToken: "next-page"
    });

    const result = await browseBucket({});

    expect(listObjectsPage).toHaveBeenCalledWith({ prefix: "posts/", token: undefined, maxKeys: 100 });
    expect(result.prefix).toBe("posts/");
    expect(result.folders).toEqual(["posts/2025/"]);
    expect(result.nextToken).toBe("next-page");
    expect(result.objects.map((object) => [object.name, object.isImage, object.assetId !== null])).toEqual([
      ["known.png", true, true],
      ["new.jpg", true, false],
      ["notes.txt", false, false]
    ]);
    expect(result.objects[0].publicUrl).toBe("https://cdn.example.com/posts/known.png");
  });

  test("honors an explicit prefix, including the bucket root, and forwards the paging token", async () => {
    listObjectsPage.mockResolvedValue({ folders: [], objects: [], nextToken: null });

    await browseBucket({ prefix: "", token: "abc" });

    expect(listObjectsPage).toHaveBeenCalledWith({ prefix: "", token: "abc", maxKeys: 100 });
  });

  test("imports a single object once and reports existing assets without downloading again", async () => {
    const buffer = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#abcdef" } }).png().toBuffer();
    downloadObject.mockResolvedValue({ buffer, contentType: "image/png", byteSize: buffer.byteLength });
    headObject.mockResolvedValue({ LastModified: new Date("2025-03-04T00:00:00.000Z") });

    const first = await importObjectFromS3("legacy/one.png");
    const second = await importObjectFromS3("legacy/one.png");

    expect(first.imported).toBe(true);
    expect(second.imported).toBe(false);
    expect(second.asset.id).toBe(first.asset.id);
    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(first.asset.createdAt).toBe(new Date("2025-03-04T00:00:00.000Z").getTime());
    expect(await getCatalogSnapshot()).toHaveLength(1);
  });
});
