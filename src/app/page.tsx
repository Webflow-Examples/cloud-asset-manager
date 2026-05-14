import { Suspense } from "react";
import { headers } from "next/headers";

import { AssetManager } from "@/components/asset-manager";
import { AccessRequired } from "@/components/auth/access-required";
import { Toaster } from "@/components/ui/sonner";
import { requireAssetManagerInterfaceAuth } from "@/lib/auth-gate";

export const dynamic = "force-dynamic";

async function assetManagerRequestHeaders() {
  const requestHeaders = await headers();
  return new Headers(Array.from(requestHeaders.entries()));
}

export default async function Home() {
  const auth = await requireAssetManagerInterfaceAuth(await assetManagerRequestHeaders());

  if (!auth.ok) {
    return (
      <>
        <AccessRequired />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <Suspense
        fallback={
          <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex min-h-screen w-full max-w-[120rem] items-center justify-center px-4">
              <div className="text-sm text-muted-foreground">
                Loading asset manager...
              </div>
            </div>
          </main>
        }
      >
        <AssetManager />
      </Suspense>
      <Toaster />
    </>
  );
}
