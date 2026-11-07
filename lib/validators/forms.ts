import { z } from "zod";

import { MAX_TRANSFORM_DIMENSION, TRANSFORM_FORMATS } from "@/lib/utils/image-formats";

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

const dimensionSchema = z
  .number()
  .int("Width and height must be whole pixels.")
  .min(1, "Width and height must be at least 1 pixel.")
  .max(MAX_TRANSFORM_DIMENSION, `Width and height can be at most ${MAX_TRANSFORM_DIMENSION} pixels.`)
  .optional();

export const transformAssetSchema = z
  .object({
    width: dimensionSchema,
    height: dimensionSchema,
    keepAspectRatio: z.boolean().default(true),
    format: z.enum(TRANSFORM_FORMATS).optional(),
    makePublic: booleanFlagSchema
  })
  .refine((value) => value.width !== undefined || value.height !== undefined || value.format !== undefined, {
    message: "Enter a width, a height, or choose a format to convert to."
  });

export const searchCatalogSchema = z.object({
  query: z.string().trim().optional(),
  postSlug: z.string().trim().optional(),
  tag: z.string().trim().optional()
});
