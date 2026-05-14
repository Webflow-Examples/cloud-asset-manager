import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AssetManagerEnv = CloudflareEnv & {
  CLOUD_ASSETS: R2Bucket;
  CLOUD_ASSET_THUMBNAILS: R2Bucket;
  ASSET_INDEX: D1Database;
  ASSETS_PREFIX?: string;
  BASE_URL?: string;
  ORIGIN?: string;
  STORAGE_PLAN_LABEL?: string;
  STORAGE_PLAN_LIMIT_BYTES?: string;
  ASSET_MANAGER_AUTH_ENABLED?: string;
  ASSET_MANAGER_PROTECT_ASSET_DELIVERY?: string;
  ASSET_MANAGER_DOMAIN_RESTRICTIONS_ENABLED?: string;
  ASSET_MANAGER_ALLOWED_ASSET_ORIGINS?: string;
  ASSET_MANAGER_ALLOW_DIRECT_ASSET_ACCESS?: string;
  ASSET_MANAGER_DOMAIN_SETTINGS_LOCKED?: string;
  ASSET_MANAGER_DEFAULT_COPIED_LINK_TYPE?: string;
  ASSET_MANAGER_DEFAULT_SNIPPET_URL_TYPE?: string;
  ASSET_MANAGER_CACHE_BEHAVIOR_SETTINGS_LOCKED?: string;
  ASSET_MANAGER_AUTH_PROVIDER_LABEL?: string;
  ASSET_MANAGER_SIGN_IN_URL?: string;
  ASSET_MANAGER_SIGN_OUT_URL?: string;
  ASSET_MANAGER_ACCOUNT_URL?: string;
};

export async function getAssetManagerEnv() {
  const { env } = await getCloudflareContext({ async: true });
  return env as AssetManagerEnv;
}
