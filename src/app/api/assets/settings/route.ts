import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  corsHeaders,
  demoSessionForRequest,
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
  await demoSessionForRequest(env, request, headers);

  return jsonResponse(await getAssetManagerSettings(env), {
    headers,
  });
}

export async function PATCH(request: Request) {
  const env = await getAssetManagerEnv();
  const headers = corsHeaders(request, env);
  const auth = await requireAssetManagerApiAuth(request, env, headers);
  if (!auth.ok) return auth.response;
  const demo = await demoSessionForRequest(env, request, headers);
  if (demo.enabled) {
    return errorResponse(
      "Settings are read-only in the public demo. A production deployment can change delivery and cache settings.",
      403,
      { headers },
    );
  }

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
