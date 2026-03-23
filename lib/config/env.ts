import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  AWS_PROFILE: z.string().trim().min(1).optional(),
  AWS_REGION: z.string().trim().min(1).default("us-east-1"),
  S3_BUCKET: z.string().trim().min(1).default(""),
  S3_PREFIX: z.string().trim().default(""),
  PUBLIC_BASE_URL: z.string().trim().url().optional(),
  SQLITE_PATH: z.string().trim().min(1).default("./data/image-uploader.db"),
  SNIPPET_COMPONENT: z.string().trim().min(1).default("BlogImage"),
  S3_VISIBILITY: z.enum(["policy", "public-read-acl"]).default("policy")
});

let cachedEnv: AppEnv | null = null;
let loaded = false;

export type AppEnv = z.infer<typeof envSchema>;

function loadDotEnv() {
  if (loaded) {
    return;
  }

  const root = process.cwd();
  const envLocalPath = path.join(root, ".env.local");
  const envPath = path.join(root, ".env");

  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  } else if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  loaded = true;
}

export function getEnv() {
  loadDotEnv();

  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}

export function resetEnvForTests() {
  cachedEnv = null;
  loaded = false;
}

export function assertAwsConfig() {
  const env = getEnv();

  if (!env.S3_BUCKET) {
    throw new Error("Missing S3_BUCKET. Add it to .env.local before using S3 features.");
  }

  return env;
}
