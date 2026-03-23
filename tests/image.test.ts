import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { extractImageDetails } from "@/lib/utils/image";

describe("image metadata extraction", () => {
  test("returns oriented dimensions", async () => {
    const buffer = await sharp({
      create: {
        width: 120,
        height: 60,
        channels: 3,
        background: { r: 240, g: 140, b: 80 }
      }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await extractImageDetails(buffer, "image/jpeg");

    expect(result.width).toBe(60);
    expect(result.height).toBe(120);
    expect(result.mimeType).toBe("image/jpeg");
  });
});
