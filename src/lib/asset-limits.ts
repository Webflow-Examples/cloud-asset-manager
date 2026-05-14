export const APP_BASE_PATH = "/assets";
export const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
export const MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_MULTIPART_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_MULTIPART_PARTS = 10_000;
export const OBJECT_KEY_PREFIX = "assets";

export const WEBFLOW_LIMITS = [
  {
    label: "Images",
    value: "20 MB",
    detail: "Maximum static image asset size.",
  },
  {
    label: "Videos",
    value: "1 GB",
    detail: "Maximum static video asset size.",
  },
  {
    label: "3D models",
    value: "500 MB",
    detail: "Maximum static 3D model asset size.",
  },
  {
    label: "Other static files",
    value: "20 MB",
    detail: "Maximum size for other static assets.",
  },
  {
    label: "Bucket storage",
    value: "1 GB / 5 GB / 25 GB",
    detail: "Free, Basic, and CMS / Business / Enterprise per bucket.",
  },
  {
    label: "Object size",
    value: "5 TiB",
    detail: "Maximum stored object size.",
  },
  {
    label: "Multipart upload",
    value: "5 GiB",
    detail: "Maximum browser upload size used by this MVP.",
  },
  {
    label: "Upload parts",
    value: "10,000",
    detail: "Maximum parts per multipart upload.",
  },
  {
    label: "Object key",
    value: "1,024 bytes",
    detail: "Maximum object key length.",
  },
  {
    label: "Object metadata",
    value: "8,192 bytes",
    detail: "Maximum metadata size per object.",
  },
  {
    label: "Same-object writes",
    value: "1/sec",
    detail: "Concurrent writes to the same object are limited.",
  },
] as const;

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}
