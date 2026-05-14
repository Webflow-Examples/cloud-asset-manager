import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  corsHeaders,
  deleteAssetPermanently,
  errorResponse,
  getAssetById,
  jsonResponse,
  normalizeAssetOrigins,
  normalizeTags,
  optionsResponse,
  restoreAsset,
  rowToAsset,
  setAssetTags,
  softDeleteAsset,
  storedAssetAllowedOrigins,
  validateCachePolicy,
  validateDisplayName,
  validateFolder,
  validateUniqueAssetSlug,
} from "@/lib/asset-storage";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function OPTIONS(request: Request) {
  const env = await getAssetManagerEnv();
  return optionsResponse(request, env);
}

export async function PATCH(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const existing = await getAssetById(env, id);
    if (!existing) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    const body = (await request.json()) as {
      displayName?: string;
      name?: string;
      slug?: string;
      folder?: string | null;
      tags?: string[] | string;
      cachePolicy?: string;
      inheritAllowedOrigins?: boolean;
      allowedOrigins?: string[] | string | null;
      restore?: boolean;
    };

    if (body.restore) {
      const restored = await restoreAsset(env, id);
      if (!restored) {
        return errorResponse("Asset not found.", 404, { headers });
      }

      return jsonResponse({ asset: rowToAsset(restored, request) }, { headers });
    }

    const displayName =
      "displayName" in body || "name" in body
        ? validateDisplayName(body.displayName ?? body.name)
        : existing.display_name;
    const slug =
      "slug" in body
        ? await validateUniqueAssetSlug(env, body.slug, { excludeId: id })
        : existing.slug;
    const folder = "folder" in body ? validateFolder(body.folder) : existing.folder;
    const cachePolicy =
      "cachePolicy" in body ? validateCachePolicy(body.cachePolicy) : existing.cache_policy;
    const tags = "tags" in body ? normalizeTags(body.tags) : null;
    const allowedOrigins =
      "allowedOrigins" in body
        ? normalizeAssetOrigins(body.allowedOrigins, { strict: true })
        : storedAssetAllowedOrigins(existing.allowed_origins);
    let inheritAllowedOrigins = existing.inherit_allowed_origins !== 0;

    if ("inheritAllowedOrigins" in body) {
      if (typeof body.inheritAllowedOrigins !== "boolean") {
        throw new Error("Asset domain inheritance must be true or false.");
      }
      inheritAllowedOrigins = body.inheritAllowedOrigins;
    }

    await env.ASSET_INDEX.prepare(
      `UPDATE assets
       SET display_name = ?,
           slug = ?,
           folder = ?,
           cache_policy = ?,
           allowed_origins = ?,
           inherit_allowed_origins = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        displayName,
        slug,
        folder,
        cachePolicy,
        JSON.stringify(allowedOrigins),
        inheritAllowedOrigins ? 1 : 0,
        new Date().toISOString(),
        id,
      )
      .run();

    if (tags) {
      await setAssetTags(env, id, tags);
    }

    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    return jsonResponse({ asset: rowToAsset(row, request) }, { headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Rename failed.", 400, {
      headers,
    });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const url = new URL(request.url);
  const permanent = url.searchParams.get("permanent") === "true";

  try {
    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    if (permanent) {
      await deleteAssetPermanently(env, row);
      return new Response(null, { status: 204, headers });
    }

    const deleted = await softDeleteAsset(env, id);
    if (!deleted) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    return jsonResponse({ asset: rowToAsset(deleted, request) }, { headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Delete failed.", 500, {
      headers,
    });
  }
}
