import {
  APP_BASE_PATH,
  DIRECT_UPLOAD_LIMIT_BYTES,
  MAX_MULTIPART_UPLOAD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  OBJECT_KEY_PREFIX,
  WEBFLOW_LIMITS,
} from "@/lib/asset-limits";
import { getAssetManagerAuthUi } from "@/lib/auth-ui";
import { assetCacheBustedUrl, assetStableUrl } from "@/lib/asset-url";
import type {
  Asset,
  AssetLinkType,
  AssetManagerSettings,
  AssetManagerSettingsLocks,
  AssetManagerSettingsValues,
  AssetRow,
  AssetUsageItem,
  AssetUsageResponse,
  CachePolicy,
} from "@/lib/asset-types";
import type { AssetManagerEnv } from "@/lib/cloudflare";

const DEFAULT_CACHE_POLICY: CachePolicy = "balanced";
export const TRASH_RETENTION_DAYS = 30;
const THUMBNAIL_OBJECT_PREFIX = `${OBJECT_KEY_PREFIX}/thumbnails/`;
const MAX_ASSET_SLUG_LENGTH = 180;
const PURGE_EXPIRED_DELETED_INTERVAL_MS = 5 * 60 * 1000;
const RECONCILE_BUCKET_INTERVAL_MS = 60 * 1000;
const USAGE_KINDS: Asset["kind"][] = [
  "image",
  "video",
  "pdf",
  "model",
  "text",
  "archive",
  "file",
];
const THUMBNAIL_SOURCE_KINDS: Asset["kind"][] = ["image", "video", "pdf"];

