/** @type {import('next').NextConfig} */
const nextConfig = {
  // Preserve ws's native optional-module resolution; bundling can replace the
  // absent bufferutil addon with {}, crashing masked frames of 32+ bytes.
  serverExternalPackages: ['ws'],
  // Fail production builds on TypeScript errors; keep the separate strict typecheck.
  typescript: { ignoreBuildErrors: false },
  // Ignorera ESLint-fel under build
  eslint: { ignoreDuringBuilds: true },
  // Allow images from common AI image generation services
  images: {
    remotePatterns: [
      { hostname: '*.supabase.co' },
      { hostname: 'replicate.delivery' },
      { hostname: 'ideogram.ai' },
    ],
  },
}

export default nextConfig
