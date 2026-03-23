import path from "node:path";

import slugify from "slugify";

function normalizePart(value: string) {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true
  });
}

export function sanitizePostSlug(postSlug: string) {
  return postSlug
    .split("/")
    .map((segment) => normalizePart(segment))
    .filter(Boolean)
    .join("/");
}

export function buildObjectKey(input: {
  postSlug: string;
  originalFilename: string;
  prefix?: string;
  existingKeys?: string[];
}) {
  const parsed = path.parse(input.originalFilename);
  const postSlug = sanitizePostSlug(input.postSlug);
  const prefix = input.prefix ? sanitizePostSlug(input.prefix) : "";
  const filenameBase = normalizePart(parsed.name || "image");
  const extension = parsed.ext ? parsed.ext.toLowerCase() : "";
  const root = [prefix, postSlug].filter(Boolean).join("/");
  const existingKeySet = new Set(input.existingKeys ?? []);

  let index = 1;
  let candidate = `${root}/${filenameBase}${extension}`;

  while (existingKeySet.has(candidate)) {
    index += 1;
    candidate = `${root}/${filenameBase}-${index}${extension}`;
  }

  return candidate;
}
