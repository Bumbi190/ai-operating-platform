/** @type {import('next').NextConfig} */
const nextConfig = {
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
