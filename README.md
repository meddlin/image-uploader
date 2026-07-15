# MDX Image Publisher

Local-first image publishing workflow for an MDX blog backed by S3.

## What it does

- Uploads an image to S3 from a local web UI
- Supports a per-upload toggle to request public object access immediately
- Extracts intrinsic dimensions with `sharp`
- Stores assets, usages, and tags in local SQLite
- Generates copy-ready MDX component snippets
- Lets you reuse existing assets without reuploading
- Ships a CLI for catalog search, tags, backfill, sync, and diagnostics

## Setup

1. Copy `.env.example` to `.env.local` and fill in your AWS settings.
2. Install dependencies with `pnpm install`.
3. Start the app with `pnpm dev`.
4. Open `http://localhost:3000`.

## Common commands

```bash
pnpm dev
pnpm test
npm run test:sast
pnpm imgctl doctor
pnpm imgctl list --query hero
pnpm imgctl import-s3 --prefix blog
```

The SAST command requires OpenGrep to be installed and available on `PATH`. It fetches project-appropriate rules from the Semgrep Registry, then scans tracked repository files subject to OpenGrep's default ignore rules and exits with an error when it finds an issue.

## Notes

- The app expects your bucket or CDN to already expose public URLs when `S3_VISIBILITY=policy`.
- The upload form can request a `public-read` ACL per upload, but that only works if your IAM user has `s3:PutObjectAcl` and the bucket allows public ACLs.
- The generated snippet defaults to `<BlogImage />`. Change that with `SNIPPET_COMPONENT`.
- The SQLite database lives at `SQLITE_PATH`, defaulting to `./data/image-uploader.db`.
