import { NextResponse } from "next/server";

import { initializeDatabase } from "@/lib/db/client";
import { listUsagesForAsset } from "@/lib/repos/usages";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ assetId: string }>;
  }
) {
  try {
    const { assetId } = await context.params;
    const id = Number.parseInt(assetId, 10);

    if (!Number.isInteger(id)) {
      throw new Error("Invalid asset id.");
    }

    initializeDatabase();
    const rows = await listUsagesForAsset(id);

    return NextResponse.json({
      usages: rows.map((row) => ({ id: row.id, postSlug: row.postSlug, createdAt: row.createdAt }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load usages."
      },
      { status: 400 }
    );
  }
}
