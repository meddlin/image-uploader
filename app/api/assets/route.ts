import { NextResponse } from "next/server";

import { uploadMetadataSchema } from "@/lib/validators/forms";
import { uploadAsset } from "@/lib/services/upload";
import { serializeCatalogAsset } from "@/lib/services/catalog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const metadata = uploadMetadataSchema.parse({
      postSlug: formData.get("postSlug"),
      altText: formData.get("altText"),
      caption: formData.get("caption"),
      tags: JSON.parse(String(formData.get("tags") ?? "[]")),
      makePublic: formData.get("makePublic")
    });

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    const upload = await uploadAsset({
      file: Buffer.from(await file.arrayBuffer()),
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      postSlug: metadata.postSlug,
      altText: metadata.altText,
      caption: metadata.caption,
      tags: metadata.tags,
      makePublic: metadata.makePublic
    });

    return NextResponse.json({
      asset: serializeCatalogAsset(upload.asset),
      usage: upload.usage,
      snippet: upload.snippet,
      deduped: upload.deduped
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed."
      },
      { status: 400 }
    );
  }
}
