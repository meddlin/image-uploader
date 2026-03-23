import { getEnv } from "@/lib/config/env";
import { initializeDatabase } from "@/lib/db/client";
import { findAssetByHash, getExistingKeys, insertAsset, listCatalogAssets } from "@/lib/repos/assets";
import { setAssetTags } from "@/lib/repos/tags";
import { insertUsage } from "@/lib/repos/usages";
import type { UploadResult } from "@/lib/services/types";
import { setObjectPublic, uploadObject } from "@/lib/services/s3";
import { sha256 } from "@/lib/utils/hash";
import { extractImageDetails } from "@/lib/utils/image";
import { buildObjectKey } from "@/lib/utils/object-key";
import { generateSnippet } from "@/lib/utils/snippet";
import { buildPublicUrl } from "@/lib/utils/url";

export async function uploadAsset(input: {
  file: Buffer;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  postSlug: string;
  altText?: string;
  caption?: string;
  tags?: string[];
  makePublic?: boolean;
}): Promise<UploadResult> {
  initializeDatabase();
  const env = getEnv();

  if (!input.mimeType.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  const hash = sha256(input.file);
  const existingAsset = await findAssetByHash(hash);

  if (existingAsset) {
    if (input.makePublic) {
      await setObjectPublic(existingAsset.s3Key);
    }

    const snippet = generateSnippet({
      componentName: env.SNIPPET_COMPONENT,
      src: existingAsset.publicUrl,
      width: existingAsset.width,
      height: existingAsset.height,
      altText: input.altText,
      caption: input.caption
    });

    const usage = await insertUsage({
      assetId: existingAsset.id,
      postSlug: input.postSlug,
      altText: input.altText,
      caption: input.caption,
      snippet,
      createdAt: Date.now()
    });

    if (input.tags?.length) {
      await setAssetTags(existingAsset.id, input.tags);
    }

    const asset = (await listCatalogAssets()).find((entry) => entry.id === existingAsset.id);

    if (!asset) {
      throw new Error("Uploaded asset could not be loaded from the catalog.");
    }

    return {
      asset,
      usage,
      snippet,
      deduped: true
    };
  }

  const details = await extractImageDetails(input.file, input.mimeType);
  const existingKeys = await getExistingKeys(
    [env.S3_PREFIX, input.postSlug].filter(Boolean).join("/").replace(/^\/+|\/+$/g, "")
  );
  const s3Key = buildObjectKey({
    postSlug: input.postSlug,
    originalFilename: input.originalFilename,
    prefix: env.S3_PREFIX,
    existingKeys
  });
  const publicUrl = buildPublicUrl({
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    key: s3Key,
    publicBaseUrl: env.PUBLIC_BASE_URL
  });

  await uploadObject({
    key: s3Key,
    body: input.file,
    contentType: input.mimeType,
    makePublic: input.makePublic
  });

  const asset = await insertAsset({
    sha256: hash,
    originalFilename: input.originalFilename,
    s3Key,
    publicUrl,
    mimeType: details.mimeType,
    byteSize: input.byteSize,
    width: details.width,
    height: details.height,
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    createdAt: Date.now()
  });

  if (input.tags?.length) {
    await setAssetTags(asset.id, input.tags);
  }

  const snippet = generateSnippet({
    componentName: env.SNIPPET_COMPONENT,
    src: publicUrl,
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

  const catalogAsset = (await listCatalogAssets()).find((entry) => entry.id === asset.id);

  if (!catalogAsset) {
    throw new Error("Uploaded asset could not be loaded from the catalog.");
  }

  return {
    asset: catalogAsset,
    usage,
    snippet,
    deduped: false
  };
}
