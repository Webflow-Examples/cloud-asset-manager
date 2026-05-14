import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  corsHeaders,
  errorResponse,
  getAssetManagerSettings,
  jsonResponse,
  optionsResponse,
  updateAssetManagerSettings,
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

  return jsonResponse(await getAssetManagerSettings(env), {
    headers,
  });
}

export async function PATCH(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;

  // TIP: Add role checks here to restrict settings access to admins.
  // Example: if (!auth.session?.canManageSettings) {
  //   return errorResponse("Admin access required.", 403, { headers });
  // }

  try {
    const settings = await updateAssetManagerSettings(env, await request.json());
    return jsonResponse(settings, { headers });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Settings update failed.", 400, {
      headers,
    });
  }
}
