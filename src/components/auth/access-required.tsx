import Link from "next/link";

import { Button } from "@/components/ui/button";

export function AccessRequired() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Access required
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Sign in to manage assets
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          This asset manager is protected. Sign in with your team&apos;s configured provider to
          upload, organize, replace, and copy stored asset links.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          If you expected access, ask the workspace owner to confirm your session and permissions.
          Provider setup remains configured in <code>src/lib/auth.ts</code>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to assets</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
