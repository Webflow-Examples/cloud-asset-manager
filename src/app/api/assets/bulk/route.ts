import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  bulkUpdateAssets,
  corsHeaders,
  errorResponse,
  jsonResponse,
  normalizeTags,
  optionsResponse,
  rowToAsset,
  validateCachePolicy,
  validateFolder,
} from "@/lib/asset-storage";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const env = await getAssetManagerEnv();
  return optionsResponse(request, env);
}

export async function PATCH(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      ids?: string[];
      folder?: string | null;
      cachePolicy?: string;
      addTags?: string[] | string;
      removeTags?: string[] | string;
    };
    const ids = Array.from(
      new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id || "").trim())),
    ).filter(Boolean);

    if (!ids.length) {
      return errorResponse("Select at least one asset.", 400, { headers });
    }

    if (ids.length > 100) {
      return errorResponse("Bulk editing is limited to 100 selected assets.", 400, { headers });
    }

    const hasFolder = "folder" in body;
    const hasCachePolicy = "cachePolicy" in body;
    const addTags = normalizeTags(body.addTags);
    const removeTags = normalizeTags(body.removeTags);

    if (!hasFolder && !hasCachePolicy && !addTags.length && !removeTags.length) {
      return errorResponse("Choose at least one bulk edit.", 400, { headers });
    }

    const rows = await bulkUpdateAssets(env, {
      ids,
      ...(hasFolder ? { folder: validateFolder(body.folder) } : {}),
      ...(hasCachePolicy ? { cachePolicy: validateCachePolicy(body.cachePolicy) } : {}),
      addTags,
      removeTags,
    });

    return jsonResponse(
      {
        updatedCount: rows.length,
        assets: rows.map((row) => rowToAsset(row, request)),
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Bulk update failed.", 400, {
      headers,
    });
  }
}
