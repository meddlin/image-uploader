#!/usr/bin/env node

import { Command } from "commander";

import { countAssets, findAssetById } from "@/lib/repos/assets";
import { initializeDatabase } from "@/lib/db/client";
import {
  addTagsToAsset,
  generateUsageSnippet,
  getCatalogSnapshot,
  importFromS3,
  removeTagFromAsset,
  syncCatalogWithS3
} from "@/lib/services/catalog";
import { verifyS3Access } from "@/lib/services/s3";

const program = new Command();

program.name("imgctl").description("Local MDX image publishing admin CLI.").version("0.1.0");

program
  .command("list")
  .option("--post <slug>", "Filter by post slug")
  .option("--tag <name>", "Filter by tag")
  .option("--query <text>", "Filter by filename, key, or URL")
  .action(async (options) => {
    initializeDatabase();
    const assets = await getCatalogSnapshot({
      query: options.query,
      postSlug: options.post,
      tag: options.tag
    });

    if (!assets.length) {
      console.log("No catalog entries matched the supplied filters.");
      return;
    }

    console.table(
      assets.map((asset) => ({
        id: asset.id,
        filename: asset.originalFilename,
        slug: asset.lastUsedPostSlug ?? "",
        tags: asset.tags.join(", "),
        dimensions: `${asset.width}x${asset.height}`,
        usages: asset.usageCount,
        key: asset.s3Key
      }))
    );
  });

program
  .command("snippet")
  .argument("<asset-id>", "Asset ID from the local catalog")
  .requiredOption("--post <slug>", "Post slug for the new usage")
  .option("--alt <text>", "Optional alt text")
  .option("--caption <text>", "Optional caption")
  .action(async (assetId, options) => {
    initializeDatabase();
    const result = await generateUsageSnippet({
      assetId: Number.parseInt(assetId, 10),
      postSlug: options.post,
      altText: options.alt,
      caption: options.caption
    });

    console.log(result.snippet);
    console.log(`\nCreated usage ${result.usage.id} for asset ${result.asset.id}.`);
  });

const tagProgram = program.command("tag").description("Manage asset tags.");

tagProgram
  .command("add")
  .argument("<asset-id>", "Asset ID")
  .argument("<tag>", "Tag name")
  .action(async (assetId, tag) => {
    const asset = await addTagsToAsset(Number.parseInt(assetId, 10), [tag]);

    if (!asset) {
      console.log("Asset not found after tag update.");
      process.exitCode = 1;
      return;
    }

    console.log(`Asset ${asset.id} tags: ${asset.tags.join(", ")}`);
  });

tagProgram
  .command("remove")
  .argument("<asset-id>", "Asset ID")
  .argument("<tag>", "Tag name")
  .action(async (assetId, tag) => {
    const result = await removeTagFromAsset(Number.parseInt(assetId, 10), tag);

    if (!result.changed) {
      console.log("No matching tag relation was removed.");
      return;
    }

    console.log(`Asset ${assetId} tags: ${(result.asset?.tags ?? []).join(", ")}`);
  });

program
  .command("import-s3")
  .option("--prefix <prefix>", "Limit import to an S3 prefix")
  .action(async (options) => {
    initializeDatabase();
    const imported = await importFromS3(options.prefix);
    const created = imported.filter((item) => item.imported).length;

    console.log(`Imported ${created} new assets. Skipped ${imported.length - created} existing assets.`);
  });

program.command("sync-s3").action(async () => {
  initializeDatabase();
  const issues = await syncCatalogWithS3();

  if (!issues.length) {
    console.log("Catalog and S3 are in sync.");
    return;
  }

  console.table(issues);
  process.exitCode = 1;
});

program.command("doctor").action(async () => {
  initializeDatabase();
  const access = await verifyS3Access();
  const assetCount = await countAssets();
  const sampleAsset = assetCount > 0 ? await findAssetById(1) : null;

  console.log("Configuration and access look healthy.");
  console.log(`Bucket: ${access.bucket}`);
  console.log(`Region: ${access.region}`);
  console.log(`Profile: ${access.profile}`);
  console.log(`Catalog assets: ${assetCount}`);
  if (sampleAsset) {
    console.log(`Oldest asset key: ${sampleAsset.s3Key}`);
  }
});

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown imgctl error.");
  process.exitCode = 1;
});
