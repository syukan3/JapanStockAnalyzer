/**
 * Cron B API Route: 決算発表予定同期
 *
 * @description GitHub Actions から呼び出される API エンドポイント
 *
 * POST /api/cron/jquants/b
 * Headers: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { acquireLock, releaseLock } from '@/lib/cron/job-lock';
import { startJobRun, completeJobRun } from '@/lib/cron/job-run';
import { updateHeartbeat } from '@/lib/cron/heartbeat';
import { handleCronB } from '@/lib/cron/handlers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby 制限

const JOB_NAME = 'cron_b' as const;
const LOCK_TTL_SECONDS = 60;

const logger = createLogger({ module: 'route/cron-b' });

export async function POST(request: Request): Promise<Response> {
  // 1. CRON_SECRET 認証
  const authError = requireCronAuth(request);
  if (authError) {
    return authError;
  }

  const supabaseIngest = createAdminClient('jquants_ingest');

  // 2. ロック取得
  const lockResult = await acquireLock(supabaseIngest, JOB_NAME, LOCK_TTL_SECONDS);
  if (!lockResult.success) {
    logger.info('Lock not acquired', { jobName: JOB_NAME, reason: lockResult.error });
    return NextResponse.json(
      { error: 'Another job is running', detail: lockResult.error },
      { status: 409 }
    );
  }

  const lockToken = lockResult.token!;
  let runId = '';

  try {
    // 3. ジョブ実行開始（job_runs INSERT）
    const startResult = await startJobRun(supabaseIngest, {
      jobName: JOB_NAME,
    });

    if (startResult.error) {
      logger.info('Job run not started', { jobName: JOB_NAME, reason: startResult.error });
      return NextResponse.json(
        { error: 'Job already executed', detail: startResult.error },
        { status: 200 }
      );
    }

    runId = startResult.runId;

    // 4. ハートビート更新（running）
    await updateHeartbeat(supabaseIngest, {
      jobName: JOB_NAME,
      status: 'running',
      runId,
    });

    // 5. ハンドラー実行
    logger.info('Executing Cron B handler', { runId });
    const result = await handleCronB(runId);

    // 6. ジョブ完了（job_runs UPDATE）
    await completeJobRun(
      supabaseIngest,
      runId,
      result.success ? 'success' : 'failed',
      result.error
    );

    // 7. ハートビート更新（success/failed）
    await updateHeartbeat(supabaseIngest, {
      jobName: JOB_NAME,
      status: result.success ? 'success' : 'failed',
      runId,
      targetDate: result.announcementDate ?? undefined,
      error: result.error,
      meta: { fetched: result.fetched, inserted: result.inserted },
    });

    logger.info('Cron B completed', {
      runId,
      success: result.success,
      announcementDate: result.announcementDate,
      fetched: result.fetched,
      inserted: result.inserted,
    });

    // 8. レスポンス返却
    return NextResponse.json({
      success: result.success,
      runId,
      announcementDate: result.announcementDate,
      fetched: result.fetched,
      inserted: result.inserted,
      error: result.error,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Cron B failed with exception', { runId, error: errorMessage });

    // クリーンアップは並列実行、失敗しても握りつぶす
    if (runId) {
      await Promise.allSettled([
        completeJobRun(supabaseIngest, runId, 'failed', errorMessage),
        updateHeartbeat(supabaseIngest, {
          jobName: JOB_NAME,
          status: 'failed',
          runId,
          error: errorMessage,
        }),
      ]);
    }

    // 本番環境ではエラー詳細を隠す
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(isDev && { detail: errorMessage }),
        runId: runId || undefined,
      },
      { status: 500 }
    );
  } finally {
    // 9. ロック解放（失敗してもレスポンスには影響させない）
    try {
      await releaseLock(supabaseIngest, JOB_NAME, lockToken);
    } catch (releaseError) {
      logger.error('Failed to release lock', {
        jobName: JOB_NAME,
        lockToken,
        error: releaseError instanceof Error ? releaseError.message : String(releaseError),
      });
      // ロック解放失敗はログのみ。TTLで自動解放されるため、ここでは握りつぶす
    }
  }
}
