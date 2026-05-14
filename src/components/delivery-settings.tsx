"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Info, Loader2, Save, Settings, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { APP_BASE_PATH } from "@/lib/asset-limits";
import type {
  AssetLinkType,
  AssetManagerAccessStatus,
  AssetManagerAuthUi,
  AssetManagerSettings,
  RuntimeConfigResponse,
} from "@/lib/asset-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readError, SELECT_CLASS } from "@/lib/utils";

const CONFIG_ENDPOINT = `${APP_BASE_PATH}/api/assets/config`;
const SETTINGS_ENDPOINT = `${APP_BASE_PATH}/api/assets/settings`;
const TEXTAREA_CLASS =
  "flex min-h-28 w-full rounded-[6px] border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const DEFAULT_SETTINGS: AssetManagerSettings = {
  domainRestrictionsEnabled: false,
  allowedAssetOrigins: [],
  allowDirectAssetAccess: false,
  defaultCopiedLinkType: "stable",
  defaultSnippetUrlType: "stable",
  locks: {
    domainSettings: false,
    cacheBehaviorSettings: false,
    domainRestrictionsEnabled: false,
    allowedAssetOrigins: false,
    allowDirectAssetAccess: false,
    defaultCopiedLinkType: false,
    defaultSnippetUrlType: false,
  },
};

const DEFAULT_ACCESS: AssetManagerAccessStatus = {
  interfaceAuthEnabled: false,
  assetDeliveryAuthEnabled: false,
  source: "environment",
  adapterPath: "src/lib/auth.ts",
};

const DEFAULT_AUTH_UI: AssetManagerAuthUi = {
  providerLabel: "Custom auth provider",
  signIn: null,
  signOut: null,
  account: null,
};

function originText(settings: AssetManagerSettings) {
  return settings.allowedAssetOrigins.join("\n");
}

