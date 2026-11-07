import { NextResponse } from "next/server";

import { serializeCatalogAsset } from "@/lib/services/catalog";
import { transformAsset } from "@/lib/services/transform";
import { transformAssetSchema } from "@/lib/validators/forms";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ assetId: string }>;
  }
) {
  try {
    const { assetId } = await context.params;
    const id = Number(assetId);

    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid asset id." }, { status: 400 });
    }

    const parsed = transformAssetSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }

    const result = await transformAsset({ assetId: id, ...parsed.data });

    return NextResponse.json({
      asset: serializeCatalogAsset(result.asset),
      deduped: result.deduped
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to resize or convert the image."
      },
      { status: 400 }
    );
  }
}
