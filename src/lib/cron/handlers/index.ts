/**
 * Cron ハンドラーモジュール
 *
 * @description 各 Cron ジョブのビジネスロジック
 */

// Cron A: 日次確定データ同期
export {
  handleCronA,
  CronARequestSchema,
  CRON_A_DATASETS,
  type CronADataset,
  type CronARequest,
  type CronAResult,
} from './cron-a';

// Cron B: 決算発表予定同期
export {
  handleCronB,
  type CronBResult,
} from './cron-b';

// Cron C: 投資部門別同期 + 整合性チェック
export {
  handleCronC,
  type CronCResult,
  type IntegrityCheckResult,
} from './cron-c';
