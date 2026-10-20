import { NextResponse } from "next/server";
import { z } from "zod";

import { browseBucket } from "@/lib/services/s3-browser";

export const runtime = "nodejs";

const querySchema = z.object({
  prefix: z.string().max(1024).optional(),
  token: z.string().max(2048).optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      prefix: searchParams.get("prefix") ?? undefined,
      token: searchParams.get("token") ?? undefined
    });

    return NextResponse.json(await browseBucket(query));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to list the bucket."
      },
      { status: 400 }
    );
  }
}