function originsFromText(value: string) {
  return value
    .split(/[,\n]/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function helpText(text: string, locked: boolean) {
  return locked ? `${text} Managed in environment configuration.` : text;
}

function SettingHelp({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 rounded-full p-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          aria-label="Setting details"
        >
          <Info />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <p>{children}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SettingLabel({
  children,
  help,
  htmlFor,
}: {
  children: React.ReactNode;
  help: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex min-h-5 items-center gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{children}</Label>
      ) : (
        <span className="text-sm font-medium">{children}</span>
      )}
      <SettingHelp>{help}</SettingHelp>
    </div>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      variant={enabled ? "success" : "outline"}
      className={enabled ? undefined : "text-muted-foreground"}
    >
      {enabled ? "On" : "Off"}
    </Badge>
  );
}

function AccessStatusRow({
  label,
  value,
  help,
  detail = "Managed in environment configuration.",
}: {
  label: string;
  value: boolean;
  help: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="grid gap-3 rounded-[6px] border border-border bg-background p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          <SettingHelp>{help}</SettingHelp>
        </div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <StatusBadge enabled={value} />
    </div>
  );
}

export function DeliverySettings() {
  const [settings, setSettings] = React.useState<AssetManagerSettings>(DEFAULT_SETTINGS);
  const [access, setAccess] = React.useState<AssetManagerAccessStatus>(DEFAULT_ACCESS);
  const [authUi, setAuthUi] = React.useState<AssetManagerAuthUi>(DEFAULT_AUTH_UI);
  const [allowedOriginsText, setAllowedOriginsText] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);

      try {
        const response = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await readError(response));
        }

        const config = (await response.json()) as RuntimeConfigResponse;
        setSettings(config.settings);
        setAccess(config.access);
        setAuthUi(config.authUi);
        setAllowedOriginsText(originText(config.settings));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load settings.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
  }, []);

  async function saveSettings() {
    setIsSaving(true);

    try {
      const payload: Partial<AssetManagerSettings> = {};

      if (!settings.locks.domainRestrictionsEnabled) {
        payload.domainRestrictionsEnabled = settings.domainRestrictionsEnabled;
      }

      if (!settings.locks.allowedAssetOrigins) {
        payload.allowedAssetOrigins = originsFromText(allowedOriginsText);
      }

      if (!settings.locks.allowDirectAssetAccess) {
        payload.allowDirectAssetAccess = settings.allowDirectAssetAccess;
      }

      if (!settings.locks.defaultCopiedLinkType) {
        payload.defaultCopiedLinkType = settings.defaultCopiedLinkType;
      }

      if (!settings.locks.defaultSnippetUrlType) {
        payload.defaultSnippetUrlType = settings.defaultSnippetUrlType;
      }

      const response = await fetch(SETTINGS_ENDPOINT, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const nextSettings = (await response.json()) as AssetManagerSettings;
      setSettings(nextSettings);
      setAllowedOriginsText(originText(nextSettings));
      toast.success("Settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateLinkType(key: "defaultCopiedLinkType" | "defaultSnippetUrlType", value: string) {
    setSettings((current) => ({
      ...current,
      [key]: value as AssetLinkType,
    }));
  }

  return (
    <TooltipProvider delayDuration={150}>
      <main className="min-h-screen bg-background text-foreground">
        <section className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-[72rem] flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Settings className="size-6 text-primary" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    Asset manager
                  </p>
                  <h1 className="text-2xl font-semibold leading-tight md:text-4xl">
                    Delivery settings
                  </h1>
                </div>
              </div>
              <Button variant="outline" asChild>
                <Link href="/">
                  <ArrowLeft />
                  Assets
                </Link>
              </Button>
            </div>
          </div>
        </section>

      <section className="mx-auto grid max-w-[72rem] gap-6 px-5 py-6 sm:px-8 lg:px-10">
        {isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-48 rounded-[8px]" />
            <Skeleton className="h-56 rounded-[8px]" />
            <Skeleton className="h-44 rounded-[8px]" />
          </div>
        ) : (
          <>
            <section className="grid gap-5 rounded-[8px] border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 size-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Access</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Auth is bring-your-own-provider and configured outside this settings form.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <AccessStatusRow
                  label="DAM interface and APIs"
                  value={access.interfaceAuthEnabled}
                  help={
                    <>
                      Controlled by <code>ASSET_MANAGER_AUTH_ENABLED</code>. When on, the DAM UI
                      and asset-management API actions require a session from{" "}
                      <code>{access.adapterPath}</code>.
                    </>
                  }
                />
                <AccessStatusRow
                  label="Asset files and thumbnails"
                  value={access.assetDeliveryAuthEnabled}
                  help={
                    <>
                      Controlled by <code>ASSET_MANAGER_PROTECT_ASSET_DELIVERY</code>. This is
                      separate from interface auth and protects file/thumbnail viewing.
                    </>
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <AccessStatusRow
                  label="Sign-in action"
                  value={Boolean(authUi.signIn)}
                  detail="Optional provider-neutral UI action."
                  help={
                    <>
                      Configure <code>ASSET_MANAGER_SIGN_IN_URL</code> or replace{" "}
                      <code>src/lib/auth-ui.ts</code>. The starter sign-in page is only a shell.
                    </>
                  }
                />
                <AccessStatusRow
                  label="Account action"
                  value={Boolean(authUi.account)}
                  detail="Optional provider-neutral UI action."
                  help={
                    <>
                      Configure <code>ASSET_MANAGER_ACCOUNT_URL</code> to show an Account action in
                      the DAM header.
                    </>
                  }
                />
                <AccessStatusRow
                  label="Sign-out action"
                  value={Boolean(authUi.signOut)}
                  detail="Optional provider-neutral UI action."
                  help={
                    <>
                      Configure <code>ASSET_MANAGER_SIGN_OUT_URL</code> to show a Sign out action in
                      the DAM header.
                    </>
                  }
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Session adapter: <code>{access.adapterPath}</code>. Auth UI actions use provider
                label <span className="font-medium text-foreground">{authUi.providerLabel}</span>{" "}
                and are configured through environment URLs or <code>src/lib/auth-ui.ts</code>.
              </p>
            </section>

            <section className="grid gap-5 rounded-[8px] border border-border bg-card p-5">
              <div>
                <h2 className="text-lg font-semibold">Asset delivery domains</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Control where file URLs can be embedded.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="domain-restrictions-enabled"
                  type="checkbox"
                  checked={settings.domainRestrictionsEnabled}
                  disabled={settings.locks.domainRestrictionsEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      domainRestrictionsEnabled: event.target.checked,
                    }))
                  }
                  className="size-4 accent-primary"
                />
                <Label htmlFor="domain-restrictions-enabled">
                  Restrict where assets can be embedded
                </Label>
                <SettingHelp>
                  {helpText(
                    "Checks the request Origin or Referer before serving `/assets/files/:slug`. This helps reduce hotlinking, but it is not a replacement for auth.",
                    settings.locks.domainRestrictionsEnabled,
                  )}
                </SettingHelp>
              </div>

              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="allowed-origins"
                  help={helpText(
                    "Enter one origin per line, including protocol and host. Paths are ignored; values are normalized before saving.",
                    settings.locks.allowedAssetOrigins,
                  )}
                >
                  Allowed domains
                </SettingLabel>
                <textarea
                  id="allowed-origins"
                  value={allowedOriginsText}
                  onChange={(event) => setAllowedOriginsText(event.target.value)}
                  disabled={settings.locks.allowedAssetOrigins}
                  className={TEXTAREA_CLASS}
                  placeholder={"https://example.com\nhttps://www.example.com"}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="allow-direct-access"
                  type="checkbox"
                  checked={settings.allowDirectAssetAccess}
                  disabled={settings.locks.allowDirectAssetAccess}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      allowDirectAssetAccess: event.target.checked,
                    }))
                  }
                  className="size-4 accent-primary"
                />
                <Label htmlFor="allow-direct-access">
                  Allow direct browser access with no referring domain
                </Label>
                <SettingHelp>
                  {helpText(
                    "Allows requests without Origin or Referer headers, such as opening an asset URL directly in a browser tab.",
                    settings.locks.allowDirectAssetAccess,
                  )}
                </SettingHelp>
              </div>
            </section>

            <section className="grid gap-5 rounded-[8px] border border-border bg-card p-5">
              <div>
                <h2 className="text-lg font-semibold">Cache behavior</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose the default URL type for copy actions and snippets.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <SettingLabel
                    htmlFor="default-copy-link"
                    help={helpText(
                      "Controls row, grid, queue, and duplicate quick-copy actions. Detail view still offers both stable and fresh links.",
                      settings.locks.defaultCopiedLinkType,
                    )}
                  >
                    Default copied link type
                  </SettingLabel>
                  <select
                    id="default-copy-link"
                    className={SELECT_CLASS}
                    value={settings.defaultCopiedLinkType}
                    disabled={settings.locks.defaultCopiedLinkType}
                    onChange={(event) =>
                      updateLinkType("defaultCopiedLinkType", event.target.value)
                    }
                  >
                    <option value="stable">Stable link</option>
                    <option value="fresh">Fresh/cache-busted link</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <SettingLabel
                    htmlFor="default-snippet-link"
                    help={helpText(
                      "Controls whether Markdown, HTML, and CSS snippets start with canonical stable URLs or cache-busted fresh URLs.",
                      settings.locks.defaultSnippetUrlType,
                    )}
                  >
                    Default snippet URL type
                  </SettingLabel>
                  <select
                    id="default-snippet-link"
                    className={SELECT_CLASS}
                    value={settings.defaultSnippetUrlType}
                    disabled={settings.locks.defaultSnippetUrlType}
                    onChange={(event) =>
                      updateLinkType("defaultSnippetUrlType", event.target.value)
                    }
                  >
                    <option value="stable">Stable</option>
                    <option value="fresh">Fresh/cache-busted</option>
                  </select>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={() => void saveSettings()} disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                Save settings
              </Button>
            </div>
          </>
        )}
        </section>
      </main>
    </TooltipProvider>
  );
}
