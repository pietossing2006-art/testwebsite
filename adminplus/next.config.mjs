/**
 * Origins Admin+ is reachable on besides localhost — i.e. the Cloudflare Tunnel hostname.
 *
 * Next.js compares a Server Action's Origin header against the host and rejects mismatches
 * (CSRF protection), and in dev it also blocks cross-origin requests to dev assets. Behind the
 * tunnel the browser's origin is the public hostname, so both lists need it or login breaks.
 *
 * Defaults cover any *.vxpers.com subdomain; override with a comma-separated
 * ADMINPLUS_ALLOWED_ORIGINS (e.g. "admin.example.com,*.example.com").
 */
const allowedOrigins = (process.env.ADMINPLUS_ALLOWED_ORIGINS ?? "vxpers.com,*.vxpers.com")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  allowedDevOrigins: allowedOrigins,
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
