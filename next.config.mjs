/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Playwright must stay external (native bindings, lazy deps).
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
    // Tree-shake icon imports — lucide-react is the largest client dep.
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    return [
      { source: "/admin/team%20rema%20humi", destination: "/admin/team-rema-humi" },
      { source: "/admin/team rema humi", destination: "/admin/team-rema-humi" },
      { source: "/admin/team", destination: "/admin/team-rema-humi" },
    ];
  },
  async redirects() {
    return [
      // Legacy entry point. NOTE: /desktop/approve (device login) must stay
      // reachable, so only the exact path redirects — no :path* wildcard.
      { source: "/desktop", destination: "/computer-use", permanent: false },
      // Tolerate the "segtings" typo seen in early project links.
      { source: "/build/:userId/:email/:projectId/segtings", destination: "/build/:userId/:email/:projectId/settings", permanent: false },
      { source: "/build/:userId/:email/:projectId/segtings/:path*", destination: "/build/:userId/:email/:projectId/settings/:path*", permanent: false },
      // Text → Film tool: tolerate the correctly-spelled route segment.
      { source: "/admin/tools/text2code2video", destination: "/admin/tools/text2code2viedo", permanent: false },
    ];
  },
};

export default nextConfig;
