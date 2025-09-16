/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
    ];
  },
  // Allow LAN access in dev
  experimental: {
    allowedDevOrigins: ["http://192.168.1.54:3000"],
  },
};

module.exports = nextConfig;
