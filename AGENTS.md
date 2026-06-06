# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js/TypeScript app for publishing images to S3 and tracking metadata in local SQLite. App Router pages and API routes live in `app/`, including `app/page.tsx` and `app/api/**/route.ts`. Shared UI components are in `components/`. Core logic is grouped under `lib/`: `services/` for workflows, `repos/` for database access, `db/` for SQLite schema/client code, `validators/` for Zod form validation, `utils/` for focused helpers, and `config/env.ts` for environment loading. CLI entry points live in `bin/`. Tests are in `tests/**/*.test.ts`, and documentation lives in `docs/`.

## Build, Test, and Development Commands

Use the npm scripts in `package.json`:

- `pnpm dev`: start the local Next.js dev server.
- `pnpm build`: create a production Next.js build.
- `pnpm start`: run the built app.
- `pnpm test`: run Vitest once.
- `pnpm test:watch`: run Vitest in watch mode.
- `pnpm imgctl doctor`: run CLI diagnostics after configuring `.env.local`.
- `pnpm imgctl list --query hero`: search the local image catalog.

## Coding Style & Naming Conventions

Use TypeScript ESM with two-space indentation. Prefer explicit exported functions and small modules matching the current `lib/<area>/<name>.ts` layout. Use kebab-case for file names such as `object-key.ts` and route directories, PascalCase for React components, and camelCase for functions and variables. Use the `@/` alias for root imports when it improves readability. Keep validation in Zod schemas and avoid duplicating environment parsing outside `lib/config/env.ts`.

## Testing Guidelines

Vitest runs in Node and includes `tests/**/*.test.ts`. Name tests after the unit or workflow under test, for example `upload-service.test.ts` or `object-key.test.ts`. Prefer focused tests for service behavior, URL/key generation, snippets, and image helpers. Use `tests/helpers.ts` for shared fixtures. Run `pnpm test` before handing off changes; run `pnpm build` when changes affect Next.js routes, React components, or environment handling.

## Commit & Pull Request Guidelines

The current history only contains an initial commit, so keep commit messages simple, imperative, and scoped, for example `Add upload validation tests` or `Fix S3 public URL handling`. Pull requests should include a short summary, testing performed, relevant configuration notes, and screenshots for UI changes. Link issues when applicable and call out any required `.env.local` changes.

## UI Design & Components

Default to using components and styling from shadcn UI, Tailwind, and lucide-react.

## Security & Configuration Tips

Do not commit `.env.local`, SQLite database files, AWS credentials, or generated uploads. Start from `.env.example`, then set `S3_BUCKET`, `AWS_REGION`, optional `AWS_PROFILE`, `PUBLIC_BASE_URL`, `SQLITE_PATH`, `SNIPPET_COMPONENT`, and `S3_VISIBILITY`. Be careful with `public-read-acl`: it requires matching IAM and bucket settings.
