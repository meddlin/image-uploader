import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { extractImageDetails, transformImage } from "@/lib/utils/image";

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

async function solidImage(width: number, height: number, format: "png" | "jpeg" | "webp" = "png") {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 150 } } })
    .toFormat(format)
    .toBuffer();
}

describe("image transforms", () => {
  test("derives the missing dimension from the aspect ratio", async () => {
    const source = await solidImage(1200, 600);

    const result = await transformImage(source, { width: 300 });

    expect(result).toMatchObject({ width: 300, height: 150, format: "png", mimeType: "image/png" });
    expect(result.byteSize).toBe(result.buffer.byteLength);
  });

  test("fits inside a width and height box when the aspect ratio is kept", async () => {
    const source = await solidImage(1200, 600);

    const result = await transformImage(source, { width: 300, height: 300 });

    expect(result).toMatchObject({ width: 300, height: 150 });
  });

  test("stretches to the exact size when the aspect ratio is not kept", async () => {
    const source = await solidImage(1200, 600);

    const result = await transformImage(source, { width: 300, height: 300, keepAspectRatio: false });

    expect(result).toMatchObject({ width: 300, height: 300 });
  });

  test("can enlarge an image", async () => {
    const source = await solidImage(50, 25);

    const result = await transformImage(source, { width: 200 });

    expect(result).toMatchObject({ width: 200, height: 100 });
  });

  test("converts between formats without resizing", async () => {
    const source = await solidImage(80, 40, "jpeg");

    const result = await transformImage(source, { format: "png" });

    expect(result).toMatchObject({ width: 80, height: 40, format: "png", mimeType: "image/png" });
    expect((await sharp(result.buffer).metadata()).format).toBe("png");
  });

  test("resizes and converts in a single pass", async () => {
    const source = await solidImage(400, 200, "jpeg");

    const result = await transformImage(source, { width: 100, format: "webp" });

    expect(result).toMatchObject({ width: 100, height: 50, mimeType: "image/webp" });
    expect((await sharp(result.buffer).metadata()).format).toBe("webp");
  });

  test("flattens transparency onto white when converting to JPEG", async () => {
    const source = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer();

    const result = await transformImage(source, { format: "jpeg" });
    const pixel = await sharp(result.buffer).raw().toBuffer();

    expect(Array.from(pixel.subarray(0, 3))).toEqual([255, 255, 255]);
  });

  test("resizes using the EXIF-oriented dimensions and drops the orientation tag", async () => {
    const source = await sharp({ create: { width: 120, height: 60, channels: 3, background: "teal" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await transformImage(source, { width: 30 });
    const metadata = await sharp(result.buffer).metadata();

    // The upright image is 60 × 120, so a width of 30 gives a height of 60.
    expect(result).toMatchObject({ width: 30, height: 60 });
    expect(metadata.orientation).toBeUndefined();
  });

  test("rasterises SVG at the requested size", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>'
    );

    const result = await transformImage(svg, { width: 400, format: "png" });

    expect(result).toMatchObject({ width: 400, height: 200, mimeType: "image/png" });
  });

  test("asks for a target format when the source format cannot be written", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');

    await expect(transformImage(svg, { width: 20 })).rejects.toThrow("Choose a format to convert to.");
  });

  test("keeps every frame when resizing an animated image", async () => {
    const frame = (color: string) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background: color } })
        .raw()
        .toBuffer();
    const frames = Buffer.concat([await frame("red"), await frame("blue")]);
    const animated = await sharp(frames, { raw: { width: 40, height: 40, channels: 3, pageHeight: 20 } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();

    const resized = await transformImage(animated, { width: 20 });
    const stills = await transformImage(animated, { width: 20, format: "png" });

    expect(resized).toMatchObject({ width: 20, height: 10, format: "webp" });
    expect((await sharp(resized.buffer).metadata()).pages).toBe(2);
    // A still format gets only the first frame, not every frame stacked into one tall image.
    expect(stills).toMatchObject({ width: 20, height: 10 });
  });
});
