import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const assets = sqliteTable(
  "assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sha256: text("sha256").notNull(),
    originalFilename: text("original_filename").notNull(),
    s3Key: text("s3_key").notNull(),
    publicUrl: text("public_url").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bucket: text("bucket").notNull(),
    region: text("region").notNull(),
    createdAt: integer("created_at").notNull()
  },
  (table) => ({
    sha256Idx: uniqueIndex("assets_sha256_idx").on(table.sha256),
    s3KeyIdx: uniqueIndex("assets_s3_key_idx").on(table.s3Key)
  })
);

export const usages = sqliteTable("usages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  postSlug: text("post_slug").notNull(),
  altText: text("alt_text"),
  caption: text("caption"),
  snippet: text("snippet").notNull(),
  createdAt: integer("created_at").notNull()
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique()
});

export const assetTags = sqliteTable(
  "asset_tags",
  {
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.assetId, table.tagId] })
  })
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Usage = typeof usages.$inferSelect;
export type NewUsage = typeof usages.$inferInsert;
export type Tag = typeof tags.$inferSelect;
