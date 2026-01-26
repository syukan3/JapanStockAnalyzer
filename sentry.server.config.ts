import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // 10% sampling for transactions (fits within free tier)
  tracesSampleRate: 0.1,

  // Environment identification
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Only enable in Vercel production (not preview)
  enabled: process.env.VERCEL_ENV === 'production',
});
