import { getEnv } from "@/lib/config/env";
import { initializeDatabase } from "@/lib/db/client";
import { findAssetIdsByKeys } from "@/lib/repos/assets";
import { listObjectsPage } from "@/lib/services/s3";
import { buildPublicUrl } from "@/lib/utils/url";

export const S3_PAGE_SIZE = 100;

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "tif", "tiff"]);

export type S3ObjectEntry = {
  key: string;
  name: string;
  size: number;
  lastModified: number | null;
  publicUrl: string;
  isImage: boolean;
  assetId: number | null;
};

export type S3BrowseResult = {
  bucket: string;
  prefix: string;
  folders: string[];
  objects: S3ObjectEntry[];
  nextToken: string | null;
};

export function normalizePrefix(prefix: string) {
  const trimmed = prefix.trim().replace(/^\/+/, "");

  return trimmed && !trimmed.endsWith("/") ? `${trimmed}/` : trimmed;
}

function isImageKey(key: string) {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";

  return imageExtensions.has(extension);
}

export async function browseBucket(input: { prefix?: string; token?: string }): Promise<S3BrowseResult> {
  initializeDatabase();
  const env = getEnv();
  const prefix = normalizePrefix(input.prefix ?? env.S3_PREFIX);
  const page = await listObjectsPage({ prefix, token: input.token, maxKeys: S3_PAGE_SIZE });
  const keys = page.objects.flatMap((object) => (object.Key ? [object.Key] : []));
  const catalogIds = new Map((await findAssetIdsByKeys(keys)).map((row) => [row.s3Key, row.id]));

  return {
    bucket: env.S3_BUCKET,
    prefix,
    folders: page.folders,
    nextToken: page.nextToken,
    objects: page.objects.flatMap((object) => {
      if (!object.Key) {
        return [];
      }

      return [
        {
          key: object.Key,
          name: object.Key.slice(prefix.length),
          size: object.Size ?? 0,
          lastModified: object.LastModified?.getTime() ?? null,
          publicUrl: buildPublicUrl({
            bucket: env.S3_BUCKET,
            region: env.AWS_REGION,
            key: object.Key,
            publicBaseUrl: env.PUBLIC_BASE_URL
          }),
          isImage: isImageKey(object.Key),
          assetId: catalogIds.get(object.Key) ?? null
        }
      ];
    })
  };
}
