import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** next-auth reads NEXTAUTH_URL in the client bundle; empty/whitespace breaks URL parsing in WebKit ("The string did not match the expected pattern."). */
const rawNextAuthUrl = (process.env.NEXTAUTH_URL || "").trim();
const vercelUrl = (process.env.VERCEL_URL || "").trim();
const nextAuthUrlForClient =
  rawNextAuthUrl ||
  (vercelUrl ? `https://${vercelUrl}` : "") ||
  "http://localhost:3007";

// Server-side NextAuth reads process.env; .env may omit NEXTAUTH_URL. Align with dev port (package.json: -p 3007).
process.env.NEXTAUTH_URL = nextAuthUrlForClient;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXTAUTH_URL: nextAuthUrlForClient
  },
  experimental: {
    // Keep defaults; add flags intentionally when needed.
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
