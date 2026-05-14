import { fileExtension, formatBytes } from "@/lib/asset-limits";
import type { AssetRow } from "@/lib/asset-types";
import type { AssetManagerEnv } from "@/lib/cloudflare";

export const DEMO_SESSION_COOKIE = "wf_asset_demo_session";
export const DEMO_SESSION_TTL_HOURS = 6;
export const DEMO_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DEMO_MAX_SESSION_BYTES = 50 * 1024 * 1024;
export const DEMO_MAX_SESSION_ASSETS = 25;
export const DEMO_ALLOWED_FILE_SUMMARY =
  "Images except SVG, PDFs, text, CSV, JSON, ZIP, MP4, WebM, MOV, GLB, and GLTF";
export const DEMO_CLEANUP_MODE = "request-time";
export const DEMO_BLOCKED_FILE_MESSAGE =
  "This file is blocked only in the public demo because demo uploads have extra file type and size limits. A production deployment can allow this file type or a larger file.";

const DEMO_ALLOWED_EXTENSIONS = new Set([
  ".avif",
  ".csv",
  ".gif",
  ".glb",
  ".gltf",
  ".jpeg",
  ".jpg",
  ".json",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".txt",
  ".webm",
  ".webp",
  ".zip",
]);

const DEMO_BLOCKED_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".exe",
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".msi",
  ".php",
  ".ps1",
  ".sh",
  ".svg",
  ".wasm",
  ".xhtml",
  ".xml",
]);

const DEMO_BLOCKED_MIME_PARTS = [
  "ecmascript",
  "html",
  "javascript",
  "script",
  "svg",
  "x-sh",
  "x-msdownload",
  "xml",
];

export function envValue(env: Partial<AssetManagerEnv>, key: keyof AssetManagerEnv) {
  const runtimeValue = env[key];
  if (typeof runtimeValue === "string") return runtimeValue;
  if (typeof process === "undefined") return undefined;
  return process.env[key];
}

function envNumber(
  env: Partial<AssetManagerEnv>,
  key: keyof AssetManagerEnv,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const value = Number(envValue(env, key) || 0);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(Math.floor(value), options.min ?? 1), options.max ?? Number.MAX_SAFE_INTEGER);
}

export function demoModeEnabled(env: Partial<AssetManagerEnv>) {
  return String(envValue(env, "ASSET_MANAGER_DEMO_MODE") ?? "true").toLowerCase() !== "false";
}

export function demoRuntimeConfig(env: Partial<AssetManagerEnv>) {
  const sessionTtlHours = envNumber(env, "ASSET_MANAGER_DEMO_SESSION_TTL_HOURS", DEMO_SESSION_TTL_HOURS, {
    min: 1,
    max: 24,
  });
  const maxFileBytes = envNumber(env, "ASSET_MANAGER_DEMO_MAX_FILE_BYTES", DEMO_MAX_FILE_BYTES, {
    min: 1024,
    max: DEMO_MAX_SESSION_BYTES,
  });
  const maxSessionBytes = envNumber(
    env,
    "ASSET_MANAGER_DEMO_MAX_SESSION_BYTES",
    DEMO_MAX_SESSION_BYTES,
    {
      min: maxFileBytes,
      max: 1024 * 1024 * 1024,
    },
  );
  const maxSessionAssets = envNumber(
    env,
    "ASSET_MANAGER_DEMO_MAX_SESSION_ASSETS",
    DEMO_MAX_SESSION_ASSETS,
    {
      min: 1,
      max: 100,
    },
  );

  return {
    enabled: demoModeEnabled(env),
    sessionTtlHours,
    maxSessionBytes,
    maxFileBytes,
    maxSessionAssets,
    allowedFileSummary: DEMO_ALLOWED_FILE_SUMMARY,
    cleanupMode: DEMO_CLEANUP_MODE,
  };
}

export function demoObjectKey(sessionId: string, id: string, filename: string) {
  return `demo-sessions/${sessionId}/assets/${id}${fileExtension(filename)}`;
}

export function demoSeedObjectKey(sessionId: string, seedAssetId: string) {
  return `demo-seed/${sessionId}/${seedAssetId}`;
}

export function demoThumbnailKey(sessionId: string, assetId: string, variant: string) {
  return `demo-sessions/${sessionId}/thumbnails/${assetId}-${variant}.webp`;
}

export function demoFileSizeError(maxFileBytes: number) {
  return `This file is larger than the public demo limit of ${formatBytes(maxFileBytes)}. A production deployment can allow larger uploads.`;
}

export function validateDemoUploadFile(
  env: Partial<AssetManagerEnv>,
  file: { filename: string; contentType: string; sizeBytes: number },
) {
  const config = demoRuntimeConfig(env);
  if (!config.enabled) return;

  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0) {
    throw new Error("Choose a file that is larger than 0 bytes.");
  }

  if (file.sizeBytes > config.maxFileBytes) {
    throw new Error(demoFileSizeError(config.maxFileBytes));
  }

  const extension = fileExtension(file.filename);
  const contentType = file.contentType.toLowerCase();

  if (
    !DEMO_ALLOWED_EXTENSIONS.has(extension) ||
    DEMO_BLOCKED_EXTENSIONS.has(extension) ||
    DEMO_BLOCKED_MIME_PARTS.some((part) => contentType.includes(part))
  ) {
    throw new Error(DEMO_BLOCKED_FILE_MESSAGE);
  }
}

export function demoAssetShouldDownload(asset: AssetRow) {
  if (!asset.demo_session_id || asset.demo_storage_owner !== "demo") return false;

  const kind = asset.content_type.toLowerCase();
  const extension = fileExtension(asset.original_filename);

  if (kind === "application/pdf" || extension === ".pdf") return false;
  if (kind.startsWith("video/")) return false;
  if (kind.startsWith("image/") && extension !== ".svg") return false;

  return true;
}

export function demoSessionCookie(request: Request, sessionId: string, expiresAt: string) {
  const url = new URL(request.url);
  const isSecure = url.protocol === "https:";
  const parts = [
    `${DEMO_SESSION_COOKIE}=${sessionId}`,
    "Path=/assets",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  if (isSecure) parts.push("Secure");

  return parts.join("; ");
}

export function demoSessionIdFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${DEMO_SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
