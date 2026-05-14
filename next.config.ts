import type { NextConfig } from "next";

const APP_MOUNT_PATH = "/assets";

const nextConfig: NextConfig = {
  basePath: APP_MOUNT_PATH,
  assetPrefix: APP_MOUNT_PATH,
};

export default nextConfig;
// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
