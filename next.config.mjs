/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Playwright must stay external (native bindings, lazy deps).
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
  async redirects() {
    return [
      { source: "/desktop", destination: "/computer-use", permanent: false },
      { source: "/desktop/:path*", destination: "/computer-use/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
