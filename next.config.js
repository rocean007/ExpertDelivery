/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tile.openstreetmap.org',
      },
      {
        protocol: 'https',
        hostname: '*.tile.openstreetmap.org',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/v1/runs/:runId',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGINS || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-Signature, X-Timestamp' },
        ],
      },
      {
        source: '/embed/:runId',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/osrm-proxy/:path*',
        destination: 'https://router.project-osrm.org/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
