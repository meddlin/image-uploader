import { z } from "zod";

const booleanFlagSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "1" || value === "on",
  z.boolean().default(false)
);

export const uploadMetadataSchema = z.object({
  postSlug: z.string().trim().min(1, "Post slug is required."),
  altText: z.string().trim().optional().transform((value) => value || undefined),
  caption: z.string().trim().optional().transform((value) => value || undefined),
  tags: z.array(z.string().trim().min(1)).default([]),
  makePublic: booleanFlagSchema
});

export const searchCatalogSchema = z.object({
  query: z.string().trim().optional(),
  postSlug: z.string().trim().optional(),
  tag: z.string().trim().optional()
});
