import Link from "next/link";
import { ArrowLeft, LockKeyhole, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { getAssetManagerAuthUi } from "@/lib/auth-ui";
import { getAssetManagerEnv } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const authUi = getAssetManagerAuthUi(await getAssetManagerEnv());

  return (
    <>
      <main className="min-h-screen bg-background text-foreground">
        <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
          <div className="rounded-[8px] border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex size-11 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {authUi.providerLabel}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Sign in to Cloud asset manager
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Use your team&apos;s configured provider to return to asset management. Once signed in,
              you can upload, organize, replace, and copy stable links.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {authUi.signIn ? (
                <Button asChild>
                  <a href={authUi.signIn.href}>{authUi.signIn.label}</a>
                </Button>
              ) : (
                <Button disabled>Sign in unavailable</Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/">
                  <ArrowLeft />
                  Assets
                </Link>
              </Button>
            </div>

            {!authUi.signIn ? (
              <div className="mt-6 grid gap-3 rounded-[6px] border border-border bg-background p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Settings className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>
                    Sign-in is not connected yet. Set <code>ASSET_MANAGER_SIGN_IN_URL</code> or
                    update <code>src/lib/auth-ui.ts</code> to route users to your provider.
                  </p>
                </div>
                <p>
                  Session validation remains server-side in <code>src/lib/auth.ts</code>. This page
                  does not handle credentials.
                </p>
              </div>
            ) : (
              <p className="mt-5 text-xs text-muted-foreground">
                Session validation is handled by <code>src/lib/auth.ts</code>.
              </p>
            )}
          </div>
        </section>
      </main>
      <Toaster />
    </>
  );
}
