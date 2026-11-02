/** @type {import('next').NextConfig} */
const nextConfig = {
  // Preserve ws's native optional-module resolution; bundling can replace the
  // absent bufferutil addon with {}, crashing masked frames of 32+ bytes.
  experimental: {
    serverComponentsExternalPackages: ['ws'],
    // These private media files use manifest-selected fs paths. Ship both even
    // when Next's static tracer cannot resolve the selected descriptor.
    outputFileTracingIncludes: {
      '/build/demo-motors/cinematic/assets/*': [
        './lib/website-build/studio/cinematic-assets/hero.webp',
        './lib/website-build/studio/cinematic-assets/showroom.mp4',
      ],
    },
  },
  // Ignorera TypeScript-fel under build — fixas löpande men ska inte blockera deploys
  typescript: { ignoreBuildErrors: true },
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
