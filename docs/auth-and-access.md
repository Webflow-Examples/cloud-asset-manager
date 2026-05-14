# Auth And Access Guide

This starter is public by default. Auth is intentionally bring-your-own-provider so teams can connect the identity system they already use.

## Recommended Production Posture

Most teams should protect the asset manager UI and APIs while leaving copied asset URLs public:

```bash
ASSET_MANAGER_DEMO_MODE=false
ASSET_MANAGER_AUTH_ENABLED=true
ASSET_MANAGER_PROTECT_ASSET_DELIVERY=false
```

This keeps uploads, edits, deletes, settings, and usage data private while allowing asset links to work on public sites.

## Connect Your Auth Provider

Replace `getAssetManagerSession` in `src/lib/auth.ts`.

Return any truthy session object when the request is allowed:

```ts
export async function getAssetManagerSession(options: {
  headers: Headers;
}): Promise<unknown | null> {
  const session = await yourAuthProvider.getSession(options.headers);
  return session ?? null;
}
```

When `ASSET_MANAGER_AUTH_ENABLED=true`, the app uses this adapter for:

- The `/assets` UI.
- The `/assets/settings` UI.
- Asset management APIs under `/assets/api/assets/**`.

## Asset Delivery Auth

Asset delivery is separate from asset management auth.

Only set this when files and thumbnails should also require a valid session:

```bash
ASSET_MANAGER_PROTECT_ASSET_DELIVERY=true
```

Protected delivery applies to:

- `/assets/files/:slug`
- `/assets/thumbnails/:id`

Leave it `false` when generated links need to work in public pages, emails, documents, or embeds.

## Auth UI Actions

The starter includes provider-neutral auth UI. Configure these URLs to send users to your provider or account surface:

```bash
ASSET_MANAGER_AUTH_PROVIDER_LABEL=Your provider
ASSET_MANAGER_SIGN_IN_URL=/your/sign-in
ASSET_MANAGER_SIGN_OUT_URL=/your/sign-out
ASSET_MANAGER_ACCOUNT_URL=/your/account
```

URLs can be relative paths or absolute `http(s)` URLs.

The sign-in page at `/assets/sign-in` is a shell until `ASSET_MANAGER_SIGN_IN_URL` or your own provider route is connected.

## CORS And API Origin

Set `ORIGIN` in production:

```bash
ORIGIN=https://your-asset-manager.example.com
```

`ORIGIN` controls CORS for asset-management APIs. It should be the origin where the asset manager UI is hosted, not the origins where assets will be displayed.

## Domain Restrictions

Domain restrictions are a delivery control, not auth. They check the request `Origin` or `Referer` before serving files.

```bash
ASSET_MANAGER_DOMAIN_RESTRICTIONS_ENABLED=true
ASSET_MANAGER_ALLOWED_ASSET_ORIGINS=https://www.example.com,https://example.webflow.io
ASSET_MANAGER_ALLOW_DIRECT_ASSET_ACCESS=false
```

Use this to reduce hotlinking or limit where copied file links can be embedded. Use auth when the file itself must be private.

Lock environment-managed settings when you do not want users to edit them in the app:

```bash
ASSET_MANAGER_DOMAIN_SETTINGS_LOCKED=true
ASSET_MANAGER_CACHE_BEHAVIOR_SETTINGS_LOCKED=true
```
