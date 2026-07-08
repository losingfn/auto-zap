/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb"
    }
  },
  images: {
    formats: ["image/avif", "image/webp"]
  }
};

export default nextConfig;
