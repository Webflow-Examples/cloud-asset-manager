import { APP_BASE_PATH } from "@/lib/asset-limits";

export function assetStableUrl(assetSlug: string, origin = "") {
  const prefix = origin.replace(/\/$/, "");
  return `${prefix}${APP_BASE_PATH}/files/${encodeURIComponent(assetSlug)}`;
}

export function assetCacheBustedUrl(assetSlug: string, cacheVersion: number, origin = "") {
  const stable = assetStableUrl(assetSlug, origin);
  const url = new URL(stable, "https://placeholder.local");
  url.searchParams.set("v", String(cacheVersion));
  return origin ? `${url.origin}${url.pathname}${url.search}` : `${url.pathname}${url.search}`;
}

export function assetUrl(
  asset: { id: string; slug?: string; url?: string; cacheVersion?: number },
  options: { cacheBust?: boolean } = {},
) {
  const stable = asset.url || assetStableUrl(asset.slug || asset.id);

  if (!options.cacheBust) return stable;

  const version = asset.cacheVersion ?? 1;
  const url = new URL(stable, "https://placeholder.local");
  url.searchParams.set("v", String(version));

  return stable.startsWith("http")
    ? `${url.origin}${url.pathname}${url.search}`
    : `${url.pathname}${url.search}`;
}
