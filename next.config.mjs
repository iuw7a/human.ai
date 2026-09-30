/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Playwright must stay external (native bindings, lazy deps).
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
  async redirects() {
    return [
      // Legacy entry point. NOTE: /desktop/approve (device login) must stay
      // reachable, so only the exact path redirects — no :path* wildcard.
      { source: "/desktop", destination: "/computer-use", permanent: false },
    ];
  },
};

export default nextConfig;