function processEnv(
  name: "ASSET_MANAGER_AUTH_ENABLED" | "ASSET_MANAGER_PROTECT_ASSET_DELIVERY",
) {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function accessFlag(
  value: string | undefined,
  name: "ASSET_MANAGER_AUTH_ENABLED" | "ASSET_MANAGER_PROTECT_ASSET_DELIVERY",
) {
  return (value ?? processEnv(name)) === "true";
}

function assetColumnSelect(alias = "assets") {
  return `
    ${alias}.id,
    ${alias}.slug,
    ${alias}.object_key,
    ${alias}.display_name,
    ${alias}.original_filename,
    ${alias}.content_type,
    ${alias}.size_bytes,
    ${alias}.etag,
    ${alias}.content_sha256,
    ${alias}.thumbnail_key,
    ${alias}.thumbnail_content_type,
    ${alias}.thumbnail_size_bytes,
    ${alias}.thumbnail_etag,
    ${alias}.thumbnail_updated_at,
    ${alias}.thumbnail_tiny_key,
    ${alias}.thumbnail_tiny_content_type,
    ${alias}.thumbnail_tiny_size_bytes,
    ${alias}.thumbnail_tiny_etag,
    ${alias}.thumbnail_tiny_updated_at,
    ${alias}.thumbnail_medium_key,
    ${alias}.thumbnail_medium_content_type,
    ${alias}.thumbnail_medium_size_bytes,
    ${alias}.thumbnail_medium_etag,
    ${alias}.thumbnail_medium_updated_at,
    ${alias}.folder,
    ${alias}.cache_policy,
    ${alias}.cache_version,
    ${alias}.allowed_origins,
    ${alias}.inherit_allowed_origins,
    ${alias}.uploaded_at,
    ${alias}.updated_at,
    ${alias}.deleted_at,
    ${alias}.delete_after,
    ${alias}.status
  `;
}

function assetSelect(alias = "assets") {
  return `
    ${assetColumnSelect(alias)},
    COALESCE(group_concat(asset_tags.tag, ','), '') AS tag_list
  `;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  content_sha256 TEXT,
  thumbnail_key TEXT,
  thumbnail_content_type TEXT,
  thumbnail_size_bytes INTEGER,
  thumbnail_etag TEXT,
  thumbnail_updated_at TEXT,
  thumbnail_tiny_key TEXT,
  thumbnail_tiny_content_type TEXT,
  thumbnail_tiny_size_bytes INTEGER,
  thumbnail_tiny_etag TEXT,
  thumbnail_tiny_updated_at TEXT,
  thumbnail_medium_key TEXT,
  thumbnail_medium_content_type TEXT,
  thumbnail_medium_size_bytes INTEGER,
  thumbnail_medium_etag TEXT,
  thumbnail_medium_updated_at TEXT,
  folder TEXT,
  cache_policy TEXT NOT NULL DEFAULT 'balanced',
  cache_version INTEGER NOT NULL DEFAULT 1,
  allowed_origins TEXT,
  inherit_allowed_origins INTEGER NOT NULL DEFAULT 1,
  uploaded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_after TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading', 'ready', 'failed'))
);
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS asset_manager_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_display_name_idx ON assets (display_name);
CREATE INDEX IF NOT EXISTS assets_original_filename_idx ON assets (original_filename);
CREATE INDEX IF NOT EXISTS assets_uploaded_at_idx ON assets (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS assets_status_idx ON assets (status);
CREATE INDEX IF NOT EXISTS assets_content_sha256_idx ON assets (content_sha256);
CREATE INDEX IF NOT EXISTS assets_folder_idx ON assets (folder);
CREATE INDEX IF NOT EXISTS assets_cache_policy_idx ON assets (cache_policy);
CREATE INDEX IF NOT EXISTS assets_deleted_at_idx ON assets (deleted_at);
CREATE INDEX IF NOT EXISTS assets_delete_after_idx ON assets (delete_after);
CREATE INDEX IF NOT EXISTS assets_status_deleted_uploaded_idx ON assets (status, deleted_at, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS assets_status_size_idx ON assets (status, size_bytes DESC);
CREATE INDEX IF NOT EXISTS assets_content_sha256_status_uploaded_idx ON assets (content_sha256, status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS asset_tags_tag_idx ON asset_tags (tag);
CREATE INDEX IF NOT EXISTS asset_tags_asset_id_idx ON asset_tags (asset_id);
CREATE INDEX IF NOT EXISTS asset_tags_tag_asset_id_idx ON asset_tags (tag, asset_id);
`;

const assetSchemaReady = new WeakMap<D1Database, Promise<void>>();
let sharedAssetSchemaReady: Promise<void> | null = null;
const maintenanceState = new WeakMap<
  D1Database,
  {
    purgeAt: number;
    reconcileAt: number;
  }
>();
const sharedMaintenanceState = {
  purgeAt: 0,
  reconcileAt: 0,
};

type AssetColumnMigration = readonly [column: string, statement: string];

const ASSET_COLUMN_MIGRATIONS = [
  ["slug", "ALTER TABLE assets ADD COLUMN slug TEXT"],
  ["folder", "ALTER TABLE assets ADD COLUMN folder TEXT"],
  ["cache_policy", "ALTER TABLE assets ADD COLUMN cache_policy TEXT NOT NULL DEFAULT 'balanced'"],
  ["cache_version", "ALTER TABLE assets ADD COLUMN cache_version INTEGER NOT NULL DEFAULT 1"],
  ["allowed_origins", "ALTER TABLE assets ADD COLUMN allowed_origins TEXT"],
  [
    "inherit_allowed_origins",
    "ALTER TABLE assets ADD COLUMN inherit_allowed_origins INTEGER NOT NULL DEFAULT 1",
  ],
  ["deleted_at", "ALTER TABLE assets ADD COLUMN deleted_at TEXT"],
  ["delete_after", "ALTER TABLE assets ADD COLUMN delete_after TEXT"],
  ["content_sha256", "ALTER TABLE assets ADD COLUMN content_sha256 TEXT"],
  ["thumbnail_key", "ALTER TABLE assets ADD COLUMN thumbnail_key TEXT"],
  ["thumbnail_content_type", "ALTER TABLE assets ADD COLUMN thumbnail_content_type TEXT"],
  ["thumbnail_size_bytes", "ALTER TABLE assets ADD COLUMN thumbnail_size_bytes INTEGER"],
  ["thumbnail_etag", "ALTER TABLE assets ADD COLUMN thumbnail_etag TEXT"],
  ["thumbnail_updated_at", "ALTER TABLE assets ADD COLUMN thumbnail_updated_at TEXT"],
  ["thumbnail_tiny_key", "ALTER TABLE assets ADD COLUMN thumbnail_tiny_key TEXT"],
  [
    "thumbnail_tiny_content_type",
    "ALTER TABLE assets ADD COLUMN thumbnail_tiny_content_type TEXT",
  ],
  ["thumbnail_tiny_size_bytes", "ALTER TABLE assets ADD COLUMN thumbnail_tiny_size_bytes INTEGER"],
  ["thumbnail_tiny_etag", "ALTER TABLE assets ADD COLUMN thumbnail_tiny_etag TEXT"],
  ["thumbnail_tiny_updated_at", "ALTER TABLE assets ADD COLUMN thumbnail_tiny_updated_at TEXT"],
  ["thumbnail_medium_key", "ALTER TABLE assets ADD COLUMN thumbnail_medium_key TEXT"],
  [
    "thumbnail_medium_content_type",
    "ALTER TABLE assets ADD COLUMN thumbnail_medium_content_type TEXT",
  ],
  [
    "thumbnail_medium_size_bytes",
    "ALTER TABLE assets ADD COLUMN thumbnail_medium_size_bytes INTEGER",
  ],
  ["thumbnail_medium_etag", "ALTER TABLE assets ADD COLUMN thumbnail_medium_etag TEXT"],
  [
    "thumbnail_medium_updated_at",
    "ALTER TABLE assets ADD COLUMN thumbnail_medium_updated_at TEXT",
  ],
] as const satisfies readonly AssetColumnMigration[];

const POST_SCHEMA_INDEX_SQL = [
  "CREATE UNIQUE INDEX IF NOT EXISTS assets_slug_idx ON assets (slug)",
  "CREATE INDEX IF NOT EXISTS assets_thumbnail_key_idx ON assets (thumbnail_key)",
  "CREATE INDEX IF NOT EXISTS assets_content_sha256_idx ON assets (content_sha256)",
  "CREATE INDEX IF NOT EXISTS assets_thumbnail_tiny_key_idx ON assets (thumbnail_tiny_key)",
  "CREATE INDEX IF NOT EXISTS assets_thumbnail_medium_key_idx ON assets (thumbnail_medium_key)",
  "CREATE INDEX IF NOT EXISTS assets_status_deleted_uploaded_idx ON assets (status, deleted_at, uploaded_at DESC)",
  "CREATE INDEX IF NOT EXISTS assets_status_size_idx ON assets (status, size_bytes DESC)",
  "CREATE INDEX IF NOT EXISTS assets_content_sha256_status_uploaded_idx ON assets (content_sha256, status, uploaded_at DESC)",
  "CREATE INDEX IF NOT EXISTS asset_tags_tag_asset_id_idx ON asset_tags (tag, asset_id)",
] as const;

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export function errorResponse(message: string, status = 400, init: ResponseInit = {}) {
  return jsonResponse({ error: message }, { ...init, status });
}

/**
 * Returns CORS headers for API responses.
 *
 * SECURITY: Set the ORIGIN environment variable in production to prevent CSRF.
 * This should be the origin where your asset manager UI is hosted (e.g.,
 * "https://your-app.example.com"), NOT the origins of sites that will display
 * your assets. Assets served via <img>, <video>, or direct links do not require
 * CORS — browsers only enforce CORS for JavaScript-initiated requests (fetch/XHR).
 *
 * Without ORIGIN set, any website can make authenticated API requests on behalf
 * of your logged-in users.
 */
export function corsHeaders(request: Request, env?: Partial<AssetManagerEnv>) {
  const requestOrigin = request.headers.get("origin");
  const allowedOrigin = env?.ORIGIN || requestOrigin || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function optionsResponse(request: Request, env?: Partial<AssetManagerEnv>) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}

const SETTING_KEYS = [
  "domainRestrictionsEnabled",
  "allowedAssetOrigins",
  "allowDirectAssetAccess",
  "defaultCopiedLinkType",
  "defaultSnippetUrlType",
] as const satisfies readonly (keyof AssetManagerSettingsValues)[];
type SettingKey = (typeof SETTING_KEYS)[number];
const SETTING_KEY_SET = new Set<string>(SETTING_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssetLinkType(value: unknown): value is AssetLinkType {
  return value === "stable" || value === "fresh";
}

function envAssetLinkType(value: string | undefined) {
  return isAssetLinkType(value) ? value : "stable";
}

function normalizeAssetOrigin(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Origin cannot be empty.");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Allowed origins must start with http:// or https://.");
    }
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    if (error instanceof Error && error.message.includes("http")) {
      throw error;
    }
    throw new Error(`Invalid origin: ${value}`);
  }
}

export function normalizeAssetOrigins(value: unknown, options: { strict: boolean }) {
  let values: unknown[] = [];

  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string") {
    values = value.split(/[,\n]/);
  } else if (value !== null && value !== undefined && options.strict) {
    throw new Error("Allowed origins must be a string or array of strings.");
  }

  const origins = new Set<string>();

  for (const item of values) {
    if (typeof item !== "string") {
      if (options.strict) throw new Error("Allowed origins must be strings.");
      continue;
    }

    if (!item.trim()) continue;

    try {
      origins.add(normalizeAssetOrigin(item));
    } catch (error) {
      if (options.strict) throw error;
    }
  }

  return Array.from(origins);
}

export function storedAssetAllowedOrigins(value: string | null | undefined) {
  if (!value) return [];

  try {
    return normalizeAssetOrigins(JSON.parse(value), { strict: false });
  } catch {
    return normalizeAssetOrigins(value, { strict: false });
  }
}

function defaultAssetManagerSettings(env: Partial<AssetManagerEnv>): AssetManagerSettingsValues {
  return {
    domainRestrictionsEnabled: env.ASSET_MANAGER_DOMAIN_RESTRICTIONS_ENABLED === "true",
    allowedAssetOrigins: normalizeAssetOrigins(env.ASSET_MANAGER_ALLOWED_ASSET_ORIGINS || "", {
      strict: false,
    }),
    allowDirectAssetAccess: env.ASSET_MANAGER_ALLOW_DIRECT_ASSET_ACCESS === "true",
    defaultCopiedLinkType: envAssetLinkType(env.ASSET_MANAGER_DEFAULT_COPIED_LINK_TYPE),
    defaultSnippetUrlType: envAssetLinkType(env.ASSET_MANAGER_DEFAULT_SNIPPET_URL_TYPE),
  };
}

function assetManagerSettingsLocks(env: Partial<AssetManagerEnv>): AssetManagerSettingsLocks {
  const domainSettings = env.ASSET_MANAGER_DOMAIN_SETTINGS_LOCKED === "true";
  const cacheBehaviorSettings = env.ASSET_MANAGER_CACHE_BEHAVIOR_SETTINGS_LOCKED === "true";

  return {
    domainSettings,
    cacheBehaviorSettings,
    domainRestrictionsEnabled: domainSettings,
    allowedAssetOrigins: domainSettings,
    allowDirectAssetAccess: domainSettings,
    defaultCopiedLinkType: cacheBehaviorSettings,
    defaultSnippetUrlType: cacheBehaviorSettings,
  };
}

function hasStoredSetting(
  settings: Partial<Record<SettingKey, unknown>>,
  key: SettingKey,
) {
  return Object.prototype.hasOwnProperty.call(settings, key);
}

function resolveAssetManagerSettings(
  defaults: AssetManagerSettingsValues,
  stored: Partial<Record<SettingKey, unknown>>,
  locks: AssetManagerSettingsLocks,
): AssetManagerSettingsValues {
  const domainRestrictionsEnabled = locks.domainRestrictionsEnabled
    ? defaults.domainRestrictionsEnabled
    : hasStoredSetting(stored, "domainRestrictionsEnabled")
    ? stored.domainRestrictionsEnabled === true
    : defaults.domainRestrictionsEnabled;
  const allowDirectAssetAccess = locks.allowDirectAssetAccess
    ? defaults.allowDirectAssetAccess
    : hasStoredSetting(stored, "allowDirectAssetAccess")
    ? stored.allowDirectAssetAccess === true
    : defaults.allowDirectAssetAccess;
  const defaultCopiedLinkType = locks.defaultCopiedLinkType
    ? defaults.defaultCopiedLinkType
    : isAssetLinkType(stored.defaultCopiedLinkType)
    ? stored.defaultCopiedLinkType
    : defaults.defaultCopiedLinkType;
  const defaultSnippetUrlType = locks.defaultSnippetUrlType
    ? defaults.defaultSnippetUrlType
    : isAssetLinkType(stored.defaultSnippetUrlType)
    ? stored.defaultSnippetUrlType
    : defaults.defaultSnippetUrlType;
  let allowedAssetOrigins = defaults.allowedAssetOrigins;

  if (!locks.allowedAssetOrigins && hasStoredSetting(stored, "allowedAssetOrigins")) {
    allowedAssetOrigins = normalizeAssetOrigins(stored.allowedAssetOrigins, { strict: false });
  }

  return {
    domainRestrictionsEnabled,
    allowedAssetOrigins,
    allowDirectAssetAccess,
    defaultCopiedLinkType,
    defaultSnippetUrlType,
  };
}

export function validateAssetManagerSettingsPatch(
  value: unknown,
): Partial<AssetManagerSettingsValues> {
  if (!isRecord(value)) {
    throw new Error("Settings payload must be an object.");
  }

  const patch: Partial<AssetManagerSettingsValues> = {};

  if ("domainRestrictionsEnabled" in value) {
    if (typeof value.domainRestrictionsEnabled !== "boolean") {
      throw new Error("Domain restrictions setting must be true or false.");
    }
    patch.domainRestrictionsEnabled = value.domainRestrictionsEnabled;
  }

  if ("allowedAssetOrigins" in value) {
    patch.allowedAssetOrigins = normalizeAssetOrigins(value.allowedAssetOrigins, { strict: true });
  }

  if ("allowDirectAssetAccess" in value) {
    if (typeof value.allowDirectAssetAccess !== "boolean") {
      throw new Error("Direct asset access setting must be true or false.");
    }
    patch.allowDirectAssetAccess = value.allowDirectAssetAccess;
  }

  if ("defaultCopiedLinkType" in value) {
    if (!isAssetLinkType(value.defaultCopiedLinkType)) {
      throw new Error("Default copied link type must be stable or fresh.");
    }
    patch.defaultCopiedLinkType = value.defaultCopiedLinkType;
  }

  if ("defaultSnippetUrlType" in value) {
    if (!isAssetLinkType(value.defaultSnippetUrlType)) {
      throw new Error("Default snippet URL type must be stable or fresh.");
    }
    patch.defaultSnippetUrlType = value.defaultSnippetUrlType;
  }

  return patch;
}

async function applyAssetSchema(db: D1Database) {
  const statements = SCHEMA_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await db.batch(statements.map((statement) => db.prepare(statement)));

  const columnRows = await db.prepare("PRAGMA table_info(assets)").all<{ name: string }>();
  const existingColumns = new Set((columnRows.results || []).map((row) => row.name));
  const missingColumns = ASSET_COLUMN_MIGRATIONS.filter(
    ([column]) => !existingColumns.has(column),
  );

  if (missingColumns.length) {
    await addMissingAssetColumns(db, missingColumns);
  }

  await db.prepare("UPDATE assets SET slug = id WHERE slug IS NULL OR slug = ''").run();
  await db.batch(POST_SCHEMA_INDEX_SQL.map((statement) => db.prepare(statement)));
}

async function addMissingAssetColumns(db: D1Database, migrations: readonly AssetColumnMigration[]) {
  try {
    await db.batch(migrations.map(([, statement]) => db.prepare(statement)));
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }

    for (const [, statement] of migrations) {
      try {
        await db.prepare(statement).run();
      } catch (migrationError) {
        if (!isDuplicateColumnError(migrationError)) {
          throw migrationError;
        }
      }
    }
  }
}

function isDuplicateColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("duplicate column");
}

export async function ensureAssetSchema(db: D1Database) {
  const existing = assetSchemaReady.get(db) || sharedAssetSchemaReady;
  if (existing) {
    return existing;
  }

  const ready = applyAssetSchema(db).catch((error) => {
    assetSchemaReady.delete(db);
    if (sharedAssetSchemaReady === ready) {
      sharedAssetSchemaReady = null;
    }
    throw error;
  });
  assetSchemaReady.set(db, ready);
  sharedAssetSchemaReady = ready;

  return ready;
}

export async function getAssetManagerSettings(
  env: Partial<AssetManagerEnv> & { ASSET_INDEX: D1Database },
): Promise<AssetManagerSettings> {
  await ensureAssetSchema(env.ASSET_INDEX);

  const rows = await env.ASSET_INDEX.prepare("SELECT key, value FROM asset_manager_settings").all<{
    key: string;
    value: string;
  }>();
  const stored: Partial<Record<SettingKey, unknown>> = {};

  for (const row of rows.results || []) {
    if (!SETTING_KEY_SET.has(row.key)) continue;

    try {
      stored[row.key as SettingKey] = JSON.parse(row.value);
    } catch {
      // Ignore malformed stored settings and fall back to environment defaults.
    }
  }

  const locks = assetManagerSettingsLocks(env);

  return {
    ...resolveAssetManagerSettings(defaultAssetManagerSettings(env), stored, locks),
    locks,
  };
}

export async function updateAssetManagerSettings(
  env: Partial<AssetManagerEnv> & { ASSET_INDEX: D1Database },
  value: unknown,
) {
  const patch = validateAssetManagerSettingsPatch(value);
  const entries = Object.entries(patch) as Array<[SettingKey, unknown]>;

  if (!entries.length) {
    return getAssetManagerSettings(env);
  }

  const locks = assetManagerSettingsLocks(env);
  const lockedKey = entries.find(([key]) => locks[key])?.[0];

  if (lockedKey) {
    throw new Error("This setting is managed in environment configuration.");
  }

  await ensureAssetSchema(env.ASSET_INDEX);
  const updatedAt = new Date().toISOString();

  await env.ASSET_INDEX.batch(
    entries.map(([key, settingValue]) =>
      env.ASSET_INDEX.prepare(
        `INSERT INTO asset_manager_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      ).bind(key, JSON.stringify(settingValue), updatedAt),
    ),
  );

  return getAssetManagerSettings(env);
}

