export type AssetRecord = {
  id: number;
  originalFilename: string;
  publicUrl: string;
  s3Key: string;
  width: number;
  height: number;
  tags: string[];
  usageCount: number;
  lastUsedPostSlug: string | null;
  createdAt: number;
};

export type AssetSnippetResponse = {
  asset: AssetRecord;
  snippet: string;
  deduped: boolean;
};

