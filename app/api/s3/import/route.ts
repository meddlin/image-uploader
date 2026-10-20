import { NextResponse } from "next/server";
import { z } from "zod";

import { importObjectFromS3 } from "@/lib/services/catalog";

export const runtime = "nodejs";

const payloadSchema = z.object({
  key: z.string().trim().min(1).max(1024)
});

export async function POST(request: Request) {
  try {
    const { key } = payloadSchema.parse(await request.json());
    const result = await importObjectFromS3(key);

    return NextResponse.json({ assetId: result.asset.id, imported: result.imported });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import the object."
      },
      { status: 400 }
    );
  }
}
