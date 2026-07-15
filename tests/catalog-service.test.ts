import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { initializeDatabase } from "@/lib/db/client";
import { insertAsset } from "@/lib/repos/assets";
import { insertUsage, listUsagesForAsset } from "@/lib/repos/usages";
import {
  addTagsToAsset,
  generateUsageSnippet,
  getCatalogSnapshot,
  removeTagFromAsset,
  syncCatalogWithS3
} from "@/lib/services/catalog";
import { setTestEnv } from "@/tests/helpers";

const { headObject } = vi.hoisted(() => ({ headObject: vi.fn() }));

vi.mock("@/lib/services/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/s3")>("@/lib/services/s3");
  return { ...actual, headObject };
});

describe("catalog service", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    cleanup = setTestEnv().cleanup;
    initializeDatabase();
    headObject.mockReset();
    headObject.mockResolvedValue({});
  });

  afterEach(() => cleanup?.());

  async function seedAsset(input: { id: number; filename: string; key: string; url?: string }) {
    return insertAsset({
      id: input.id,
      sha256: `hash-${input.id}`,
      originalFilename: input.filename,
      s3Key: input.key,
      publicUrl: input.url ?? `https://cdn.example.com/${input.key}`,
      mimeType: "image/png",
      byteSize: 100,
      width: 100,
      height: 50,
      bucket: "unit-test-bucket",
      region: "us-east-1",
      createdAt: input.id
    });
  }

  test("filters catalog entries by query, post slug, and tag", async () => {
    const hero = await seedAsset({ id: 1, filename: "Hero Image.png", key: "posts/blog/hero.png" });
    await seedAsset({ id: 2, filename: "diagram.png", key: "posts/docs/architecture.png" });
    await insertUsage({
      assetId: hero.id,
      postSlug: "blog/launch-post",
      snippet: "<BlogImage />",
      createdAt: 10
    });
    await addTagsToAsset(hero.id, [" featured ", "hero", "featured"]);

    await expect(getCatalogSnapshot({ query: "Hero Image" })).resolves.toHaveLength(1);
    await expect(getCatalogSnapshot({ query: "architecture" })).resolves.toHaveLength(1);
    await expect(getCatalogSnapshot({ query: "cdn.example.com/posts/blog" })).resolves.toHaveLength(1);
    await expect(getCatalogSnapshot({ postSlug: "launch" })).resolves.toHaveLength(1);
    await expect(getCatalogSnapshot({ tag: "feat" })).resolves.toHaveLength(1);

    const catalog = await getCatalogSnapshot();
    expect(catalog.find((asset) => asset.id === hero.id)).toMatchObject({
      tags: ["featured", "hero"],
      usageCount: 1,
      lastUsedPostSlug: "blog/launch-post"
    });
  });

  test("adds and removes normalized tags idempotently", async () => {
    const asset = await seedAsset({ id: 1, filename: "hero.png", key: "posts/hero.png" });

    const tagged = await addTagsToAsset(asset.id, [" hero ", "hero", "feature"]);
    expect(tagged?.tags).toEqual(["hero", "feature"]);

    await expect(removeTagFromAsset(asset.id, "hero")).resolves.toMatchObject({ changed: true });
    await expect(removeTagFromAsset(asset.id, "hero")).resolves.toMatchObject({ changed: false });
    await expect(removeTagFromAsset(asset.id, "missing")).resolves.toMatchObject({ changed: false });
    await expect(addTagsToAsset(999, ["hero"])).rejects.toThrow("Asset 999 was not found.");
  });

  test("generates a snippet and records another usage", async () => {
    const asset = await seedAsset({ id: 1, filename: "hero.png", key: "posts/hero.png" });

    const result = await generateUsageSnippet({
      assetId: asset.id,
      postSlug: "blog/reuse",
      altText: "Reused hero",
      caption: "Again"
    });

    expect(result.snippet).toContain('alt="Reused hero"');
    expect(await listUsagesForAsset(asset.id)).toHaveLength(1);
    await expect(generateUsageSnippet({ assetId: 999, postSlug: "blog/missing" })).rejects.toThrow(
      "Asset 999 was not found."
    );
  });

  test("reports missing S3 objects and public URL mismatches", async () => {
    await seedAsset({ id: 1, filename: "healthy.png", key: "posts/healthy.png" });
    await seedAsset({
      id: 2,
      filename: "wrong-url.png",
      key: "posts/wrong-url.png",
      url: "https://old.example.com/wrong-url.png"
    });
    await seedAsset({ id: 3, filename: "missing.png", key: "posts/missing.png" });
    headObject.mockImplementation(async (key: string) => {
      if (key === "posts/missing.png") {
        throw new Error("NotFound");
      }
      return {};
    });

    const issues = await syncCatalogWithS3();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ s3Key: "posts/wrong-url.png", message: expect.stringContaining("Public URL mismatch") }),
        expect.objectContaining({ s3Key: "posts/missing.png", message: "NotFound" })
      ])
    );
    expect(issues).toHaveLength(2);
  });
});
