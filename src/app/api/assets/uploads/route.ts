import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  contentTypeFor,
  corsHeaders,
  createObjectKey,
  createUniqueAssetSlug,
  assertDemoSessionCapacity,
  demoSessionForRequest,
  errorResponse,
  getUploadBaseUrl,
  insertAsset,
  jsonResponse,
  noteDemoAssetStorageChanged,
  normalizeTags,
  optionsResponse,
  validateCachePolicy,
  validateContentSha256,
  validateDisplayName,
  validateFileName,
  validateFileSize,
  validateFolder,
} from "@/lib/asset-storage";
import { demoModeEnabled, demoObjectKey, validateDemoUploadFile } from "@/lib/asset-demo";
import { MULTIPART_PART_SIZE_BYTES } from "@/lib/asset-limits";

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
  const demo = await demoSessionForRequest(env, request, headers);

  try {
    const body = (await request.json()) as {
      name?: string;
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
      folder?: string;
      tags?: string[] | string;
      cachePolicy?: string;
      contentSha256?: string;
    };

    const displayName = validateDisplayName(body.name);
    const originalFilename = validateFileName(body.fileName);
    const contentType = contentTypeFor(body.contentType);
    const folder = validateFolder(body.folder);
    const tags = normalizeTags(body.tags);
    const cachePolicy = validateCachePolicy(body.cachePolicy);
    const contentSha256 = validateContentSha256(body.contentSha256);
    const sizeBytes = Number(body.sizeBytes || 0);
    validateFileSize(sizeBytes, "multipart");
    if (demo.enabled) {
      validateDemoUploadFile(env, { filename: originalFilename, contentType, sizeBytes });
      await assertDemoSessionCapacity(env, demo.sessionId, sizeBytes);
    }

    const id = crypto.randomUUID();
    const scope = demo.enabled && demo.sessionId ? { demoSessionId: demo.sessionId } : undefined;
    const slug = await createUniqueAssetSlug(env, originalFilename, { scope });
    const objectKey =
      demo.enabled && demo.sessionId
        ? demoObjectKey(demo.sessionId, id, originalFilename)
        : createObjectKey(id, originalFilename);
    const upload = await env.CLOUD_ASSETS.createMultipartUpload(objectKey, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        assetId: id,
        displayName,
        originalFilename,
        ...(folder ? { folder } : {}),
        ...(tags.length ? { tags: tags.join(",") } : {}),
        cachePolicy,
        ...(contentSha256 ? { contentSha256 } : {}),
      },
    });

    const row = await insertAsset(env, {
      id,
      slug,
      object_key: objectKey,
      display_name: displayName,
      original_filename: originalFilename,
      content_type: contentType,
      size_bytes: sizeBytes,
      etag: null,
      content_sha256: contentSha256,
      folder,
      cache_policy: cachePolicy,
      status: "uploading",
      tags,
      demo_session_id: demo.sessionId || "",
      demo_storage_owner: demoModeEnabled(env) && demo.sessionId ? "demo" : "seed",
      demo_expires_at: demo.expiresAt,
    });
    await noteDemoAssetStorageChanged(env, row);

    return jsonResponse(
      {
        id,
        key: upload.key,
        uploadId: upload.uploadId,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        partUrl: `${getUploadBaseUrl(request, env)}/api/assets/uploads/${encodeURIComponent(id)}`,
      },
      { status: 201, headers },
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not start upload.", 400, {
      headers,
    });
  }
}
