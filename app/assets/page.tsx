import { AssetCatalog } from "@/components/asset-catalog";
import { initializeDatabase } from "@/lib/db/client";
import { getCatalogSnapshot } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  initializeDatabase();
  const initialAssets = await getCatalogSnapshot();

  return <AssetCatalog initialAssets={initialAssets} />;
}
