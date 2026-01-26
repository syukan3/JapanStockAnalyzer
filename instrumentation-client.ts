import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 1% sampling for client (minimal UI, save quota)
  tracesSampleRate: 0.01,

  // Disable session replays (not needed, save quota)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Environment identification
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  // Only enable in Vercel production (not preview)
  enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production',
});

// Required for navigation instrumentation in Next.js App Router
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
