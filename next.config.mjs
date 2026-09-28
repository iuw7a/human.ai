/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Playwright must stay external (native bindings, lazy deps).
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
};

export default nextConfig;
