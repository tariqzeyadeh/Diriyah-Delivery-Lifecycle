import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import withPWAInit from '@ducanh2912/next-pwa'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    // Matches app/~offline/page.tsx (next-pwa App Router convention)
    document: '/~offline',
  },
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
  },
})

/**
 * Strict CSP for Diriyah (financial / strategic data).
 * Next.js App Router still requires limited 'unsafe-inline' / 'unsafe-eval' for scripts
 * in many deployments; tighten further with nonces in a follow-up hardening sprint.
 */
const ContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://browser.sentry-cdn.com",
  "connect-src 'self' https://*.sentry.io https://*.amazonaws.com https://login.microsoftonline.com https://api.openai.com https://*.openai.azure.com",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  // next-pwa injects webpack; silence Turbopack dual-bundler warning on Next 16
  turbopack: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withPWA(withNextIntl(nextConfig))
