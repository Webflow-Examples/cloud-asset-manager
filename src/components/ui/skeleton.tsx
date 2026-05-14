import { cn } from "@/lib/utils";
import type * as React from "react";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-[6px] bg-muted", className)} {...props} />;
}

export { Skeleton };
