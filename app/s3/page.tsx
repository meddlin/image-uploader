import { S3Browser } from "@/components/s3-browser";
import { browseBucket, type S3BrowseResult } from "@/lib/services/s3-browser";

export const dynamic = "force-dynamic";

export default async function S3Page({ searchParams }: { searchParams: Promise<{ prefix?: string | string[] }> }) {
  const { prefix } = await searchParams;
  const requestedPrefix = typeof prefix === "string" ? prefix : undefined;
  let initial: S3BrowseResult | null = null;
  let error: string | null = null;

  try {
    initial = await browseBucket({ prefix: requestedPrefix });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to list the bucket.";
  }

  // Remount when the folder changes so paging and import state reset.
  return <S3Browser error={error} initial={initial} key={initial?.prefix ?? requestedPrefix ?? ""} />;
}
