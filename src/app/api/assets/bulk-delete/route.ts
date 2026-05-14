import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  bulkDeleteAssetsPermanently,
  bulkSoftDeleteAssets,
  corsHeaders,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/asset-storage";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const env = await getAssetManagerEnv();
  return optionsResponse(request, env);
}

export async function POST(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { ids?: string[]; permanent?: boolean };
    const ids = Array.from(
      new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id || "").trim())),
    ).filter(Boolean);

    if (!ids.length) {
      return errorResponse("Select at least one asset.", 400, { headers });
    }

    if (ids.length > 100) {
      return errorResponse("Bulk delete is limited to 100 selected assets.", 400, { headers });
    }

    const result = body.permanent
      ? await bulkDeleteAssetsPermanently(env, ids)
      : await bulkSoftDeleteAssets(env, ids);

    return jsonResponse(
      {
        deletedIds: result.deleted,
        failedIds: result.failed,
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Bulk delete failed.", 400, {
      headers,
    });
  }
}
