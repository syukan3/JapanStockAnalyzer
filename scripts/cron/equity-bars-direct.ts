/**
 * equity_bars 直接実行スクリプト（GH Actions用）
 *
 * @description Vercel 10秒制限を回避するため、GH Actionsランナー上で直接実行
 * - 環境変数は GH Actions secrets から直接セットされる（.env.local 不要）
 * - determineTargetDates() でキャッチアップ対応
 * - job_runs / heartbeat に記録
 */

import { createAdminClient } from '../../src/lib/supabase/admin';
import { createLogger, type LogContext } from '../../src/lib/utils/logger';
import { syncEquityBarsDailyForDate } from '../../src/lib/jquants/endpoints';
import { determineTargetDates } from '../../src/lib/cron/catch-up';
import { startJobRun, completeJobRun } from '../../src/lib/cron/job-run';
import type { JobName } from '../../src/lib/cron/job-run';
import { updateHeartbeat } from '../../src/lib/cron/heartbeat';

const logger = createLogger({ module: 'equity-bars-direct' });

const JOB_NAME: JobName = 'cron_a';

/**
 * 環境変数バリデーション
 */
function validateEnv(): void {
  const required = [
    'JQUANTS_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function main(): Promise<void> {
  validateEnv();

  const supabaseIngest = createAdminClient('jquants_ingest');
  const supabaseCore = createAdminClient('jquants_core');

  // 処理対象日を決定
  const targetDates = await determineTargetDates(supabaseIngest, supabaseCore, JOB_NAME);

  if (targetDates.length === 0) {
    logger.info('No target dates to process');
    console.log(JSON.stringify({ success: true, targetDates: [], fetched: 0, inserted: 0 }));
    return;
  }

  // 全対象日を処理（GH Actionsには10秒制限なし）
  const results: Array<{
    targetDate: string;
    fetched: number;
    inserted: number;
    pageCount?: number;
  }> = [];

  for (const targetDate of targetDates) {
    logger.info('Processing equity_bars', { targetDate });

    // ジョブ記録開始
    const { runId, error: startError } = await startJobRun(supabaseIngest, {
      jobName: JOB_NAME,
      targetDate,
      meta: { dataset: 'equity_bars', source: 'gh-actions-direct' },
    });

    if (startError) {
      logger.warn('Job run start issue', { targetDate, error: startError });
      // 既に実行済みの場合はスキップ
      if (startError.includes('already executed')) {
        logger.info('Skipping already executed date', { targetDate });
        continue;
      }
    }

    const logContext: LogContext = {
      jobName: JOB_NAME,
      runId: runId || undefined,
      dataset: 'equity_bars',
    };

    // ハートビート: running
    await updateHeartbeat(supabaseIngest, {
      jobName: JOB_NAME,
      status: 'running',
      runId: runId || undefined,
      targetDate,
    });

    try {
      const result = await syncEquityBarsDailyForDate(targetDate, { logContext });

      logger.info('equity_bars sync completed', {
        targetDate,
        fetched: result.fetched,
        inserted: result.inserted,
        pageCount: result.pageCount,
      });

      results.push({
        targetDate,
        fetched: result.fetched,
        inserted: result.inserted,
        pageCount: result.pageCount,
      });

      // ジョブ成功記録
      if (runId) {
        await Promise.all([
          completeJobRun(supabaseIngest, runId, 'success'),
          updateHeartbeat(supabaseIngest, {
            jobName: JOB_NAME,
            status: 'success',
            runId,
            targetDate,
          }),
        ]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('equity_bars sync failed', { targetDate, error: errorMessage });

      if (runId) {
        await Promise.all([
          completeJobRun(supabaseIngest, runId, 'failed', errorMessage),
          updateHeartbeat(supabaseIngest, {
            jobName: JOB_NAME,
            status: 'failed',
            runId,
            targetDate,
            error: errorMessage,
          }),
        ]);
      }

      // 失敗しても他の日付は続行しない（エラーを伝播）
      throw error;
    }
  }

  // 結果出力
  const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);

  const output = {
    success: true,
    targetDates: results.map((r) => r.targetDate),
    fetched: totalFetched,
    inserted: totalInserted,
    details: results,
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
