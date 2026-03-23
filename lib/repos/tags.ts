import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { assetTags, tags } from "@/lib/db/schema";

export async function ensureTags(names: string[]) {
  if (!names.length) {
    return [];
  }

  for (const name of names) {
    getDb()
      .insert(tags)
      .values({ name })
      .onConflictDoNothing()
      .run();
  }

  return getDb().select().from(tags).where(inArray(tags.name, names));
}

export async function setAssetTags(assetId: number, names: string[]) {
  const normalized = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  if (!normalized.length) {
    return;
  }

  const storedTags = await ensureTags(normalized);

  for (const tag of storedTags) {
    getDb()
      .insert(assetTags)
      .values({ assetId, tagId: tag.id })
      .onConflictDoNothing()
      .run();
  }
}

export async function removeAssetTag(assetId: number, name: string) {
  const tag = getDb().select().from(tags).where(eq(tags.name, name)).get();

  if (!tag) {
    return false;
  }

  const result = getDb()
    .delete(assetTags)
    .where(and(eq(assetTags.assetId, assetId), eq(assetTags.tagId, tag.id)))
    .run();

  return result.changes > 0;
}
