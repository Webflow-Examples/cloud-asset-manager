# Architecture Guide

The Asset Manager is a Next.js App Router application deployed to Webflow Cloud through OpenNext.

## Request Flow

1. A user opens `/assets`.
2. The app checks interface auth through `src/lib/auth-gate.ts`.
3. The React UI calls API routes under `/assets/api/assets/**`.
4. Demo mode, when enabled, resolves or creates an anonymous session cookie and scopes asset rows to that session.
5. API routes read and write metadata in `ASSET_INDEX`.
6. File bytes are stored in `CLOUD_ASSETS`; generated thumbnails are stored in `CLOUD_ASSET_THUMBNAILS`.
7. Copied links serve files through `/assets/files/:slug` and thumbnails through `/assets/thumbnails/:id`.

## Storage Split

`CLOUD_ASSETS` stores file bytes. Object keys are not intended to be the customer-facing contract.

`CLOUD_ASSET_THUMBNAILS` stores generated preview artifacts. New thumbnail writes go to this bucket, while delivery still falls back to legacy thumbnails that may exist in `CLOUD_ASSETS`.

`ASSET_INDEX` stores the stable asset record: URL slug, display name, original filename, content type, size, object key, folder, tags, cache policy, thumbnail metadata, upload status, soft-delete state, and optional demo session scope.

That split lets the app preserve stable links even when users rename, reorganize, or replace assets. Editing the URL slug intentionally changes the public file link.

## Demo Mode

Demo mode is enabled by default for the starter. It keeps public demos usable without letting anonymous visitors mutate shared seed assets.

Each browser session gets a `demo_sessions` row and an HttpOnly cookie. On first use, active seed assets are cloned into session-scoped metadata rows. Seed clones use virtual object keys and `demo_seed_asset_id` to resolve the real seed object at delivery time. Replacements and new uploads write real objects under `demo-sessions/<session-id>/` and mark those rows as demo-owned.

Slug uniqueness is scoped by `demo_session_id`, so two visitors can upload or rename assets to the same slug without colliding. File and thumbnail delivery check the session cookie first; demo URLs include `?demo=1` so session uploads do not fall back to public seed assets for other visitors.

Expired demo sessions stop serving immediately. Request-time cleanup removes expired session rows, demo-owned objects, demo thumbnails, and tombstones in small batches.

## Main Code Areas

- `src/components/asset-manager.tsx`: main product UI, upload flow, filters, table, drawer, copy actions, replacement, and trash.
- `src/lib/asset-storage.ts`: schema safety, validation, metadata mapping, search/filter queries, settings, tags, and usage stats.
- `src/app/api/assets/**`: asset management APIs for listing, upload, update, replacement, thumbnails, duplicates, settings, and usage.
- `src/app/files/[id]/route.ts`: stable file delivery route with `GET`, `HEAD`, byte ranges, validation headers, cache intent, and trash/status handling.
- `src/app/thumbnails/[id]/route.ts`: generated thumbnail delivery route.
- `migrations/**`: additive database migrations for the asset index.

## Delivery Behavior

Files are served through the app, not directly from a public bucket.

The file route supports full downloads, `HEAD`, single byte ranges, ETag revalidation, content disposition, per-asset cache intent, and `410 Gone` for assets still recoverable in trash.

Webflow Cloud may override `Cache-Control` response headers at the platform layer. The app still records cache intent and emits best-effort headers, but cache-busted fresh URLs are the dependable invalidation path.

The URL slug is the stable file-link contract. Asset IDs and object keys remain internal to the app and storage layer.

## Extension Points

- Replace `src/lib/auth.ts` to connect your auth provider.
- Set `ASSET_MANAGER_DEMO_MODE=false` before using the starter as a production asset manager.
- Extend `migrations/**` and `src/lib/asset-storage.ts` together for new metadata fields.
- Adjust `src/components/asset-manager.tsx` for workflow changes such as approvals, ownership, or custom review queues.
- Update `src/app/globals.css` and `public/brand/**` if you want different branding.
- Change delivery behavior in `src/app/files/[id]/route.ts` if your project needs different headers, transforms, or access rules.

Keep runtime behavior and database migrations in sync. If a new UI field needs to persist, add a migration and update the storage helpers in the same change.
