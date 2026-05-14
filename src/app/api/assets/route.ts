import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  contentTypeFor,
  corsHeaders,
  createObjectKey,
  createUniqueAssetSlug,
  demoSessionForRequest,
  assertDemoSessionCapacity,
  errorResponse,
  insertAsset,
  jsonResponse,
  listAssets,
  noteDemoAssetStorageChanged,
  optionsResponse,
  rowToAsset,
  normalizeTags,
  validateDisplayName,
  validateCachePolicy,
  validateContentSha256,
  validateFileName,
  validateFileSize,
  validateFolder,
} from "@/lib/asset-storage";
import { demoModeEnabled, demoObjectKey, validateDemoUploadFile } from "@/lib/asset-demo";

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
  const demo = await demoSessionForRequest(env, request, headers, { cloneSeedAssets: true });

  const response = await listAssets(
    env,
    request,
    demo.enabled && demo.sessionId ? { demoSessionId: demo.sessionId } : undefined,
  );

  return jsonResponse(response, {
    headers,
  });
}

export async function POST(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;
  const demo = await demoSessionForRequest(env, request, headers);

  try {
    const form = await request.formData();
    const displayName = validateDisplayName(form.get("name"));
    const folder = validateFolder(form.get("folder"));
    const tags = normalizeTags(form.getAll("tags").length ? form.getAll("tags") : form.get("tags"));
    const cachePolicy = validateCachePolicy(form.get("cachePolicy"));
    const contentSha256 = validateContentSha256(form.get("contentSha256"));
    const file = form.get("file");

    if (!(file instanceof File)) {
      return errorResponse("Choose a file before uploading.", 400, { headers });
    }

    validateFileSize(file.size, "direct");

    const id = crypto.randomUUID();
    const originalFilename = validateFileName(file.name);
    const contentType = contentTypeFor(file.type);
    if (demo.enabled) {
      validateDemoUploadFile(env, {
        filename: originalFilename,
        contentType,
        sizeBytes: file.size,
      });
      await assertDemoSessionCapacity(env, demo.sessionId, file.size);
    }
    const scope = demo.enabled && demo.sessionId ? { demoSessionId: demo.sessionId } : undefined;
    const slug = await createUniqueAssetSlug(env, originalFilename, { scope });
    const objectKey =
      demo.enabled && demo.sessionId
        ? demoObjectKey(demo.sessionId, id, originalFilename)
        : createObjectKey(id, originalFilename);
    const object = await env.CLOUD_ASSETS.put(objectKey, file.stream(), {
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

    if (!object) {
      return errorResponse("Upload failed before the file was stored.", 412, { headers });
    }

    const row = await insertAsset(env, {
      id,
      slug,
      object_key: objectKey,
      display_name: displayName,
      original_filename: originalFilename,
      content_type: contentType,
      size_bytes: file.size,
      etag: object.httpEtag || object.etag || null,
      content_sha256: contentSha256,
      folder,
      cache_policy: cachePolicy,
      uploaded_at: object.uploaded?.toISOString?.(),
      status: "ready",
      tags,
      demo_session_id: demo.sessionId || "",
      demo_storage_owner: demoModeEnabled(env) && demo.sessionId ? "demo" : "seed",
      demo_expires_at: demo.expiresAt,
    });

    if (!row) {
      return errorResponse("The file uploaded, but the asset index could not be updated.", 500, {
        headers,
      });
    }
    await noteDemoAssetStorageChanged(env, row);

    return jsonResponse({ asset: rowToAsset(row, request) }, { status: 201, headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Upload failed.", 400, {
      headers,
    });
  }
}
