import { describe, expect, test } from "vitest";

import { buildPublicUrl } from "@/lib/utils/url";

describe("public URL generation", () => {
  test("builds a direct S3 URL when no public base URL is configured", () => {
    expect(
      buildPublicUrl({
        bucket: "my-bucket",
        region: "us-east-1",
        key: "blog/my asset.png"
      })
    ).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/blog/my%20asset.png");
  });

  test("builds a custom public URL when a base is configured", () => {
    expect(
      buildPublicUrl({
        bucket: "my-bucket",
        region: "us-east-1",
        key: "blog/hero.png",
        publicBaseUrl: "https://cdn.example.com/"
      })
    ).toBe("https://cdn.example.com/blog/hero.png");
  });
});
