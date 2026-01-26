/**
 * Sentry Test Endpoint
 *
 * This endpoint is for testing Sentry integration.
 * DELETE THIS FILE after verifying Sentry is working.
 *
 * Usage:
 *   GET  /api/sentry-test?secret=<CRON_SECRET> - Throws an error (captured by Sentry)
 *   POST /api/sentry-test?secret=<CRON_SECRET> - Sends a test message to Sentry
 *
 * NOTE: Requires CRON_SECRET for authentication.
 */

import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';

function isAuthorized(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get('secret');
  return secret === process.env.CRON_SECRET;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  throw new Error('Sentry Test Error - DELETE THIS ENDPOINT AFTER TESTING');
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  Sentry.captureMessage('Sentry Test Message', 'info');
  await Sentry.flush(2000);
  return NextResponse.json({ success: true, message: 'Test message sent to Sentry' });
}
