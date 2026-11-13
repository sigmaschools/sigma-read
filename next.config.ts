import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The password sign-in is retired: an old link or bookmark lands on the page that says to open Sigma Read from Compass
  async redirects() {
    return [{ source: "/login", destination: "/open-from-compass", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
