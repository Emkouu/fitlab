import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded by Node, not bundled: its Roboto font paths must point at real files.
  serverExternalPackages: ["pdfmake"],
};

export default nextConfig;
