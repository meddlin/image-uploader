import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { getDb, getSqlite } from "@/lib/db/client";
import { assetTags, assets, tags, usages, type Asset, type NewAsset } from "@/lib/db/schema";

export type CatalogAsset = Asset & {
  tags: string[];
  usageCount: number;
  lastUsedPostSlug: string | null;
  lastUsedAt: number | null;
};

export async function findAssetByHash(sha256: string) {
  return getDb().query.assets.findFirst({
    where: eq(assets.sha256, sha256)
  });
}

export async function findAssetById(assetId: number) {
  return getDb().query.assets.findFirst({
    where: eq(assets.id, assetId)
  });
}

export async function findAssetByKey(s3Key: string) {
  return getDb().query.assets.findFirst({
    where: eq(assets.s3Key, s3Key)
  });
}

export async function insertAsset(input: NewAsset) {
  const inserted = getDb()
    .insert(assets)
    .values(input)
    .returning()
    .get();

  return inserted;
}

export async function getExistingKeys(prefix: string) {
  const rows = await getDb()
    .select({ key: assets.s3Key })
    .from(assets)
    .where(like(assets.s3Key, `${prefix}%`));

  return rows.map((row) => row.key);
}

export async function listCatalogAssets(filters?: {
  query?: string;
  postSlug?: string;
  tag?: string;
}) {
  const db = getDb();
  const conditions = [];

  if (filters?.query) {
    const query = `%${filters.query}%`;
    conditions.push(or(like(assets.originalFilename, query), like(assets.s3Key, query), like(assets.publicUrl, query)));
  }

  if (filters?.postSlug) {
    conditions.push(
      sql<boolean>`exists (
        select 1 from usages
        where usages.asset_id = assets.id
          and usages.post_slug like ${`%${filters.postSlug}%`}
      )`
    );
  }

  if (filters?.tag) {
    conditions.push(
      sql<boolean>`exists (
        select 1 from asset_tags
        inner join tags on tags.id = asset_tags.tag_id
        where asset_tags.asset_id = assets.id
          and tags.name like ${`%${filters.tag}%`}
      )`
    );
  }

  const baseAssets = await db
    .select()
    .from(assets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(assets.createdAt));

  if (!baseAssets.length) {
    return [];
  }

  const sqlite = getSqlite();
  const tagStmt = sqlite.prepare("select tags.name from asset_tags inner join tags on tags.id = asset_tags.tag_id where asset_tags.asset_id = ?");
  const usageStmt = sqlite.prepare(
    `
      select
        count(*) as usageCount,
        (
          select post_slug from usages
          where usages.asset_id = ?
          order by created_at desc, id desc
          limit 1
        ) as postSlug,
        (
          select created_at from usages
          where usages.asset_id = ?
          order by created_at desc, id desc
          limit 1
        ) as createdAt
      from usages
      where usages.asset_id = ?
    `
  );

  return baseAssets.map((asset) => {
    const tagRows = tagStmt.all(asset.id) as Array<{ name: string }>;
    const usageRow = usageStmt.get(asset.id, asset.id, asset.id) as
      | { usageCount: number; postSlug: string | null; createdAt: number | null }
      | undefined;

    return {
      ...asset,
      tags: tagRows.map((row) => row.name),
      usageCount: usageRow?.usageCount ?? 0,
      lastUsedPostSlug: usageRow?.postSlug ?? null,
      lastUsedAt: usageRow?.createdAt ?? null
    } satisfies CatalogAsset;
  });
}

export async function listAllAssets() {
  return getDb().select().from(assets).orderBy(desc(assets.createdAt));
}

export async function countAssets() {
  const row = getDb().select({ value: sql<number>`count(*)` }).from(assets).get();
  return row?.value ?? 0;
}
