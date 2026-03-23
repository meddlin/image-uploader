import { desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { usages, type NewUsage } from "@/lib/db/schema";

export async function insertUsage(input: NewUsage) {
  return getDb().insert(usages).values(input).returning().get();
}

export async function listUsagesForAsset(assetId: number) {
  return getDb()
    .select()
    .from(usages)
    .where(eq(usages.assetId, assetId))
    .orderBy(desc(usages.createdAt));
}
