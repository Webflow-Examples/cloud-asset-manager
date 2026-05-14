"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import {
  AlertCircle,
  Archive,
  BarChart3,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Database,
  ExternalLink,
  File,
  FileText,
  Folder,
  HardDrive,
  ImageIcon,
  Info,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  MoreHorizontal,
  Moon,
  Pencil,
  PlaySquare,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sun,
  Tag,
  Trash2,
  UploadCloud,
  UserCircle,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import {
  DIRECT_UPLOAD_LIMIT_BYTES,
  MAX_MULTIPART_UPLOAD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  formatBytes,
} from "@/lib/asset-limits";
import type {
  Asset,
  AssetListResponse,
  AssetUsageItem,
  AssetUsageResponse,
  CachePolicy,
  RuntimeConfigResponse,
} from "@/lib/asset-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, readError, SELECT_CLASS, TEXTAREA_CLASS } from "@/lib/utils";

const DEFAULT_CONFIG: RuntimeConfigResponse = {
  appBasePath: "/assets",
  uploadBaseUrl: "/assets",
  directUploadLimitBytes: DIRECT_UPLOAD_LIMIT_BYTES,
  multipartPartSizeBytes: MULTIPART_PART_SIZE_BYTES,
  maxMultipartUploadBytes: MAX_MULTIPART_UPLOAD_BYTES,
  settings: {
    domainRestrictionsEnabled: false,
    allowedAssetOrigins: [],
    allowDirectAssetAccess: false,
    defaultCopiedLinkType: "stable",
    defaultSnippetUrlType: "stable",
    locks: {
      domainSettings: false,
      cacheBehaviorSettings: false,
      domainRestrictionsEnabled: false,
      allowedAssetOrigins: false,
      allowDirectAssetAccess: false,
      defaultCopiedLinkType: false,
      defaultSnippetUrlType: false,
    },
  },
  access: {
    interfaceAuthEnabled: false,
    assetDeliveryAuthEnabled: false,
    source: "environment",
    adapterPath: "src/lib/auth.ts",
  },
  authUi: {
    providerLabel: "Custom auth provider",
    signIn: null,
    signOut: null,
    account: null,
  },
};

const THEME_STORAGE_KEY = "wf-asset-manager-theme";
const UPLOAD_CONCURRENCY = 2;
const ASSET_PAGE_SIZE = 24;
const USAGE_KIND_ORDER: Asset["kind"][] = [
  "image",
  "video",
  "pdf",
  "model",
  "text",
  "archive",
  "file",
];

const FIELD_LABEL_CLASS = "flex h-5 items-center";
const CHECKBOX_CLASS =
  "size-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DESTRUCTIVE_LINK_BUTTON_CLASS =
  "h-9 px-1.5 text-destructive underline-offset-4 hover:bg-transparent hover:text-destructive hover:underline focus-visible:ring-destructive/40";
const RESILIENT_VALUE_CLASS = "min-w-0 break-words [overflow-wrap:anywhere]";
const RESILIENT_CODE_CLASS =
  "min-w-0 break-all font-mono text-[0.8125rem] leading-5 [overflow-wrap:anywhere]";

const CACHE_POLICY_OPTIONS: Array<{
  value: CachePolicy;
  label: string;
  detail: string;
}> = [
  {
    value: "balanced",
    label: "Balanced",
    detail: "Revalidates after 5 minutes.",
  },
  {
    value: "immutable",
    label: "Long immutable",
    detail: "Caches for one year.",
  },
  {
    value: "no-store",
    label: "No browser cache",
    detail: "Always refetches.",
  },
];

function cachePolicyDetail(policy: CachePolicy) {
  return CACHE_POLICY_OPTIONS.find((option) => option.value === policy)?.detail || "";
}

function CachePolicyHelpTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-3 size-11 rounded-full p-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          aria-label="Cache policy details"
        >
          <Info />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <div className="grid gap-2">
          <p className="font-medium">
            Saves the intended cache behavior for copied asset links.
          </p>
          <p className="text-muted-foreground">
            Webflow Cloud may override Cache-Control headers. Use fresh URLs when immediate
            invalidation matters.
          </p>
          <div className="grid gap-1">
            {CACHE_POLICY_OPTIONS.map((option) => (
              <p key={option.value}>
                <span className="font-medium">{option.label}:</span> {option.detail}
              </p>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CachePolicyLabel({
  children = "Cache policy",
  htmlFor,
}: {
  children?: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex h-5 items-center gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{children}</Label>
      ) : (
        <span className="text-sm font-medium">{children}</span>
      )}
      <CachePolicyHelpTooltip />
    </div>
  );
}

type UploadPart = {
  partNumber: number;
  etag: string;
};

type ThemeMode = "dark" | "light";
type ManagerView = "assets" | "usage" | "trash";
type AssetViewMode = "list" | "grid";
type QueueStatus = "idle" | "uploading" | "complete" | "error";
type DuplicateStatus = "idle" | "checking" | "clear" | "found" | "error" | "allowed";
type UiErrorAction = {
  label: string;
  href: string;
};

type UiError = {
  title: string;
  message: string;
  status?: number;
  action?: UiErrorAction;
};

type CopyFormat = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  message: string;
  wide?: boolean;
};

type UploadQueueItem = {
  id: string;
  file: File;
  name: string;
  folder: string;
  tags: string;
  cachePolicy: CachePolicy;
  contentSha256?: string;
  duplicateStatus: DuplicateStatus;
  duplicateAssets: Asset[];
  duplicateError?: string;
  progress: number;
  status: QueueStatus;
  error?: string;
  asset?: Asset;
};

type AssetDraft = {
  displayName: string;
  slug: string;
  folder: string;
  tags: string;
  cachePolicy: CachePolicy;
  inheritAllowedOrigins: boolean;
  allowedOrigins: string;
};

class UiResponseError extends Error {
  uiError: UiError;

  constructor(uiError: UiError) {
    super(uiError.message);
    this.name = "UiResponseError";
    this.uiError = uiError;
  }
}

