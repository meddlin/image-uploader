import type { Asset, Usage } from "@/lib/db/schema";
import type { CatalogAsset } from "@/lib/repos/assets";

export type UploadResult = {
  asset: CatalogAsset;
  usage: Usage;
  snippet: string;
  deduped: boolean;
};

export type ImportedAssetResult = {
  asset: Asset;
  imported: boolean;
};

export type SyncIssue = {
  assetId: number;
  s3Key: string;
  message: string;
};
