import { describe, expect, test } from "vitest";

import { buildObjectKey, buildVariantFilename, buildVariantKey, sanitizePostSlug } from "@/lib/utils/object-key";

describe("object key generation", () => {
  test("normalizes the post slug and filename", () => {
    const key = buildObjectKey({
      postSlug: "Blog/My Great Post",
      originalFilename: "Hero Image.PNG",
      prefix: "posts"
    });

    expect(sanitizePostSlug("Blog/My Great Post")).toBe("blog/my-great-post");
    expect(key).toBe("posts/blog/my-great-post/hero-image.png");
  });

  test("adds a numeric suffix when the key already exists", () => {
    const key = buildObjectKey({
      postSlug: "blog/reused-name",
      originalFilename: "diagram.png",
      existingKeys: ["blog/reused-name/diagram.png", "blog/reused-name/diagram-2.png"]
    });

    expect(key).toBe("blog/reused-name/diagram-3.png");
  });
});

describe("variant naming", () => {
  test("adds the output dimensions only when the image was resized", () => {
    expect(
      buildVariantFilename({ originalFilename: "Hero Shot.JPG", extension: "png", width: 800, height: 450 })
    ).toBe("Hero Shot-800x450.png");
    expect(buildVariantFilename({ originalFilename: "Hero Shot.JPG", extension: "png" })).toBe("Hero Shot.png");
  });

  test("keeps the variant in the same folder as its source", () => {
    const key = buildVariantKey({
      sourceKey: "posts/blog/launch/Hero_Original.JPG",
      filename: "Hero Shot-800x450.png"
    });

    expect(key).toBe("posts/blog/launch/hero-shot-800x450.png");
  });

  test("handles a source at the bucket root and avoids existing keys", () => {
    expect(buildVariantKey({ sourceKey: "hero.jpg", filename: "hero.png" })).toBe("hero.png");
    expect(
      buildVariantKey({ sourceKey: "posts/hero.jpg", filename: "hero.png", existingKeys: ["posts/hero.png"] })
    ).toBe("posts/hero-2.png");
  });
});
