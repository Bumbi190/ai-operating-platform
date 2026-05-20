/** @type {import('next').NextConfig} */
const nextConfig = {
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
