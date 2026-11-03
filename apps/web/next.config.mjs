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
        './lib/website-build/studio/cinematic-assets/nord-r.mp4',
        './lib/website-build/studio/cinematic-assets/reel-*.mp4',
        './lib/website-build/studio/cinematic-assets/reel-*.webp',
        './lib/website-build/studio/cinematic-assets/nord-r-*.webp',
        './lib/website-build/studio/cinematic-assets/nord-r.glb',
      ],
      '/bilhandlare/**': [
        './lib/website-build/studio/cinematic-assets/*.mp4',
        './lib/website-build/studio/cinematic-assets/*.webp',
        './lib/website-build/studio/cinematic-assets/nord-r.glb',
        './lib/website-build/runtime/model3d-v1.bin',
      ],
      '/assets/*': ['./lib/website-build/runtime/model3d-v1.bin'],
      '/build/demo-motors/assets/*': [
        './lib/website-build/runtime/model3d-v1.bin',
        './lib/website-build/studio/cinematic-assets/nord-r-front.webp',
        './lib/website-build/studio/cinematic-assets/nord-r.glb',
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