function assetKindFromFile(file: File): Asset["kind"] {
  const lowerType = (file.type || "").toLowerCase();
  const lowerName = file.name.toLowerCase();

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

function managerViewFromParam(value: string | null): ManagerView {
  return value === "usage" || value === "trash" ? value : "assets";
}

function assetViewModeFromParam(value: string | null): AssetViewMode {
  return value === "grid" ? "grid" : "list";
}

function pageFromParam(value: string | null) {
  const page = Math.floor(Number(value || 1));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function previewUrl(asset: Asset) {
  return asset.cacheBustedUrl;
}

function assetIcon(asset: Pick<Asset, "kind">) {
  switch (asset.kind) {
    case "image":
      return ImageIcon;
    case "video":
      return PlaySquare;
    case "pdf":
    case "text":
      return FileText;
    case "model":
      return Box;
    case "archive":
      return Archive;
    default:
      return File;
  }
}

function usesCheckerboard(asset: Pick<Asset, "contentType" | "originalFilename" | "kind">) {
  if (asset.kind !== "image") return false;

  const contentType = asset.contentType.toLowerCase();
  const filename = asset.originalFilename.toLowerCase();

  return (
    contentType.includes("png") ||
    contentType.includes("svg") ||
    filename.endsWith(".png") ||
    filename.endsWith(".svg")
  );
}

function checkerboardStyle(enabled: boolean): React.CSSProperties | undefined {
  if (!enabled) return undefined;

  return {
    backgroundColor: "var(--background)",
    backgroundImage:
      "linear-gradient(45deg, var(--muted) 25%, transparent 25%), " +
      "linear-gradient(-45deg, var(--muted) 25%, transparent 25%), " +
      "linear-gradient(45deg, transparent 75%, var(--muted) 75%), " +
      "linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
    backgroundSize: "8px 8px",
  };
}

async function readUiResponseError(response: Response, fallbackTitle: string) {
  const detail = await readError(response);

  if (response.status === 401) {
    return new UiResponseError({
      title: "Session required",
      message: "Sign in to continue managing assets.",
      status: response.status,
      action: {
        label: "Sign in",
        href: "/sign-in",
      },
    });
  }

  if (response.status === 403) {
    return new UiResponseError({
      title: "Access denied",
      message: "Your session does not have access to this asset manager.",
      status: response.status,
    });
  }

  return new UiResponseError({
    title: fallbackTitle,
    message: detail,
    status: response.status,
  });
}

function uiErrorFromUnknown(error: unknown, fallbackTitle: string, fallbackMessage: string): UiError {
  if (error instanceof UiResponseError) return error.uiError;

  return {
    title: fallbackTitle,
    message: error instanceof Error ? error.message : fallbackMessage,
  };
}

function uploadedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeDate(value: string) {
  const now = Date.now();
  const timestamp = Date.parse(value);
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return uploadedDate(value);
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function kindLabel(kind: Asset["kind"]) {
  if (kind === "pdf") return "PDF";
  if (kind === "model") return "3D model";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function detailDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fileDisplayName(file: File) {
  return file.name.replace(/\.[^.]+$/, "") || file.name;
}

function tagsInput(tags: string[]) {
  return tags.join(", ");
}

function originsInput(origins: string[]) {
  return origins.join("\n");
}

function assetDraftFromAsset(asset: Asset): AssetDraft {
  return {
    displayName: asset.displayName,
    slug: asset.slug,
    folder: asset.folder || "",
    tags: tagsInput(asset.tags),
    cachePolicy: asset.cachePolicy,
    inheritAllowedOrigins: asset.inheritAllowedOrigins,
    allowedOrigins: originsInput(asset.allowedOrigins),
  };
}

function normalizeDraftValue(value: string) {
  return value.trim();
}

function assetDraftMatchesAsset(draft: AssetDraft, asset: Asset) {
  const source = assetDraftFromAsset(asset);

  return (
    normalizeDraftValue(draft.displayName) === normalizeDraftValue(source.displayName) &&
    normalizeDraftValue(draft.slug) === normalizeDraftValue(source.slug) &&
    normalizeDraftValue(draft.folder) === normalizeDraftValue(source.folder) &&
    normalizeDraftValue(draft.tags) === normalizeDraftValue(source.tags) &&
    draft.cachePolicy === source.cachePolicy &&
    draft.inheritAllowedOrigins === source.inheritAllowedOrigins &&
    normalizeDraftValue(draft.allowedOrigins) === normalizeDraftValue(source.allowedOrigins)
  );
}

function domainRuleLabel(asset: Asset) {
  if (asset.inheritAllowedOrigins) return "Inherits global settings";
  return asset.allowedOrigins.length ? "Custom allowlist" : "Custom unrestricted";
}

function allowedOriginsLabel(asset: Asset) {
  if (asset.inheritAllowedOrigins) return "Global settings";
  return asset.allowedOrigins.length ? asset.allowedOrigins.join(", ") : "None";
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function copiedAssetUrl(asset: Asset, useFreshUrl: boolean) {
  return useFreshUrl ? asset.cacheBustedUrl : asset.url;
}

function snippetFor(asset: Asset, type: "markdown" | "html" | "css", useFreshUrl = false) {
  const url = copiedAssetUrl(asset, useFreshUrl);

  if (type === "markdown") {
    return asset.kind === "image"
      ? `![${asset.displayName}](${url})`
      : `[${asset.displayName}](${url})`;
  }

  if (type === "html") {
    if (asset.kind === "image") {
      return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(asset.displayName)}">`;
    }

    if (asset.kind === "video") {
      return `<video src="${escapeAttribute(url)}" controls></video>`;
    }

    if (asset.kind === "pdf") {
      return `<iframe src="${escapeAttribute(url)}" title="${escapeAttribute(asset.displayName)}"></iframe>`;
    }

    return `<a href="${escapeAttribute(url)}">${escapeAttribute(asset.displayName)}</a>`;
  }

  return `url("${url}")`;
}

function copyFormatsFor(asset: Asset, useFreshSnippets = false) {
  const formats: CopyFormat[] = [
    {
      label: "Stable link",
      icon: Copy,
      value: asset.url,
      message: "Stable link copied. Safe to paste into Webflow.",
    },
    {
      label: "Fresh link",
      icon: RefreshCw,
      value: asset.cacheBustedUrl,
      message: "Fresh link copied with the latest cache version.",
    },
    {
      label: "Object key",
      icon: Code2,
      value: asset.objectKey,
      message: "Object key copied.",
    },
    {
      label: "Markdown",
      icon: FileText,
      value: snippetFor(asset, "markdown", useFreshSnippets),
      message: "Markdown snippet copied.",
    },
    {
      label: "HTML",
      icon: Code2,
      value: snippetFor(asset, "html", useFreshSnippets),
      message: "HTML snippet copied.",
    },
  ];

  if (asset.kind === "image") {
    formats.push({
      label: "CSS url()",
      icon: Code2,
      value: snippetFor(asset, "css", useFreshSnippets),
      message: "CSS URL copied.",
      wide: true,
    });
  }

  return formats;
}

function rowCopyFormatsFor(asset: Asset) {
  return copyFormatsFor(asset).filter(
    (format) =>
      format.label === "Markdown" || format.label === "HTML" || format.label === "CSS url()",
  );
}

function makeQueueItem(file: File, defaults: Pick<UploadQueueItem, "folder" | "tags" | "cachePolicy">) {
  return {
    id: crypto.randomUUID(),
    file,
    name: fileDisplayName(file),
    folder: defaults.folder,
    tags: defaults.tags,
    cachePolicy: defaults.cachePolicy,
    duplicateStatus: "idle" as DuplicateStatus,
    duplicateAssets: [],
    progress: 0,
    status: "idle" as QueueStatus,
  };
}

function folderOptions(current: string, folders: string[]) {
  return current && !folders.includes(current) ? [current, ...folders] : folders;
}

function tagOptions(current: string, tags: string[]) {
  return current && !tags.includes(current) ? [current, ...tags] : tags;
}

function paginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 3);
    pages.add(totalPages - 2);
    pages.add(totalPages - 1);
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  for (const page of sortedPages) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}

function elementAcceptsTextInput(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;

  const tagName = element.tagName.toLowerCase();
  if (tagName === "textarea" || tagName === "select") return true;

  if (tagName !== "input") return false;

  const inputType = (element as HTMLInputElement).type;
  return !["button", "checkbox", "file", "radio", "reset", "submit"].includes(inputType);
}

export function AssetManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialView = managerViewFromParam(searchParams.get("view"));
  const initialMode = assetViewModeFromParam(searchParams.get("mode"));
  const initialPage = pageFromParam(searchParams.get("page"));
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [total, setTotal] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(initialPage);
  const [pageSize, setPageSize] = React.useState(ASSET_PAGE_SIZE);
  const [totalPages, setTotalPages] = React.useState(0);
  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [folderFilter, setFolderFilter] = React.useState(searchParams.get("folder") || "");
  const [tagFilter, setTagFilter] = React.useState(searchParams.get("tag") || "");
  const [activeView, setActiveView] = React.useState<ManagerView>(initialView);
  const [assetViewMode, setAssetViewMode] = React.useState<AssetViewMode>(initialMode);
  const [usage, setUsage] = React.useState<AssetUsageResponse | null>(null);
  const [usageError, setUsageError] = React.useState<UiError | null>(null);
  const [isUsageLoading, setIsUsageLoading] = React.useState(initialView === "usage");
  const [assetListError, setAssetListError] = React.useState<UiError | null>(null);
  const [retentionDays, setRetentionDays] = React.useState(30);
  const [folders, setFolders] = React.useState<string[]>([]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUploadingQueue, setIsUploadingQueue] = React.useState(false);
  const [queue, setQueue] = React.useState<UploadQueueItem[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = React.useState<Set<string>>(() => new Set());
  const [bulkFolder, setBulkFolder] = React.useState("");
  const [bulkClearFolder, setBulkClearFolder] = React.useState(false);
  const [bulkCachePolicy, setBulkCachePolicy] = React.useState<CachePolicy | "">("");
  const [bulkAddTags, setBulkAddTags] = React.useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = React.useState("");
  const [isBulkSaving, setIsBulkSaving] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<UiError | null>(null);
  const [defaultFolder, setDefaultFolder] = React.useState("");
  const [defaultTags, setDefaultTags] = React.useState("");
  const [defaultCachePolicy, setDefaultCachePolicy] = React.useState<CachePolicy>("balanced");
  const [config, setConfig] = React.useState<RuntimeConfigResponse>(DEFAULT_CONFIG);
  const [configError, setConfigError] = React.useState<UiError | null>(null);
  const [isConfigLoading, setIsConfigLoading] = React.useState(false);
  const [activeAsset, setActiveAsset] = React.useState<Asset | null>(null);
  const [assetDraft, setAssetDraft] = React.useState<AssetDraft>({
    displayName: "",
    slug: "",
    folder: "",
    tags: "",
    cachePolicy: "balanced",
    inheritAllowedOrigins: true,
    allowedOrigins: "",
  });
  const [isSavingDetails, setIsSavingDetails] = React.useState(false);
  const [saveDetailsError, setSaveDetailsError] = React.useState<UiError | null>(null);
  const [restoreError, setRestoreError] = React.useState<UiError | null>(null);
  const [isConfirmingDiscardDetails, setIsConfirmingDiscardDetails] = React.useState(false);
  const [assetPendingDelete, setAssetPendingDelete] = React.useState<Asset | null>(null);
  const [hiddenAssetIds, setHiddenAssetIds] = React.useState<Set<string>>(() => new Set());
  const [bulkDeletePending, setBulkDeletePending] = React.useState<{
    ids: string[];
    permanent: boolean;
  } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [isBulkRestoring, setIsBulkRestoring] = React.useState(false);
  const [replacementFile, setReplacementFile] = React.useState<File | null>(null);
  const [replacementError, setReplacementError] = React.useState<UiError | null>(null);
  const [replacementProgress, setReplacementProgress] = React.useState(0);
  const [isReplacing, setIsReplacing] = React.useState(false);
  const [isConfirmingReplacement, setIsConfirmingReplacement] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = React.useState(false);
  const [useFreshSnippetUrls, setUseFreshSnippetUrls] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const replacementInputRef = React.useRef<HTMLInputElement>(null);
  const detailsReturnFocusRef = React.useRef<HTMLElement | null>(null);
  const dialogReturnFocusRef = React.useRef<HTMLElement | null>(null);
  const selectionAnchorIdRef = React.useRef<string | null>(null);
  const selectAllCheckboxRef = React.useRef<HTMLInputElement>(null);
  const loadedFacetKeyRef = React.useRef<string | null>(null);
  const isLightTheme = theme === "light";
  const showTrash = activeView === "trash";
  const isUsageView = activeView === "usage";
  const hasUnsavedAssetDetails = activeAsset
    ? !assetDraftMatchesAsset(assetDraft, activeAsset)
    : false;
  const assetSlugWillChange = activeAsset
    ? normalizeDraftValue(assetDraft.slug) !== activeAsset.slug
    : false;

  React.useEffect(() => {
    const nextView = managerViewFromParam(searchParams.get("view"));
    const nextMode = assetViewModeFromParam(searchParams.get("mode"));
    const nextPage = pageFromParam(searchParams.get("page"));
    const nextQuery = searchParams.get("q") || "";
    const nextFolder = searchParams.get("folder") || "";
    const nextTag = searchParams.get("tag") || "";

    setActiveView((current) => (current === nextView ? current : nextView));
    setAssetViewMode((current) => (current === nextMode ? current : nextMode));
    setCurrentPage((current) => (current === nextPage ? current : nextPage));
    setQuery((current) => (current === nextQuery ? current : nextQuery));
    setFolderFilter((current) => (current === nextFolder ? current : nextFolder));
    setTagFilter((current) => (current === nextTag ? current : nextTag));
  }, [searchParams]);

  React.useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("view");
    nextParams.delete("mode");
    nextParams.delete("q");
    nextParams.delete("folder");
    nextParams.delete("tag");
    nextParams.delete("page");

    if (activeView !== "assets") nextParams.set("view", activeView);
    if (assetViewMode !== "list") nextParams.set("mode", assetViewMode);
    if (query.trim()) nextParams.set("q", query.trim());
    if (folderFilter) nextParams.set("folder", folderFilter);
    if (tagFilter) nextParams.set("tag", tagFilter);
    if (currentPage > 1) nextParams.set("page", String(currentPage));

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;

    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
  }, [
    activeView,
    assetViewMode,
    currentPage,
    folderFilter,
    pathname,
    query,
    router,
    searchParams,
    tagFilter,
  ]);

  React.useEffect(() => {
    selectionAnchorIdRef.current = null;
    setSelectedAssetIds(new Set());
  }, [activeView, assetViewMode, currentPage, folderFilter, query, tagFilter]);

  React.useEffect(() => {
    const currentTheme =
      document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(currentTheme);
    setThemeReady(true);
  }, []);

  React.useEffect(() => {
    if (!themeReady) return;

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Non-persistent browser contexts can still use the in-memory toggle.
    }
  }, [theme, themeReady]);

  const loadConfig = React.useCallback(async () => {
    setIsConfigLoading(true);
    setConfigError(null);
    try {
      const response = await fetch(`${DEFAULT_CONFIG.appBasePath}/api/assets/config`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw await readUiResponseError(response, "Runtime settings unavailable");
      }

      const body = (await response.json()) as RuntimeConfigResponse;
      setConfig(body);
      setUseFreshSnippetUrls(body.settings.defaultSnippetUrlType === "fresh");
      return body;
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Runtime settings unavailable", "Could not load runtime config.");
      setConfigError(uiError);
      toast.error(uiError.message);
      return null;
    } finally {
      setIsConfigLoading(false);
    }
  }, []);

  const loadAssets = React.useCallback(
    async (
      search: string,
      folder: string,
      tag: string,
      trash: boolean,
      page: number,
      options: { refreshFacets?: boolean } = {},
    ) => {
      setIsLoading(true);
      setAssetListError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        if (folder) params.set("folder", folder);
        if (tag) params.set("tag", tag);
        if (trash) params.set("trash", "1");
        params.set("page", String(page));
        params.set("limit", String(ASSET_PAGE_SIZE));
        if (options.refreshFacets === false) params.set("facets", "0");

        const response = await fetch(
          `${DEFAULT_CONFIG.appBasePath}/api/assets${params.size ? `?${params.toString()}` : ""}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw await readUiResponseError(response, "Could not load assets");
        }

        const body = (await response.json()) as AssetListResponse;
        setAssets(body.assets);
        setHiddenAssetIds((prev) => {
          if (!prev.size) return prev;
          const stillPresent = new Set(body.assets.map((asset) => asset.id));
          const next = new Set<string>();
          prev.forEach((id) => {
            if (stillPresent.has(id)) next.add(id);
          });
          return next.size === prev.size ? prev : next;
        });
        setTotal(body.total);
        setCurrentPage(body.page);
        setPageSize(body.pageSize);
        setTotalPages(body.totalPages);
        if (body.folders) setFolders(body.folders);
        if (body.tags) setTags(body.tags);
        setRetentionDays(body.retentionDays || 30);
        setConfig((previous) => ({ ...previous, uploadBaseUrl: body.uploadBaseUrl }));
        return body;
      } catch (error) {
        const uiError = uiErrorFromUnknown(error, "Could not load assets", "Could not load assets.");
        setAssetListError(uiError);
        toast.error(uiError.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const loadUsage = React.useCallback(async () => {
    setIsUsageLoading(true);
    setUsageError(null);
    try {
      const response = await fetch(`${DEFAULT_CONFIG.appBasePath}/api/assets/usage`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw await readUiResponseError(response, "Could not load usage");
      }

      setUsage((await response.json()) as AssetUsageResponse);
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Could not load usage", "Could not load usage dashboard.");
      setUsageError(uiError);
      toast.error(uiError.message);
    } finally {
      setIsUsageLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  React.useEffect(() => {
    if (isUsageView) return;

    const timeout = window.setTimeout(() => {
      const facetKey = JSON.stringify([query.trim(), folderFilter, tagFilter, showTrash]);
      const refreshFacets = loadedFacetKeyRef.current !== facetKey;
      void loadAssets(query, folderFilter, tagFilter, showTrash, currentPage, {
        refreshFacets,
      }).then((body) => {
        if (body && refreshFacets) {
          loadedFacetKeyRef.current = facetKey;
        }
      });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [currentPage, folderFilter, isUsageView, loadAssets, query, showTrash, tagFilter]);

  React.useEffect(() => {
    if (!isUsageView) return;
    void loadUsage();
  }, [isUsageView, loadUsage]);

  function patchQueueItem(
    id: string,
    patch:
      | Partial<UploadQueueItem>
      | ((item: UploadQueueItem) => Partial<UploadQueueItem>),
  ) {
    setQueue((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...(typeof patch === "function" ? patch(item) : patch),
            }
          : item,
      ),
    );
  }

  async function checkQueueItemDuplicates(item: UploadQueueItem) {
    patchQueueItem(item.id, {
      duplicateStatus: "checking",
      duplicateAssets: [],
      duplicateError: undefined,
    });

    let contentSha256: string;
    try {
      const { hashFileSha256 } = await import("@/lib/client-file-hash");
      contentSha256 = await hashFileSha256(item.file);
      patchQueueItem(item.id, { contentSha256 });
    } catch (error) {
      patchQueueItem(item.id, {
        duplicateStatus: "error",
        duplicateAssets: [],
        duplicateError: error instanceof Error ? error.message : "Hashing failed.",
      });
      toast.warning("Could not hash one file for duplicates. Upload is still allowed.");
      return;
    }

    try {
      const response = await fetch(
        `${config.uploadBaseUrl}/api/assets/duplicates?sha256=${encodeURIComponent(contentSha256)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw await readUiResponseError(response, "Duplicate check unavailable");
      }

      const body = (await response.json()) as { assets: Asset[] };
      patchQueueItem(item.id, {
        contentSha256,
        duplicateStatus: body.assets.length ? "found" : "clear",
        duplicateAssets: body.assets,
        duplicateError: undefined,
      });
    } catch (error) {
      patchQueueItem(item.id, {
        contentSha256,
        duplicateStatus: "error",
        duplicateAssets: [],
        duplicateError: error instanceof Error ? error.message : "Duplicate check failed.",
      });
      toast.warning("Could not check one file for duplicates. Upload is still allowed.");
    }
  }

  function addFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    const newItems = fileArray.map((file) =>
      makeQueueItem(file, {
        folder: defaultFolder,
        tags: defaultTags,
        cachePolicy: defaultCachePolicy,
      }),
    );

    setQueue((current) => [...current, ...newItems]);
    newItems.forEach((item) => void checkQueueItemDuplicates(item));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function applyDefaultFolder(value: string) {
    const previousValue = defaultFolder;
    setDefaultFolder(value);
    setQueue((current) =>
      current.map((item) =>
        (item.status === "idle" || item.status === "error") &&
        (!item.folder.trim() || item.folder === previousValue)
          ? { ...item, folder: value }
          : item,
      ),
    );
  }

  function applyDefaultTags(value: string) {
    const previousValue = defaultTags;
    setDefaultTags(value);
    setQueue((current) =>
      current.map((item) =>
        (item.status === "idle" || item.status === "error") &&
        (!item.tags.trim() || item.tags === previousValue)
          ? { ...item, tags: value }
          : item,
      ),
    );
  }

  function applyDefaultCachePolicy(value: CachePolicy) {
    const previousValue = defaultCachePolicy;
    setDefaultCachePolicy(value);
    setQueue((current) =>
      current.map((item) =>
        (item.status === "idle" || item.status === "error") &&
        item.cachePolicy === previousValue
          ? { ...item, cachePolicy: value }
          : item,
      ),
    );
  }

  function handleUploadFolderChange(value: string) {
    if (queue.length === 1) {
      setDefaultFolder(value);
      patchQueueItem(queue[0].id, { folder: value });
      return;
    }

    applyDefaultFolder(value);
  }

  function handleUploadTagsChange(value: string) {
    if (queue.length === 1) {
      setDefaultTags(value);
      patchQueueItem(queue[0].id, { tags: value });
      return;
    }

    applyDefaultTags(value);
  }

  function handleUploadCachePolicyChange(value: CachePolicy) {
    if (queue.length === 1) {
      setDefaultCachePolicy(value);
      patchQueueItem(queue[0].id, { cachePolicy: value });
      return;
    }

    applyDefaultCachePolicy(value);
  }

  async function copyText(value: string, message = "Copied.") {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Could not copy from this browser context.");
    }
  }

  async function copyAssetLink(asset: Asset) {
    const useFreshUrl = config.settings.defaultCopiedLinkType === "fresh";
    await copyText(
      copiedAssetUrl(asset, useFreshUrl),
      useFreshUrl
        ? "Fresh link copied with the latest cache version."
        : "Stable link copied. Safe to paste into Webflow.",
    );
    setCopiedId(asset.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  async function uploadThumbnailForAsset(asset: Asset, sourceFile: File) {
    const sourceKind = assetKindFromFile(sourceFile);

    if (
      asset.kind !== sourceKind ||
      !["image", "pdf", "video"].includes(asset.kind)
    ) {
      return asset;
    }

    const {
      MEDIUM_THUMBNAIL_HEIGHT,
      TINY_THUMBNAIL_HEIGHT,
      createAssetThumbnail,
    } = await import("@/lib/client-thumbnails");
    const [thumbnailTiny, thumbnailMedium] = await Promise.all([
      createAssetThumbnail(sourceFile, TINY_THUMBNAIL_HEIGHT),
      createAssetThumbnail(sourceFile, MEDIUM_THUMBNAIL_HEIGHT),
    ]);
    if (!thumbnailTiny && !thumbnailMedium) return asset;

    const form = new FormData();
    if (thumbnailTiny) form.append("thumbnailTiny", thumbnailTiny);
    if (thumbnailMedium) form.append("thumbnailMedium", thumbnailMedium);

    const response = await fetch(
      `${config.uploadBaseUrl}/api/assets/${encodeURIComponent(asset.id)}/thumbnail`,
      {
        method: "PUT",
        body: form,
      },
    );

    if (!response.ok) {
      throw await readUiResponseError(response, "Thumbnail update failed");
    }

    const body = (await response.json()) as { asset: Asset };
    return body.asset;
  }

  async function withGeneratedThumbnail(asset: Asset, sourceFile: File, context: "upload" | "replace") {
    try {
      return await uploadThumbnailForAsset(asset, sourceFile);
    } catch (error) {
      toast.error(
        context === "upload"
          ? "Asset uploaded, but its thumbnail could not be saved."
          : "File replaced, but its thumbnail could not be updated.",
      );
      console.warn(error);
      return asset;
    }
  }

  function resetReplacementState() {
    setReplacementFile(null);
    setReplacementError(null);
    setReplacementProgress(0);
    setIsConfirmingReplacement(false);
    if (replacementInputRef.current) {
      replacementInputRef.current.value = "";
    }
  }

  function returnFocusTo(element: HTMLElement | null) {
    if (!element) return;
    window.setTimeout(() => {
      if (document.contains(element)) element.focus();
    }, 0);
  }

  function returnFocusToDetailsTrigger() {
    returnFocusTo(detailsReturnFocusRef.current);
  }

  function returnFocusToDialogTrigger() {
    returnFocusTo(dialogReturnFocusRef.current || detailsReturnFocusRef.current);
    dialogReturnFocusRef.current = null;
  }

  function closeActiveAsset(options: { discardDetails?: boolean } = {}) {
    if (isReplacing) return;

    if (!options.discardDetails && hasUnsavedAssetDetails) {
      setIsConfirmingDiscardDetails(true);
      return;
    }

    setIsConfirmingDiscardDetails(false);
    setActiveAsset(null);
    setSaveDetailsError(null);
    setRestoreError(null);
    resetReplacementState();
    returnFocusToDetailsTrigger();
  }

  function replacementValidationError(asset: Asset, file: File | null) {
    if (!file) return null;

    if (file.size <= 0) {
      return "Choose a file that is larger than 0 bytes.";
    }

    if (file.size > config.maxMultipartUploadBytes) {
      return `This file is larger than ${formatBytes(config.maxMultipartUploadBytes)}.`;
    }

    const replacementKind = assetKindFromFile(file);
    if (replacementKind !== asset.kind) {
      return `Choose another ${kindLabel(asset.kind)} file. This file looks like ${kindLabel(replacementKind)}.`;
    }

    return null;
  }

  function chooseReplacementFile(file: File | null) {
    if (isReplacing) return;
    setReplacementFile(file);
    setReplacementProgress(0);
    const validationError = activeAsset ? replacementValidationError(activeAsset, file) : null;
    setReplacementError(
      validationError
        ? {
            title: "Replacement blocked",
            message: validationError,
          }
        : null,
    );
  }

  async function replaceDirect(asset: Asset, file: File, contentSha256: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("contentSha256", contentSha256);
    setReplacementProgress(12);

    const response = await fetch(
      `${config.uploadBaseUrl}/api/assets/${encodeURIComponent(asset.id)}/replace`,
      {
        method: "PUT",
        body: form,
      },
    );

    if (!response.ok) {
      throw await readUiResponseError(response, "Replacement failed");
    }

    setReplacementProgress(100);
    const body = (await response.json()) as { asset: Asset };
    return body.asset;
  }

  async function replaceMultipart(asset: Asset, file: File, contentSha256: string) {
    const replaceUrl = `${config.uploadBaseUrl}/api/assets/${encodeURIComponent(asset.id)}/replace`;
    const createResponse = await fetch(replaceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        contentSha256,
      }),
    });

    if (!createResponse.ok) {
      throw await readUiResponseError(createResponse, "Replacement failed");
    }

    const upload = (await createResponse.json()) as {
      uploadId: string;
      partSizeBytes: number;
      partUrl: string;
    };
    const partSize = upload.partSizeBytes || config.multipartPartSizeBytes;
    const parts: UploadPart[] = [];

    try {
      for (let offset = 0, partNumber = 1; offset < file.size; offset += partSize, partNumber += 1) {
        const chunk = file.slice(offset, Math.min(offset + partSize, file.size));
        const response = await fetch(
          `${upload.partUrl}?uploadId=${encodeURIComponent(upload.uploadId)}&partNumber=${partNumber}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
            },
            body: chunk,
          },
        );

        if (!response.ok) {
          throw await readUiResponseError(response, "Replacement failed");
        }

        parts.push((await response.json()) as UploadPart);
        setReplacementProgress(Math.min(98, Math.round(((offset + chunk.size) / file.size) * 100)));
      }

      const completeResponse = await fetch(upload.partUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uploadId: upload.uploadId,
          parts,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          contentSha256,
        }),
      });

      if (!completeResponse.ok) {
        throw await readUiResponseError(completeResponse, "Replacement failed");
      }

      setReplacementProgress(100);
      const body = (await completeResponse.json()) as { asset: Asset };
      return body.asset;
    } catch (error) {
      await fetch(`${upload.partUrl}?uploadId=${encodeURIComponent(upload.uploadId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
      throw error;
    }
  }

  async function replaceActiveAsset() {
    if (isReplacing) return;
    if (!activeAsset || !replacementFile) return;

    const validationError = replacementValidationError(activeAsset, replacementFile);
    if (validationError) {
      setReplacementError({
        title: "Replacement blocked",
        message: validationError,
      });
      return;
    }

    setIsConfirmingReplacement(false);
    returnFocusToDialogTrigger();
    setIsReplacing(true);
    setReplacementError(null);
    setReplacementProgress(2);

    try {
      const { hashFileSha256 } = await import("@/lib/client-file-hash");
      const contentSha256 = await hashFileSha256(replacementFile);
      let asset =
        replacementFile.size <= config.directUploadLimitBytes
          ? await replaceDirect(activeAsset, replacementFile, contentSha256)
          : await replaceMultipart(activeAsset, replacementFile, contentSha256);
      asset = await withGeneratedThumbnail(asset, replacementFile, "replace");

      setActiveAsset(asset);
      setAssetDraft(assetDraftFromAsset(asset));
      setAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
      if (isUsageView) {
        await loadUsage();
      } else {
        await loadAssets(query, folderFilter, tagFilter, showTrash, currentPage);
      }
      resetReplacementState();
      toast.success("File replaced. The stable URL stayed intact.");
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Replacement failed", "Replacement failed.");
      setReplacementError(uiError);
      toast.error(uiError.message);
    } finally {
      setIsReplacing(false);
    }
  }

  function uploadMetadata(item: UploadQueueItem) {
    return {
      name: item.name.trim(),
      folder: item.folder.trim(),
      tags: item.tags,
      cachePolicy: item.cachePolicy,
      contentSha256: item.contentSha256,
    };
  }

  async function uploadDirect(item: UploadQueueItem) {
    const metadata = uploadMetadata(item);
    const form = new FormData();
    form.append("name", metadata.name);
    form.append("folder", metadata.folder);
    form.append("tags", metadata.tags);
    form.append("cachePolicy", metadata.cachePolicy);
    if (metadata.contentSha256) form.append("contentSha256", metadata.contentSha256);
    form.append("file", item.file);

    patchQueueItem(item.id, { progress: 12 });

    const response = await fetch(`${config.uploadBaseUrl}/api/assets`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw await readUiResponseError(response, "Upload failed");
    }

    patchQueueItem(item.id, { progress: 100 });
    const body = (await response.json()) as { asset: Asset };
    return body.asset;
  }

  async function uploadMultipart(item: UploadQueueItem) {
    const metadata = uploadMetadata(item);
    const createResponse = await fetch(`${config.uploadBaseUrl}/api/assets/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: metadata.name,
        folder: metadata.folder,
        tags: metadata.tags,
        cachePolicy: metadata.cachePolicy,
        contentSha256: metadata.contentSha256,
        fileName: item.file.name,
        contentType: item.file.type || "application/octet-stream",
        sizeBytes: item.file.size,
      }),
    });

    if (!createResponse.ok) {
      throw await readUiResponseError(createResponse, "Upload failed");
    }

    const upload = (await createResponse.json()) as {
      id: string;
      uploadId: string;
      partSizeBytes: number;
      partUrl: string;
    };

    const partSize = upload.partSizeBytes || config.multipartPartSizeBytes;
    const parts: UploadPart[] = [];

    try {
      for (let offset = 0, partNumber = 1; offset < item.file.size; offset += partSize, partNumber += 1) {
        const chunk = item.file.slice(offset, Math.min(offset + partSize, item.file.size));
        const response = await fetch(
          `${upload.partUrl}?uploadId=${encodeURIComponent(upload.uploadId)}&partNumber=${partNumber}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
            },
            body: chunk,
          },
        );

        if (!response.ok) {
          throw await readUiResponseError(response, "Upload failed");
        }

        parts.push((await response.json()) as UploadPart);
        patchQueueItem(item.id, {
          progress: Math.min(98, Math.round(((offset + chunk.size) / item.file.size) * 100)),
        });
      }

      const completeResponse = await fetch(upload.partUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uploadId: upload.uploadId,
          parts,
          contentSha256: metadata.contentSha256,
        }),
      });

      if (!completeResponse.ok) {
        throw await readUiResponseError(completeResponse, "Upload failed");
      }

      patchQueueItem(item.id, { progress: 100 });
      const body = (await completeResponse.json()) as { asset: Asset };
      return body.asset;
    } catch (error) {
      await fetch(`${upload.partUrl}?uploadId=${encodeURIComponent(upload.uploadId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
      throw error;
    }
  }

  async function uploadQueueItem(item: UploadQueueItem) {
    const name = item.name.trim();

    if (!name) {
      patchQueueItem(item.id, {
        status: "error",
        error: "Add a name before uploading.",
        progress: 0,
      });
      return false;
    }

    if (item.file.size > config.maxMultipartUploadBytes) {
      patchQueueItem(item.id, {
        status: "error",
        error: `This file is larger than ${formatBytes(config.maxMultipartUploadBytes)}.`,
        progress: 0,
      });
      return false;
    }

    if (
      item.duplicateStatus === "checking" ||
      item.duplicateStatus === "error" ||
      (item.duplicateStatus === "found" && item.duplicateAssets.length > 0)
    ) {
      patchQueueItem(item.id, {
        error:
          item.duplicateStatus === "error"
            ? "Acknowledge the failed duplicate check before uploading."
            : "Resolve the duplicate warning before uploading.",
        progress: 0,
      });
      return false;
    }

    patchQueueItem(item.id, { status: "uploading", error: undefined, progress: 2 });

    try {
      let asset =
        item.file.size <= config.directUploadLimitBytes
          ? await uploadDirect(item)
          : await uploadMultipart(item);
      asset = await withGeneratedThumbnail(asset, item.file, "upload");

      patchQueueItem(item.id, {
        status: "complete",
        asset,
        progress: 100,
        error: undefined,
      });
      return true;
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Upload failed", "Upload failed.");
      patchQueueItem(item.id, {
        status: "error",
        error: uiError.message,
      });
      return false;
    }
  }

  async function uploadAllQueued() {
    if (isUploadingQueue) return;
    const blockedDuplicates = queue.filter(
      (item) =>
        (item.status === "idle" || item.status === "error") &&
        (item.duplicateStatus === "checking" ||
          item.duplicateStatus === "error" ||
          (item.duplicateStatus === "found" && item.duplicateAssets.length > 0)),
    );
    const pending = queue.filter(
      (item) =>
        (item.status === "idle" || item.status === "error") &&
        item.duplicateStatus !== "checking" &&
        item.duplicateStatus !== "error" &&
        !(item.duplicateStatus === "found" && item.duplicateAssets.length > 0),
    );
    if (!pending.length) {
      toast.error(
        blockedDuplicates.length
          ? "Resolve duplicate warnings before uploading."
          : "Add files to the queue before uploading.",
      );
      return;
    }

    setIsUploadingQueue(true);
    let cursor = 0;
    let completed = 0;
    let failed = 0;

    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor];
        cursor += 1;
        const ok = await uploadQueueItem(item);
        if (ok) completed += 1;
        else failed += 1;
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, () => worker()),
      );
      if (isUsageView) {
        await loadUsage();
      } else {
        setActiveView("assets");
        setCurrentPage(1);
        await loadAssets(query, folderFilter, tagFilter, false, 1);
      }

      if (failed) {
        toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed.`);
      }
      if (completed) {
        toast.success(
          `${completed} asset${completed === 1 ? "" : "s"} uploaded. Stable links are ready.`,
        );
      }
    } finally {
      setIsUploadingQueue(false);
    }
  }

  async function retryQueueItem(item: UploadQueueItem) {
    if (isUploadingQueue) return;
    setIsUploadingQueue(true);
    try {
      const ok = await uploadQueueItem(item);
      if (ok) {
        if (isUsageView) {
          await loadUsage();
        } else {
          setActiveView("assets");
          setCurrentPage(1);
          await loadAssets(query, folderFilter, tagFilter, false, 1);
        }
        toast.success("Asset uploaded. Stable link is ready.");
      }
    } finally {
      setIsUploadingQueue(false);
    }
  }

  async function saveAssetDetails(options: { closeOnSuccess?: boolean } = {}) {
    if (isSavingDetails) return;
    if (!activeAsset) return;

    const displayName = assetDraft.displayName.trim();
    if (!displayName) {
      const uiError = {
        title: "Name required",
        message: "Add a name for this asset.",
      };
      setSaveDetailsError(uiError);
      toast.error(uiError.message);
      return;
    }

    const previousSlug = activeAsset.slug;
    setIsSavingDetails(true);
    setSaveDetailsError(null);
    try {
      const response = await fetch(
        `${DEFAULT_CONFIG.appBasePath}/api/assets/${encodeURIComponent(activeAsset.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName,
            slug: assetDraft.slug,
            folder: assetDraft.folder,
            tags: assetDraft.tags,
            cachePolicy: assetDraft.cachePolicy,
            inheritAllowedOrigins: assetDraft.inheritAllowedOrigins,
            ...(!assetDraft.inheritAllowedOrigins
              ? { allowedOrigins: assetDraft.allowedOrigins }
              : {}),
          }),
        },
      );

      if (!response.ok) {
        throw await readUiResponseError(response, "Could not save details");
      }

      const body = (await response.json()) as { asset: Asset };
      setActiveAsset(body.asset);
      setAssetDraft(assetDraftFromAsset(body.asset));
      setAssets((current) => current.map((asset) => (asset.id === body.asset.id ? body.asset : asset)));
      if (isUsageView) {
        await loadUsage();
      } else {
        await loadAssets(query, folderFilter, tagFilter, showTrash, currentPage);
      }
      setIsConfirmingDiscardDetails(false);
      if (options.closeOnSuccess) {
        setActiveAsset(null);
        resetReplacementState();
        returnFocusToDetailsTrigger();
      }
      toast.success(
        body.asset.slug !== previousSlug
          ? "Details saved. The stable URL changed; update any pasted links."
          : "Details saved. Teammates will see the updated metadata.",
      );
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Could not save details", "Update failed.");
      setSaveDetailsError(uiError);
      toast.error(uiError.message);
    } finally {
      setIsSavingDetails(false);
    }
  }

  function requestDelete(asset: Asset, trigger?: HTMLElement | null) {
    if (trigger) dialogReturnFocusRef.current = trigger;
    setAssetPendingDelete(asset);
  }

  async function deleteAsset() {
    if (!assetPendingDelete) return;

    const target = assetPendingDelete;
    const isPermanentDelete = Boolean(target.deletedAt);

    setHiddenAssetIds((prev) => {
      const next = new Set(prev);
      next.add(target.id);
      return next;
    });
    dropSelection([target.id]);
    setQueue((current) =>
      current.map((item) =>
        item.asset?.id === target.id
          ? { ...item, asset: undefined, status: "idle", progress: 0 }
          : item,
      ),
    );
    setCopiedId((current) => (current === target.id ? null : current));
    if (activeAsset?.id === target.id) {
      setActiveAsset(null);
      setSaveDetailsError(null);
      setRestoreError(null);
      resetReplacementState();
    }
    setAssetPendingDelete(null);
    returnFocusToDialogTrigger();

    try {
      const response = await fetch(
        `${DEFAULT_CONFIG.appBasePath}/api/assets/${encodeURIComponent(target.id)}${
          isPermanentDelete ? "?permanent=true" : ""
        }`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw await readUiResponseError(response, "Could not update trash");
      }

      toast.success(
        isPermanentDelete ? "Asset permanently deleted." : "Asset moved to trash. The link is paused.",
      );
      void (isUsageView
        ? loadUsage()
        : loadAssets(query, folderFilter, tagFilter, showTrash, currentPage));
    } catch (error) {
      setHiddenAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      const uiError = uiErrorFromUnknown(error, "Could not update trash", "Delete failed.");
      toast.error(uiError.message);
    }
  }

  async function restoreDeletedAsset(asset: Asset) {
    if (isSavingDetails) return;
    setIsSavingDetails(true);
    setRestoreError(null);
    try {
      const response = await fetch(
        `${DEFAULT_CONFIG.appBasePath}/api/assets/${encodeURIComponent(asset.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ restore: true }),
        },
      );

      if (!response.ok) {
        throw await readUiResponseError(response, "Could not restore asset");
      }

      const body = (await response.json()) as { asset: Asset };
      setActiveAsset(body.asset);
      setAssetDraft(assetDraftFromAsset(body.asset));
      if (isUsageView) {
        await loadUsage();
      } else {
        await loadAssets(query, folderFilter, tagFilter, showTrash, currentPage);
      }
      selectionAnchorIdRef.current = null;
      setSelectedAssetIds(new Set());
      toast.success("Asset restored. The stable link is active again.");
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Could not restore asset", "Restore failed.");
      setRestoreError(uiError);
      toast.error(uiError.message);
    } finally {
      setIsSavingDetails(false);
    }
  }

  function openDetails(asset: Asset, trigger?: HTMLElement | null) {
    if (trigger) detailsReturnFocusRef.current = trigger;
    resetReplacementState();
    setSaveDetailsError(null);
    setRestoreError(null);
    setIsConfirmingDiscardDetails(false);
    setActiveAsset(asset);
    setAssetDraft(assetDraftFromAsset(asset));
  }

  function assetIsSelectable(asset: Asset) {
    if (asset.status !== "ready") return false;
    if (showTrash ? !asset.deletedAt : !!asset.deletedAt) return false;
    return !hiddenAssetIds.has(asset.id);
  }

  function selectableAssetIdsInCurrentOrder() {
    return assets.filter(assetIsSelectable).map((asset) => asset.id);
  }

  function clearAssetSelection() {
    selectionAnchorIdRef.current = null;
    setSelectedAssetIds(new Set());
  }

  function eventHasShiftKey(event: React.ChangeEvent<HTMLInputElement>) {
    return "shiftKey" in event.nativeEvent && Boolean(event.nativeEvent.shiftKey);
  }

  function setAssetSelection(id: string, selected: boolean, shiftKey = false) {
    const selectableIds = selectableAssetIdsInCurrentOrder();
    const targetIndex = selectableIds.indexOf(id);
    if (targetIndex < 0) return;

    const anchorId = selectionAnchorIdRef.current;
    if (shiftKey && anchorId) {
      const anchorIndex = selectableIds.indexOf(anchorId);

      if (anchorIndex >= 0) {
        const startIndex = Math.min(anchorIndex, targetIndex);
        const endIndex = Math.max(anchorIndex, targetIndex);
        const rangeIds = selectableIds.slice(startIndex, endIndex + 1);

        setSelectedAssetIds((current) => {
          const next = new Set(current);
          for (const rangeId of rangeIds) {
            if (selected) next.add(rangeId);
            else next.delete(rangeId);
          }
          return next;
        });
        selectionAnchorIdRef.current = id;
        return;
      }
    }

    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
    selectionAnchorIdRef.current = id;
  }

  function toggleAssetSelection(id: string, shiftKey = false) {
    setAssetSelection(id, !selectedAssetIds.has(id), shiftKey);
  }

  function clearAssetFilters() {
    setIsLoading(true);
    setAssetListError(null);
    setQuery("");
    setFolderFilter("");
    setTagFilter("");
    setCurrentPage(1);
  }

  function setPageSelection(selected: boolean) {
    selectionAnchorIdRef.current = null;
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      for (const asset of assets) {
        if (!assetIsSelectable(asset)) continue;
        if (selected) next.add(asset.id);
        else next.delete(asset.id);
      }
      return next;
    });
  }

  function dropSelection(ids: Iterable<string>) {
    const droppedIds = new Set(ids);
    if (selectionAnchorIdRef.current && droppedIds.has(selectionAnchorIdRef.current)) {
      selectionAnchorIdRef.current = null;
    }

    setSelectedAssetIds((current) => {
      const next = new Set(current);
      for (const id of droppedIds) next.delete(id);
      return next;
    });
  }

  async function applyBulkEdit() {
    if (isBulkSaving) return;
    const ids = Array.from(selectedAssetIds);
    if (!ids.length) return;

    const body: {
      ids: string[];
      folder?: string | null;
      cachePolicy?: CachePolicy;
      addTags?: string;
      removeTags?: string;
    } = { ids };

    if (bulkClearFolder) {
      body.folder = null;
    } else if (bulkFolder.trim()) {
      body.folder = bulkFolder.trim();
    }
    if (bulkCachePolicy) body.cachePolicy = bulkCachePolicy;
    if (bulkAddTags.trim()) body.addTags = bulkAddTags;
    if (bulkRemoveTags.trim()) body.removeTags = bulkRemoveTags;

    if (
      !("folder" in body) &&
      !body.cachePolicy &&
      !body.addTags?.trim() &&
      !body.removeTags?.trim()
    ) {
      const uiError = {
        title: "No bulk edit selected",
        message: "Choose at least one bulk edit.",
      };
      setBulkError(uiError);
      toast.error(uiError.message);
      return;
    }

    setIsBulkSaving(true);
    setBulkError(null);
    try {
      const response = await fetch(`${DEFAULT_CONFIG.appBasePath}/api/assets/bulk`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await readUiResponseError(response, "Bulk edit failed");
      }

      const result = (await response.json()) as { updatedCount: number; assets: Asset[] };
      selectionAnchorIdRef.current = null;
      setSelectedAssetIds(new Set());
      setBulkFolder("");
      setBulkClearFolder(false);
      setBulkCachePolicy("");
      setBulkAddTags("");
      setBulkRemoveTags("");
      await loadAssets(query, folderFilter, tagFilter, showTrash, currentPage);
      toast.success(`${result.updatedCount} asset${result.updatedCount === 1 ? "" : "s"} updated.`);
    } catch (error) {
      const uiError = uiErrorFromUnknown(error, "Bulk edit failed", "Bulk update failed.");
      setBulkError(uiError);
      toast.error(uiError.message);
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function bulkDeleteAssets() {
    if (isBulkDeleting || !bulkDeletePending) return;
    const { ids, permanent } = bulkDeletePending;
    if (!ids.length) return;

    setIsBulkDeleting(true);
    setHiddenAssetIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    dropSelection(ids);
    setBulkDeletePending(null);

    try {
      const response = await fetch(`${DEFAULT_CONFIG.appBasePath}/api/assets/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, permanent }),
      });

      if (!response.ok) {
        throw await readUiResponseError(response, "Bulk delete failed");
      }

      const result = (await response.json()) as {
        deletedIds: string[];
        failedIds: { id: string; error: string }[];
      };

      if (result.failedIds.length) {
        setHiddenAssetIds((prev) => {
          const next = new Set(prev);
          result.failedIds.forEach((failure) => next.delete(failure.id));
          return next;
        });
        const sample = result.failedIds[0]?.error ?? "";
        toast.error(
          `${result.deletedIds.length} ${permanent ? "deleted" : "moved to trash"}, ${result.failedIds.length} failed${sample ? `: ${sample}` : "."}`,
        );
      } else {
        const noun = result.deletedIds.length === 1 ? "asset" : "assets";
        toast.success(
          permanent
            ? `${result.deletedIds.length} ${noun} permanently deleted.`
            : `${result.deletedIds.length} ${noun} moved to trash.`,
        );
      }

      void (isUsageView
        ? loadUsage()
        : loadAssets(query, folderFilter, tagFilter, showTrash, currentPage));
    } catch (error) {
      setHiddenAssetIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      const uiError = uiErrorFromUnknown(error, "Bulk delete failed", "Bulk delete failed.");
      toast.error(uiError.message);
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function bulkRestoreSelectedAssets() {
    if (isBulkRestoring) return;
    const ids = Array.from(selectedAssetIds);
    if (!ids.length) return;

    setIsBulkRestoring(true);
    setHiddenAssetIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    dropSelection(ids);

    try {
      const response = await fetch(`${DEFAULT_CONFIG.appBasePath}/api/assets/bulk-restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        throw await readUiResponseError(response, "Bulk restore failed");
      }

      const result = (await response.json()) as {
        restoredIds: string[];
        failedIds: { id: string; error: string }[];
      };

      if (result.failedIds.length) {
        setHiddenAssetIds((prev) => {
          const next = new Set(prev);
          result.failedIds.forEach((failure) => next.delete(failure.id));
          return next;
        });
        const sample = result.failedIds[0]?.error ?? "";
        toast.error(
          `${result.restoredIds.length} restored, ${result.failedIds.length} failed${sample ? `: ${sample}` : "."}`,
        );
      } else {
        const noun = result.restoredIds.length === 1 ? "asset" : "assets";
        toast.success(`${result.restoredIds.length} ${noun} restored.`);
      }

      void loadAssets(query, folderFilter, tagFilter, showTrash, currentPage);
    } catch (error) {
      setHiddenAssetIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      const uiError = uiErrorFromUnknown(error, "Bulk restore failed", "Bulk restore failed.");
      toast.error(uiError.message);
    } finally {
      setIsBulkRestoring(false);
    }
  }

  const hasQueuedFiles = queue.length > 0;
  const isMultiFileQueue = queue.length > 1;
  const singleQueueItem = queue.length === 1 ? queue[0] : null;
  const pendingQueueCount = React.useMemo(
    () => queue.filter((item) => item.status === "idle" || item.status === "error").length,
    [queue],
  );
  const clearableQueueCount = React.useMemo(
    () => queue.filter((item) => item.status === "complete" || item.status === "error").length,
    [queue],
  );
  const queueMetadataDisabled =
    isUploadingQueue ||
    Boolean(
      singleQueueItem &&
        (singleQueueItem.status === "uploading" || singleQueueItem.status === "complete"),
    );
  const hasAssetFilters = Boolean(query || folderFilter || tagFilter);
  const visibleAssets = React.useMemo(
    () =>
      hiddenAssetIds.size
        ? assets.filter((asset) => !hiddenAssetIds.has(asset.id))
        : assets,
    [assets, hiddenAssetIds],
  );
  const isFirstAssetRun =
    activeView === "assets" &&
    !showTrash &&
    !hasAssetFilters &&
    !isUsageView &&
    !isLoading &&
    !assetListError &&
    total === 0 &&
    visibleAssets.length === 0;
  const uploadPanelTitle = isMultiFileQueue
    ? "Upload queue"
    : isFirstAssetRun && !hasQueuedFiles
      ? "Start with an upload"
      : "Upload";
  const folderFieldLabel = isMultiFileQueue ? "Default folder" : "Folder";
  const tagsFieldLabel = isMultiFileQueue ? "Default tags" : "Tags";
  const cacheFieldLabel = isMultiFileQueue ? "Default cache" : "Cache";
  const folderFieldValue = singleQueueItem ? singleQueueItem.folder : defaultFolder;
  const tagsFieldValue = singleQueueItem ? singleQueueItem.tags : defaultTags;
  const cacheFieldValue = singleQueueItem ? singleQueueItem.cachePolicy : defaultCachePolicy;
  const canBulkSelect =
    activeView === "assets" && assetViewMode === "list" && !isUsageView;
  const selectableAssets = React.useMemo(
    () =>
      canBulkSelect
        ? visibleAssets.filter(
            (asset) =>
              asset.status === "ready" && (showTrash ? !!asset.deletedAt : !asset.deletedAt),
          )
        : [],
    [visibleAssets, canBulkSelect, showTrash],
  );
  const selectedCount = selectedAssetIds.size;
  const selectedSelectableCount = React.useMemo(
    () => selectableAssets.filter((asset) => selectedAssetIds.has(asset.id)).length,
    [selectableAssets, selectedAssetIds],
  );
  const allSelectableAssetsSelected = React.useMemo(
    () =>
      selectableAssets.length > 0 &&
      selectedSelectableCount === selectableAssets.length,
    [selectableAssets.length, selectedSelectableCount],
  );
  const someSelectableAssetsSelected =
    selectedSelectableCount > 0 && !allSelectableAssetsSelected;

  React.useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate = someSelectableAssetsSelected;
  }, [someSelectableAssetsSelected]);

  React.useEffect(() => {
    if (
      selectedCount === 0 ||
      activeAsset ||
      assetPendingDelete ||
      bulkDeletePending ||
      isConfirmingDiscardDetails ||
      isConfirmingReplacement
    ) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (elementAcceptsTextInput(document.activeElement)) return;

      event.preventDefault();
      selectionAnchorIdRef.current = null;
      setSelectedAssetIds(new Set());
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeAsset,
    assetPendingDelete,
    bulkDeletePending,
    isConfirmingDiscardDetails,
    isConfirmingReplacement,
    selectedCount,
  ]);
  const bulkEditSummary = React.useMemo(
    () =>
      [
        bulkClearFolder
          ? "Clear folder"
          : bulkFolder.trim()
            ? `Set folder to ${bulkFolder.trim()}`
            : null,
        bulkCachePolicy ? `Set cache to ${bulkCachePolicy}` : null,
        bulkAddTags.trim() ? `Add tags: ${bulkAddTags.trim()}` : null,
        bulkRemoveTags.trim() ? `Remove tags: ${bulkRemoveTags.trim()}` : null,
      ].filter((item): item is string => Boolean(item)),
    [bulkAddTags, bulkCachePolicy, bulkClearFolder, bulkFolder, bulkRemoveTags],
  );
  const filterFolderOptions = React.useMemo(
    () => folderOptions(folderFilter, folders),
    [folderFilter, folders],
  );
  const filterTagOptions = React.useMemo(
    () => tagOptions(tagFilter, tags),
    [tagFilter, tags],
  );
  const replacementKind = replacementFile ? assetKindFromFile(replacementFile) : null;
  const pageStart = total > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd =
    total > 0 ? Math.min(total, (currentPage - 1) * pageSize + visibleAssets.length) : 0;
  const isUsagePending = isUsageView && (isUsageLoading || (!usage && !usageError));
  const activeTitle = React.useMemo(
    () => (isUsageView ? "Usage" : showTrash ? "Trash" : "Assets"),
    [isUsageView, showTrash],
  );
  const activeDescription = React.useMemo(
    () =>
      isUsageView
        ? usage
          ? `${formatBytes(usage.totalBytes)} across ${countLabel(usage.assetCount, "ready asset")}.`
          : isUsagePending
            ? "Loading storage and upload health."
            : "Live storage and upload health from the asset index."
        : showTrash
          ? isLoading
            ? "Loading deleted assets."
            : `${total === 1 ? "1 deleted asset" : `${total} deleted assets`} recoverable for ${retentionDays} days.`
          : isLoading
            ? "Loading assets from Object Storage."
            : `${total === 1 ? "1 asset" : `${total} assets`} indexed from Object Storage.`,
    [isLoading, isUsagePending, isUsageView, retentionDays, showTrash, total, usage],
  );
  const isRefreshLoading = isUsageView ? isUsageLoading : isLoading;
  const activeCopyFormats = React.useMemo(
    () => (activeAsset ? copyFormatsFor(activeAsset, useFreshSnippetUrls) : []),
    [activeAsset, useFreshSnippetUrls],
  );
  const secondaryCopyFormats = React.useMemo(
    () => activeCopyFormats.filter((format) => format.label !== "Stable link"),
    [activeCopyFormats],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <main className="min-h-screen bg-background text-foreground">
        <section className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-[120rem] flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
            <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative h-7 w-[167px] shrink-0">
                  <img
                    src={
                      isLightTheme
                        ? "/assets/brand/webflow-full-blue-black.svg"
                        : "/assets/brand/webflow-full-blue-white.png"
                    }
                    alt="Webflow"
                    className="absolute left-0 top-0 h-7 w-auto"
                  />
                </div>
                <Separator className="hidden h-7 w-px bg-border md:block" />
                <div>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Object storage
                  </p>
                  <h1 className="text-2xl font-semibold leading-[1.08] md:text-3xl">
                    Cloud asset manager
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {config.authUi.account ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" asChild>
                        <a href={config.authUi.account.href}>
                          <UserCircle />
                          {config.authUi.account.label}
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Open {config.authUi.providerLabel} account settings
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {config.authUi.signOut ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" asChild>
                        <a href={config.authUi.signOut.href}>
                          <LogOut />
                          {config.authUi.signOut.label}
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sign out through {config.authUi.providerLabel}</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/settings">
                        <Settings />
                        Settings
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delivery settings</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTheme(isLightTheme ? "dark" : "light")}
                      aria-label={isLightTheme ? "Switch to dark mode" : "Switch to light mode"}
                    >
                      {isLightTheme ? <Moon /> : <Sun />}
                      {isLightTheme ? "Dark" : "Light"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isLightTheme ? "Switch to dark mode" : "Switch to light mode"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </header>
          </div>
        </section>

        <section className="mx-auto grid max-w-[120rem] gap-6 px-5 py-6 sm:px-8 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:px-10">
          <aside className="min-w-0 flex flex-col gap-6">
            <section className="min-w-0 rounded-[8px] border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold leading-6">{uploadPanelTitle}</h2>
                </div>
                <UploadCloud className="size-5 text-primary" />
              </div>

              <div className="grid min-w-0 gap-4">
                <label
                  className={cn(
                    "flex min-h-40 max-w-full cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:border-primary",
                    isUploadingQueue && "cursor-not-allowed opacity-60",
                  )}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!isUploadingQueue) {
                      addFiles(event.dataTransfer.files);
                    }
                  }}
                >
                  <UploadCloud className="mb-3 size-8 text-primary" />
                  <span className="text-sm font-semibold">Drop files or browse</span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    Files are queued first. Up to{" "}
                    {formatBytes(config.maxMultipartUploadBytes)} per file.
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={isUploadingQueue}
                    onChange={(event) => addFiles(event.target.files || [])}
                  />
                </label>

                {hasQueuedFiles ? (
                  <div className="grid min-w-0 max-w-full gap-4 rounded-[8px] border border-border bg-background p-4">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold leading-5">Queue defaults</h3>
                      <p className="mt-1 max-w-[34rem] text-xs leading-5 text-muted-foreground">
                        These settings apply to the queued files unless a file card overrides them.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="default-folder" className={FIELD_LABEL_CLASS}>
                          {folderFieldLabel}
                        </Label>
                        <Input
                          id="default-folder"
                          value={folderFieldValue}
                          onChange={(event) => handleUploadFolderChange(event.target.value)}
                          placeholder="Campaign"
                          disabled={queueMetadataDisabled}
                        />
                      </div>
                      <div className="grid gap-2">
                        <CachePolicyLabel htmlFor="default-cache">{cacheFieldLabel}</CachePolicyLabel>
                        <select
                          id="default-cache"
                          className={SELECT_CLASS}
                          value={cacheFieldValue}
                          onChange={(event) =>
                            handleUploadCachePolicyChange(event.target.value as CachePolicy)
                          }
                          disabled={queueMetadataDisabled}
                        >
                          {CACHE_POLICY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="default-tags">{tagsFieldLabel}</Label>
                      <Input
                        id="default-tags"
                        value={tagsFieldValue}
                        onChange={(event) => handleUploadTagsChange(event.target.value)}
                        placeholder="hero, launch, docs"
                        disabled={queueMetadataDisabled}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!pendingQueueCount || isUploadingQueue}
                    onClick={() => void uploadAllQueued()}
                  >
                    {isUploadingQueue ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                    {uploadPanelTitle}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!clearableQueueCount || isUploadingQueue}
                    onClick={() =>
                      setQueue((current) =>
                        current.filter(
                          (item) => item.status !== "complete" && item.status !== "error",
                        ),
                      )
                    }
                  >
                    <Check />
                    Clear done
                  </Button>
                </div>

                {hasQueuedFiles ? (
                  <div className="grid min-w-0 gap-3">
                    {queue.map((item) => (
                      <QueueItemCard
                        key={item.id}
                        item={item}
                        showMetadataFields={isMultiFileQueue}
                        disabled={isUploadingQueue || item.status === "uploading" || item.status === "complete"}
                        onPatch={(patch) => patchQueueItem(item.id, patch)}
                        onRemove={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))}
                        onRetry={() => void retryQueueItem(item)}
                        onCopy={() => item.asset && void copyAssetLink(item.asset)}
                        onAllowDuplicate={() =>
                          patchQueueItem(item.id, {
                            duplicateStatus: "allowed",
                            duplicateError: undefined,
                            error: undefined,
                          })
                        }
                        onCopyDuplicate={(asset) => void copyAssetLink(asset)}
                        onOpenDuplicate={(asset) => openDetails(asset)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-[8px] border border-border bg-card">
            {configError ? (
              <ConfigErrorBanner
                error={configError}
                isRetrying={isConfigLoading}
                onRetry={() => void loadConfig()}
              />
            ) : null}
            <div className="flex flex-col gap-4 border-b border-border p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold leading-6">{activeTitle}</h2>
                  <p className="mt-1 max-w-[42rem] text-sm leading-5 text-muted-foreground">
                    {activeDescription}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <div
                    className={cn(
                      "h-12 rounded-[8px] border border-border bg-background p-1",
                      isUsageView
                        ? "hidden pointer-events-none sm:flex sm:invisible"
                        : "flex",
                    )}
                    aria-hidden={isUsageView}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={assetViewMode === "list" ? "secondary" : "ghost"}
                          size="sm"
                          className="h-full px-3"
                          onClick={() => setAssetViewMode("list")}
                          disabled={isUsageView}
                          aria-pressed={assetViewMode === "list"}
                        >
                          <List />
                          <span className="sr-only">List view</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>List view</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={assetViewMode === "grid" ? "secondary" : "ghost"}
                          size="sm"
                          className="h-full px-3"
                          onClick={() => setAssetViewMode("grid")}
                          disabled={isUsageView}
                          aria-pressed={assetViewMode === "grid"}
                        >
                          <LayoutGrid />
                          <span className="sr-only">Grid view</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Grid view</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex h-12 rounded-[8px] border border-border bg-background p-1">
                    <Button
                      variant={activeView === "assets" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-full"
                      aria-pressed={activeView === "assets"}
                      onClick={() => {
                        setActiveView("assets");
                        setCurrentPage(1);
                      }}
                    >
                      Assets
                    </Button>
                    <Button
                      variant={activeView === "usage" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-full"
                      aria-pressed={activeView === "usage"}
                      onClick={() => {
                        setActiveView("usage");
                        setCurrentPage(1);
                      }}
                    >
                      <BarChart3 />
                      Usage
                    </Button>
                    <Button
                      variant={activeView === "trash" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-full"
                      aria-pressed={activeView === "trash"}
                      onClick={() => {
                        setActiveView("trash");
                        setCurrentPage(1);
                      }}
                    >
                      <Trash2 />
                      Trash
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      isUsageView
                        ? void loadUsage()
                        : void loadAssets(query, folderFilter, tagFilter, showTrash, currentPage)
                    }
                    disabled={isRefreshLoading}
                    className="h-12 w-full sm:w-auto"
                  >
                    <RefreshCw className={cn(isRefreshLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>

              {!isUsageView ? (
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setCurrentPage(1);
                      }}
                      aria-label="Search assets"
                      placeholder="Search by name, filename, type, folder, or tag"
                      className="pl-9"
                    />
                  </div>
                  <select
                    className={SELECT_CLASS}
                    value={folderFilter}
                    onChange={(event) => {
                      setFolderFilter(event.target.value);
                      setCurrentPage(1);
                    }}
                    aria-label="Filter by folder"
                  >
                    <option value="">All folders</option>
                    {filterFolderOptions.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                  <select
                    className={SELECT_CLASS}
                    value={tagFilter}
                    onChange={(event) => {
                      setTagFilter(event.target.value);
                      setCurrentPage(1);
                    }}
                    aria-label="Filter by tag"
                  >
                    <option value="">All tags</option>
                    {filterTagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                  {hasAssetFilters ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={clearAssetFilters}
                    >
                      <X />
                      Clear
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {!isUsageView && !activeAsset && restoreError ? (
              <div className="border-b border-border p-4">
                <InlineErrorNotice error={restoreError} />
              </div>
            ) : null}

            <div className="min-h-[540px]">
              {isUsageView ? (
                <UsageDashboard
                  usage={usage}
                  isLoading={isUsageLoading}
                  error={usageError}
                  onRetry={() => void loadUsage()}
                />
              ) : isLoading ? (
                <div className="grid gap-3 p-5">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : assetListError ? (
                <AssetListErrorState
                  error={assetListError}
                  onRetry={() =>
                    void loadAssets(query, folderFilter, tagFilter, showTrash, currentPage)
                  }
                />
              ) : visibleAssets.length ? (
                <>
                  {canBulkSelect ? (
                    <BulkEditPresence selectedCount={selectedCount}>
                      {(visibleSelectedCount, isClosing) => (
                        <BulkEditBar
                          selectedCount={visibleSelectedCount}
                          showTrash={showTrash}
                          folder={bulkFolder}
                          clearFolder={bulkClearFolder}
                          cachePolicy={bulkCachePolicy}
                          addTags={bulkAddTags}
                          removeTags={bulkRemoveTags}
                          isSaving={isBulkSaving || isClosing}
                          isDeleting={isBulkDeleting}
                          isRestoring={isBulkRestoring}
                          isClosing={isClosing}
                          summary={bulkEditSummary}
                          error={bulkError}
                          onFolderChange={(value) => {
                            setBulkError(null);
                            setBulkFolder(value);
                          }}
                          onClearFolderChange={(value) => {
                            setBulkError(null);
                            setBulkClearFolder(value);
                          }}
                          onCachePolicyChange={(value) => {
                            setBulkError(null);
                            setBulkCachePolicy(value);
                          }}
                          onAddTagsChange={(value) => {
                            setBulkError(null);
                            setBulkAddTags(value);
                          }}
                          onRemoveTagsChange={(value) => {
                            setBulkError(null);
                            setBulkRemoveTags(value);
                          }}
                          onApply={() => void applyBulkEdit()}
                          onClearSelection={clearAssetSelection}
                          onSoftDelete={() =>
                            setBulkDeletePending({
                              ids: Array.from(selectedAssetIds),
                              permanent: false,
                            })
                          }
                          onPermanentDelete={() =>
                            setBulkDeletePending({
                              ids: Array.from(selectedAssetIds),
                              permanent: true,
                            })
                          }
                          onRestore={() => void bulkRestoreSelectedAssets()}
                        />
                      )}
                    </BulkEditPresence>
                  ) : null}
                  {assetViewMode === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4 p-5">
                      {visibleAssets.map((asset) => {
                        const Icon = assetIcon(asset);

                        return (
                          <article
                            key={asset.id}
                            className="content-auto-card grid min-w-0 gap-3 rounded-[8px] border border-border bg-background p-3"
                          >
                            <AssetListMedia asset={asset} Icon={Icon} variant="grid" />
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium">
                                {asset.displayName}
                              </h3>
                              <p className="truncate text-xs text-muted-foreground">
                                {asset.originalFilename}
                              </p>
                              <AssetBadges asset={asset} />
                            </div>
                            <AssetActions
                              asset={asset}
                              copied={copiedId === asset.id}
                              onCopy={() => void copyAssetLink(asset)}
                              onCopyFormat={(format) => void copyText(format.value, format.message)}
                              onRestore={() => void restoreDeletedAsset(asset)}
                              onOpen={(trigger) => openDetails(asset, trigger)}
                              onDelete={(trigger) => requestDelete(asset, trigger)}
                              layout="grid"
                            />
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          {canBulkSelect ? (
                            <TableHead className="px-5">
                              <input
                                ref={selectAllCheckboxRef}
                                type="checkbox"
                                checked={allSelectableAssetsSelected}
                                onChange={(event) => setPageSelection(event.target.checked)}
                                disabled={selectableAssets.length === 0}
                                aria-label="Select all assets on this page"
                                aria-checked={
                                  someSelectableAssetsSelected
                                    ? "mixed"
                                    : allSelectableAssetsSelected
                                      ? "true"
                                      : "false"
                                }
                                className={CHECKBOX_CLASS}
                              />
                            </TableHead>
                          ) : null}
                          <TableHead className="px-5">Name</TableHead>
                          <TableHead className="hidden w-32 lg:table-cell">Type</TableHead>
                          <TableHead className="hidden w-28 text-right md:table-cell">Size</TableHead>
                          <TableHead className="hidden w-36 text-right xl:table-cell">
                            {showTrash ? "Deleted" : "Uploaded"}
                          </TableHead>
                          <TableHead className="w-[228px] px-5 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleAssets.map((asset) => {
                          const Icon = assetIcon(asset);
                          const selectable = assetIsSelectable(asset);
                          const selected = selectedAssetIds.has(asset.id);
                          const assetIdentity = (
                            <div className="flex min-w-0 items-center gap-3">
                              <AssetListMedia asset={asset} Icon={Icon} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium leading-5">{asset.displayName}</p>
                                <p className="truncate text-xs leading-4 text-muted-foreground">
                                  {asset.originalFilename}
                                </p>
                                <AssetBadges asset={asset} />
                              </div>
                            </div>
                          );

                          return (
                            <TableRow
                              key={asset.id}
                              className={cn(
                                "group",
                                selected && "bg-primary/5 hover:bg-primary/10",
                              )}
                            >
                              {canBulkSelect ? (
                                <TableCell className="px-5 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={!selectable}
                                    onChange={(event) =>
                                      setAssetSelection(
                                        asset.id,
                                        event.target.checked,
                                        eventHasShiftKey(event),
                                      )
                                    }
                                    aria-label={`${selected ? "Deselect" : "Select"} ${asset.displayName}`}
                                    className={CHECKBOX_CLASS}
                                  />
                                </TableCell>
                              ) : null}
                              <TableCell className="px-5 py-3">
                                {canBulkSelect && selectable ? (
                                  <button
                                    type="button"
                                    className="block w-full rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={(event) =>
                                      toggleAssetSelection(asset.id, event.shiftKey)
                                    }
                                    aria-pressed={selected}
                                    aria-label={`${selected ? "Deselect" : "Select"} ${asset.displayName}`}
                                  >
                                    {assetIdentity}
                                  </button>
                                ) : (
                                  assetIdentity
                                )}
                              </TableCell>
                              <TableCell className="hidden py-3 lg:table-cell">
                                <div className="flex min-w-0 items-center gap-2">
                                  <Icon className="size-4 shrink-0 text-primary" />
                                  <span className="truncate text-sm capitalize text-muted-foreground">
                                    {kindLabel(asset.kind)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden py-3 text-right font-medium tabular-nums text-muted-foreground md:table-cell">
                                {formatBytes(asset.sizeBytes)}
                              </TableCell>
                              <TableCell className="hidden py-3 text-right text-muted-foreground xl:table-cell">
                                {uploadedDate(asset.deletedAt || asset.uploadedAt)}
                              </TableCell>
                              <TableCell className="px-5 py-3">
                                <AssetActions
                                  asset={asset}
                                  copied={copiedId === asset.id}
                                  onCopy={() => void copyAssetLink(asset)}
                                  onCopyFormat={(format) =>
                                    void copyText(format.value, format.message)
                                  }
                                  onRestore={() => void restoreDeletedAsset(asset)}
                                  onOpen={(trigger) => openDetails(asset, trigger)}
                                  onDelete={(trigger) => requestDelete(asset, trigger)}
                                  layout="list"
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    total={total}
                    disabled={isLoading}
                    onPageChange={setCurrentPage}
                  />
                </>
              ) : (
                <div className="flex min-h-[540px] items-center justify-center px-6 py-10">
                  {isFirstAssetRun ? (
                    <div className="grid w-full max-w-3xl gap-8 text-left md:grid-cols-[minmax(0,1fr)_280px] md:items-center">
                      <div className="min-w-0">
                        <div className="mb-4 flex size-14 items-center justify-center rounded-[8px] border border-border bg-background">
                          <UploadCloud className="size-7 text-primary" />
                        </div>
                        <h3 className="text-2xl font-semibold leading-8">Create your first stable asset link</h3>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                          Upload one file, confirm how it should be organized, then copy a stable URL for Webflow. The link stays the same if the file needs to be replaced later.
                        </p>
                        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                          <Button type="button" onClick={() => fileInputRef.current?.click()}>
                            <UploadCloud />
                            Choose file
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setActiveView("usage");
                              setCurrentPage(1);
                            }}
                          >
                            <BarChart3 />
                            View usage
                          </Button>
                        </div>
                      </div>
                      <ol className="grid rounded-[8px] border border-border bg-background text-sm">
                        {[
                          ["Upload", "Add a file to the queue. Nothing is stored until you confirm."],
                          ["Organize", "Set folder, tags, and cache policy before the file becomes ready."],
                          ["Copy", "Use the stable link in Webflow, then manage replacements here."],
                        ].map(([title, detail], index) => (
                          <li
                            key={title}
                            className={cn(
                              "grid grid-cols-[2rem_1fr] gap-3 p-4",
                              index > 0 && "border-t border-border",
                            )}
                          >
                            <span className="flex size-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground">
                              {index + 1}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold leading-5 text-foreground">{title}</span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-4 flex size-14 items-center justify-center rounded-[8px] border border-border bg-background">
                        <UploadCloud className="size-7 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold">
                        {hasAssetFilters ? "No matching assets" : showTrash ? "Trash is empty" : "No assets yet"}
                      </h3>
                      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                        {hasAssetFilters
                          ? "Try another search term or clear the folder and tag filters."
                          : showTrash
                            ? `Deleted assets will appear here for ${retentionDays} days before permanent deletion.`
                            : "Upload a file to create the first stable link."}
                      </p>
                      {hasAssetFilters ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-5"
                          onClick={clearAssetFilters}
                        >
                          <X />
                          Clear filters
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </section>

        <Sheet
          open={Boolean(activeAsset)}
          onOpenChange={(open) => {
            if (!open) {
              closeActiveAsset();
            }
          }}
        >
          {activeAsset ? (
            <SheetContent
              className="max-w-[72rem]"
              onEscapeKeyDown={(event) => {
                if (isReplacing) event.preventDefault();
              }}
              onPointerDownOutside={(event) => {
                if (isReplacing) event.preventDefault();
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid min-h-full lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
                  <div className="min-w-0 border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
                    <div className="grid gap-5">
                      <AssetPreview asset={activeAsset} />

                      <div className="min-w-0">
                        <SheetHeader className="pr-10">
                          <SheetTitle className={cn("min-w-0 text-2xl leading-7", RESILIENT_VALUE_CLASS)}>
                            {activeAsset.displayName}
                          </SheetTitle>
                        </SheetHeader>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-info/35 bg-info/10 capitalize text-foreground">
                            {kindLabel(activeAsset.kind)}
                          </Badge>
                          <Badge variant="outline">{formatBytes(activeAsset.sizeBytes)}</Badge>
                          <Badge variant="outline">{activeAsset.cachePolicy}</Badge>
                          {activeAsset.deletedAt ? (
                            <Badge variant="outline" className="border-destructive/40 text-destructive">
                              In trash
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      {activeAsset.deletedAt ? (
                        <div className="rounded-[8px] border border-destructive/30 bg-destructive/10 p-4">
                          <p className="text-sm font-semibold">This asset is in trash.</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Restore it to make the stable link work again. Permanent deletion is available
                            until automatic cleanup after{" "}
                            {activeAsset.deleteAfter ? detailDate(activeAsset.deleteAfter) : "the retention period"}.
                          </p>
                        </div>
                      ) : null}

                      {activeAsset.cachePolicy === "immutable" ? (
                        <div className="flex gap-3 rounded-[8px] border border-warning/35 bg-warning/10 p-3 text-sm">
                          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                          <p className="text-muted-foreground">
                            Immutable caching can keep the previous file around when the host honors
                            cache headers.
                          </p>
                        </div>
                      ) : null}

                      <AssetDeliveryExceptionNotice asset={activeAsset} settings={config.settings} />

                      <details className="group border-t border-border pt-5">
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                          <div>
                            <h3 className="text-base font-semibold leading-6">Object metadata</h3>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              Storage, delivery, and debugging details.
                            </p>
                          </div>
                          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                          <DetailRow label="Stable URL" value={activeAsset.url} wide breakValue />
                          <DetailRow label="Fresh URL" value={activeAsset.cacheBustedUrl} wide breakValue />
                          <DetailRow label="URL slug" value={activeAsset.slug} wide breakValue />
                          <DetailRow label="Object key" value={activeAsset.objectKey} wide breakValue />
                          <DetailRow label="Filename" value={activeAsset.originalFilename} />
                          <DetailRow label="MIME type" value={activeAsset.contentType} />
                          <DetailRow label="Kind" value={kindLabel(activeAsset.kind)} />
                          <DetailRow label="Size" value={formatBytes(activeAsset.sizeBytes)} />
                          <DetailRow label="ETag" value={activeAsset.etag || "Unavailable"} breakValue />
                          <DetailRow
                            label="SHA-256"
                            value={activeAsset.contentSha256 || "Unavailable"}
                            breakValue
                          />
                          <DetailRow label="Folder" value={activeAsset.folder || "None"} />
                          <DetailRow
                            label="Tags"
                            value={activeAsset.tags.length ? activeAsset.tags.join(", ") : "None"}
                          />
                          <DetailRow label="Cache policy" value={activeAsset.cachePolicy} />
                          <DetailRow label="Domain rule" value={domainRuleLabel(activeAsset)} />
                          <DetailRow label="Allowed domains" value={allowedOriginsLabel(activeAsset)} breakValue />
                          <DetailRow
                            label="Global restrictions"
                            value={config.settings.domainRestrictionsEnabled ? "On" : "Off"}
                          />
                          <DetailRow
                            label="Global domains"
                            value={
                              config.settings.allowedAssetOrigins.length
                                ? config.settings.allowedAssetOrigins.join(", ")
                                : "None"
                            }
                            breakValue
                          />
                          <DetailRow label="Cache version" value={String(activeAsset.cacheVersion)} />
                          <DetailRow label="Uploaded" value={detailDate(activeAsset.uploadedAt)} />
                          <DetailRow label="Updated" value={detailDate(activeAsset.updatedAt)} />
                          {activeAsset.deletedAt ? (
                            <>
                              <DetailRow label="Deleted" value={detailDate(activeAsset.deletedAt)} />
                              <DetailRow
                                label="Delete after"
                                value={activeAsset.deleteAfter ? detailDate(activeAsset.deleteAfter) : "Unknown"}
                              />
                            </>
                          ) : null}
                        </dl>
                      </details>
                    </div>
                  </div>

                  <div className="min-w-0 p-5 pr-12 sm:p-6 sm:pr-12">
                    <div className="grid gap-6">
                      {!activeAsset.deletedAt ? (
                        <>
                          <section className="grid gap-3">
                            <div>
                              <h3 className="text-base font-semibold leading-6">Use this asset</h3>
                              <p className="mt-1 max-w-[34rem] text-xs leading-5 text-muted-foreground">
                                Copy the stable URL or a ready-to-paste snippet.
                              </p>
                            </div>
                            <Button
                              className="justify-start"
                              onClick={() => void copyText(activeAsset.url, "Stable link copied.")}
                            >
                              <Copy />
                              Copy stable link
                            </Button>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {secondaryCopyFormats.map((format) => {
                                const Icon = format.icon;

                                return (
                                  <Button
                                    key={format.label}
                                    variant="outline"
                                    className={cn("justify-start", format.wide && "sm:col-span-2")}
                                    onClick={() => void copyText(format.value, format.message)}
                                  >
                                    <Icon />
                                    {format.label}
                                  </Button>
                                );
                              })}
                            </div>
                            <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={useFreshSnippetUrls}
                                onChange={(event) => setUseFreshSnippetUrls(event.target.checked)}
                                className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                              Use fresh URLs in snippets
                            </label>
                          </section>

                          <section className="grid gap-4 border-t border-border pt-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold leading-6">Replace file</h3>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  Keep the stable URL and replace the stored file behind it.
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                                <input
                                  ref={replacementInputRef}
                                  type="file"
                                  className="hidden"
                                  onChange={(event) =>
                                    chooseReplacementFile(event.currentTarget.files?.[0] || null)
                                  }
                                  disabled={isReplacing}
                                />
                                <Button
                                  variant="outline"
                                  onClick={() => replacementInputRef.current?.click()}
                                  disabled={isReplacing}
                                >
                                  <UploadCloud />
                                  Choose file
                                </Button>
                                {replacementFile ? (
                                  <Button
                                    variant="ghost"
                                    onClick={resetReplacementState}
                                    disabled={isReplacing}
                                  >
                                    <X />
                                    Remove
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            {replacementFile ? (
                              <div className="grid gap-3 rounded-[8px] border border-border p-3">
                                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <p className={cn("text-sm font-semibold", RESILIENT_VALUE_CLASS)}>
                                      {replacementFile.name}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatBytes(replacementFile.size)}
                                    </p>
                                  </div>
                                  {replacementKind ? (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "w-fit capitalize",
                                        replacementKind !== activeAsset.kind &&
                                          "border-destructive/40 text-destructive",
                                      )}
                                    >
                                      {kindLabel(replacementKind)}
                                    </Badge>
                                  ) : null}
                                </div>
                                {replacementProgress > 0 ? <Progress value={replacementProgress} /> : null}
                                {replacementError ? (
                                  <div className="flex min-w-0 gap-2 rounded-[8px] border border-destructive/30 bg-destructive/10 p-3">
                                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold leading-5 text-destructive">
                                        {replacementError.title}
                                      </p>
                                      <p className={cn("mt-1 text-xs text-muted-foreground", RESILIENT_VALUE_CLASS)}>
                                        {replacementError.message}
                                      </p>
                                      {replacementError.action ? (
                                        <Button type="button" variant="outline" size="sm" className="mt-3" asChild>
                                          <Link href={replacementError.action.href}>
                                            {replacementError.action.label}
                                          </Link>
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {replacementFile ? (
                              <div className="flex justify-end">
                                <Button
                                  onClick={(event) => {
                                    dialogReturnFocusRef.current = event.currentTarget;
                                    setIsConfirmingReplacement(true);
                                  }}
                                  disabled={Boolean(replacementError) || isReplacing}
                                >
                                  {isReplacing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                                  Replace file
                                </Button>
                              </div>
                            ) : null}
                          </section>
                        </>
                      ) : null}

                      <section className="grid gap-4 border-t border-border pt-5">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base font-semibold leading-6">Editable details</h3>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Update how teammates find, organize, and copy this asset.
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="details-name">Asset name</Label>
                            <Input
                              id="details-name"
                              value={assetDraft.displayName}
                              onChange={(event) => {
                                setSaveDetailsError(null);
                                setAssetDraft((current) => ({
                                  ...current,
                                  displayName: event.target.value,
                                }));
                              }}
                              disabled={isSavingDetails || isReplacing}
                            />
                          </div>
                          <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="details-slug">URL slug</Label>
                            <Input
                              id="details-slug"
                              value={assetDraft.slug}
                              onChange={(event) => {
                                setSaveDetailsError(null);
                                setAssetDraft((current) => ({
                                  ...current,
                                  slug: event.target.value,
                                }));
                              }}
                              placeholder="brand-guide.pdf"
                              disabled={isSavingDetails || isReplacing}
                            />
                            <p className="text-xs leading-5 text-muted-foreground">
                              Spaces become hyphens. Keep this stable after sharing the URL.
                            </p>
                            {assetSlugWillChange ? (
                              <div className="flex gap-2 rounded-[8px] border border-warning/35 bg-warning/10 p-3 text-xs leading-5 text-muted-foreground">
                                <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                                <p>
                                  Changing this slug changes the stable URL and breaks links already copied for this
                                  asset.
                                </p>
                              </div>
                            ) : null}
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="details-folder" className={FIELD_LABEL_CLASS}>
                              Folder
                            </Label>
                            <Input
                              id="details-folder"
                              value={assetDraft.folder}
                              onChange={(event) => {
                                setSaveDetailsError(null);
                                setAssetDraft((current) => ({
                                  ...current,
                                  folder: event.target.value,
                                }));
                              }}
                              placeholder="Campaign"
                              disabled={isSavingDetails || isReplacing}
                            />
                          </div>
                          <div className="grid gap-2">
                            <CachePolicyLabel htmlFor="details-cache" />
                            <select
                              id="details-cache"
                              className={SELECT_CLASS}
                              value={assetDraft.cachePolicy}
                              onChange={(event) => {
                                setSaveDetailsError(null);
                                setAssetDraft((current) => ({
                                  ...current,
                                  cachePolicy: event.target.value as CachePolicy,
                                }));
                              }}
                              disabled={isSavingDetails || isReplacing}
                            >
                              {CACHE_POLICY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="details-tags">Tags</Label>
                            <Input
                              id="details-tags"
                              value={assetDraft.tags}
                              onChange={(event) => {
                                setSaveDetailsError(null);
                                setAssetDraft((current) => ({
                                  ...current,
                                  tags: event.target.value,
                                }));
                              }}
                              placeholder="hero, launch, docs"
                              disabled={isSavingDetails || isReplacing}
                            />
                          </div>
                          <div className="grid gap-3 pt-1 sm:col-span-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold">Asset delivery domains</h4>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label="Asset delivery domain details"
                                  >
                                    <Info className="size-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Controls where this file URL can be embedded when domain restrictions are enabled.
                                  This is not auth.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name="details-domain-rule"
                                  checked={assetDraft.inheritAllowedOrigins}
                                  onChange={() => {
                                    setSaveDetailsError(null);
                                    setAssetDraft((current) => ({
                                      ...current,
                                      inheritAllowedOrigins: true,
                                    }));
                                  }}
                                  disabled={isSavingDetails || isReplacing}
                                  className="size-4 accent-primary"
                                />
                                Inherit global settings
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name="details-domain-rule"
                                  checked={!assetDraft.inheritAllowedOrigins}
                                  onChange={() => {
                                    setSaveDetailsError(null);
                                    setAssetDraft((current) => ({
                                      ...current,
                                      inheritAllowedOrigins: false,
                                    }));
                                  }}
                                  disabled={isSavingDetails || isReplacing}
                                  className="size-4 accent-primary"
                                />
                                Override for this asset
                              </label>
                            </div>
                            {!assetDraft.inheritAllowedOrigins ? (
                              <div className="grid gap-2">
                                <Label htmlFor="details-allowed-origins">Allowed domains</Label>
                                <textarea
                                  id="details-allowed-origins"
                                  value={assetDraft.allowedOrigins}
                                  onChange={(event) => {
                                    setSaveDetailsError(null);
                                    setAssetDraft((current) => ({
                                      ...current,
                                      allowedOrigins: event.target.value,
                                    }));
                                  }}
                                  className={TEXTAREA_CLASS}
                                  placeholder={"https://campaign.example.com\nhttps://preview.example.com"}
                                  disabled={isSavingDetails || isReplacing}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {saveDetailsError ? (
                          <InlineErrorNotice
                            error={saveDetailsError}
                            onRetry={() => void saveAssetDetails()}
                          />
                        ) : null}
                        {restoreError ? (
                          <InlineErrorNotice
                            error={restoreError}
                            onRetry={() => void restoreDeletedAsset(activeAsset)}
                          />
                        ) : null}
                        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                          <Button
                            variant="outline"
                            onClick={() => void saveAssetDetails()}
                            disabled={isSavingDetails || isReplacing || Boolean(activeAsset.deletedAt)}
                          >
                            {isSavingDetails ? <Loader2 className="animate-spin" /> : <Pencil />}
                            Save details
                          </Button>
                          {activeAsset.deletedAt ? (
                            <Button
                              variant="outline"
                              onClick={() => void restoreDeletedAsset(activeAsset)}
                              disabled={isSavingDetails || isReplacing}
                            >
                              {isSavingDetails ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                              Restore
                            </Button>
                          ) : null}
                          <Button
                            variant="destructive"
                            onClick={(event) => requestDelete(activeAsset, event.currentTarget)}
                            disabled={isSavingDetails || isReplacing}
                          >
                            <Trash2 />
                            {activeAsset.deletedAt ? "Delete forever" : "Move to trash"}
                          </Button>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {activeAsset.deletedAt
                            ? "Permanent deletion removes the stored object and breaks the stable link."
                            : `Trash pauses the stable link. You can restore this asset for ${retentionDays} days.`}
                        </p>
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          ) : null}
        </Sheet>

        <Dialog
          open={isConfirmingReplacement}
          onOpenChange={(open) => {
            if (!open && !isReplacing) {
              setIsConfirmingReplacement(false);
              returnFocusToDialogTrigger();
            }
          }}
        >
          {activeAsset && replacementFile ? (
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Replace this file?</DialogTitle>
                <DialogDescription>
                  This overwrites the stored object. Existing copied links keep the same URL.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 rounded-[8px] border border-border bg-background p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Current asset
                  </p>
                  <p className={cn("text-sm font-semibold", RESILIENT_VALUE_CLASS)}>
                    {activeAsset.displayName}
                  </p>
                  <p className={cn("mt-1 text-xs text-muted-foreground", RESILIENT_CODE_CLASS)}>
                    {activeAsset.url}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Replacement
                  </p>
                  <p className={cn("text-sm font-semibold", RESILIENT_VALUE_CLASS)}>
                    {replacementFile.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBytes(replacementFile.size)} ·{" "}
                    {replacementKind ? kindLabel(replacementKind) : "File"}
                  </p>
                </div>
                <div className="grid gap-2 rounded-[8px] border border-border p-3 text-xs leading-5 text-muted-foreground">
                  <p>
                    Type check:{" "}
                    <span className="font-semibold text-foreground">
                      {replacementKind === activeAsset.kind
                        ? `Matches ${kindLabel(activeAsset.kind)}`
                        : `Expected ${kindLabel(activeAsset.kind)}`}
                    </span>
                  </p>
                  <p>
                    Cache policy:{" "}
                    <span className="font-semibold text-foreground">
                      {activeAsset.cachePolicy}
                    </span>
                  </p>
                  <p>
                    Cache effect: visitors receive the new file when browser and platform caches
                    allow it.
                  </p>
                </div>
              </div>

              {activeAsset.cachePolicy === "immutable" ? (
                <div className="flex gap-3 rounded-[8px] border border-warning/35 bg-warning/10 p-3 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-muted-foreground">
                    Immutable caching may delay when existing visitors see the new file where cache
                    headers are honored.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConfirmingReplacement(false);
                    returnFocusToDialogTrigger();
                  }}
                  disabled={isReplacing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void replaceActiveAsset()}
                  disabled={isReplacing || replacementKind !== activeAsset.kind}
                >
                  {isReplacing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Replace file
                </Button>
              </div>
            </DialogContent>
          ) : null}
        </Dialog>

        <Dialog
          open={Boolean(assetPendingDelete)}
          onOpenChange={(open) => {
            if (!open) {
              setAssetPendingDelete(null);
              returnFocusToDialogTrigger();
            }
          }}
        >
          {assetPendingDelete ? (
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {assetPendingDelete.deletedAt ? "Permanently delete asset?" : "Move asset to trash?"}
                </DialogTitle>
                <DialogDescription>
                  {assetPendingDelete.deletedAt
                    ? "This permanently deletes the stored object and metadata. The stable link will no longer resolve and the asset cannot be restored."
                    : `This pauses the stable link and moves the asset to trash for ${retentionDays} days. Restoring it brings the link back.`}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-[8px] border border-border bg-background p-4">
                <p className={cn("text-sm font-semibold", RESILIENT_VALUE_CLASS)}>
                  {assetPendingDelete.displayName}
                </p>
                <p className={cn("mt-1 text-xs text-muted-foreground", RESILIENT_VALUE_CLASS)}>
                  {assetPendingDelete.originalFilename}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssetPendingDelete(null);
                    returnFocusToDialogTrigger();
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void deleteAsset()}>
                  <Trash2 />
                  {assetPendingDelete.deletedAt ? "Delete forever" : "Move to trash"}
                </Button>
              </div>
            </DialogContent>
          ) : null}
        </Dialog>

        <Dialog
          open={Boolean(bulkDeletePending)}
          onOpenChange={(open) => {
            if (!open && !isBulkDeleting) setBulkDeletePending(null);
          }}
        >
          {bulkDeletePending ? (
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {bulkDeletePending.permanent
                    ? `Permanently delete ${bulkDeletePending.ids.length} asset${bulkDeletePending.ids.length === 1 ? "" : "s"}?`
                    : `Move ${bulkDeletePending.ids.length} asset${bulkDeletePending.ids.length === 1 ? "" : "s"} to trash?`}
                </DialogTitle>
                <DialogDescription>
                  {bulkDeletePending.permanent
                    ? "This permanently deletes the stored objects and metadata. The stable links will no longer resolve and the assets cannot be restored."
                    : `This pauses the stable links and moves the assets to trash for ${retentionDays} days. They can be restored from the trash view.`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => setBulkDeletePending(null)}
                  disabled={isBulkDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void bulkDeleteAssets()}
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {bulkDeletePending.permanent ? "Delete forever" : "Move to trash"}
                </Button>
              </div>
            </DialogContent>
          ) : null}
        </Dialog>

        <Dialog
          open={isConfirmingDiscardDetails}
          onOpenChange={(open) => {
            if (!open && !isSavingDetails) {
              setIsConfirmingDiscardDetails(false);
              returnFocusToDetailsTrigger();
            }
          }}
        >
          <DialogContent className="max-w-md overflow-hidden">
            <DialogHeader className="min-w-0 pr-6">
              <DialogTitle>Unsaved asset details</DialogTitle>
              <DialogDescription className={RESILIENT_VALUE_CLASS}>
                Save your changes before closing, or discard them and keep the stored file unchanged.
              </DialogDescription>
            </DialogHeader>
            <div className={cn("min-w-0 rounded-[8px] border border-border bg-background p-4 text-sm leading-5 text-muted-foreground", RESILIENT_VALUE_CLASS)}>
              Name, folder, tags, cache policy, or delivery domains have changed.
            </div>
            <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                variant="ghost"
                onClick={() => closeActiveAsset({ discardDetails: true })}
                disabled={isSavingDetails}
              >
                Discard changes
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsConfirmingDiscardDetails(false);
                  returnFocusToDetailsTrigger();
                }}
                disabled={isSavingDetails}
              >
                Keep editing
              </Button>
              <Button
                onClick={() => {
                  setIsConfirmingDiscardDetails(false);
                  void saveAssetDetails({ closeOnSuccess: true });
                }}
                disabled={isSavingDetails}
              >
                {isSavingDetails ? <Loader2 className="animate-spin" /> : <Pencil />}
                Save details
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}

function UsageDashboard({
  usage,
  isLoading,
  error,
  onRetry,
}: {
  usage: AssetUsageResponse | null;
  isLoading: boolean;
  error: UiError | null;
  onRetry: () => void;
}) {
  if ((isLoading || (!usage && !error)) && !usage) {
    return (
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="flex min-h-[540px] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-[8px] border border-border bg-background">
          <BarChart3 className="size-7 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">{error?.title || "Usage unavailable"}</h3>
        <p className={cn("mt-2 max-w-sm text-sm text-muted-foreground", RESILIENT_VALUE_CLASS)}>
          {error?.message || "Refresh the dashboard to load storage usage from the asset index."}
        </p>
        {error?.action ? (
          <Button type="button" variant="outline" className="mt-5" asChild>
            <Link href={error.action.href}>{error.action.label}</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
            <RefreshCw />
            Retry
          </Button>
        )}
      </div>
    );
  }

  const largestKind = USAGE_KIND_ORDER.map((kind) => usage.byKind[kind]).sort(
    (a, b) => b.bytes - a.bytes,
  )[0];
  const activeStorageDetail =
    usage.trashedBytes > 0
      ? `${formatBytes(usage.activeBytes)} active, ${formatBytes(usage.trashedBytes)} in trash.`
      : "No trash storage counted right now.";

  return (
    <div className="grid gap-5 p-5">
      {error ? (
        <InlineErrorNotice
          error={error}
          onRetry={onRetry}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <UsageMetricCard
          icon={HardDrive}
          label="Storage in use"
          value={formatBytes(usage.totalBytes)}
          detail={activeStorageDetail}
        />
        <UsageMetricCard
          icon={Database}
          label="Ready assets"
          value={usage.assetCount.toLocaleString()}
          detail={`${countLabel(usage.activeCount, "active", "active")} · ${countLabel(usage.trashedCount, "in trash", "in trash")}`}
        />
        <UsageMetricCard
          icon={BarChart3}
          label="Largest type"
          value={largestKind ? kindLabel(largestKind.kind) : "None"}
          detail={
            largestKind && largestKind.bytes > 0
              ? `${formatBytes(largestKind.bytes)} across ${countLabel(largestKind.count, "asset")}.`
              : "Upload assets to build a usage profile."
          }
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <UsageKindBreakdown usage={usage} />
        <div className="grid gap-4">
          <UsageFileList title="Largest files" items={usage.largestFiles} mode="largest" />
          <UsageFileList title="Recent uploads" items={usage.recentUploads} mode="recent" />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Generated {relativeDate(usage.generatedAt)} from indexed asset metadata.
      </p>
    </div>
  );
}

function ConfigErrorBanner({
  error,
  isRetrying,
  onRetry,
}: {
  error: UiError;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border-b border-border bg-background p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{error.title}</p>
          <p className={cn("mt-1 text-xs leading-5 text-muted-foreground", RESILIENT_VALUE_CLASS)}>
            {error.message}
          </p>
        </div>
      </div>
      {error.action ? (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={error.action.href}>{error.action.label}</Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Retry
        </Button>
      )}
    </div>
  );
}

function AssetListErrorState({
  error,
  onRetry,
}: {
  error: UiError;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex min-h-[540px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-[8px] border border-border bg-background">
        <AlertCircle className="size-7 text-destructive" />
      </div>
      <h3 className="text-xl font-semibold">{error.title}</h3>
      <p className={cn("mt-2 max-w-md text-sm text-muted-foreground", RESILIENT_VALUE_CLASS)}>
        {error.message}
      </p>
      {error.action ? (
        <Button type="button" variant="outline" className="mt-5" asChild>
          <Link href={error.action.href}>{error.action.label}</Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      )}
    </div>
  );
}

function InlineErrorNotice({
  title,
  message,
  error,
  onRetry,
}: {
  title?: string;
  message?: string;
  error?: UiError;
  onRetry?: () => void;
}) {
  const resolvedTitle = error?.title || title || "Something went wrong";
  const resolvedMessage = error?.message || message || "Try again.";

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-[8px] border border-border bg-background p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{resolvedTitle}</p>
          <p className={cn("mt-1 text-xs leading-5 text-muted-foreground", RESILIENT_VALUE_CLASS)}>
            {resolvedMessage}
          </p>
        </div>
      </div>
      {error?.action ? (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={error.action.href}>{error.action.label}</Link>
        </Button>
      ) : onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function UsageMetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-[8px] border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-[1.375rem] font-semibold leading-7 tabular-nums">{value}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-[8px] border border-border">
          <Icon className="size-4 text-primary" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-5 text-muted-foreground">{detail}</p>
    </section>
  );
}

function UsageKindBreakdown({ usage }: { usage: AssetUsageResponse }) {
  return (
    <section className="content-auto-section rounded-[8px] border border-border bg-background p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold leading-5">Count by type</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Ready assets, including trash.</p>
        </div>
        <BarChart3 className="size-5 text-primary" />
      </div>
      <div className="grid gap-3">
        {USAGE_KIND_ORDER.map((kind) => {
          const stat = usage.byKind[kind];
          const Icon = assetIcon({ kind });

          return (
            <div key={kind} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="truncate font-medium leading-5">{kindLabel(kind)}</span>
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {stat.count.toLocaleString()} · {formatBytes(stat.bytes)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(stat.percentBytes, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UsageFileList({
  title,
  items,
  mode,
}: {
  title: string;
  items: AssetUsageItem[];
  mode: "largest" | "recent";
}) {
  return (
    <section className="content-auto-section rounded-[8px] border border-border bg-background p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold leading-5">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {mode === "largest" ? "Top ready assets by stored size." : "Newest ready assets by upload time."}
          </p>
        </div>
        {mode === "largest" ? (
          <HardDrive className="size-5 text-primary" />
        ) : (
          <UploadCloud className="size-5 text-primary" />
        )}
      </div>
      {items.length ? (
        <div className="content-auto-section grid gap-3">
          {items.map((item) => (
            <UsageFileRow
              key={item.id}
              item={item}
              trailing={mode === "largest" ? formatBytes(item.sizeBytes) : relativeDate(item.uploadedAt)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-[8px] border border-dashed border-border text-center">
          <File className="mb-3 size-7 text-primary" />
          <p className="text-sm font-semibold">No ready assets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Upload assets to populate this list.</p>
        </div>
      )}
    </section>
  );
}

function UsageFileRow({
  item,
  trailing,
}: {
  item: AssetUsageItem;
  trailing: string;
}) {
  const Icon = assetIcon(item);

  return (
    <div className="rounded-[8px] border border-border p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[6px] border border-border">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-5">{item.displayName}</p>
            <p className={cn("mt-1 text-xs leading-4 text-muted-foreground", RESILIENT_VALUE_CLASS)}>
              {item.originalFilename}
            </p>
          </div>
        </div>
        <span className="min-w-0 shrink-0 text-right text-sm font-semibold tabular-nums">
          {trailing}
        </span>
      </div>
    </div>
  );
}

function BulkEditPresence({
  selectedCount,
  children,
}: {
  selectedCount: number;
  children: (visibleSelectedCount: number, isClosing: boolean) => React.ReactNode;
}) {
  const [isPresent, setIsPresent] = React.useState(selectedCount > 0);
  const [isClosing, setIsClosing] = React.useState(false);
  const [visibleSelectedCount, setVisibleSelectedCount] = React.useState(selectedCount);

  React.useEffect(() => {
    if (selectedCount > 0) {
      setVisibleSelectedCount(selectedCount);
      setIsClosing(false);
      setIsPresent(true);
      return;
    }

    if (!isPresent) return;

    setIsClosing(true);
    const timeout = window.setTimeout(() => {
      setIsPresent(false);
      setIsClosing(false);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [isPresent, selectedCount]);

  if (!isPresent) return null;

  return children(visibleSelectedCount, isClosing);
}

function BulkEditBar({
  selectedCount,
  showTrash,
  folder,
  clearFolder,
  cachePolicy,
  addTags,
  removeTags,
  isSaving,
  isDeleting,
  isRestoring,
  summary,
  error,
  isClosing = false,
  onFolderChange,
  onClearFolderChange,
  onCachePolicyChange,
  onAddTagsChange,
  onRemoveTagsChange,
  onApply,
  onClearSelection,
  onSoftDelete,
  onPermanentDelete,
  onRestore,
}: {
  selectedCount: number;
  showTrash: boolean;
  folder: string;
  clearFolder: boolean;
  cachePolicy: CachePolicy | "";
  addTags: string;
  removeTags: string;
  isSaving: boolean;
  isDeleting: boolean;
  isRestoring: boolean;
  summary: string[];
  error: UiError | null;
  isClosing?: boolean;
  onFolderChange: (value: string) => void;
  onClearFolderChange: (value: boolean) => void;
  onCachePolicyChange: (value: CachePolicy | "") => void;
  onAddTagsChange: (value: string) => void;
  onRemoveTagsChange: (value: string) => void;
  onApply: () => void;
  onClearSelection: () => void;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
  onRestore: () => void;
}) {
  const busy = isSaving || isDeleting || isRestoring;
  const hasBulkEditDraft = !showTrash && summary.length > 0;
  const canHideMetadataFields = !hasBulkEditDraft && !error;
  const [isEditingMetadata, setIsEditingMetadata] = React.useState(false);
  const bulkFieldsId = React.useId();

  React.useEffect(() => {
    if (showTrash) {
      setIsEditingMetadata(false);
      return;
    }

    if (hasBulkEditDraft || error) {
      setIsEditingMetadata(true);
    }
  }, [error, hasBulkEditDraft, showTrash]);

  return (
    <section
      data-state={isClosing ? "closing" : "open"}
      className={cn(
        "bulk-action-motion sticky top-0 z-20 grid gap-3 overflow-hidden border-b border-border bg-background px-4 py-3 will-change-transform",
        isClosing && "pointer-events-none",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold leading-5">
            {selectedCount} selected
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClearSelection}
            disabled={busy}
            aria-label="Clear selection"
          >
            <X />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
          {showTrash ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onRestore}
                disabled={busy}
              >
                {isRestoring ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                Restore
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={DESTRUCTIVE_LINK_BUTTON_CLASS}
                onClick={onPermanentDelete}
                disabled={busy}
              >
                <Trash2 />
                Delete forever
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant={isEditingMetadata ? "secondary" : "default"}
                onClick={() =>
                  setIsEditingMetadata((open) => (open && canHideMetadataFields ? false : true))
                }
                disabled={busy}
                aria-expanded={isEditingMetadata}
                aria-controls={bulkFieldsId}
              >
                <Pencil />
                Edit metadata
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={DESTRUCTIVE_LINK_BUTTON_CLASS}
                onClick={onSoftDelete}
                disabled={busy}
              >
                <Trash2 />
                Move to trash
              </Button>
            </>
          )}
        </div>
      </div>
      {error ? (
        <InlineErrorNotice error={error} onRetry={onApply} />
      ) : null}
      {!showTrash && isEditingMetadata ? (
        <div id={bulkFieldsId} className="grid gap-3 border-t border-border pt-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-2">
              <Label htmlFor="bulk-folder">Folder</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="bulk-folder"
                  value={folder}
                  onChange={(event) => onFolderChange(event.target.value)}
                  placeholder="Set folder"
                  disabled={clearFolder || busy}
                />
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={clearFolder}
                    onChange={(event) => onClearFolderChange(event.target.checked)}
                    disabled={busy}
                    className={CHECKBOX_CLASS}
                  />
                  Clear
                </label>
              </div>
            </div>
            <div className="grid gap-2">
              <CachePolicyLabel htmlFor="bulk-cache">Cache</CachePolicyLabel>
              <select
                id="bulk-cache"
                className={SELECT_CLASS}
                value={cachePolicy}
                onChange={(event) => onCachePolicyChange(event.target.value as CachePolicy | "")}
                disabled={busy}
              >
                <option value="">Keep</option>
                {CACHE_POLICY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-add-tags">Add tags</Label>
              <Input
                id="bulk-add-tags"
                value={addTags}
                onChange={(event) => onAddTagsChange(event.target.value)}
                placeholder="hero, launch"
                disabled={busy}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-remove-tags">Remove tags</Label>
              <Input
                id="bulk-remove-tags"
                value={removeTags}
                onChange={(event) => onRemoveTagsChange(event.target.value)}
                placeholder="old, draft"
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onApply} disabled={busy}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
              Apply edits
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QueueItemCard({
  item,
  showMetadataFields,
  disabled,
  onPatch,
  onRemove,
  onRetry,
  onCopy,
  onAllowDuplicate,
  onCopyDuplicate,
  onOpenDuplicate,
}: {
  item: UploadQueueItem;
  showMetadataFields: boolean;
  disabled: boolean;
  onPatch: (patch: Partial<UploadQueueItem>) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onAllowDuplicate: () => void;
  onCopyDuplicate: (asset: Asset) => void;
  onOpenDuplicate: (asset: Asset) => void;
}) {
  const nameInputId = `queue-${item.id}-name`;
  const folderInputId = `queue-${item.id}-folder`;
  const cacheInputId = `queue-${item.id}-cache`;
  const tagsInputId = `queue-${item.id}-tags`;
  const statusIcon =
    item.status === "complete" ? (
      <Check className="size-4 text-primary" />
    ) : item.status === "error" ? (
      <AlertCircle className="size-4 text-destructive" />
    ) : item.status === "uploading" ? (
      <Loader2 className="size-4 animate-spin text-primary" />
    ) : (
      <File className="size-4 text-muted-foreground" />
    );

  return (
    <div className="content-auto-card grid min-w-0 max-w-full gap-3 rounded-[8px] border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {statusIcon}
            <p className="min-w-0 truncate text-sm font-medium leading-5">{item.file.name}</p>
          </div>
          <p className={cn("mt-1 max-w-full text-xs leading-relaxed text-muted-foreground", RESILIENT_VALUE_CLASS)}>
            {formatBytes(item.file.size)} · {item.file.type || "Unknown type"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.status === "complete" && item.asset ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCopy}
              aria-label={`Copy uploaded asset link for ${item.name || item.file.name}`}
            >
              <Copy />
              <span className="sr-only">Copy uploaded asset link for {item.name || item.file.name}</span>
            </Button>
          ) : null}
          {item.status === "error" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRetry}
              aria-label={`Retry upload for ${item.name || item.file.name}`}
            >
              <RotateCcw />
              <span className="sr-only">Retry upload for {item.name || item.file.name}</span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={item.status === "uploading"}
            aria-label={`Remove ${item.name || item.file.name} from the upload queue`}
          >
            <X />
            <span className="sr-only">Remove {item.name || item.file.name} from the upload queue</span>
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-2">
        <Label htmlFor={nameInputId} className="sr-only">
          Asset name
        </Label>
        <Input
          id={nameInputId}
          value={item.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          placeholder="Asset name"
          disabled={disabled}
        />
        {showMetadataFields ? (
          <>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Label htmlFor={folderInputId} className="sr-only">
                  Folder
                </Label>
                <Input
                  id={folderInputId}
                  value={item.folder}
                  onChange={(event) => onPatch({ folder: event.target.value })}
                  placeholder="Folder"
                  disabled={disabled}
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor={cacheInputId} className="sr-only">
                  Cache policy
                </Label>
                <select
                  id={cacheInputId}
                  className={SELECT_CLASS}
                  value={item.cachePolicy}
                  onChange={(event) => onPatch({ cachePolicy: event.target.value as CachePolicy })}
                  disabled={disabled}
                >
                  {CACHE_POLICY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {cachePolicyDetail(item.cachePolicy)}
              </p>
            </div>
            <Label htmlFor={tagsInputId} className="sr-only">
              Tags
            </Label>
            <Input
              id={tagsInputId}
              value={item.tags}
              onChange={(event) => onPatch({ tags: event.target.value })}
              placeholder="Tags, separated by commas"
              disabled={disabled}
            />
          </>
        ) : null}
      </div>

      {item.progress > 0 ? <Progress value={item.progress} /> : null}
      {item.duplicateStatus === "checking" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Checking for duplicates...
        </p>
      ) : null}
      {item.duplicateStatus === "error" && item.duplicateError ? (
        <div className="grid gap-2 rounded-[8px] border border-amber-400/40 bg-amber-400/10 p-3">
          <div className="flex min-w-0 gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5">Duplicate check unavailable</p>
              <p className={cn("mt-1 text-xs text-muted-foreground", RESILIENT_VALUE_CLASS)}>
                {item.duplicateError}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onAllowDuplicate}>
            <UploadCloud />
            Upload anyway
          </Button>
        </div>
      ) : null}
      {item.duplicateStatus === "allowed" ? (
        <p className="text-xs text-muted-foreground">Duplicate warning dismissed.</p>
      ) : null}
      {item.duplicateStatus === "found" && item.duplicateAssets.length ? (
        <div className="grid gap-2 rounded-[8px] border border-primary/30 bg-primary/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5">Possible duplicate</p>
              <p className="text-xs text-muted-foreground">
                This file matches {item.duplicateAssets.length === 1 ? "an existing asset" : "existing assets"}.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            {item.duplicateAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-[6px] border border-border bg-background p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium leading-4">{asset.displayName}</p>
                  <p className={cn("text-[11px] text-muted-foreground", RESILIENT_VALUE_CLASS)}>
                    {asset.deletedAt ? "In trash" : "Active"} · {formatBytes(asset.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onCopyDuplicate(asset)}
                    aria-label={`Copy link for duplicate asset ${asset.displayName}`}
                  >
                    <Copy />
                    <span className="sr-only">Copy link for duplicate asset {asset.displayName}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenDuplicate(asset)}
                    aria-label={`Open details for duplicate asset ${asset.displayName}`}
                  >
                    <MoreHorizontal />
                    <span className="sr-only">Open details for duplicate asset {asset.displayName}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="flex-1" onClick={onRemove}>
              <X />
              Skip
            </Button>
            <Button type="button" className="flex-1" onClick={onAllowDuplicate}>
              <UploadCloud />
              Upload anyway
            </Button>
          </div>
        </div>
      ) : null}
      {item.error ? (
        <div className="flex min-w-0 gap-2 rounded-[8px] border border-destructive/30 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5 text-destructive">Upload failed</p>
            <p className={cn("mt-1 text-xs text-muted-foreground", RESILIENT_VALUE_CLASS)}>
              {item.error}
            </p>
          </div>
        </div>
      ) : null}
      {item.asset ? (
        <p className={cn("text-xs text-muted-foreground", RESILIENT_CODE_CLASS)}>
          {item.asset.url}
        </p>
      ) : null}
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  total,
  disabled,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {pageStart}-{pageEnd} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft />
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {paginationItems(currentPage, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="flex size-9 items-center justify-center text-muted-foreground"
              >
                <MoreHorizontal className="size-4" />
              </span>
            ) : (
              <Button
                key={item}
                variant={item === currentPage ? "secondary" : "ghost"}
                size="icon"
                disabled={disabled}
                onClick={() => onPageChange(item)}
                aria-label={item === currentPage ? `Page ${item}, current page` : `Go to page ${item}`}
                aria-current={item === currentPage ? "page" : undefined}
              >
                {item}
              </Button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

const AssetListMedia = React.memo(function AssetListMedia({
  asset,
  Icon,
  variant = "list",
}: {
  asset: Asset;
  Icon: React.ComponentType<{ className?: string }>;
  variant?: "list" | "grid";
}) {
  const isGrid = variant === "grid";
  const thumbnailUrl = isGrid ? asset.mediumThumbnailUrl : asset.tinyThumbnailUrl;
  const showCheckerboard = usesCheckerboard(asset);
  const OverlayIcon =
    asset.kind === "video" ? PlaySquare : asset.kind === "pdf" ? FileText : null;

  if (thumbnailUrl && !asset.deletedAt) {
    return (
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-background",
          isGrid ? "h-[330px] w-full" : "h-[38px] w-[38px]",
        )}
        style={checkerboardStyle(showCheckerboard)}
      >
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn("h-full w-full object-contain", OverlayIcon && "opacity-70")}
        />
        {OverlayIcon ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/35">
            <div
              className={cn(
                "flex items-center justify-center rounded-full border border-border bg-card/90 text-primary shadow-sm",
                isGrid ? "size-14" : "size-7",
              )}
            >
              <OverlayIcon className={isGrid ? "size-8" : "size-4"} />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[6px] border border-border bg-background",
        isGrid ? "h-[330px] w-full" : "h-[38px] w-[38px]",
      )}
    >
      <Icon className={cn("text-primary", isGrid ? "size-12" : "size-5")} />
    </div>
  );
});

function AssetActions({
  asset,
  copied,
  onCopy,
  onCopyFormat,
  onRestore,
  onOpen,
  onDelete,
  layout,
}: {
  asset: Asset;
  copied: boolean;
  onCopy: () => void;
  onCopyFormat: (format: CopyFormat) => void;
  onRestore: () => void;
  onOpen: (trigger: HTMLElement) => void;
  onDelete: (trigger: HTMLElement) => void;
  layout: "list" | "grid";
}) {
  const isGrid = layout === "grid";

  return (
    <div className={cn("flex items-center gap-2", isGrid ? "justify-between" : "justify-end")}>
      {asset.deletedAt ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onRestore}
              aria-label={`Restore ${asset.displayName}`}
              className={cn(isGrid && "flex-1")}
            >
              <RotateCcw />
              Restore
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restore this asset and its stable link</TooltipContent>
        </Tooltip>
      ) : (
        <QuickCopyActions
          asset={asset}
          copied={copied}
          isGrid={isGrid}
          onCopy={onCopy}
          onCopyFormat={onCopyFormat}
        />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(event) => onOpen(event.currentTarget)}
            aria-label={`Open details for ${asset.displayName}`}
          >
            <Info />
            <span className="sr-only">Open details for {asset.displayName}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open details</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={(event) => onDelete(event.currentTarget)}
            aria-label={
              asset.deletedAt
                ? `Permanently delete ${asset.displayName}`
                : `Move ${asset.displayName} to trash`
            }
          >
            <Trash2 />
            <span className="sr-only">
              {asset.deletedAt ? "Permanently delete asset" : "Move asset to trash"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{asset.deletedAt ? "Permanently delete" : "Move to trash"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function QuickCopyActions({
  asset,
  copied,
  isGrid,
  onCopy,
  onCopyFormat,
}: {
  asset: Asset;
  copied: boolean;
  isGrid: boolean;
  onCopy: () => void;
  onCopyFormat: (format: CopyFormat) => void;
}) {
  const formats = React.useMemo(() => rowCopyFormatsFor(asset), [asset]);

  return (
    <div className={cn("flex min-w-0", isGrid && "flex-1")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            aria-label={`Copy default link for ${asset.displayName}`}
            className={cn(
              "min-w-[112px] rounded-r-none",
              copied && "copy-success-pop border-success/50 bg-success/10 text-foreground",
              isGrid && "flex-1",
            )}
            aria-live="polite"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy the default file URL</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="-ml-px rounded-l-none px-2"
                aria-label={`More copy formats for ${asset.displayName}`}
              >
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More copy formats</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align={isGrid ? "start" : "end"}>
          {formats.map((format) => {
            const Icon = format.icon;

            return (
              <DropdownMenuItem key={format.label} onSelect={() => onCopyFormat(format)}>
                <Icon />
                {format.label === "CSS url()" ? "CSS" : format.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const AssetBadges = React.memo(function AssetBadges({ asset }: { asset: Asset }) {
  if (!asset.deletedAt && !asset.folder && !asset.tags.length) return null;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-1">
      {asset.deletedAt ? (
        <Badge
          variant="outline"
          className="max-w-full min-w-0 gap-1 border-destructive/40 bg-destructive/10 text-[11px] text-destructive"
        >
          <Trash2 className="size-3 shrink-0" />
          Trash
        </Badge>
      ) : null}
      {asset.folder ? (
        <Badge variant="outline" className="max-w-full min-w-0 gap-1 border-primary/30 bg-primary/10 text-[11px]">
          <Folder className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{asset.folder}</span>
        </Badge>
      ) : null}
      {asset.tags.slice(0, 3).map((tag) => (
        <Badge key={tag} variant="outline" className="max-w-full min-w-0 gap-1 border-info/30 bg-info/10 text-[11px]">
          <Tag className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{tag}</span>
        </Badge>
      ))}
      {asset.tags.length > 3 ? (
        <Badge variant="outline" className="text-[11px]">
          +{asset.tags.length - 3}
        </Badge>
      ) : null}
    </div>
  );
});

function AssetDeliveryExceptionNotice({
  asset,
  settings,
}: {
  asset: Asset;
  settings: RuntimeConfigResponse["settings"];
}) {
  if (!asset.inheritAllowedOrigins) {
    const hasAllowlist = asset.allowedOrigins.length > 0;

    return (
      <div className="rounded-[8px] border border-info/30 bg-info/10 p-3 text-sm leading-5">
        <p className="font-semibold">
          {hasAllowlist ? "Custom delivery domains" : "Custom unrestricted delivery"}
        </p>
        <p className={cn("mt-1 text-muted-foreground", RESILIENT_VALUE_CLASS)}>
          {hasAllowlist
            ? `This asset uses its own allowlist: ${asset.allowedOrigins.join(", ")}.`
            : "This asset overrides global delivery domains and does not restrict embed origins."}
        </p>
      </div>
    );
  }

  if (settings.domainRestrictionsEnabled && settings.allowedAssetOrigins.length === 0) {
    return (
      <div className="rounded-[8px] border border-warning/35 bg-warning/10 p-3 text-sm leading-5">
        <p className="font-semibold">Delivery domains need setup</p>
        <p className="mt-1 text-muted-foreground">
          Domain restrictions are on, but no global delivery domains are configured.
        </p>
      </div>
    );
  }

  return null;
}

function DetailRow({
  label,
  value,
  wide = false,
  breakValue = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  breakValue?: boolean;
}) {
  return (
    <div className={cn("grid gap-1 border-b border-border pb-3", wide && "sm:col-span-2")}>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm leading-5 text-foreground",
          breakValue ? RESILIENT_CODE_CLASS : RESILIENT_VALUE_CLASS,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function AssetPreview({ asset }: { asset: Asset }) {
  const sharedClass =
    "h-[330px] w-full rounded-[8px] border border-border bg-background object-contain";
  const PreviewOverlayIcon =
    asset.kind === "video" ? PlaySquare : asset.kind === "pdf" ? FileText : null;

  if (asset.deletedAt) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center rounded-[8px] border border-border bg-background text-center">
        <Trash2 className="mb-4 size-12 text-destructive" />
        <p className="max-w-md px-6 text-sm text-muted-foreground">
          Preview and copied links are paused while this asset is in trash.
        </p>
      </div>
    );
  }

  if (asset.kind === "image") {
    return (
      <div
        className="flex h-[330px] w-full items-center justify-center overflow-hidden rounded-[8px] border border-border bg-background"
        style={checkerboardStyle(usesCheckerboard(asset))}
      >
        <img
          src={asset.mediumThumbnailUrl || previewUrl(asset)}
          alt={asset.displayName}
          decoding="async"
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  if (PreviewOverlayIcon && asset.mediumThumbnailUrl) {
    return (
      <div className="relative flex h-[330px] w-full items-center justify-center overflow-hidden rounded-[8px] border border-border bg-background">
        <img
          src={asset.mediumThumbnailUrl}
          alt={asset.displayName}
          decoding="async"
          className="h-full w-full object-contain opacity-70"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-background/35">
          <div className="flex size-16 items-center justify-center rounded-full border border-border bg-card/90 text-primary shadow-sm">
            <PreviewOverlayIcon className="size-9" />
          </div>
        </div>
      </div>
    );
  }

  if (asset.kind === "video") {
    return <video src={previewUrl(asset)} controls className={sharedClass} />;
  }

  if (asset.kind === "pdf") {
    return <iframe src={previewUrl(asset)} title={asset.displayName} className={sharedClass} />;
  }

  const Icon = assetIcon(asset);

  return (
    <div className="flex h-[240px] flex-col items-center justify-center rounded-[8px] border border-border bg-background text-center">
      <Icon className="mb-4 size-12 text-primary" />
      <p className="max-w-md px-6 text-sm text-muted-foreground">
        This asset type may not preview in the browser. Open the stable link to inspect the stored file.
      </p>
      <Button asChild variant="outline" className="mt-5">
        <a href={asset.url} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open asset
        </a>
      </Button>
    </div>
  );
}
