export type CachePolicy = "balanced" | "immutable" | "no-store";
export type AssetLinkType = "stable" | "fresh";

export type AssetManagerSettingsValues = {
  domainRestrictionsEnabled: boolean;
  allowedAssetOrigins: string[];
  allowDirectAssetAccess: boolean;
  defaultCopiedLinkType: AssetLinkType;
  defaultSnippetUrlType: AssetLinkType;
};

export type AssetManagerSettingsLocks = {
  domainSettings: boolean;
  cacheBehaviorSettings: boolean;
  domainRestrictionsEnabled: boolean;
  allowedAssetOrigins: boolean;
  allowDirectAssetAccess: boolean;
  defaultCopiedLinkType: boolean;
  defaultSnippetUrlType: boolean;
};

export type AssetManagerSettings = AssetManagerSettingsValues & {
  locks: AssetManagerSettingsLocks;
};

export type AssetManagerAccessStatus = {
  interfaceAuthEnabled: boolean;
  assetDeliveryAuthEnabled: boolean;
  source: "environment";
  adapterPath: "src/lib/auth.ts";
};

export type AssetManagerAuthAction = {
  label: string;
  href: string;
};

export type AssetManagerAuthUi = {
  providerLabel: string;
  signIn: AssetManagerAuthAction | null;
  signOut: AssetManagerAuthAction | null;
  account: AssetManagerAuthAction | null;
};

export type AssetManagerDemoConfig = {
  enabled: boolean;
  sessionTtlHours: number;
  maxSessionBytes: number;
  maxFileBytes: number;
  maxSessionAssets: number;
  allowedFileSummary: string;
  cleanupMode: "request-time";
};

export type AssetRow = {
  id: string;
  slug: string;
  object_key: string;
  display_name: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  etag: string | null;
  content_sha256: string | null;
  thumbnail_key: string | null;
  thumbnail_content_type: string | null;
  thumbnail_size_bytes: number | null;
  thumbnail_etag: string | null;
  thumbnail_updated_at: string | null;
  thumbnail_tiny_key: string | null;
  thumbnail_tiny_content_type: string | null;
  thumbnail_tiny_size_bytes: number | null;
  thumbnail_tiny_etag: string | null;
  thumbnail_tiny_updated_at: string | null;
  thumbnail_medium_key: string | null;
  thumbnail_medium_content_type: string | null;
  thumbnail_medium_size_bytes: number | null;
  thumbnail_medium_etag: string | null;
  thumbnail_medium_updated_at: string | null;
  folder: string | null;
  cache_policy: CachePolicy;
  cache_version: number;
  allowed_origins: string | null;
  inherit_allowed_origins: number;
  uploaded_at: string;
  updated_at: string;
  deleted_at: string | null;
  delete_after: string | null;
  status: "uploading" | "ready" | "failed";
  demo_session_id: string;
  demo_seed_asset_id: string | null;
  demo_storage_owner: "seed" | "demo";
  demo_expires_at: string | null;
  tag_list?: string | null;
};

export type Asset = {
  id: string;
  slug: string;
  objectKey: string;
  displayName: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  etag: string | null;
  contentSha256: string | null;
  thumbnailUrl: string | null;
  tinyThumbnailUrl: string | null;
  mediumThumbnailUrl: string | null;
  folder: string | null;
  tags: string[];
  cachePolicy: CachePolicy;
  cacheVersion: number;
  allowedOrigins: string[];
  inheritAllowedOrigins: boolean;
  uploadedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deleteAfter: string | null;
  status: "uploading" | "ready" | "failed";
  url: string;
  cacheBustedUrl: string;
  kind: "image" | "video" | "pdf" | "model" | "text" | "archive" | "file";
  demoSessionId: string | null;
};

export type AssetUsageItem = {
  id: string;
  displayName: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  status: Asset["status"];
  kind: Asset["kind"];
};

export type AssetUsageKindStats = {
  kind: Asset["kind"];
  count: number;
  bytes: number;
  percentBytes: number;
};

export type AssetUsagePlan = {
  label: string | null;
  limitBytes: number | null;
  percentUsed: number | null;
  isConfigured: boolean;
  isOverLimit: boolean;
};

export type AssetUsageLimitNote = {
  label: string;
  value: string;
  detail: string;
};

export type AssetUsageResponse = {
  generatedAt: string;
  totalBytes: number;
  activeBytes: number;
  trashedBytes: number;
  assetCount: number;
  activeCount: number;
  trashedCount: number;
  byKind: Record<Asset["kind"], AssetUsageKindStats>;
  largestFiles: AssetUsageItem[];
  recentUploads: AssetUsageItem[];
  uploadIssues: AssetUsageItem[];
  storagePlan: AssetUsagePlan;
  limitNotes: AssetUsageLimitNote[];
};

export type AssetListResponse = {
  assets: Asset[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  query: string;
  folder: string;
  tag: string;
  trash: boolean;
  retentionDays: number;
  folders?: string[];
  tags?: string[];
  truncated: boolean;
  uploadBaseUrl: string;
};

export type RuntimeConfigResponse = {
  appBasePath: string;
  uploadBaseUrl: string;
  directUploadLimitBytes: number;
  multipartPartSizeBytes: number;
  maxMultipartUploadBytes: number;
  settings: AssetManagerSettings;
  access: AssetManagerAccessStatus;
  authUi: AssetManagerAuthUi;
  demo: AssetManagerDemoConfig;
};
