import { headers } from "next/headers";

import { AccessRequired } from "@/components/auth/access-required";
import { DeliverySettings } from "@/components/delivery-settings";
import { Toaster } from "@/components/ui/sonner";
import { requireAssetManagerInterfaceAuth } from "@/lib/auth-gate";

export const dynamic = "force-dynamic";

async function assetManagerRequestHeaders() {
  const requestHeaders = await headers();
  return new Headers(Array.from(requestHeaders.entries()));
}

export default async function SettingsPage() {
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
      <DeliverySettings />
      <Toaster />
    </>
  );
}
