import { describe, expect, test } from "vitest";

import { buildObjectKey, sanitizePostSlug } from "@/lib/utils/object-key";

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
