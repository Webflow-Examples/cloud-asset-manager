# Deployment Guide

This guide covers the minimum setup needed to run your own copy of the Webflow Cloud Asset Manager.

## Local Development

Prerequisites:

- Node.js 22 or later.
- `npm` for installing and building dependencies. Webflow Cloud currently builds npm projects.

Install dependencies:

```bash
npm install
```

Generate runtime types after changing bindings:

```bash
npm run cf-typegen
```

Apply local database migrations:

```bash
npx wrangler d1 migrations apply ASSET_INDEX --local
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000/assets`.

`npm run dev` is the fast local iteration path. This starter also wires OpenNext into `next dev` through `next.config.ts` so local Worker bindings are available while you develop.

## Cloud Resources

The app expects three Webflow Cloud storage bindings:

| Binding | Resource | Used for |
| --- | --- | --- |
| `CLOUD_ASSETS` | Object Storage bucket | Original files |
| `CLOUD_ASSET_THUMBNAILS` | Object Storage bucket | Generated thumbnails |
| `ASSET_INDEX` | SQLite database | Asset records, tags, settings, upload state, and usage stats |

Existing thumbnails that were written to `CLOUD_ASSETS` before the split continue to render through a legacy read fallback. New thumbnail writes use `CLOUD_ASSET_THUMBNAILS`.

Before deploying:

1. Create or select a Webflow Cloud project and environment for the app.
2. Confirm the GitHub branch and set the environment mount path to `/assets`, or update `next.config.ts`, route references, and copied-link behavior together.
3. Keep the binding names in `wrangler.json` aligned with the app code.
4. Configure production environment variables.
5. Commit and push to the connected branch for the first deploy or any storage binding changes. Webflow Cloud creates or updates storage bindings from the linked repository deployment.
6. After the environment and bindings exist, you can also deploy app-code-only changes from the Webflow Cloud dashboard or with the Webflow CLI.

Webflow Cloud connects storage through the bindings declared in `wrangler.json`. When the app deploys, Webflow Cloud creates or connects the storage resources for that environment and exposes them to the app as runtime bindings. The `database_id` placeholder in this starter is intentionally left as zeros; Webflow Cloud assigns the real ID after deployment.

SQLite schema changes live in `migrations/`. Webflow Cloud applies new migrations during deployment, so production schema updates should be added as new SQL migration files rather than applied manually.

## Environment Checklist

Start from `.env.example`.

- Set `ORIGIN` to the deployed asset manager origin before enabling auth.
- Set `ASSET_MANAGER_AUTH_ENABLED=true` only after wiring `src/lib/auth.ts`.
- Keep `ASSET_MANAGER_PROTECT_ASSET_DELIVERY=false` if copied asset URLs should work on public sites.
- Set `STORAGE_PLAN_LIMIT_BYTES` and `STORAGE_PLAN_LABEL` if you want a usage progress bar.
- Webflow Cloud sets `ASSETS_PREFIX` to the Worker origin in production. For local overrides, use an absolute origin without `/assets`; the app appends the mount path.

## Deploy

Webflow Cloud can deploy automatically when you push to the GitHub branch connected to an environment. You can also deploy manually from the Webflow Cloud dashboard or with the Webflow Cloud CLI:

```bash
npm run deploy
```

If you deploy non-interactively, pass the mount path expected by your Webflow Cloud environment. The app itself is configured with a Next.js base path of `/assets`.

```bash
npm run deploy -- --no-input --mount /assets --skip-mount-path-check --skip-update-check
```

Use the connected GitHub deployment path for first-time storage setup or binding changes. Webflow Cloud does not apply new storage binding configuration from local CLI-only deployments.

Publishing the connected Webflow site is separate from deploying the Webflow Cloud app. If app changes are not visible after publishing the site, check the Webflow Cloud deployment history and runtime logs for the app environment.

## Validate

Run these before opening a PR or deploying:

```bash
npm run lint
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Common Setup Issues

- Local build fails with `listen EPERM`: this can happen in restricted sandboxes that block localhost binds. Re-run in a normal terminal.
- Storage bindings do not appear in the dashboard after deploy: confirm the bindings are declared in `wrangler.json`, save the Webflow Cloud project settings, and redeploy the app.
- Asset manager loads but APIs fail: confirm the `CLOUD_ASSETS`, `CLOUD_ASSET_THUMBNAILS`, and `ASSET_INDEX` binding names match `wrangler.json` and that the latest app deployment succeeded.
- Uploads fail with `413 Content Too Large`: use the multipart flow and confirm each upload request fits current Webflow Cloud request-body limits. Multipart uploads also have Object Storage part-size rules.
- Cache policy changes do not change browser/CDN behavior: Webflow Cloud may override `Cache-Control` response headers. Use fresh/cache-busted URLs when immediate invalidation matters.
- Generated upload URLs duplicate `/assets`: confirm a custom `ASSETS_PREFIX` contains only the origin, not the `/assets` mount path.
- Auth returns `401` for every request: `ASSET_MANAGER_AUTH_ENABLED=true` is set before `src/lib/auth.ts` returns a valid session.
