import path from "node:path";

import { getEnv } from "@/lib/config/env";
import { initializeDatabase } from "@/lib/db/client";
import { findAssetById, findAssetByKey, insertAsset, listAllAssets, listCatalogAssets, type CatalogAsset } from "@/lib/repos/assets";
import { setAssetTags } from "@/lib/repos/tags";
import { insertUsage } from "@/lib/repos/usages";
import type { Asset } from "@/lib/db/schema";
import { extractImageDetails } from "@/lib/utils/image";
import { generateSnippet } from "@/lib/utils/snippet";
import { buildPublicUrl } from "@/lib/utils/url";
import { downloadObject, headObject, listObjects } from "@/lib/services/s3";
import { sha256 } from "@/lib/utils/hash";
import type { ImportedAssetResult, SyncIssue } from "@/lib/services/types";

export async function searchCatalog(filters?: {
  query?: string;
  postSlug?: string;
  tag?: string;
}) {
  initializeDatabase();
  return listCatalogAssets(filters);
}

export async function generateUsageSnippet(input: {
  assetId: number;
  postSlug: string;
  altText?: string;
  caption?: string;
}) {
  initializeDatabase();
  const env = getEnv();
  const asset = await findAssetById(input.assetId);

  if (!asset) {
    throw new Error(`Asset ${input.assetId} was not found.`);
  }

  const snippet = generateSnippet({
    componentName: env.SNIPPET_COMPONENT,
    src: asset.publicUrl,
    width: asset.width,
    height: asset.height,
    altText: input.altText,
    caption: input.caption
  });

  const usage = await insertUsage({
    assetId: asset.id,
    postSlug: input.postSlug,
    altText: input.altText,
    caption: input.caption,
    snippet,
    createdAt: Date.now()
  });

  return { asset, usage, snippet };
}

export async function addTagsToAsset(assetId: number, tags: string[]) {
  initializeDatabase();
  const asset = await findAssetById(assetId);

  if (!asset) {
    throw new Error(`Asset ${assetId} was not found.`);
  }

  await setAssetTags(assetId, tags);
  const results = await listCatalogAssets();
  return results.find((entry) => entry.id === assetId) ?? null;
}

export async function removeTagFromAsset(assetId: number, tagName: string) {
  const { removeAssetTag } = await import("@/lib/repos/tags");
  initializeDatabase();
  const changed = await removeAssetTag(assetId, tagName);

  return {
    changed,
    asset: (await listCatalogAssets()).find((entry) => entry.id === assetId) ?? null
  };
}

export async function importFromS3(prefix?: string) {
  initializeDatabase();
  const env = getEnv();
  const resolvedPrefix = prefix ?? env.S3_PREFIX;
  const objects = await listObjects(resolvedPrefix);
  const imported: ImportedAssetResult[] = [];

  for (const object of objects) {
    const key = object.Key;

    if (!key) {
      continue;
    }

    const existing = await findAssetByKey(key);

    if (existing) {
      imported.push({ asset: existing, imported: false });
      continue;
    }

    const download = await downloadObject(key);
    const details = await extractImageDetails(download.buffer, download.contentType);
    const asset = await insertAsset({
      sha256: sha256(download.buffer),
      originalFilename: path.basename(key),
      s3Key: key,
      publicUrl: buildPublicUrl({
        bucket: env.S3_BUCKET,
        region: env.AWS_REGION,
        key,
        publicBaseUrl: env.PUBLIC_BASE_URL
      }),
      mimeType: details.mimeType,
      byteSize: download.byteSize,
      width: details.width,
      height: details.height,
      bucket: env.S3_BUCKET,
      region: env.AWS_REGION,
      createdAt: object.LastModified?.getTime() ?? Date.now()
    });

    imported.push({ asset, imported: true });
  }

  return imported;
}

export async function syncCatalogWithS3() {
  initializeDatabase();
  const env = getEnv();
  const issues: SyncIssue[] = [];
  const allAssets = await listAllAssets();

  for (const asset of allAssets) {
    try {
      await headObject(asset.s3Key);
    } catch (error) {
      issues.push({
        assetId: asset.id,
        s3Key: asset.s3Key,
        message: error instanceof Error ? error.message : "Unknown S3 error."
      });
      continue;
    }

    const expectedUrl = buildPublicUrl({
      bucket: asset.bucket || env.S3_BUCKET,
      region: asset.region || env.AWS_REGION,
      key: asset.s3Key,
      publicBaseUrl: env.PUBLIC_BASE_URL
    });

    if (asset.publicUrl !== expectedUrl) {
      issues.push({
        assetId: asset.id,
        s3Key: asset.s3Key,
        message: `Public URL mismatch. Catalog=${asset.publicUrl} Expected=${expectedUrl}`
      });
    }
  }

  return issues;
}

export async function getCatalogSnapshot(filters?: {
  query?: string;
  postSlug?: string;
  tag?: string;
}) {
  const items = await searchCatalog(filters);

  return items.map((item) => serializeCatalogAsset(item));
}

export function serializeCatalogAsset(asset: CatalogAsset) {
  return {
    ...asset,
    createdAt: asset.createdAt,
    lastUsedAt: asset.lastUsedAt
  };
}

export function serializeAsset(asset: Asset) {
  return {
    ...asset,
    createdAt: asset.createdAt
  };
}
