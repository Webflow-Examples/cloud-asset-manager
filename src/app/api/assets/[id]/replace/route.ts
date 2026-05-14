import { MAX_MULTIPART_PARTS, MULTIPART_PART_SIZE_BYTES } from "@/lib/asset-limits";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  contentTypeFor,
  corsHeaders,
  errorResponse,
  getAssetById,
  getUploadBaseUrl,
  jsonResponse,
  objectMetadataForAsset,
  optionsResponse,
  rowToAsset,
  updateAssetFileMetadata,
  validateContentSha256,
  validateFileName,
  validateFileSize,
  validateReplacementAsset,
} from "@/lib/asset-storage";
import { getAssetManagerEnv } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ReplacementUploadBody = {
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  contentSha256?: string;
};

type ReplacementCompleteBody = ReplacementUploadBody & {
  uploadId?: string;
  parts?: R2UploadedPart[];
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

  if (uploadId || url.searchParams.has("partNumber")) {
    if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
      return errorResponse("Upload ID and part number are required.", 400, { headers });
    }

    if (partNumber > MAX_MULTIPART_PARTS) {
      return errorResponse(`Part number exceeds maximum of ${MAX_MULTIPART_PARTS}.`, 400, { headers });
    }

    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    if (row.deleted_at || row.status !== "ready") {
      return errorResponse("Only active, ready assets can be replaced.", 400, { headers });
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

  try {
    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return errorResponse("Choose a replacement file.", 400, { headers });
    }

    const originalFilename = validateFileName(file.name);
    const contentType = contentTypeFor(file.type);
    const contentSha256 = validateContentSha256(form.get("contentSha256"));
    validateFileSize(file.size, "direct");
    validateReplacementAsset(row, originalFilename, contentType);

    const object = await env.CLOUD_ASSETS.put(row.object_key, file.stream(), {
      httpMetadata: {
        contentType,
      },
      customMetadata: objectMetadataForAsset(row, originalFilename, contentSha256),
    });

    if (!object) {
      return errorResponse("Replacement failed before the file was stored.", 412, { headers });
    }

    const updated = await updateAssetFileMetadata(env, row, {
      originalFilename,
      contentType,
      sizeBytes: file.size,
      etag: object.httpEtag || object.etag || null,
      contentSha256,
      updatedAt: object.uploaded?.toISOString?.(),
    });

    if (!updated) {
      return errorResponse("The file was replaced, but the asset index could not be updated.", 500, {
        headers,
      });
    }

    return jsonResponse({ asset: rowToAsset(updated, request) }, { headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Replacement failed.", 400, {
      headers,
    });
  }
}

export async function POST(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    const body = (await request.json()) as ReplacementUploadBody;
    const originalFilename = validateFileName(body.fileName);
    const contentType = contentTypeFor(body.contentType);
    const contentSha256 = validateContentSha256(body.contentSha256);
    const sizeBytes = Number(body.sizeBytes || 0);
    validateFileSize(sizeBytes, "multipart");
    validateReplacementAsset(row, originalFilename, contentType);

    const upload = await env.CLOUD_ASSETS.createMultipartUpload(row.object_key, {
      httpMetadata: {
        contentType,
      },
      customMetadata: objectMetadataForAsset(row, originalFilename, contentSha256),
    });

    return jsonResponse(
      {
        id: row.id,
        key: upload.key,
        uploadId: upload.uploadId,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        partUrl: `${getUploadBaseUrl(request, env)}/api/assets/${encodeURIComponent(row.id)}/replace`,
      },
      { status: 201, headers },
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not start replacement.",
      400,
      { headers },
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = (await request.json()) as ReplacementCompleteBody;

    if (!body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return errorResponse("Upload ID and uploaded parts are required.", 400, { headers });
    }

    const row = await getAssetById(env, id);
    if (!row) {
      return errorResponse("Asset not found.", 404, { headers });
    }

    if (row.deleted_at || row.status !== "ready") {
      return errorResponse("Only active, ready assets can be replaced.", 400, { headers });
    }

    if (body.sizeBytes) {
      validateFileSize(Number(body.sizeBytes), "multipart");
    }

    if (body.fileName || body.contentType) {
      validateReplacementAsset(
        row,
        validateFileName(body.fileName || row.original_filename),
        contentTypeFor(body.contentType || row.content_type),
      );
    }

    const upload = env.CLOUD_ASSETS.resumeMultipartUpload(row.object_key, body.uploadId);
    const object = await upload.complete(
      [...body.parts].sort((a, b) => a.partNumber - b.partNumber),
    );
    const originalFilename = validateFileName(
      body.fileName || object.customMetadata?.originalFilename || row.original_filename,
    );
    const contentType = contentTypeFor(
      body.contentType || object.httpMetadata?.contentType || row.content_type,
    );
    const sizeBytes = Number(body.sizeBytes || object.size || 0);
    const contentSha256 =
      validateContentSha256(body.contentSha256) ||
      validateContentSha256(object.customMetadata?.contentSha256) ||
      row.content_sha256;
    validateReplacementAsset(row, originalFilename, contentType);

    const updated = await updateAssetFileMetadata(env, row, {
      originalFilename,
      contentType,
      sizeBytes,
      etag: object.httpEtag || object.etag || null,
      contentSha256,
      updatedAt: object.uploaded?.toISOString?.(),
    });

    if (!updated) {
      return errorResponse("Replacement completed, but the asset index could not be read.", 500, {
        headers,
      });
    }

    return jsonResponse({ asset: rowToAsset(updated, request) }, { headers });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? `Replacement completion failed: ${error.message}` : "Replacement failed.",
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
    return errorResponse("Asset not found.", 404, { headers });
  }

  try {
    await env.CLOUD_ASSETS.resumeMultipartUpload(row.object_key, uploadId).abort();

    return new Response(null, { status: 204, headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not abort replacement.", 500, {
      headers,
    });
  }
}