export function getUploadBaseUrl(request: Request, env: Partial<AssetManagerEnv>) {
  const origin = new URL(request.url).origin;
  const prefix = env.ASSETS_PREFIX?.replace(/\/$/, "");
  return `${prefix || origin}${APP_BASE_PATH}`;
}

export async function runtimeConfig(
  request: Request,
  env: Partial<AssetManagerEnv> & { ASSET_INDEX: D1Database },
) {
  return {
    appBasePath: APP_BASE_PATH,
    uploadBaseUrl: getUploadBaseUrl(request, env),
    directUploadLimitBytes: DIRECT_UPLOAD_LIMIT_BYTES,
    multipartPartSizeBytes: MULTIPART_PART_SIZE_BYTES,
    maxMultipartUploadBytes: MAX_MULTIPART_UPLOAD_BYTES,
    settings: await getAssetManagerSettings(env),
    access: {
      interfaceAuthEnabled: accessFlag(
        env.ASSET_MANAGER_AUTH_ENABLED,
        "ASSET_MANAGER_AUTH_ENABLED",
      ),
      assetDeliveryAuthEnabled: accessFlag(
        env.ASSET_MANAGER_PROTECT_ASSET_DELIVERY,
        "ASSET_MANAGER_PROTECT_ASSET_DELIVERY",
      ),
      source: "environment" as const,
      adapterPath: "src/lib/auth.ts" as const,
    },
    authUi: getAssetManagerAuthUi(env),
  };
}

export function fileExtension(filename: string) {
  const cleanName = filename.split(/[\\/]/).pop() || "";
  const dotIndex = cleanName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === cleanName.length - 1) {
    return "";
  }

  return cleanName
    .slice(dotIndex)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
}

export function createObjectKey(id: string, filename: string) {
  return `${OBJECT_KEY_PREFIX}/${id}${fileExtension(filename)}`;
}

function splitSlugExtension(slug: string) {
  const dotIndex = slug.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === slug.length - 1) {
    return { base: slug, extension: "" };
  }

  return {
    base: slug.slice(0, dotIndex),
    extension: slug.slice(dotIndex),
  };
}

function fitSlugLength(slug: string) {
  if (slug.length <= MAX_ASSET_SLUG_LENGTH) {
    return slug;
  }

  const { base, extension } = splitSlugExtension(slug);
  const maxBaseLength = Math.max(MAX_ASSET_SLUG_LENGTH - extension.length, 1);
  const trimmedBase = base.slice(0, maxBaseLength).replace(/[._-]+$/g, "") || "asset";

  return `${trimmedBase}${extension}`.slice(0, MAX_ASSET_SLUG_LENGTH);
}

