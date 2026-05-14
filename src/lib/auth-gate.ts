import { getAssetManagerSession } from "@/lib/auth";
import { getAssetManagerEnv, type AssetManagerEnv } from "@/lib/cloudflare";

export type AuthGateResult =
  | {
      ok: true;
      session: unknown | null;
    }
  | {
      ok: false;
      response: Response;
    };

type AuthResponseType = "empty" | "json" | "text";

type AuthGateOptions = {
  enabled?: boolean;
  env?: Partial<AssetManagerEnv>;
  responseHeaders?: HeadersInit;
  responseType?: AuthResponseType;
};

function envFlag(value: string | undefined, fallback: string | undefined) {
  return (value ?? fallback) === "true";
}

function processEnv(name: "ASSET_MANAGER_AUTH_ENABLED" | "ASSET_MANAGER_PROTECT_ASSET_DELIVERY") {
  return typeof process === "undefined" ? undefined : process.env[name];
}

export function assetManagerAuthEnabled(env?: Partial<AssetManagerEnv>) {
  return envFlag(env?.ASSET_MANAGER_AUTH_ENABLED, processEnv("ASSET_MANAGER_AUTH_ENABLED"));
}

export function assetDeliveryAuthEnabled(env?: Partial<AssetManagerEnv>) {
  return envFlag(
    env?.ASSET_MANAGER_PROTECT_ASSET_DELIVERY,
    processEnv("ASSET_MANAGER_PROTECT_ASSET_DELIVERY"),
  );
}

function headersFromInput(input: Request | Headers) {
  return input instanceof Request ? input.headers : input;
}

function unauthorizedResponse(
  responseHeaders?: HeadersInit,
  responseType: AuthResponseType = "json",
) {
  const headers = new Headers(responseHeaders);

  if (responseType === "empty") {
    return new Response(null, { status: 401, headers });
  }

  if (responseType === "text") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "text/plain;charset=UTF-8");
    }

    return new Response("Unauthorized", { status: 401, headers });
  }

  return Response.json({ error: "Unauthorized" }, { status: 401, headers });
}

export async function requireAssetManagerAuth(
  input: Request | Headers,
  options: AuthGateOptions = {},
): Promise<AuthGateResult> {
  const env = options.env ?? (await getAssetManagerEnv());
  const enabled = options.enabled ?? assetManagerAuthEnabled(env);

  if (!enabled) {
    return {
      ok: true,
      session: null,
    };
  }

  const session = await getAssetManagerSession({
    headers: headersFromInput(input),
  });

  if (!session) {
    return {
      ok: false,
      response: unauthorizedResponse(options.responseHeaders, options.responseType),
    };
  }

  return {
    ok: true,
    session,
  };
}

export function requireAssetManagerInterfaceAuth(input: Request | Headers) {
  return requireAssetManagerAuth(input);
}

export function requireAssetManagerApiAuth(
  request: Request,
  env: Partial<AssetManagerEnv>,
  responseHeaders: HeadersInit,
) {
  return requireAssetManagerAuth(request, {
    env,
    responseHeaders,
    responseType: "json",
  });
}

export function requireAssetDeliveryAuth(
  request: Request,
  env: Partial<AssetManagerEnv>,
  options: Pick<AuthGateOptions, "responseType"> = {},
) {
  return requireAssetManagerAuth(request, {
    enabled: assetDeliveryAuthEnabled(env),
    env,
    responseType: options.responseType ?? "text",
  });
}
