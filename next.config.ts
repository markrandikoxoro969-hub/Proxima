import type { NextConfig } from "next";

/**
 * PROXIMA — Next.js configuration
 *
 * Plain-words summary:
 *  - Adds security headers to every response (see `securityHeaders` below).
 *  - Lets you open the dev server from your phone on the same Wi-Fi.
 *  - Keeps icon imports small (only the icons you use are bundled).
 */

const isDev = process.env.NODE_ENV !== "production";
// Vercel sets VERCEL=1 automatically. Used to enable HTTPS-only rules there.
const isVercel = process.env.VERCEL === "1";
// Set ALLOW_FRAMING=true only if you need to embed the site in an iframe
// (for example a preview tool). Production default: framing is blocked.
const allowFraming = isDev || process.env.ALLOW_FRAMING === "true";

/**
 * Content-Security-Policy: tells the browser which sources are allowed.
 * We don't use per-request nonces, so pages can stay static (= fast).
 * 'unsafe-inline' for scripts is needed for Next's inline bootstrap + our
 * tiny theme script. XSS is prevented at the source: we never inject
 * untrusted HTML (React escapes text; markdown is sanitized).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Google profile pictures are shown after login.
  "img-src 'self' blob: data: https://lh3.googleusercontent.com",
  "font-src 'self'",
  // Browser only talks to our own server. The AI API is called server-side.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Google sign-in redirects the login form to accounts.google.com.
  "form-action 'self' https://accounts.google.com",
  allowFraming ? "" : "frame-ancestors 'none'",
  isVercel ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone is allowed for our own pages only (voice input).
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(allowFraming ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  ...(isVercel
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

// Hostnames allowed to open the *dev* server (phone on home Wi-Fi, tunnels).
// Add more with ALLOWED_DEV_ORIGINS="my-laptop.local,*.ngrok-free.app"
const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Edge TTS opens a Node WebSocket; keep it out of the server bundle so its
  // optional `ws`/`stream` internals resolve the Node versions at runtime.
  serverExternalPackages: ["msedge-tts"],
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", ...extraDevOrigins],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  experimental: {
    // Tree-shake big icon/animation packages so only used parts ship.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Static theme videos, posters, and meme stickers cache locally so
        // looping and switching themes never stalls on repeat downloads.
        source: "/media/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        // The service worker must never be cached, so phones always get the latest one.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
