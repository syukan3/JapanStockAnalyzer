#!/usr/bin/env tsx
/**
 * 銘柄マスタ Seed スクリプト
 *
 * @description J-Quants APIから銘柄マスタを取得してDBに保存
 *
 * @example
 * ```
 * npm run seed:master
 * npm run seed:master -- --from 2024-01-01 --to 2024-12-31
 * ```
 */

import { loadEnv, parseArgs, createProgress, logResult, startTimer, type SeedResult } from './_shared';

async function main(): Promise<SeedResult> {
  loadEnv();

  const { to } = parseArgs();

  console.log('Starting Equity Master Seed (SCD Type 2)');
  console.log(`  Date: ${to}`);

  const timer = startTimer();

  // 動的インポート（環境変数ロード後）
  const { syncEquityMasterSCD } = await import('../../src/lib/jquants/endpoints/equity-master');

  // SCD Type 2方式で銘柄マスタを同期
  const progress = createProgress(1, 'equity_master');

  try {
    const result = await syncEquityMasterSCD(to);
    progress.done();

    const seedResult: SeedResult = {
      name: 'Equity Master',
      fetched: result.fetched,
      inserted: result.inserted + result.updated,
      errors: result.errors,
      durationMs: timer(),
    };

    logResult(seedResult);
    return seedResult;
  } catch (error) {
    progress.done();
    console.error('Failed to sync equity master:', error);
    throw error;
  }
}

// 直接実行時のみmain()を呼ぶ（import時は実行しない）
const isDirectRun = process.argv[1]?.endsWith('equity-master.ts') || process.argv[1]?.endsWith('equity-master');
if (isDirectRun) {
  main()
    .then((result) => {
      if (result.errors.length > 0) {
        process.exit(1);
      }
    })
    .catch(() => {
      process.exit(1);
    });
}

export { main as seedEquityMaster };
