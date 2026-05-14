import { getAssetById, getThumbnailObject, headThumbnailObject } from "@/lib/asset-storage";
import { requireAssetDeliveryAuth } from "@/lib/auth-gate";
import { getAssetManagerEnv } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ThumbnailSelection = {
  key: string;
  contentType: string | null;
  etag: string | null;
  updatedAt: string | null;
};

function thumbnailHeaders(selection: ThumbnailSelection, object: R2Object | R2ObjectBody) {
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(object.size),
    "Content-Type": object.httpMetadata?.contentType || selection.contentType || "image/webp",
    ETag: object.httpEtag || object.etag || selection.etag || "",
    "Last-Modified": (object.uploaded || new Date(selection.updatedAt || Date.now())).toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });

  if (!headers.get("ETag")) {
    headers.delete("ETag");
  }

  return headers;
}

function thumbnailSelection(
  asset: NonNullable<Awaited<ReturnType<typeof getAssetById>>>,
  size: string | null,
): ThumbnailSelection | null {
  if (size === "tiny" && asset.thumbnail_tiny_key) {
    return {
      key: asset.thumbnail_tiny_key,
      contentType: asset.thumbnail_tiny_content_type,
      etag: asset.thumbnail_tiny_etag,
      updatedAt: asset.thumbnail_tiny_updated_at,
    };
  }

  if (asset.thumbnail_medium_key) {
    return {
      key: asset.thumbnail_medium_key,
      contentType: asset.thumbnail_medium_content_type,
      etag: asset.thumbnail_medium_etag,
      updatedAt: asset.thumbnail_medium_updated_at,
    };
  }

  if (asset.thumbnail_key) {
    return {
      key: asset.thumbnail_key,
      contentType: asset.thumbnail_content_type,
      etag: asset.thumbnail_etag,
      updatedAt: asset.thumbnail_updated_at,
    };
  }

  return null;
}

async function serveThumbnail(request: Request, { params }: Params, headOnly: boolean) {
  const env = await getAssetManagerEnv();
  const auth = await requireAssetDeliveryAuth(request, env, {
    responseType: headOnly ? "empty" : "text",
  });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const asset = await getAssetById(env, id);
  const size = new URL(request.url).searchParams.get("size");
  const selection = asset ? thumbnailSelection(asset, size) : null;

  if (!asset || !selection) {
    return new Response("Thumbnail not found.", { status: 404 });
  }

  if (asset.deleted_at) {
    return new Response("Asset is in trash.", {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const objectHead = await headThumbnailObject(env, selection.key);
  if (!objectHead) {
    return new Response("Thumbnail not found.", { status: 404 });
  }

  const headers = thumbnailHeaders(selection, objectHead);
  if (headOnly) {
    return new Response(null, { status: 200, headers });
  }

  const object = await getThumbnailObject(env, selection.key);
  if (!object) {
    return new Response("Thumbnail not found.", { status: 404 });
  }

  return new Response(object.body, {
    status: 200,
    headers: thumbnailHeaders(selection, object),
  });
}

export async function HEAD(request: Request, params: Params) {
  return serveThumbnail(request, params, true);
}

export async function GET(request: Request, params: Params) {
  return serveThumbnail(request, params, false);
}
