import { getAssetManagerEnv } from "@/lib/cloudflare";
import {
  cacheControlFor,
  getAssetBySlug,
  getAssetManagerSettings,
  storedAssetAllowedOrigins,
} from "@/lib/asset-storage";
import {
  assetDomainRestrictionsEnabled,
  checkAssetRequestOrigin,
} from "@/lib/asset-domain-gate";
import { requireAssetDeliveryAuth } from "@/lib/auth-gate";
import type { AssetRow } from "@/lib/asset-types";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ParsedRange = {
  offset: number;
  length: number;
  end: number;
};

async function markAssetMissing(asset: AssetRow) {
  const env = await getAssetManagerEnv();

  await env.ASSET_INDEX.prepare(
    `UPDATE assets
     SET status = 'failed', updated_at = ?
     WHERE id = ?`,
  )
    .bind(new Date().toISOString(), asset.id)
    .run();
}

function cleanFilename(filename: string) {
  return filename.replace(/["\r\n]/g, "");
}

function etagFor(object: R2Object | R2ObjectBody, asset: AssetRow) {
  if (object.httpEtag) return object.httpEtag;
  if (object.etag) return `"${object.etag.replace(/^"|"$/g, "")}"`;
  return asset.etag || "";
}

function matchesIfNoneMatch(value: string | null, etag: string) {
  if (!value || !etag) return false;
  return value
    .split(",")
    .map((item) => item.trim())
    .some((item) => item === "*" || item === etag || item.replace(/^W\//, "") === etag);
}

function parseRangeHeader(value: string | null, size: number): ParsedRange | "invalid" | null {
  if (!value) return null;
  if (!value.startsWith("bytes=") || value.includes(",")) return "invalid";

  const rangeValue = value.slice("bytes=".length).trim();
  const [startValue, endValue] = rangeValue.split("-");

  if (startValue === "" && endValue === "") return "invalid";
  if (size <= 0) return "invalid";

  if (startValue === "") {
    const suffix = Number(endValue);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";

    const length = Math.min(suffix, size);
    return {
      offset: size - length,
      length,
      end: size - 1,
    };
  }

  const start = Number(startValue);
  const requestedEnd = endValue ? Number(endValue) : size - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return "invalid";
  }

  const end = Math.min(requestedEnd, size - 1);
  return {
    offset: start,
    length: end - start + 1,
    end,
  };
}

function baseHeaders(
  asset: AssetRow,
  object: R2Object | R2ObjectBody,
  options: { varyByRequestOrigin?: boolean } = {},
) {
  const contentType = object.httpMetadata?.contentType || asset.content_type || "application/octet-stream";
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControlFor(asset.cache_policy),
    "Content-Disposition": `inline; filename="${cleanFilename(asset.original_filename)}"`,
    "Content-Type": contentType,
    ETag: etagFor(object, asset),
    "Last-Modified": (object.uploaded || new Date(asset.updated_at)).toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });

  if (options.varyByRequestOrigin) {
    headers.set("Vary", "Origin, Referer");
  }

  return headers;
}

async function serveFile(request: Request, { params }: Params, headOnly: boolean) {
  const env = await getAssetManagerEnv();
  const auth = await requireAssetDeliveryAuth(request, env, {
    responseType: headOnly ? "empty" : "text",
  });
  if (!auth.ok) return auth.response;

  const { id: slug } = await params;
  const asset = await getAssetBySlug(env, slug);

  if (!asset) {
    return new Response("Asset not found.", { status: 404 });
  }

  if (asset.deleted_at) {
    return new Response("Asset is in trash.", {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  if (asset.status !== "ready") {
    return new Response("Asset upload is not complete.", { status: 409 });
  }

  const settings = await getAssetManagerSettings(env);
  const domainGate = checkAssetRequestOrigin(request, {
    assetAllowedOrigins: storedAssetAllowedOrigins(asset.allowed_origins),
    inheritAllowedOrigins: asset.inherit_allowed_origins !== 0,
    settings,
  });
  if (!domainGate.ok) return domainGate.response;

  const objectHead = await env.CLOUD_ASSETS.head(asset.object_key);
  if (!objectHead) {
    await markAssetMissing(asset);
    return new Response("Stored object not found.", { status: 404 });
  }

  const range = parseRangeHeader(request.headers.get("range"), objectHead.size);
  const headers = baseHeaders(asset, objectHead, {
    varyByRequestOrigin: assetDomainRestrictionsEnabled({ settings }),
  });

  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${objectHead.size}`);
    return new Response("Requested range not satisfiable.", { status: 416, headers });
  }

  if (!range && matchesIfNoneMatch(request.headers.get("if-none-match"), headers.get("ETag") || "")) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  if (headOnly) {
    headers.set("Content-Length", String(range ? range.length : objectHead.size));
    if (range) {
      headers.set("Content-Range", `bytes ${range.offset}-${range.end}/${objectHead.size}`);
    }
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  const object = await env.CLOUD_ASSETS.get(
    asset.object_key,
    range ? { range: { offset: range.offset, length: range.length } } : undefined,
  );

  if (!object) {
    await markAssetMissing(asset);
    return new Response("Stored object not found.", { status: 404 });
  }

  headers.set("Content-Length", String(range ? range.length : objectHead.size));
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.end}/${objectHead.size}`);
  }

  return new Response(object.body, { status: range ? 206 : 200, headers });
}

export async function HEAD(request: Request, params: Params) {
  return serveFile(request, params, true);
}

export async function GET(request: Request, params: Params) {
  return serveFile(request, params, false);
}
