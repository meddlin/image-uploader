import { describe, expect, test } from "vitest";

import { searchCatalogSchema, uploadMetadataSchema } from "@/lib/validators/forms";

describe("form validation", () => {
  test.each([true, "true", "1", "on"])("accepts %j as a public upload flag", (makePublic) => {
    const result = uploadMetadataSchema.parse({ postSlug: " post/slug ", makePublic });

    expect(result).toMatchObject({ postSlug: "post/slug", makePublic: true, tags: [] });
  });

  test("normalizes optional metadata and tags", () => {
    const result = uploadMetadataSchema.parse({
      postSlug: " blog/post ",
      altText: "   ",
      caption: " Caption ",
      tags: [" hero ", "detail"]
    });

    expect(result).toEqual({
      postSlug: "blog/post",
      altText: undefined,
      caption: "Caption",
      tags: ["hero", "detail"],
      makePublic: false
    });
  });

  test("rejects a missing post slug and blank tags", () => {
    expect(() => uploadMetadataSchema.parse({ postSlug: " ", tags: [] })).toThrow();
    expect(() => uploadMetadataSchema.parse({ postSlug: "blog/post", tags: [" "] })).toThrow();
  });

  test("trims catalog filters", () => {
    expect(searchCatalogSchema.parse({ query: " hero ", postSlug: " post ", tag: " tag " })).toEqual({
      query: "hero",
      postSlug: "post",
      tag: "tag"
    });
  });
});
