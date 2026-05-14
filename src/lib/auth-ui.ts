import type { AssetManagerAuthAction, AssetManagerAuthUi } from "@/lib/asset-types";
import type { AssetManagerEnv } from "@/lib/cloudflare";

const DEFAULT_PROVIDER_LABEL = "Custom auth provider";

type AuthUiEnvKey =
  | "ASSET_MANAGER_AUTH_PROVIDER_LABEL"
  | "ASSET_MANAGER_SIGN_IN_URL"
  | "ASSET_MANAGER_SIGN_OUT_URL"
  | "ASSET_MANAGER_ACCOUNT_URL";

function processEnv(name: AuthUiEnvKey) {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function envValue(env: Partial<AssetManagerEnv>, name: AuthUiEnvKey) {
  return env[name] ?? processEnv(name);
}

function validAuthHref(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function authAction(label: string, href: string | null): AssetManagerAuthAction | null {
  return href ? { label, href } : null;
}

export function getAssetManagerAuthUi(env: Partial<AssetManagerEnv> = {}): AssetManagerAuthUi {
  const providerLabel =
    envValue(env, "ASSET_MANAGER_AUTH_PROVIDER_LABEL")?.trim() || DEFAULT_PROVIDER_LABEL;

  return {
    providerLabel,
    signIn: authAction("Sign in", validAuthHref(envValue(env, "ASSET_MANAGER_SIGN_IN_URL"))),
    signOut: authAction("Sign out", validAuthHref(envValue(env, "ASSET_MANAGER_SIGN_OUT_URL"))),
    account: authAction("Account", validAuthHref(envValue(env, "ASSET_MANAGER_ACCOUNT_URL"))),
  };
}
