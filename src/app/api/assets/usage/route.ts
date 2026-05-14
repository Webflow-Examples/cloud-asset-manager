import { getAssetManagerEnv } from "@/lib/cloudflare";
import { requireAssetManagerApiAuth } from "@/lib/auth-gate";
import {
  assetUsage,
  corsHeaders,
  demoSessionForRequest,
  jsonResponse,
  optionsResponse,
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
  const demo = await demoSessionForRequest(env, request, headers, { cloneSeedAssets: true });

  return jsonResponse(
    await assetUsage(
      env,
      demo.enabled && demo.sessionId ? { demoSessionId: demo.sessionId } : undefined,
    ),
    {
    headers,
    },
  );
}
