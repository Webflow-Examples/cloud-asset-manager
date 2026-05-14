import {
  corsHeaders,
  demoSessionForRequest,
  errorResponse,
  getAssetById,
  jsonResponse,
  optionsResponse,
  putAssetThumbnails,
  rowToAsset,
} from "@/lib/asset-storage";
import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";

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

export async function PUT(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;
  const demo = await demoSessionForRequest(env, request, headers, { cloneSeedAssets: true });
  const scope = demo.enabled && demo.sessionId ? { demoSessionId: demo.sessionId } : undefined;

  const { id } = await params;

  try {
    const row = await getAssetById(env, id, scope);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    const form = await request.formData();
    const thumbnail = form.get("thumbnail");
    const tinyThumbnail = form.get("thumbnailTiny");
    const mediumThumbnail = form.get("thumbnailMedium");

    if (
      !(thumbnail instanceof File) &&
      !(tinyThumbnail instanceof File) &&
      !(mediumThumbnail instanceof File)
    ) {
      return errorResponse("Choose a thumbnail file.", 400, { headers });
    }

    const updated = await putAssetThumbnails(env, row, {
      tiny: tinyThumbnail instanceof File ? tinyThumbnail : undefined,
      medium:
        mediumThumbnail instanceof File
          ? mediumThumbnail
          : thumbnail instanceof File
            ? thumbnail
            : undefined,
    });
    if (!updated) {
      return errorResponse("Thumbnail uploaded, but the asset index could not be read.", 500, {
        headers,
      });
    }

    return jsonResponse({ asset: rowToAsset(updated, request) }, { headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Thumbnail upload failed.", 400, {
      headers,
    });
  }
}
