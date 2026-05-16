/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.itsalive.fans" }],
        destination: "https://itsalive.fans/:path*",
        permanent: true
      }
    ];
  }
};

export default nextConfig;

