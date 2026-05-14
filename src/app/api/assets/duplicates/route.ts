import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  corsHeaders,
  errorResponse,
  findDuplicateAssets,
  jsonResponse,
  optionsResponse,
  rowToAsset,
  validateContentSha256,
} from "@/lib/asset-storage";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const env = await getAssetManagerEnv();
  return optionsResponse(request, env);
}

export async function GET(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const contentSha256 = validateContentSha256(url.searchParams.get("sha256"));

    if (!contentSha256) {
      return errorResponse("SHA-256 hash is required.", 400, { headers });
    }

    const duplicates = await findDuplicateAssets(env, contentSha256, 5);
    return jsonResponse(
      { assets: duplicates.map((row) => rowToAsset(row, request)) },
      { headers },
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Duplicate lookup failed.", 400, {
      headers,
    });
  }
}
