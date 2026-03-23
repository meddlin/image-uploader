import { NextResponse } from "next/server";
import { z } from "zod";

import { generateUsageSnippet, getCatalogSnapshot } from "@/lib/services/catalog";

export const runtime = "nodejs";

const payloadSchema = z.object({
  postSlug: z.string().trim().min(1),
  altText: z.string().trim().optional().transform((value) => value || undefined),
  caption: z.string().trim().optional().transform((value) => value || undefined)
});

export async function POST(
  request: Request,
  context: {
    params: Promise<{ assetId: string }>;
  }
) {
  try {
    const { assetId } = await context.params;
    const payload = payloadSchema.parse(await request.json());
    const result = await generateUsageSnippet({
      assetId: Number.parseInt(assetId, 10),
      postSlug: payload.postSlug,
      altText: payload.altText,
      caption: payload.caption
    });
    const latestAsset = (await getCatalogSnapshot()).find((asset) => asset.id === result.asset.id);

    return NextResponse.json({
      asset: latestAsset ?? result.asset,
      usage: result.usage,
      snippet: result.snippet
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate a snippet."
      },
      { status: 400 }
    );
  }
}
