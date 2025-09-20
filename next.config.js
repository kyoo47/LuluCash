/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
  // Allow LAN access in dev
  experimental: {
    allowedDevOrigins: ["http://192.168.1.54:3001"],
  },
};

module.exports = nextConfig;
