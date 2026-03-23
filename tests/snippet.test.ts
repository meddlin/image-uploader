import { describe, expect, test } from "vitest";

import { generateSnippet } from "@/lib/utils/snippet";

describe("snippet generation", () => {
  test("omits optional props when they are missing", () => {
    expect(
      generateSnippet({
        componentName: "BlogImage",
        src: "https://cdn.example.com/post/hero.jpg",
        width: 1600,
        height: 900
      })
    ).toBe(`<BlogImage
  src="https://cdn.example.com/post/hero.jpg"
  width={1600}
  height={900}
/>`);
  });

  test("includes alt text and caption when provided", () => {
    expect(
      generateSnippet({
        componentName: "BlogImage",
        src: "https://cdn.example.com/post/hero.jpg",
        width: 1600,
        height: 900,
        altText: "Dashboard overview",
        caption: 'Quoted "caption"'
      })
    ).toBe(`<BlogImage
  src="https://cdn.example.com/post/hero.jpg"
  alt="Dashboard overview"
  width={1600}
  height={900}
  caption="Quoted &quot;caption&quot;"
/>`);
  });
});
