const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — block embedding in any iframe
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing attacks
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Limit referrer info to origin-only when crossing origins
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable browser features this app does not use
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Stop DNS prefetching (reduces side-channel info leakage)
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          // Content Security Policy
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.clerk.dev https://*.clerk.accounts.dev https://js.stripe.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https: wss:; frame-src https://js.clerk.dev https://*.clerk.accounts.dev https://js.stripe.com https://challenges.cloudflare.com; worker-src 'self' blob:;" },
        ],
      },
    ];
  },
}

module.exports = withSentryConfig(
  nextConfig,
  {
    org: "civitas-zero",
    project: "javascript-nextjs",
    silent: !process.env.CI,
    widenClientFileUpload: true,
    hideSourceMaps: true,
  }
);
