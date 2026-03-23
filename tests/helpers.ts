import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resetEnvForTests } from "@/lib/config/env";
import { resetDatabaseForTests } from "@/lib/db/client";
import { resetS3ClientForTests } from "@/lib/services/s3";

export function setTestEnv(overrides?: Record<string, string | undefined>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "image-uploader-"));
  const sqlitePath = path.join(dir, "catalog.db");

  process.env.AWS_REGION = "us-east-1";
  process.env.S3_BUCKET = "unit-test-bucket";
  process.env.S3_PREFIX = "posts";
  process.env.PUBLIC_BASE_URL = "https://cdn.example.com";
  process.env.SQLITE_PATH = sqlitePath;
  process.env.SNIPPET_COMPONENT = "BlogImage";
  process.env.S3_VISIBILITY = "policy";
  delete process.env.AWS_PROFILE;

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  resetEnvForTests();
  resetDatabaseForTests();
  resetS3ClientForTests();

  return {
    sqlitePath,
    cleanup() {
      resetDatabaseForTests();
      if (fs.existsSync(sqlitePath)) {
        fs.rmSync(path.dirname(sqlitePath), { recursive: true, force: true });
      }
    }
  };
}
