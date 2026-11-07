# Resize and Convert Images

Every upload is stored exactly as it was received, at its native size and format. The **Resize / convert** button on each row of the Assets page turns any stored image into a new one without touching the original.

## Using it

1. Open **Assets** and click **Resize / convert** on a row.
2. Enter a width, a height, or both, and/or pick a **Format**. At least one is required.
3. Click **Create new image**. The new asset appears directly under the original.

The new asset has no usages yet. Use **Use in post** on it to generate a snippet, the same as for any other asset.

### Dimensions

- **Keep aspect ratio** is on by default. Typing a width fills in the matching height (and the other way round), and the result always fits inside the width × height you give.
- Turn it off to stretch the image to exactly the width and height entered.
- Sizes are whole pixels from 1 to 10,000 per side. Images can be enlarged as well as shrunk.

### Formats

JPEG, PNG, WebP, AVIF, and GIF. Leave **Format** on *Keep original* to resize without converting.

- Transparent images converted to JPEG are flattened onto a white background, since JPEG has no transparency.
- SVG sources are rasterised at the requested size, so they need a target format.
- Animated GIF and WebP keep their frames when they stay GIF or WebP. Converting to another format keeps only the first frame.
- EXIF orientation is applied to the pixels and all other metadata, including GPS location, is dropped.

## What gets stored

- The new object is written next to the original in S3, named `<original-name>-<width>x<height>.<ext>`. A pure format conversion drops the size suffix. A numeric suffix is added if the key is already taken.
- It gets its own catalog row, so it shows up in search, the CLI, and snippets like any upload.
- Repeating the same transform returns the existing asset instead of uploading a duplicate.
- The **Make the new image publicly accessible** option mirrors the upload form's public ACL toggle.

## API

```
POST /api/assets/:assetId/transform
{ "width": 800, "height": 450, "keepAspectRatio": true, "format": "webp", "makePublic": false }
```

All fields are optional except that one of `width`, `height`, or `format` must be present. The response is `{ asset, deduped }`.

## Where the code lives

- `lib/utils/image.ts` — `transformImage`, the sharp pipeline.
- `lib/services/transform.ts` — downloads the source from S3, transforms it, uploads and catalogs the result.
- `app/api/assets/[assetId]/transform/route.ts` — validates input with `transformAssetSchema`.
- `components/asset-transform-panel.tsx` — the per-row form.
