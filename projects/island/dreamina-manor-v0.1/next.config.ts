import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() { return [{source:"/assets/world/icons/:path*",headers:[{key:"Cache-Control",value:"public, max-age=31536000, immutable"}]}]; }
};

export default nextConfig;
