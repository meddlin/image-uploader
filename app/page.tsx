import { getEnv } from "@/lib/config/env";
import { initializeDatabase } from "@/lib/db/client";
import { getCatalogSnapshot } from "@/lib/services/catalog";
import { ImagePublisher } from "@/components/image-publisher";

export default async function HomePage() {
  initializeDatabase();
  const initialAssets = await getCatalogSnapshot();
  const env = getEnv();

  return <ImagePublisher defaultMakePublic={env.S3_VISIBILITY === "public-read-acl"} initialAssets={initialAssets} />;
}