export function normalizeAssetSlug(value: unknown) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");

  if (!slug) {
    throw new Error("URL slug must include at least one letter or number.");
  }

  return fitSlugLength(slug);
}

function slugWithSuffix(slug: string, suffix: string) {
  const { base, extension } = splitSlugExtension(slug);
  const maxBaseLength = Math.max(
    MAX_ASSET_SLUG_LENGTH - suffix.length - extension.length - 1,
    1,
  );
  const trimmedBase = base.slice(0, maxBaseLength).replace(/[._-]+$/g, "") || "asset";

  return `${trimmedBase}-${suffix}${extension}`;
}

async function assetSlugAvailable(
  env: AssetManagerEnv,
  slug: string,
  options: { excludeId?: string } = {},
) {
  await ensureAssetSchema(env.ASSET_INDEX);

  const row = options.excludeId
    ? await env.ASSET_INDEX.prepare("SELECT id FROM assets WHERE slug = ? AND id != ?")
        .bind(slug, options.excludeId)
        .first<{ id: string }>()
    : await env.ASSET_INDEX.prepare("SELECT id FROM assets WHERE slug = ?")
        .bind(slug)
        .first<{ id: string }>();

  return !row;
}

export async function createUniqueAssetSlug(env: AssetManagerEnv, filename: string) {
  const baseSlug = normalizeAssetSlug(filename);

  if (await assetSlugAvailable(env, baseSlug)) {
    return baseSlug;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const candidate = slugWithSuffix(baseSlug, suffix);

    if (await assetSlugAvailable(env, candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not create a unique URL slug for this asset.");
}

export async function validateUniqueAssetSlug(
  env: AssetManagerEnv,
  value: unknown,
  options: { excludeId?: string } = {},
) {
  const slug = normalizeAssetSlug(value);

  if (!(await assetSlugAvailable(env, slug, options))) {
    throw new Error("That URL slug is already used by another asset.");
  }

  return slug;
}

export type ThumbnailVariant = "tiny" | "medium";

export function createThumbnailKey(id: string, variant: ThumbnailVariant) {
  return `${THUMBNAIL_OBJECT_PREFIX}${id}-${variant}.webp`;
}

function isThumbnailObjectKey(key: string) {
  return key.startsWith(THUMBNAIL_OBJECT_PREFIX);
}

export function validateDisplayName(value: unknown) {
  const displayName = String(value || "").trim();

  if (!displayName) {
    throw new Error("Add a name before uploading the asset.");
  }

  if (displayName.length > 160) {
    throw new Error("Asset names must be 160 characters or fewer.");
  }

  return displayName;
}

export function validateFileName(value: unknown) {
  const filename = String(value || "").split(/[\\/]/).pop()?.trim() || "";

  if (!filename) {
    throw new Error("Choose a file before uploading.");
  }

  return filename;
}

export function validateFileSize(size: number, mode: "direct" | "multipart") {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Choose a file that is larger than 0 bytes.");
  }

  if (mode === "direct" && size > DIRECT_UPLOAD_LIMIT_BYTES) {
    throw new Error("This file is too large for direct upload. Use multipart upload instead.");
  }

  if (size > MAX_MULTIPART_UPLOAD_BYTES) {
    throw new Error("This file is larger than the 5 GiB multipart upload limit for this MVP.");
  }
}

export function contentTypeFor(fileType: unknown) {
  return String(fileType || "application/octet-stream").trim() || "application/octet-stream";
}

export function validateThumbnailFile(file: File) {
  const contentType = contentTypeFor(file.type);

  if (!contentType.startsWith("image/")) {
    throw new Error("Thumbnail must be an image file.");
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("Thumbnail file is empty.");
  }

  if (file.size > 512 * 1024) {
    throw new Error("Thumbnail must be 512 KB or smaller.");
  }

  return contentType;
}

export function validateContentSha256(value: unknown) {
  const hash = String(value || "").trim().toLowerCase();

  if (!hash) {
    return null;
  }

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("Content hash must be a SHA-256 hex digest.");
  }

  return hash;
}

export function validateFolder(value: unknown) {
  const folder = String(value || "")
    .trim()
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ");

  if (!folder) {
    return null;
  }

  if (folder.length > 80) {
    throw new Error("Folders must be 80 characters or fewer.");
  }

  return folder;
}

export function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value.flatMap((tag) => String(tag).split(","))
    : String(value || "").split(",");

  const tags = rawTags
    .map((tag) =>
      tag
        .trim()
        .toLowerCase()
        .replace(/^#+/, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]/g, ""),
    )
    .filter(Boolean);

  const uniqueTags = Array.from(new Set(tags)).slice(0, 20);

  for (const tag of uniqueTags) {
    if (tag.length > 40) {
      throw new Error("Tags must be 40 characters or fewer.");
    }
  }

  return uniqueTags;
}

export function tagsToInput(tags: string[]) {
  return tags.join(", ");
}

export function validateCachePolicy(value: unknown): CachePolicy {
  if (value === "immutable" || value === "no-store" || value === "balanced") {
    return value;
  }

  return DEFAULT_CACHE_POLICY;
}

export function cacheControlFor(policy: CachePolicy) {
  if (policy === "immutable") {
    return "public, max-age=31536000, immutable";
  }

  if (policy === "no-store") {
    return "no-store";
  }

  return "public, max-age=300, must-revalidate";
}

function tagsFromTagList(value: string | null | undefined) {
  return value ? value.split(",").filter(Boolean) : [];
}

export function assetKind(contentType: string, filename: string): Asset["kind"] {
  const lowerType = contentType.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerType.startsWith("image/")) return "image";
  if (lowerType.startsWith("video/")) return "video";
  if (lowerType === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (
    lowerType.includes("model") ||
    [".glb", ".gltf", ".obj", ".fbx", ".stl", ".usdz"].some((ext) => lowerName.endsWith(ext))
  ) {
    return "model";
  }
  if (lowerType.startsWith("text/") || lowerType.includes("json") || lowerType.includes("xml")) {
    return "text";
  }
  if ([".zip", ".tar", ".gz", ".rar", ".7z"].some((ext) => lowerName.endsWith(ext))) {
    return "archive";
  }
  return "file";
}

export function validateReplacementAsset(
  row: AssetRow,
  originalFilename: string,
  contentType: string,
) {
  if (row.deleted_at) {
    throw new Error("Restore this asset before replacing its file.");
  }

  if (row.status !== "ready") {
    throw new Error("Only ready assets can be replaced.");
  }

  const currentKind = assetKind(row.content_type, row.original_filename);
  const replacementKind = assetKind(contentType, originalFilename);

  if (currentKind !== replacementKind) {
    throw new Error(
      `Replacement must be another ${currentKind} asset. This file looks like ${replacementKind}.`,
    );
  }

  return replacementKind;
}

export function objectMetadataForAsset(
  row: AssetRow,
  originalFilename: string,
  contentSha256?: string | null,
) {
  const tags = tagsFromTagList(row.tag_list);

  return {
    assetId: row.id,
    displayName: row.display_name,
    originalFilename,
    ...(row.folder ? { folder: row.folder } : {}),
    ...(tags.length ? { tags: tags.join(",") } : {}),
    cachePolicy: row.cache_policy,
    ...(contentSha256 ? { contentSha256 } : {}),
  };
}

function thumbnailUrl(
  origin: string,
  row: AssetRow,
  variant: ThumbnailVariant,
  thumbnailVersion: string,
) {
  const hasVariant =
    variant === "tiny" ? Boolean(row.thumbnail_tiny_key) : Boolean(row.thumbnail_medium_key);
  const hasLegacyFallback = Boolean(row.thumbnail_key);

  if (row.deleted_at || (!hasVariant && !hasLegacyFallback)) {
    return null;
  }

  const params = new URLSearchParams({
    size: variant,
    v: thumbnailVersion,
  });

  return `${origin}${APP_BASE_PATH}/thumbnails/${encodeURIComponent(row.id)}?${params.toString()}`;
}

function thumbnailKeysFor(
  row: Partial<Pick<AssetRow, "thumbnail_key" | "thumbnail_tiny_key" | "thumbnail_medium_key">>,
) {
  return [row.thumbnail_key, row.thumbnail_tiny_key, row.thumbnail_medium_key].filter(
    (key): key is string => Boolean(key),
  );
}

export async function putThumbnailObject(
  env: AssetManagerEnv,
  key: string,
  value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
  options?: R2PutOptions,
) {
  const object = await env.CLOUD_ASSET_THUMBNAILS.put(key, value, options);
  // Once a thumbnail has been regenerated in the split bucket, remove the legacy same-key copy.
  await env.CLOUD_ASSETS.delete(key).catch(() => undefined);
  return object;
}

export async function headThumbnailObject(env: AssetManagerEnv, key: string) {
  return (await env.CLOUD_ASSET_THUMBNAILS.head(key)) || env.CLOUD_ASSETS.head(key);
}

export async function getThumbnailObject(env: AssetManagerEnv, key: string) {
  return (await env.CLOUD_ASSET_THUMBNAILS.get(key)) || env.CLOUD_ASSETS.get(key);
}

export async function deleteThumbnailObjects(env: AssetManagerEnv, keys: string[]) {
  if (!keys.length) return;

  await Promise.all([env.CLOUD_ASSET_THUMBNAILS.delete(keys), env.CLOUD_ASSETS.delete(keys)]);
}

export function rowToAsset(row: AssetRow, request: Request): Asset {
  const origin = new URL(request.url).origin;
  const cacheVersion = row.cache_version || 1;
  const stableUrl = assetStableUrl(row.slug || row.id, origin);
  const allowedOrigins = storedAssetAllowedOrigins(row.allowed_origins);
  const thumbnailVersion =
    row.thumbnail_medium_updated_at ||
    row.thumbnail_tiny_updated_at ||
    row.thumbnail_updated_at ||
    row.updated_at;
  const tinyThumbnailUrl = thumbnailUrl(origin, row, "tiny", thumbnailVersion);
  const mediumThumbnailUrl = thumbnailUrl(origin, row, "medium", thumbnailVersion);

  return {
    id: row.id,
    slug: row.slug || row.id,
    objectKey: row.object_key,
    displayName: row.display_name,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    etag: row.etag,
    contentSha256: row.content_sha256,
    thumbnailUrl: mediumThumbnailUrl,
    tinyThumbnailUrl,
    mediumThumbnailUrl,
    folder: row.folder,
    tags: tagsFromTagList(row.tag_list),
    cachePolicy: row.cache_policy || DEFAULT_CACHE_POLICY,
    cacheVersion,
    allowedOrigins,
    inheritAllowedOrigins: row.inherit_allowed_origins !== 0,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deleteAfter: row.delete_after,
    status: row.status,
    url: stableUrl,
    cacheBustedUrl: assetCacheBustedUrl(row.slug || row.id, cacheVersion, origin),
    kind: assetKind(row.content_type, row.original_filename),
  };
}

export async function updateAssetFileMetadata(
  env: AssetManagerEnv,
  row: Pick<AssetRow, "id"> &
    Partial<Pick<AssetRow, "thumbnail_key" | "thumbnail_tiny_key" | "thumbnail_medium_key">>,
  file: {
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    etag: string | null;
    contentSha256?: string | null;
    updatedAt?: string;
  },
) {
  const updatedAt = file.updatedAt || new Date().toISOString();

  const thumbnailKeys = thumbnailKeysFor(row);
  if (thumbnailKeys.length) {
    await deleteThumbnailObjects(env, thumbnailKeys);
  }

  await env.ASSET_INDEX.prepare(
    `UPDATE assets
     SET original_filename = ?,
         content_type = ?,
         size_bytes = ?,
         etag = ?,
         content_sha256 = ?,
         thumbnail_key = NULL,
         thumbnail_content_type = NULL,
         thumbnail_size_bytes = NULL,
         thumbnail_etag = NULL,
         thumbnail_updated_at = NULL,
         thumbnail_tiny_key = NULL,
         thumbnail_tiny_content_type = NULL,
         thumbnail_tiny_size_bytes = NULL,
         thumbnail_tiny_etag = NULL,
         thumbnail_tiny_updated_at = NULL,
         thumbnail_medium_key = NULL,
         thumbnail_medium_content_type = NULL,
         thumbnail_medium_size_bytes = NULL,
         thumbnail_medium_etag = NULL,
         thumbnail_medium_updated_at = NULL,
         cache_version = cache_version + 1,
         updated_at = ?,
         status = 'ready'
     WHERE id = ?`,
  )
    .bind(
      file.originalFilename,
      file.contentType,
      file.sizeBytes,
      file.etag,
      file.contentSha256 || null,
      updatedAt,
      row.id,
    )
    .run();

  return getAssetById(env, row.id);
}

export async function putAssetThumbnails(
  env: AssetManagerEnv,
  row: AssetRow,
  files: Partial<Record<ThumbnailVariant, File>>,
) {
  const kind = assetKind(row.content_type, row.original_filename);

  if (!THUMBNAIL_SOURCE_KINDS.includes(kind)) {
    throw new Error("Only image, PDF, and video assets can have thumbnails.");
  }

  if (row.deleted_at) {
    throw new Error("Restore this asset before updating its thumbnail.");
  }

  const variants = (["tiny", "medium"] as const).filter((variant) => files[variant]);
  if (!variants.length) {
    throw new Error("Choose a thumbnail file.");
  }

  const updates: Record<
    ThumbnailVariant,
    {
      key: string;
      contentType: string;
      sizeBytes: number;
      etag: string | null;
      updatedAt: string;
    }
  > = {} as Record<
    ThumbnailVariant,
    {
      key: string;
      contentType: string;
      sizeBytes: number;
      etag: string | null;
      updatedAt: string;
    }
  >;

  for (const variant of variants) {
    const file = files[variant];
    if (!file) continue;

    const contentType = validateThumbnailFile(file);
    const thumbnailKey = createThumbnailKey(row.id, variant);
    const object = await putThumbnailObject(env, thumbnailKey, await file.arrayBuffer(), {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        assetId: row.id,
        sourceObjectKey: row.object_key,
        purpose: `${variant}-thumbnail`,
      },
    });

    if (!object) {
      throw new Error("Thumbnail upload failed before the file was stored.");
    }

    updates[variant] = {
      key: thumbnailKey,
      contentType,
      sizeBytes: file.size,
      etag: object.httpEtag || object.etag || null,
      updatedAt: object.uploaded?.toISOString?.() || new Date().toISOString(),
    };
  }

  const tiny = updates.tiny;
  const medium = updates.medium;
  const updatedAt = medium?.updatedAt || tiny?.updatedAt || new Date().toISOString();
  await env.ASSET_INDEX.prepare(
    `UPDATE assets
     SET thumbnail_tiny_key = COALESCE(?, thumbnail_tiny_key),
         thumbnail_tiny_content_type = COALESCE(?, thumbnail_tiny_content_type),
         thumbnail_tiny_size_bytes = COALESCE(?, thumbnail_tiny_size_bytes),
         thumbnail_tiny_etag = COALESCE(?, thumbnail_tiny_etag),
         thumbnail_tiny_updated_at = COALESCE(?, thumbnail_tiny_updated_at),
         thumbnail_medium_key = COALESCE(?, thumbnail_medium_key),
         thumbnail_medium_content_type = COALESCE(?, thumbnail_medium_content_type),
         thumbnail_medium_size_bytes = COALESCE(?, thumbnail_medium_size_bytes),
         thumbnail_medium_etag = COALESCE(?, thumbnail_medium_etag),
         thumbnail_medium_updated_at = COALESCE(?, thumbnail_medium_updated_at),
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      tiny?.key || null,
      tiny?.contentType || null,
      tiny?.sizeBytes || null,
      tiny?.etag || null,
      tiny?.updatedAt || null,
      medium?.key || null,
      medium?.contentType || null,
      medium?.sizeBytes || null,
      medium?.etag || null,
      medium?.updatedAt || null,
      updatedAt,
      row.id,
    )
    .run();

  return getAssetById(env, row.id);
}

export async function hashObjectKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function pruneIndexedThumbnailObjects(env: AssetManagerEnv) {
  for (let batch = 0; batch < 20; batch += 1) {
    const indexedThumbnails = await env.ASSET_INDEX.prepare(
      `SELECT id
       FROM assets
       WHERE object_key LIKE ?
       LIMIT 200`,
    )
      .bind(`${THUMBNAIL_OBJECT_PREFIX}%`)
      .all<{ id: string }>();
    const rows = indexedThumbnails.results || [];

    if (!rows.length) return;

    await env.ASSET_INDEX.batch(
      rows.map((row) =>
        env.ASSET_INDEX.prepare("DELETE FROM asset_tags WHERE asset_id = ?").bind(row.id),
      ),
    );
    await env.ASSET_INDEX.batch(
      rows.map((row) => env.ASSET_INDEX.prepare("DELETE FROM assets WHERE id = ?").bind(row.id)),
    );
  }
}

export async function reconcileBucketObjects(env: AssetManagerEnv) {
  await pruneIndexedThumbnailObjects(env);

  const listed = await env.CLOUD_ASSETS.list({ limit: 200 });
  const objects = listed.objects.filter((object) => !isThumbnailObjectKey(object.key));
  const existingKeys = await existingAssetObjectKeys(env, objects.map((object) => object.key));
  const now = new Date().toISOString();

  for (const object of objects) {
    if (existingKeys.has(object.key)) {
      continue;
    }

    const keyPart = object.key.split("/").pop() || object.key;
    const keyWithoutExtension = keyPart.replace(/\.[^.]+$/, "");
    const id = object.key.startsWith(`${OBJECT_KEY_PREFIX}/`)
      ? keyWithoutExtension
      : `r2-${await hashObjectKey(object.key)}`;
    const slug = await createUniqueAssetSlug(env, keyPart || object.key);

    await env.ASSET_INDEX.prepare(
      `INSERT OR IGNORE INTO assets (
        id,
        slug,
        object_key,
        display_name,
        original_filename,
        content_type,
        size_bytes,
        etag,
        folder,
        cache_policy,
        uploaded_at,
        updated_at,
        deleted_at,
        delete_after,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'balanced', ?, ?, NULL, NULL, 'ready')`,
    )
      .bind(
        id,
        slug,
        object.key,
        keyPart || "Untitled asset",
        keyPart || object.key,
        "application/octet-stream",
        object.size,
        object.etag || object.httpEtag || null,
        object.uploaded?.toISOString?.() || now,
        now,
      )
      .run();
  }

  return listed.truncated;
}

async function existingAssetObjectKeys(env: AssetManagerEnv, objectKeys: string[]) {
  if (!objectKeys.length) {
    return new Set<string>();
  }

  const placeholders = objectKeys.map(() => "?").join(", ");
  const rows = await env.ASSET_INDEX.prepare(
    `SELECT object_key
     FROM assets
     WHERE object_key IN (${placeholders})`,
  )
    .bind(...objectKeys)
    .all<{ object_key: string }>();

  return new Set((rows.results || []).map((row) => row.object_key));
}

function assetMaintenanceState(db: D1Database) {
  let state = maintenanceState.get(db);
  if (!state) {
    state = sharedMaintenanceState;
    maintenanceState.set(db, state);
  }

  return state;
}

async function maybePurgeExpiredDeletedAssets(env: AssetManagerEnv) {
  const state = assetMaintenanceState(env.ASSET_INDEX);
  const now = Date.now();
  if (now - state.purgeAt < PURGE_EXPIRED_DELETED_INTERVAL_MS) {
    return;
  }

  await purgeExpiredDeletedAssets(env);
  state.purgeAt = Date.now();
}

async function maybeReconcileBucketObjects(env: AssetManagerEnv, shouldRun: boolean) {
  if (!shouldRun) {
    return false;
  }

  const state = assetMaintenanceState(env.ASSET_INDEX);
  const now = Date.now();
  if (now - state.reconcileAt < RECONCILE_BUCKET_INTERVAL_MS) {
    return false;
  }

  const truncated = await reconcileBucketObjects(env);
  state.reconcileAt = Date.now();

  return truncated;
}

async function tagsForAssetIds(env: AssetManagerEnv, assetIds: string[]) {
  if (!assetIds.length) {
    return new Map<string, string[]>();
  }

  const placeholders = assetIds.map(() => "?").join(", ");
  const result = await env.ASSET_INDEX.prepare(
    `SELECT asset_id, tag
     FROM asset_tags
     WHERE asset_id IN (${placeholders})
     ORDER BY asset_id, tag`,
  )
    .bind(...assetIds)
    .all<{ asset_id: string; tag: string }>();
  const tags = new Map<string, string[]>();

  for (const row of result.results || []) {
    const current = tags.get(row.asset_id);
    if (current) {
      current.push(row.tag);
    } else {
      tags.set(row.asset_id, [row.tag]);
    }
  }

  return tags;
}

export async function listAssets(env: AssetManagerEnv, request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const folder = validateFolder(url.searchParams.get("folder")) || "";
  const selectedTags = normalizeTags(url.searchParams.getAll("tag"));
  const tag = selectedTags[0] || "";
  const trash = url.searchParams.get("trash") === "1" || url.searchParams.get("trash") === "true";
  const includeFacets = url.searchParams.get("facets") !== "0";
  const requestedPage = Math.floor(Number(url.searchParams.get("page") || 1));
  const requestedLimit = Math.floor(Number(url.searchParams.get("limit") || 24));
  const pageSize = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 24, 1), 100);

  await ensureAssetSchema(env.ASSET_INDEX);
  await maybePurgeExpiredDeletedAssets(env);
  const shouldReconcile =
    !trash &&
    !query &&
    !folder &&
    selectedTags.length === 0 &&
    (!Number.isFinite(requestedPage) || requestedPage <= 1);
  const truncated = await maybeReconcileBucketObjects(env, shouldReconcile);

  const where = ["assets.status = 'ready'", trash ? "assets.deleted_at IS NOT NULL" : "assets.deleted_at IS NULL"];
  const binds: (string | number)[] = [];
  const searchTerm = `%${query.toLowerCase()}%`;

  if (query) {
    where.push(
      `(lower(assets.display_name) LIKE ?
        OR lower(assets.original_filename) LIKE ?
        OR lower(assets.slug) LIKE ?
        OR lower(assets.content_type) LIKE ?
        OR lower(COALESCE(assets.folder, '')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM asset_tags search_tags
          WHERE search_tags.asset_id = assets.id AND lower(search_tags.tag) LIKE ?
        ))`,
    );
    binds.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (folder) {
    where.push("assets.folder = ?");
    binds.push(folder);
  }

  for (const selectedTag of selectedTags) {
    where.push(
      `EXISTS (
        SELECT 1 FROM asset_tags filter_tags
        WHERE filter_tags.asset_id = assets.id AND filter_tags.tag = ?
      )`,
    );
    binds.push(selectedTag);
  }

  const whereSql = where.join(" AND ");

  const summaryStatements = [
    env.ASSET_INDEX.prepare(
      `SELECT COUNT(*) as total
       FROM assets
       WHERE ${whereSql}`,
    ).bind(...binds),
  ];

  if (includeFacets) {
    summaryStatements.push(
      env.ASSET_INDEX.prepare(
        `SELECT DISTINCT folder
         FROM assets
         WHERE status = 'ready'
           AND ${trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"}
           AND folder IS NOT NULL
           AND folder != ''
         ORDER BY lower(folder)`,
      ),
      env.ASSET_INDEX.prepare(
        `SELECT DISTINCT asset_tags.tag
         FROM asset_tags
         INNER JOIN assets ON assets.id = asset_tags.asset_id
         WHERE assets.status = 'ready'
           AND ${trash ? "assets.deleted_at IS NOT NULL" : "assets.deleted_at IS NULL"}
         ORDER BY lower(asset_tags.tag)`,
      ),
    );
  }

  const [countResult, foldersResult, tagsResult] = await env.ASSET_INDEX.batch(summaryStatements);
  const countRows = (countResult as D1Result<{ total: number }>).results || [];
  const total = countRows[0]?.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const page =
    totalPages > 0
      ? Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages)
      : 1;
  const offset = totalPages > 0 ? (page - 1) * pageSize : 0;

  const result = await env.ASSET_INDEX.prepare(
    `SELECT ${assetColumnSelect("assets")}
     FROM assets
     WHERE ${whereSql}
     ORDER BY ${trash ? "assets.deleted_at" : "assets.uploaded_at"} DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all<AssetRow>();
  const rows = result.results || [];
  const tagsByAssetId = await tagsForAssetIds(
    env,
    rows.map((row) => row.id),
  );
  const assets = rows.map((row) =>
    rowToAsset(
      {
        ...row,
        tag_list: (tagsByAssetId.get(row.id) || []).join(","),
      },
      request,
    ),
  );
  const response = {
    assets,
    total,
    page,
    pageSize,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: totalPages > 0 && page < totalPages,
    query,
    folder,
    tag,
    trash,
    retentionDays: TRASH_RETENTION_DAYS,
    truncated,
    uploadBaseUrl: getUploadBaseUrl(request, env),
  };

  if (!includeFacets) {
    return response;
  }

  return {
    ...response,
    folders: ((foldersResult as D1Result<{ folder: string }>).results || []).map(
      (row) => row.folder,
    ),
    tags: ((tagsResult as D1Result<{ tag: string }>).results || []).map((row) => row.tag),
  };
}

export async function findDuplicateAssets(
  env: AssetManagerEnv,
  contentSha256: string,
  limit = 5,
) {
  await ensureAssetSchema(env.ASSET_INDEX);

  const result = await env.ASSET_INDEX.prepare(
    `SELECT ${assetSelect("assets")}
     FROM assets
     LEFT JOIN asset_tags ON asset_tags.asset_id = assets.id
     WHERE assets.status = 'ready'
       AND assets.content_sha256 = ?
     GROUP BY assets.id
     ORDER BY assets.deleted_at IS NOT NULL ASC, datetime(assets.uploaded_at) DESC
     LIMIT ?`,
  )
    .bind(contentSha256, Math.min(Math.max(limit, 1), 20))
    .all<AssetRow>();

  return result.results || [];
}

type UsageAssetRow = Pick<
  AssetRow,
  | "id"
  | "display_name"
  | "original_filename"
  | "content_type"
  | "size_bytes"
  | "uploaded_at"
  | "updated_at"
  | "deleted_at"
  | "status"
>;
type UsageAggregateRow = Pick<
  AssetRow,
  "original_filename" | "content_type" | "size_bytes" | "deleted_at"
>;

function emptyUsageByKind() {
  return Object.fromEntries(
    USAGE_KINDS.map((kind) => [
      kind,
      {
        kind,
        count: 0,
        bytes: 0,
        percentBytes: 0,
      },
    ]),
  ) as AssetUsageResponse["byKind"];
}

function rowToUsageItem(row: UsageAssetRow): AssetUsageItem {
  return {
    id: row.id,
    displayName: row.display_name,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes || 0),
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    status: row.status,
    kind: assetKind(row.content_type, row.original_filename),
  };
}

function storagePlanUsage(totalBytes: number, env: Partial<AssetManagerEnv>) {
  const label = (env.STORAGE_PLAN_LABEL || "").trim() || null;
  const configuredLimit = Number(env.STORAGE_PLAN_LIMIT_BYTES || 0);
  const limitBytes =
    Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.floor(configuredLimit)
      : null;
  const percentUsed = limitBytes ? (totalBytes / limitBytes) * 100 : null;

  return {
    label,
    limitBytes,
    percentUsed,
    isConfigured: Boolean(limitBytes),
    isOverLimit: Boolean(limitBytes && totalBytes > limitBytes),
  };
}

export async function assetUsage(env: AssetManagerEnv): Promise<AssetUsageResponse> {
  await ensureAssetSchema(env.ASSET_INDEX);
  await maybePurgeExpiredDeletedAssets(env);

  const usageItemSelect = `id,
                           display_name,
                           original_filename,
                           content_type,
                           size_bytes,
                           uploaded_at,
                           updated_at,
                           deleted_at,
                           status`;
  const [aggregateResult, largestResult, recentResult, issueResult] =
    await env.ASSET_INDEX.batch([
      env.ASSET_INDEX.prepare(
        `SELECT original_filename,
                content_type,
                size_bytes,
                deleted_at
         FROM assets
         WHERE status = 'ready'`,
      ),
      env.ASSET_INDEX.prepare(
        `SELECT ${usageItemSelect}
         FROM assets
         WHERE status = 'ready'
         ORDER BY size_bytes DESC
         LIMIT 5`,
      ),
      env.ASSET_INDEX.prepare(
        `SELECT ${usageItemSelect}
         FROM assets
         WHERE status = 'ready'
         ORDER BY uploaded_at DESC
         LIMIT 5`,
      ),
      env.ASSET_INDEX.prepare(
        `SELECT ${usageItemSelect}
         FROM assets
         WHERE status IN ('uploading', 'failed')
         ORDER BY updated_at DESC
         LIMIT 5`,
      ),
    ]);

  const aggregateRows = (aggregateResult as D1Result<UsageAggregateRow>).results || [];
  const largestFiles = ((largestResult as D1Result<UsageAssetRow>).results || []).map(
    rowToUsageItem,
  );
  const recentUploads = ((recentResult as D1Result<UsageAssetRow>).results || []).map(
    rowToUsageItem,
  );
  const uploadIssues = ((issueResult as D1Result<UsageAssetRow>).results || []).map(
    rowToUsageItem,
  );
  const byKind = emptyUsageByKind();
  let totalBytes = 0;
  let activeBytes = 0;
  let trashedBytes = 0;
  let activeCount = 0;
  let trashedCount = 0;

  for (const row of aggregateRows) {
    const sizeBytes = Number(row.size_bytes || 0);
    const kind = assetKind(row.content_type, row.original_filename);
    totalBytes += sizeBytes;
    byKind[kind].count += 1;
    byKind[kind].bytes += sizeBytes;

    if (row.deleted_at) {
      trashedBytes += sizeBytes;
      trashedCount += 1;
    } else {
      activeBytes += sizeBytes;
      activeCount += 1;
    }
  }

  for (const kind of USAGE_KINDS) {
    byKind[kind].percentBytes = totalBytes ? (byKind[kind].bytes / totalBytes) * 100 : 0;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalBytes,
    activeBytes,
    trashedBytes,
    assetCount: aggregateRows.length,
    activeCount,
    trashedCount,
    byKind,
    largestFiles,
    recentUploads,
    uploadIssues,
    storagePlan: storagePlanUsage(totalBytes, env),
    limitNotes: WEBFLOW_LIMITS.map((note) => ({ ...note })),
  };
}

export async function getAssetById(env: AssetManagerEnv, id: string) {
  await ensureAssetSchema(env.ASSET_INDEX);
  return env.ASSET_INDEX.prepare(
    `SELECT ${assetSelect("assets")}
     FROM assets
     LEFT JOIN asset_tags ON asset_tags.asset_id = assets.id
     WHERE assets.id = ?
     GROUP BY assets.id`,
  )
    .bind(id)
    .first<AssetRow>();
}

export async function getAssetBySlug(env: AssetManagerEnv, slug: string) {
  await ensureAssetSchema(env.ASSET_INDEX);
  return env.ASSET_INDEX.prepare(
    `SELECT ${assetSelect("assets")}
     FROM assets
     LEFT JOIN asset_tags ON asset_tags.asset_id = assets.id
     WHERE assets.slug = ?
     GROUP BY assets.id`,
  )
    .bind(slug)
    .first<AssetRow>();
}

export function deleteAfterFor(deletedAt = new Date()) {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function softDeleteAsset(env: AssetManagerEnv, id: string) {
  await ensureAssetSchema(env.ASSET_INDEX);
  const deletedAt = new Date();
  await env.ASSET_INDEX.prepare(
    `UPDATE assets
     SET deleted_at = ?, delete_after = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(deletedAt.toISOString(), deleteAfterFor(deletedAt), deletedAt.toISOString(), id)
    .run();

  return getAssetById(env, id);
}

export async function restoreAsset(env: AssetManagerEnv, id: string) {
  await ensureAssetSchema(env.ASSET_INDEX);
  await env.ASSET_INDEX.prepare(
    `UPDATE assets
     SET deleted_at = NULL, delete_after = NULL, updated_at = ?
     WHERE id = ?`,
  )
    .bind(new Date().toISOString(), id)
    .run();

  return getAssetById(env, id);
}

export async function deleteAssetPermanently(
  env: AssetManagerEnv,
  row: Pick<AssetRow, "id" | "object_key"> &
    Partial<Pick<AssetRow, "thumbnail_key" | "thumbnail_tiny_key" | "thumbnail_medium_key">>,
) {
  await env.CLOUD_ASSETS.delete(row.object_key);
  const thumbnailKeys = thumbnailKeysFor(row);
  if (thumbnailKeys.length) {
    await deleteThumbnailObjects(env, thumbnailKeys);
  }
  await env.ASSET_INDEX.prepare("DELETE FROM asset_tags WHERE asset_id = ?").bind(row.id).run();
  await env.ASSET_INDEX.prepare("DELETE FROM assets WHERE id = ?").bind(row.id).run();
}

export async function purgeExpiredDeletedAssets(env: AssetManagerEnv) {
  const now = new Date().toISOString();
  const expired = await env.ASSET_INDEX.prepare(
    `SELECT id,
            object_key,
            thumbnail_key,
            thumbnail_tiny_key,
            thumbnail_medium_key
     FROM assets
     WHERE deleted_at IS NOT NULL AND delete_after IS NOT NULL AND delete_after <= ?
     LIMIT 25`,
  )
    .bind(now)
    .all<
      Pick<
        AssetRow,
        "id" | "object_key" | "thumbnail_key" | "thumbnail_tiny_key" | "thumbnail_medium_key"
      >
    >();

  for (const row of expired.results || []) {
    await deleteAssetPermanently(env, row);
  }
}

export async function setAssetTags(env: AssetManagerEnv, assetId: string, tags: string[]) {
  await ensureAssetSchema(env.ASSET_INDEX);
  await env.ASSET_INDEX.prepare("DELETE FROM asset_tags WHERE asset_id = ?").bind(assetId).run();

  if (!tags.length) {
    return;
  }

  await env.ASSET_INDEX.batch(
    tags.map((tag) =>
      env.ASSET_INDEX.prepare(
        "INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)",
      ).bind(assetId, tag),
    ),
  );
}

export async function bulkUpdateAssets(
  env: AssetManagerEnv,
  update: {
    ids: string[];
    folder?: string | null;
    cachePolicy?: CachePolicy;
    addTags?: string[];
    removeTags?: string[];
  },
) {
  await ensureAssetSchema(env.ASSET_INDEX);

  const ids = Array.from(new Set(update.ids.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const selected = await env.ASSET_INDEX.prepare(
    `SELECT id
     FROM assets
     WHERE id IN (${placeholders})
       AND status = 'ready'
       AND deleted_at IS NULL`,
  )
    .bind(...ids)
    .all<{ id: string }>();
  const activeIds = (selected.results || []).map((row) => row.id);
  if (!activeIds.length) return [];

  const now = new Date().toISOString();
  const activePlaceholders = activeIds.map(() => "?").join(", ");
  const setClauses: string[] = [];
  const updateBinds: (string | null)[] = [];

  if (update.folder !== undefined) {
    setClauses.push("folder = ?");
    updateBinds.push(update.folder);
  }

  if (update.cachePolicy) {
    setClauses.push("cache_policy = ?");
    updateBinds.push(update.cachePolicy);
  }

  const addTags = update.addTags || [];
  const removeTags = update.removeTags || [];

  if (setClauses.length || addTags.length || removeTags.length) {
    setClauses.push("updated_at = ?");
    updateBinds.push(now);
    await env.ASSET_INDEX.prepare(
      `UPDATE assets
       SET ${setClauses.join(", ")}
       WHERE id IN (${activePlaceholders})`,
    )
      .bind(...updateBinds, ...activeIds)
      .run();
  }

  if (addTags.length) {
    await env.ASSET_INDEX.batch(
      activeIds.flatMap((id) =>
        addTags.map((tag) =>
          env.ASSET_INDEX.prepare(
            "INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)",
          ).bind(id, tag),
        ),
      ),
    );
  }

  if (removeTags.length) {
    await env.ASSET_INDEX.batch(
      activeIds.flatMap((id) =>
        removeTags.map((tag) =>
          env.ASSET_INDEX.prepare("DELETE FROM asset_tags WHERE asset_id = ? AND tag = ?").bind(
            id,
            tag,
          ),
        ),
      ),
    );
  }

  const result = await env.ASSET_INDEX.prepare(
    `SELECT ${assetSelect("assets")}
     FROM assets
     LEFT JOIN asset_tags ON asset_tags.asset_id = assets.id
     WHERE assets.id IN (${activePlaceholders})
     GROUP BY assets.id
     ORDER BY datetime(assets.uploaded_at) DESC`,
  )
    .bind(...activeIds)
    .all<AssetRow>();

  return result.results || [];
}

export type BulkActionFailure = { id: string; error: string };

export async function bulkSoftDeleteAssets(env: AssetManagerEnv, ids: string[]) {
  await ensureAssetSchema(env.ASSET_INDEX);
  const deleted: string[] = [];
  const failed: BulkActionFailure[] = [];
  for (const id of ids) {
    try {
      const row = await softDeleteAsset(env, id);
      if (row) deleted.push(id);
      else failed.push({ id, error: "Asset not found." });
    } catch (error) {
      failed.push({
        id,
        error: error instanceof Error ? error.message : "Delete failed.",
      });
    }
  }
  return { deleted, failed };
}

export async function bulkDeleteAssetsPermanently(env: AssetManagerEnv, ids: string[]) {
  await ensureAssetSchema(env.ASSET_INDEX);
  const deleted: string[] = [];
  const failed: BulkActionFailure[] = [];
  for (const id of ids) {
    try {
      const row = await getAssetById(env, id);
      if (!row) {
        failed.push({ id, error: "Asset not found." });
        continue;
      }
      await deleteAssetPermanently(env, row);
      deleted.push(id);
    } catch (error) {
      failed.push({
        id,
        error: error instanceof Error ? error.message : "Permanent delete failed.",
      });
    }
  }
  return { deleted, failed };
}

export async function bulkRestoreAssets(env: AssetManagerEnv, ids: string[]) {
  await ensureAssetSchema(env.ASSET_INDEX);
  const restored: string[] = [];
  const failed: BulkActionFailure[] = [];
  for (const id of ids) {
    try {
      const row = await restoreAsset(env, id);
      if (row) restored.push(id);
      else failed.push({ id, error: "Asset not found." });
    } catch (error) {
      failed.push({
        id,
        error: error instanceof Error ? error.message : "Restore failed.",
      });
    }
  }
  return { restored, failed };
}

export async function insertAsset(
  env: AssetManagerEnv,
  row: Omit<
    AssetRow,
    | "uploaded_at"
    | "updated_at"
    | "deleted_at"
    | "delete_after"
    | "thumbnail_key"
    | "thumbnail_content_type"
    | "thumbnail_size_bytes"
    | "thumbnail_etag"
    | "thumbnail_updated_at"
    | "thumbnail_tiny_key"
    | "thumbnail_tiny_content_type"
    | "thumbnail_tiny_size_bytes"
    | "thumbnail_tiny_etag"
    | "thumbnail_tiny_updated_at"
    | "thumbnail_medium_key"
    | "thumbnail_medium_content_type"
    | "thumbnail_medium_size_bytes"
    | "thumbnail_medium_etag"
    | "thumbnail_medium_updated_at"
    | "cache_version"
    | "allowed_origins"
    | "inherit_allowed_origins"
    | "tag_list"
  > & {
    uploaded_at?: string;
    updated_at?: string;
    tags?: string[];
    deleted_at?: string | null;
    delete_after?: string | null;
  },
) {
  const now = new Date().toISOString();
  const uploadedAt = row.uploaded_at || now;
  const updatedAt = row.updated_at || now;

  await ensureAssetSchema(env.ASSET_INDEX);
  await env.ASSET_INDEX.prepare(
    `INSERT INTO assets (
      id,
      slug,
      object_key,
      display_name,
      original_filename,
      content_type,
      size_bytes,
      etag,
      content_sha256,
      folder,
      cache_policy,
      cache_version,
      uploaded_at,
      updated_at,
      deleted_at,
      delete_after,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      display_name = excluded.display_name,
      original_filename = excluded.original_filename,
      content_type = excluded.content_type,
      size_bytes = excluded.size_bytes,
      etag = excluded.etag,
      content_sha256 = excluded.content_sha256,
      folder = excluded.folder,
      cache_policy = excluded.cache_policy,
      deleted_at = excluded.deleted_at,
      delete_after = excluded.delete_after,
      updated_at = excluded.updated_at,
      status = excluded.status`,
  )
    .bind(
      row.id,
      row.slug,
      row.object_key,
      row.display_name,
      row.original_filename,
      row.content_type,
      row.size_bytes,
      row.etag,
      row.content_sha256,
      row.folder,
      row.cache_policy,
      uploadedAt,
      updatedAt,
      row.deleted_at || null,
      row.delete_after || null,
      row.status,
    )
    .run();

  await setAssetTags(env, row.id, row.tags || []);

  return getAssetById(env, row.id);
}
