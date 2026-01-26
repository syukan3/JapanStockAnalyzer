import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Enable Sentry trace metadata for client-side
    clientTraceMetadata: ['sentry-trace', 'baggage'],
  },
  // Expose VERCEL_ENV to client for Sentry environment detection
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV,
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Source maps configuration
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Disable telemetry
  telemetry: false,

  // Only show output in CI
  silent: !process.env.CI,
});
