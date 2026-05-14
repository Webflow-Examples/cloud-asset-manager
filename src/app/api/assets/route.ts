import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  contentTypeFor,
  corsHeaders,
  createObjectKey,
  createUniqueAssetSlug,
  errorResponse,
  insertAsset,
  jsonResponse,
  listAssets,
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

  const response = await listAssets(env, request);

  return jsonResponse(response, {
    headers,
  });
}

export async function POST(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

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
    const slug = await createUniqueAssetSlug(env, originalFilename);
    const objectKey = createObjectKey(id, originalFilename);
    const contentType = contentTypeFor(file.type);
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
    });

    if (!row) {
      return errorResponse("The file uploaded, but the asset index could not be updated.", 500, {
        headers,
      });
    }

    return jsonResponse({ asset: rowToAsset(row, request) }, { status: 201, headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Upload failed.", 400, {
      headers,
    });
  }
}
