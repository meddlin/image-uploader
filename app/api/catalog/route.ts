import { NextResponse } from "next/server";

import { getCatalogSnapshot } from "@/lib/services/catalog";
import { searchCatalogSchema } from "@/lib/validators/forms";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = searchCatalogSchema.parse({
      query: searchParams.get("query") ?? undefined,
      postSlug: searchParams.get("postSlug") ?? undefined,
      tag: searchParams.get("tag") ?? undefined
    });

    const assets = await getCatalogSnapshot(filters);
    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load the catalog."
      },
      { status: 400 }
    );
  }
}
