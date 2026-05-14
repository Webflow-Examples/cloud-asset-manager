import type { AssetManagerEnv } from "@/lib/cloudflare";
import type { AssetManagerSettings } from "@/lib/asset-types";

type DomainGateSettings = Pick<
  AssetManagerSettings,
  "domainRestrictionsEnabled" | "allowedAssetOrigins" | "allowDirectAssetAccess"
>;

type DomainGateOptions = {
  assetAllowedOrigins?: string[] | null;
  inheritAllowedOrigins?: boolean;
  globalAllowedOrigins?: string[];
  env?: Partial<AssetManagerEnv>;
  settings?: DomainGateSettings;
};

export function assetDomainRestrictionsEnabled(
  options: Pick<DomainGateOptions, "env" | "settings"> = {},
) {
  return (
    options.settings?.domainRestrictionsEnabled ??
    (options.env?.ASSET_MANAGER_DOMAIN_RESTRICTIONS_ENABLED === "true")
  );
}

export function checkAssetRequestOrigin(request: Request, options: DomainGateOptions = {}) {
  if (!assetDomainRestrictionsEnabled(options)) {
    return { ok: true as const };
  }

  const envOrigins =
    options.env?.ASSET_MANAGER_ALLOWED_ASSET_ORIGINS?.split(",")
      .map(normalizeOrigin)
      .filter(Boolean) ?? [];

  const configuredOrigins =
    options.inheritAllowedOrigins === false
      ? options.assetAllowedOrigins ?? []
      : options.globalAllowedOrigins?.length
        ? options.globalAllowedOrigins
        : options.settings
          ? options.settings.allowedAssetOrigins
        : envOrigins;

  const allowedOrigins = configuredOrigins.map(normalizeOrigin).filter(Boolean);

  if (!allowedOrigins.length) {
    return { ok: true as const };
  }

  const requestOrigin = getRequestOrigin(request);

  if (!requestOrigin) {
    return (options.settings?.allowDirectAssetAccess ??
      (options.env?.ASSET_MANAGER_ALLOW_DIRECT_ASSET_ACCESS === "true"))
      ? { ok: true as const }
      : {
          ok: false as const,
          response: new Response("Forbidden", { status: 403 }),
        };
  }

  if (!allowedOrigins.includes(requestOrigin)) {
    return {
      ok: false as const,
      response: new Response("Forbidden", { status: 403 }),
    };
  }

  return { ok: true as const };
}

function getRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const value = origin || referer;

  if (!value) return null;

  try {
    const url = new URL(value);
    return normalizeOrigin(`${url.protocol}//${url.host}`);
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return "";

  try {
    const url = new URL(value.trim().toLowerCase());
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
}
