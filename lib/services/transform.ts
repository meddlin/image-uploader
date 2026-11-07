import path from "node:path";

import { getEnv } from "@/lib/config/env";
import { initializeDatabase } from "@/lib/db/client";
import { findAssetByHash, findAssetById, getExistingKeys, insertAsset, listCatalogAssets } from "@/lib/repos/assets";
import { downloadObject, setObjectPublic, uploadObject } from "@/lib/services/s3";
import type { TransformResult } from "@/lib/services/types";
import { sha256 } from "@/lib/utils/hash";
import { transformImage } from "@/lib/utils/image";
import { FORMAT_EXTENSIONS, type TransformFormat } from "@/lib/utils/image-formats";
import { buildVariantFilename, buildVariantKey } from "@/lib/utils/object-key";
import { buildPublicUrl } from "@/lib/utils/url";

async function loadCatalogAsset(assetId: number) {
  const asset = (await listCatalogAssets()).find((entry) => entry.id === assetId);

  if (!asset) {
    throw new Error("Transformed asset could not be loaded from the catalog.");
  }

  return asset;
}

/**
 * Resizes and/or converts an existing asset into a new asset. The source object and its catalog
 * row are never modified, so the original stays available at its native size and format.
 */
export async function transformAsset(input: {
  assetId: number;
  width?: number;
  height?: number;
  keepAspectRatio?: boolean;
  format?: TransformFormat;
  makePublic?: boolean;
}): Promise<TransformResult> {
  initializeDatabase();
  const env = getEnv();
  const source = await findAssetById(input.assetId);

  if (!source) {
    throw new Error(`Asset ${input.assetId} was not found.`);
  }

  const download = await downloadObject(source.s3Key);
  const output = await transformImage(download.buffer, {
    width: input.width,
    height: input.height,
    keepAspectRatio: input.keepAspectRatio,
    format: input.format
  });
  const hash = sha256(output.buffer);
  const existingAsset = await findAssetByHash(hash);

  if (existingAsset) {
    if (input.makePublic) {
      await setObjectPublic(existingAsset.s3Key);
    }

    return { asset: await loadCatalogAsset(existingAsset.id), deduped: true };
  }

  const resized = input.width !== undefined || input.height !== undefined;
  const originalFilename = buildVariantFilename({
    originalFilename: source.originalFilename,
    extension: FORMAT_EXTENSIONS[output.format],
    width: resized ? output.width : undefined,
    height: resized ? output.height : undefined
  });
  const existingKeys = await getExistingKeys(`${path.posix.dirname(source.s3Key)}/`);
  const s3Key = buildVariantKey({ sourceKey: source.s3Key, filename: originalFilename, existingKeys });
  const publicUrl = buildPublicUrl({
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    key: s3Key,
    publicBaseUrl: env.PUBLIC_BASE_URL
  });

  await uploadObject({
    key: s3Key,
    body: output.buffer,
    contentType: output.mimeType,
    makePublic: input.makePublic
  });

  const asset = await insertAsset({
    sha256: hash,
    originalFilename,
    s3Key,
    publicUrl,
    mimeType: output.mimeType,
    byteSize: output.byteSize,
    width: output.width,
    height: output.height,
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    createdAt: Date.now()
  });

  return { asset: await loadCatalogAsset(asset.id), deduped: false };
}
