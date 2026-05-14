import { MAX_MULTIPART_PARTS } from "@/lib/asset-limits";
import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  corsHeaders,
  errorResponse,
  getAssetById,
  jsonResponse,
  optionsResponse,
  rowToAsset,
  validateContentSha256,
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

export async function PUT(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = Number(url.searchParams.get("partNumber"));

  if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return errorResponse("Upload ID and part number are required.", 400, { headers });
  }

  if (partNumber > MAX_MULTIPART_PARTS) {
    return errorResponse(`Part number exceeds maximum of ${MAX_MULTIPART_PARTS}.`, 400, { headers });
  }

  const row = await getAssetById(env, id);
  if (!row) {
    return errorResponse("Asset upload not found.", 404, { headers });
  }

  try {
    const body = await request.arrayBuffer();
    if (!body.byteLength) {
      return errorResponse("Upload part body is empty.", 400, { headers });
    }

    const upload = env.CLOUD_ASSETS.resumeMultipartUpload(row.object_key, uploadId);
    const part = await upload.uploadPart(partNumber, body);

    return jsonResponse(part, { headers });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? `Part upload failed: ${error.message}`
        : "Part upload failed. The request body may be too large.",
      500,
      { headers },
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = (await request.json()) as {
      uploadId?: string;
      parts?: R2UploadedPart[];
      contentSha256?: string;
    };

    if (!body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return errorResponse("Upload ID and uploaded parts are required.", 400, { headers });
    }

    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset upload not found.", 404, { headers });
    }

    const upload = env.CLOUD_ASSETS.resumeMultipartUpload(row.object_key, body.uploadId);
    const object = await upload.complete(
      [...body.parts].sort((a, b) => a.partNumber - b.partNumber),
    );
    const contentSha256 = validateContentSha256(body.contentSha256) || row.content_sha256;

    await env.ASSET_INDEX.prepare(
      `UPDATE assets
       SET size_bytes = ?, etag = ?, content_sha256 = ?, status = 'ready', updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        object.size,
        object.httpEtag || object.etag || null,
        contentSha256,
        new Date().toISOString(),
        id,
      )
      .run();

    const completedRow = await getAssetById(env, id);
    if (!completedRow) {
      return errorResponse("Upload completed, but the asset index could not be read.", 500, {
        headers,
      });
    }

    return jsonResponse({ asset: rowToAsset(completedRow, request) }, { headers });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? `Upload completion failed: ${error.message}` : "Upload failed.",
      500,
      { headers },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");

  if (!uploadId) {
    return errorResponse("Upload ID is required.", 400, { headers });
  }

  const row = await getAssetById(env, id);
  if (!row) {
    return errorResponse("Asset upload not found.", 404, { headers });
  }

  try {
    await env.CLOUD_ASSETS.resumeMultipartUpload(row.object_key, uploadId).abort();
    await env.ASSET_INDEX.prepare(
      `UPDATE assets
       SET status = 'failed', updated_at = ?
       WHERE id = ?`,
    )
      .bind(new Date().toISOString(), id)
      .run();

    return new Response(null, { status: 204, headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not abort upload.", 500, {
      headers,
    });
  }
}
