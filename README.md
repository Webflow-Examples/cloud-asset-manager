# Webflow Cloud Asset Manager

A deployable asset manager starter for Webflow Cloud [**Object Storage**](https://developers.webflow.com/webflow-cloud/storing-data/object-storage).

Clone it, connect it to your own [**Webflow Cloud**](https://webflow.com/cloud) project and storage bindings, then shape it around your team's workflow. Out of the box, it gives you a polished `/assets` workspace for uploading files, organizing them, previewing them, replacing them, and copying stable delivery links without making your storage bucket public.

This repo is intentionally a starter, not a locked-down product. It ships with useful defaults, clear extension points, and bring-your-own-auth hooks so customer teams can adapt it for real production use. [A demo site is available to view the interface here.](https://cloud-asset-manager.webflow.io/assets)

## What You Get

- Bulk uploads with per-file names, folders, tags, cache intent, progress, retry, and copy-link actions.
- Searchable asset library with folder and tag filters.
- Asset details drawer with preview, editable metadata, object information, replacement, and copy formats for URL, object key, Markdown, HTML, and CSS `url()`.
- Stable proxied file links at `/assets/files/:slug`; renaming, reorganizing, or replacing an asset does not change the link.
- Browser-generated image thumbnails for list, grid, and drawer previews.
- Usage dashboard with indexed storage totals, type breakdowns, largest files, recent uploads, upload issues, and storage-plan context.
- Trash workflow with 30-day soft delete, restore, and permanent deletion.
- Optional domain restrictions, cache-busted URL variants, and separate auth controls for asset management and asset delivery.
- Light/dark theme support and a Webflow-branded UI foundation you can keep or replace.

## Common Use Cases

Use this starter when your team wants to:

- Manage Webflow Cloud Object Storage files without sending non-technical teammates into a cloud console.
- Keep stable URLs for campaign assets, downloads, PDFs, media files, or implementation snippets.
- Replace files while preserving links already used on a site or in code.
- Build a custom digital asset workflow on top of Webflow Cloud instead of starting from a blank app.
- Add your own auth, approval flow, metadata model, or downstream automation.

## How It Works

The app is a Next.js App Router project deployed to Webflow Cloud through OpenNext.

- **App route:** The UI runs at `/assets`.
- **Storage:** File bytes are stored in `CLOUD_ASSETS`; generated thumbnails are stored in `CLOUD_ASSET_THUMBNAILS`.
- **Metadata:** Search, organization, status, settings, and usage data live in the `ASSET_INDEX` SQLite binding.
- **Delivery:** Files stream through `/assets/files/:slug` and thumbnails through `/assets/thumbnails/:id`.
- **Auth:** The starter is public by default. You can wire your provider into `src/lib/auth.ts` and enable auth with environment variables.
- **Demo mode:** Public starter deployments use session-scoped demo storage by default so visitors can try the UI without changing shared seed assets.

Object Storage does not need to be public. The app serves files through its own delivery routes, which lets you preserve stable links, range requests, thumbnail delivery, cache-busted URL variants, and optional access controls in one place.

New file links use filename-based slugs by default, such as `/assets/files/brand-guide.pdf`. Asset IDs and object keys stay internal. Existing assets keep their current URLs until a user edits the URL slug in the asset details drawer.

## Quick Start

Prerequisites:

- Node.js 22 or later.
- `npm` for installing and building dependencies. Webflow Cloud currently builds npm projects.
- A Webflow Cloud project and environment when you are ready to deploy.

Install dependencies:

```bash
npm install
```

Generate runtime types after binding changes:

```bash
npm run cf-typegen
```

Apply local database migrations:

```bash
npx wrangler d1 migrations apply ASSET_INDEX --local
```

Run the app locally:

```bash
npm run dev
```

Open [http://localhost:3000/assets](http://localhost:3000/assets).

`npm run dev` is the fast local iteration path. This starter also wires OpenNext into `next dev` through `next.config.ts` so local Worker bindings are available while you develop.

Before deploying, preview the production Worker build locally:

```bash
npm run preview
```

## Configure Cloud Resources

`wrangler.json` defines the bindings this starter expects:

| Binding | Purpose | Default name |
| --- | --- | --- |
| `CLOUD_ASSETS` | Object Storage bucket for original files | `cloud-assets` |
| `CLOUD_ASSET_THUMBNAILS` | Object Storage bucket for generated thumbnails | `cloud-asset-thumbnails` |
| `ASSET_INDEX` | SQLite database for asset metadata, tags, settings, and usage stats | `asset-index` |

New thumbnail uploads use `CLOUD_ASSET_THUMBNAILS`. Existing thumbnails that still live in `CLOUD_ASSETS` continue to render through the thumbnail delivery route until they are regenerated or manually copied to the thumbnail bucket.

Before deploying your own copy:

1. Create a Webflow Cloud project and environment for your app.
2. Set the environment mount path to `/assets`, or update `next.config.ts`, route references, and copied-link behavior together.
3. Keep the binding names in `wrangler.json` aligned with the app code.
4. Commit and push to the GitHub branch connected to the environment for the first deploy or any storage binding changes. Webflow Cloud creates or updates storage bindings from the linked repository deployment.
5. After the environment and bindings exist, you can also deploy app-code-only changes manually with the Webflow CLI:

```bash
npm run deploy
```

Webflow Cloud connects storage through the bindings declared in `wrangler.json`. SQLite migrations in `migrations/` are applied by Webflow Cloud deployments. The app is mounted at `/assets` by `next.config.ts`; if you change the mount path, update route references, copied link behavior, and the Webflow Cloud environment mount path together.

## Environment Variables

The starter works without custom environment variables, but production deployments should review these settings.

| Variable | Use |
| --- | --- |
| `ORIGIN` | Recommended in production. Restricts API CORS to your asset manager origin. |
| `ASSETS_PREFIX` | Worker origin for generated upload/file URLs. Webflow Cloud sets this automatically in production. For local overrides, use an absolute origin without `/assets`; the app appends the mount path. |
| `STORAGE_PLAN_LIMIT_BYTES` | Enables the usage progress bar against your storage plan limit. |
| `STORAGE_PLAN_LABEL` | Labels the configured storage plan in the usage dashboard. |
| `ASSET_MANAGER_DEMO_MODE` | Enables the public demo sandbox. Defaults to `true`; set to `false` for production. |
| `ASSET_MANAGER_DEMO_SESSION_TTL_HOURS` | Demo session lifetime. Defaults to `6`. |
| `ASSET_MANAGER_DEMO_MAX_FILE_BYTES` | Per-file demo upload limit. Defaults to `20971520` (20 MB). |
| `ASSET_MANAGER_DEMO_MAX_SESSION_BYTES` | Total demo upload storage per browser session. Defaults to `52428800` (50 MB). |
| `ASSET_MANAGER_DEMO_MAX_SESSION_ASSETS` | Maximum demo-owned uploads per browser session. Defaults to `25`. |
| `ASSET_MANAGER_DOMAIN_RESTRICTIONS_ENABLED` | Enables origin/referer checks for asset delivery. |
| `ASSET_MANAGER_ALLOWED_ASSET_ORIGINS` | Comma-separated origins allowed to embed or request protected assets. |
| `ASSET_MANAGER_ALLOW_DIRECT_ASSET_ACCESS` | Allows direct asset requests with no origin/referer when domain restrictions are enabled. |
| `ASSET_MANAGER_DOMAIN_SETTINGS_LOCKED` | Locks domain restriction settings to environment configuration. |
| `ASSET_MANAGER_DEFAULT_COPIED_LINK_TYPE` | Sets default copied links to `stable` or `fresh`. |
| `ASSET_MANAGER_DEFAULT_SNIPPET_URL_TYPE` | Sets default snippet URLs to `stable` or `fresh`. |
| `ASSET_MANAGER_CACHE_BEHAVIOR_SETTINGS_LOCKED` | Locks cache/link behavior settings to environment configuration. |

## More Guides

- [Deployment guide](docs/deployment.md): local setup, cloud resources, migrations, deployment, validation, and common setup issues.
- [Architecture guide](docs/architecture.md): app flow, storage split, delivery behavior, and extension points.
- [Auth and access guide](docs/auth-and-access.md): bring-your-own-auth, delivery auth, CORS, and domain restrictions.

## Auth And Access Control

The default starter is intentionally public so you can deploy and test it quickly. Demo mode is enabled by default so public visitors work in a temporary, cookie-bound sandbox. Their uploads, edits, deletes, replacements, and trash actions affect only their browser session and expire automatically.

Disable demo mode before using the app as a real asset manager:

Recommended production posture:

```bash
ASSET_MANAGER_DEMO_MODE=false
ASSET_MANAGER_AUTH_ENABLED=true
ASSET_MANAGER_PROTECT_ASSET_DELIVERY=false
```

That keeps uploads, edits, deletes, settings, and usage data behind auth while allowing copied asset URLs to work on public sites.

## Public Demo Sandbox

When `ASSET_MANAGER_DEMO_MODE` is not set or is set to `true`, the app creates an anonymous session with an HttpOnly cookie. Seed assets are cloned into that session as metadata-only rows that point back to the shared seed objects. New uploads and replacements write under a `demo-sessions/<session-id>/` object prefix and never overwrite seed objects.

Demo sessions expire after 6 hours by default. Expired sessions stop listing and serving session uploads immediately. Cleanup runs opportunistically on normal app/API requests and deletes small batches of expired session rows, demo objects, demo thumbnails, and tombstones. If the app receives no traffic, expired objects may remain in storage until the next request, but they are not accessible after expiry.

Demo uploads intentionally have additional limits: 20 MB per file, 50 MB per session, and 25 demo-owned uploads per session. The public demo allows common images except SVG, PDFs, text, CSV, JSON, ZIP, MP4, WebM, MOV, GLB, and GLTF. HTML, SVG, JavaScript, shell scripts, executables, unknown binary files, and unsupported archives are blocked in demo mode. Production deployments can change this policy in code after disabling demo mode and adding auth.

For heavily promoted public demos, add platform-level protections such as WAF/rate limits, Turnstile before upload, and malware scanning.

To connect auth:

1. Replace `getAssetManagerSession` in `src/lib/auth.ts` with your provider's server-side session lookup.
2. Return a truthy session object when the request is allowed, or `null` when it should be denied.
3. Set `ASSET_MANAGER_AUTH_ENABLED=true`.
4. Optionally configure the provider-neutral UI actions:

| Variable | Use |
| --- | --- |
| `ASSET_MANAGER_AUTH_PROVIDER_LABEL` | Label shown in auth-related UI. Defaults to `Custom auth provider`. |
| `ASSET_MANAGER_SIGN_IN_URL` | Sign-in action for `/assets/sign-in`. |
| `ASSET_MANAGER_SIGN_OUT_URL` | Sign-out action in the app header. |
| `ASSET_MANAGER_ACCOUNT_URL` | Account action in the app header. |

If your files themselves should require a session, also set:

```bash
ASSET_MANAGER_PROTECT_ASSET_DELIVERY=true
```

Keep this separate from UI/API auth. Many sites need private asset management but public file delivery.

## Customize The Starter

Useful places to start:

- **Product UI:** `src/components/asset-manager.tsx`
- **Theme and visual system:** `src/app/globals.css`, `src/components/ui/**`, `public/brand/**`
- **Auth adapter:** `src/lib/auth.ts`
- **Runtime auth gates:** `src/lib/auth-gate.ts`
- **Storage, validation, search, and settings:** `src/lib/asset-storage.ts`
- **File and thumbnail delivery:** `src/app/files/[id]/route.ts`, `src/app/thumbnails/[id]/route.ts`
- **Database schema:** `migrations/**`
- **Cloud bindings:** `wrangler.json`

The app currently uses flat folder labels and normalized tags. If your workflow needs nested folders, approval states, asset ownership, audit logs, or custom metadata fields, extend the database migrations and the storage helpers together.

## Validation

Run these checks before opening a PR or deploying:

```bash
npm run lint
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

With a preview or deployed demo running, exercise the demo sandbox contract:

```bash
DEMO_CHECK_BASE_URL=http://localhost:8787/assets npm run check:demo
```

## Current Boundaries

- This starter does not ship provider-specific auth packages, callback routes, sign-up flows, credential handling, or a built-in account page.
- Folders are flat labels, not nested paths.
- Tags are metadata only; they do not change object keys.
- Webflow Cloud may override `Cache-Control` response headers. Cache policy settings are still stored as delivery intent, but cache-busted fresh URLs are the reliable way to force a new request.
- Large uploads use multipart routes, but each request still has to fit Webflow Cloud request-body limits and Object Storage multipart constraints. Test large-file behavior in the target environment before promising multi-GB workflows.
- Replacement is same-kind only and does not keep old file versions.
- Standard delete moves assets to trash; permanent delete is available from the trash view.
- The app is a starter for your Webflow Cloud instance and storage resources. It is not a hosted SaaS service.

## License

This project is available under the [MIT License](LICENSE).
