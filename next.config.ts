import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Browser journeys may run from the official Playwright container over
  // host networking while the Next.js development server binds locally.
  allowedDevOrigins: ['127.0.0.1'],
}

export default nextConfig
