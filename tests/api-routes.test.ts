import { beforeEach, describe, expect, test, vi } from "vitest";

import { POST as uploadRoute } from "@/app/api/assets/route";
import { POST as snippetRoute } from "@/app/api/assets/[assetId]/snippet/route";
import { GET as catalogRoute } from "@/app/api/catalog/route";

const { uploadAsset, getCatalogSnapshot, generateUsageSnippet } = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
  getCatalogSnapshot: vi.fn(),
  generateUsageSnippet: vi.fn()
}));

vi.mock("@/lib/services/upload", () => ({ uploadAsset }));
vi.mock("@/lib/services/catalog", () => ({
  generateUsageSnippet,
  getCatalogSnapshot,
  serializeCatalogAsset: (asset: unknown) => asset
}));

const asset = {
  id: 7,
  originalFilename: "hero.png",
  publicUrl: "https://cdn.example.com/posts/hero.png",
  s3Key: "posts/hero.png",
  mimeType: "image/png",
  byteSize: 3,
  width: 1200,
  height: 630,
  tags: ["hero"],
  usageCount: 1,
  lastUsedPostSlug: "blog/launch",
  lastUsedAt: 10,
  createdAt: 1,
  sha256: "hash",
  bucket: "bucket",
  region: "us-east-1"
};

describe("API routes", () => {
  beforeEach(() => {
    uploadAsset.mockReset();
    getCatalogSnapshot.mockReset();
    generateUsageSnippet.mockReset();
  });

  test("upload route parses normalized form data and returns the service result", async () => {
    uploadAsset.mockResolvedValue({ asset, usage: { id: 3 }, snippet: "<BlogImage />", deduped: false });
    const form = new FormData();
    form.set("file", new File(["png"], "hero.png", { type: "image/png" }));
    form.set("postSlug", " blog/launch ");
    form.set("altText", " Hero image ");
    form.set("caption", " ");
    form.set("tags", JSON.stringify([" hero "]));
    form.set("makePublic", "on");

    const response = await uploadRoute(new Request("http://localhost/api/assets", { method: "POST", body: form }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ asset, snippet: "<BlogImage />", deduped: false });
    expect(uploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "hero.png",
        mimeType: "image/png",
        postSlug: "blog/launch",
        altText: "Hero image",
        caption: undefined,
        tags: ["hero"],
        makePublic: true
      })
    );
  });

  test("upload route rejects missing files, malformed tags, and service errors", async () => {
    const missingFile = new FormData();
    missingFile.set("postSlug", "blog/post");
    missingFile.set("altText", "");
    missingFile.set("caption", "");
    const missingResponse = await uploadRoute(
      new Request("http://localhost/api/assets", { method: "POST", body: missingFile })
    );
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: "A file is required." });

    const malformed = new FormData();
    malformed.set("postSlug", "blog/post");
    malformed.set("altText", "");
    malformed.set("caption", "");
    malformed.set("tags", "not-json");
    const malformedResponse = await uploadRoute(
      new Request("http://localhost/api/assets", { method: "POST", body: malformed })
    );
    expect(malformedResponse.status).toBe(400);
    expect((await malformedResponse.json()).error).toBeTruthy();

    uploadAsset.mockRejectedValue(new Error("S3 unavailable"));
    const valid = new FormData();
    valid.set("file", new File(["png"], "hero.png", { type: "image/png" }));
    valid.set("postSlug", "blog/post");
    valid.set("altText", "");
    valid.set("caption", "");
    const failedResponse = await uploadRoute(
      new Request("http://localhost/api/assets", { method: "POST", body: valid })
    );
    await expect(failedResponse.json()).resolves.toEqual({ error: "S3 unavailable" });
  });

  test("catalog route normalizes filters and returns assets", async () => {
    getCatalogSnapshot.mockResolvedValue([asset]);

    const response = await catalogRoute(
      new Request("http://localhost/api/catalog?query=%20hero%20&postSlug=%20launch%20&tag=%20featured%20")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assets: [asset] });
    expect(getCatalogSnapshot).toHaveBeenCalledWith({ query: "hero", postSlug: "launch", tag: "featured" });
  });

  test("catalog route converts service failures to a 400 response", async () => {
    getCatalogSnapshot.mockRejectedValue(new Error("Database unavailable"));

    const response = await catalogRoute(new Request("http://localhost/api/catalog"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Database unavailable" });
  });

  test("snippet route validates input and returns the refreshed asset", async () => {
    generateUsageSnippet.mockResolvedValue({ asset, usage: { id: 9 }, snippet: "<BlogImage />" });
    getCatalogSnapshot.mockResolvedValue([{ ...asset, usageCount: 2, lastUsedPostSlug: "blog/reuse" }]);

    const response = await snippetRoute(
      new Request("http://localhost/api/assets/7/snippet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postSlug: " blog/reuse ", altText: " Reused ", caption: " " })
      }),
      { params: Promise.resolve({ assetId: "7" }) }
    );

    expect(response.status).toBe(200);
    expect(generateUsageSnippet).toHaveBeenCalledWith({
      assetId: 7,
      postSlug: "blog/reuse",
      altText: "Reused",
      caption: undefined
    });
    expect((await response.json()).asset).toMatchObject({ usageCount: 2, lastUsedPostSlug: "blog/reuse" });
  });

  test("snippet route reports validation and service failures", async () => {
    const invalidResponse = await snippetRoute(
      new Request("http://localhost/api/assets/7/snippet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postSlug: " " })
      }),
      { params: Promise.resolve({ assetId: "7" }) }
    );
    expect(invalidResponse.status).toBe(400);

    generateUsageSnippet.mockRejectedValue(new Error("Asset 999 was not found."));
    const missingResponse = await snippetRoute(
      new Request("http://localhost/api/assets/999/snippet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postSlug: "blog/reuse" })
      }),
      { params: Promise.resolve({ assetId: "999" }) }
    );
    await expect(missingResponse.json()).resolves.toEqual({ error: "Asset 999 was not found." });
  });
});
