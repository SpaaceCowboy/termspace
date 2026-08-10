import type { NextConfig } from 'next'

/**
 * In production Caddy puts the UI and the API on one origin. Dev has to look
 * the same or the cookie and the WebSocket `Origin` check both break, so the
 * gateway is proxied rather than called cross-origin.
 */
const gatewayOrigin = process.env.TERMSPACE_GATEWAY_ORIGIN ?? 'http://127.0.0.1:3001'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${gatewayOrigin}/api/:path*` },
      { source: '/ws', destination: `${gatewayOrigin}/ws` },
    ]
  },
}

export default config
