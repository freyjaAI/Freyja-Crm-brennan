# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/freyja-crm` (standalone, not a pnpm workspace package)

Pre-built Freyja IQ Broker CRM — a full-stack Express + React app with an embedded SQLite database.

- **Database**: `artifacts/freyja-crm/data.db` — SQLite (~1.5 GB, 2,618,852 broker records across all 50 US states)
- **Server**: Express 5 serving both the API and the React frontend from `dist/`
- **Run**: `bash -c 'cd /home/runner/workspace/artifacts/freyja-crm && NODE_ENV=production node dist/index.cjs'`
- **Port**: 25814 (mapped to `/` preview path)
- **Native module**: `better-sqlite3` — compiled with `make` inside `node_modules/better-sqlite3/build/`
- Source files live under `server/`, `client/`, `shared/`; production dist is pre-built in `dist/`
- Do NOT run pnpm commands for this artifact — it uses plain `npm` and its own `node_modules`
- **After any source change**: run `cd artifacts/freyja-crm && npm run build`, then restart the `artifacts/freyja-crm: web` workflow
- **AI integrations**: `@google/genai` installed; uses `AI_INTEGRATIONS_GEMINI_API_KEY` + `AI_INTEGRATIONS_GEMINI_BASE_URL` env vars
- **Apify**: `APIFY_TOKEN` secret set; used for Google Search scraper → LinkedIn profile lookup
- **New API endpoints**:
  - `POST /api/brokers/:id/enrich-linkedin` — Apify Google search → LinkedIn URL + headline
  - `POST /api/brokers/:id/generate-outreach` — Gemini `gemini-2.5-flash` → email subject/body + LinkedIn message
  - `POST /api/outreach/batch` — SSE endpoint, processes up to 100 brokers (3 concurrent), streams progress events
- **Schema additions** (columns added to `data.db` and `shared/schema.ts`): `linkedin_url`, `linkedin_headline`, `linkedin_location`, `linkedin_connections`, `linkedin_email_found`, `linkedin_enriched_at`, `outreach_email_subject`, `outreach_email_body`, `outreach_linkedin_message`, `outreach_generated_at`
- **UI additions**: BrokerDetail panel has LinkedIn section (Find/Re-search button, profile link, headline) and AI Outreach section (Email + LinkedIn tabs with copy buttons); Brokers list has "Batch AI Enrich" button with a progress dialog and SSE streaming
- **Prospecting filters** (Brokers page):
  - Expandable advanced filter panel with: Deals Closed (min/max), Avg Deal Price (min/max), Experience Years (min/max), Brokerage (text), City (text), Source Type (select), Property Types (multi-select: House, Condo, Townhouse, Commercial, Lot/Land, Manufactured, Other), Has Email/Phone/LinkedIn (checkboxes)
  - Active filter chips with click-to-remove
  - Column sorting on Name, Office, State, Sold, Avg $, Exp (numeric text fields parsed via SQL CASE/REPLACE/REGEXP)
  - Debounced text/numeric inputs (400ms) to prevent excessive API calls
  - Export CSV respects all advanced filters
  - Backend: `buildProspectingConditions()` in storage.ts handles safe SQL parsing of text-formatted numeric fields (commas, $ signs, K/M suffixes, "X years" format)
  - API: `GET /api/filter-options` returns available states, specialties, source types
  - **Filter presets**: 6 built-in presets (Top Producers, High-Value Brokers, Active Residential, Commercial Specialists, New & Hungry, Land & Development) displayed as scrollable pill buttons; custom presets saved/deleted via `filter_presets` table (id, user_id, name, filters JSONB, created_at); API: `GET/POST /api/filter-presets`, `DELETE /api/filter-presets/:id`; active preset auto-clears when any manual filter changes

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
