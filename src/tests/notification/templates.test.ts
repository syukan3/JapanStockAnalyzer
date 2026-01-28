/**
 * notification/templates.ts のユニットテスト
 */

import { describe, it, expect } from 'vitest';
import {
  getJobFailureEmailTemplate,
  getJobSuccessEmailTemplate,
  getDailySummaryEmailTemplate,
} from '@/lib/notification/templates';
import type { JobFailureNotification, JobSuccessNotification } from '@/lib/notification/email';

describe('notification/templates.ts', () => {
  describe('getJobFailureEmailTemplate', () => {
    it('失敗通知メールテンプレートを生成する', () => {
      const data: JobFailureNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        targetDate: '2024-01-15',
        error: 'API timeout',
        timestamp: new Date('2024-01-15T10:00:00.000Z'),
      };

      const { subject, html } = getJobFailureEmailTemplate(data);

      expect(subject).toBe('[ALERT] cron_a 失敗 - 2024-01-15');
      expect(html).toContain('ジョブ失敗通知');
      expect(html).toContain('cron_a');
      expect(html).toContain('run-123');
      expect(html).toContain('2024-01-15');
      expect(html).toContain('API timeout');
    });

    it('datasetがある場合はテンプレートに含める', () => {
      const data: JobFailureNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        error: 'Error',
        timestamp: new Date(),
        dataset: 'equity_bars_daily',
      };

      const { html } = getJobFailureEmailTemplate(data);

      expect(html).toContain('データセット');
      expect(html).toContain('equity_bars_daily');
    });

    it('targetDateがない場合は「未指定」と表示する', () => {
      const data: JobFailureNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        error: 'Error',
        timestamp: new Date(),
      };

      const { subject, html } = getJobFailureEmailTemplate(data);

      expect(subject).toContain('未指定');
      expect(html).toContain('未指定');
    });

    it('エラーメッセージをHTMLエスケープする', () => {
      const data: JobFailureNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        error: '<script>alert("XSS")</script>',
        timestamp: new Date(),
      };

      const { html } = getJobFailureEmailTemplate(data);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('ジョブ名をラベルに変換する', () => {
      const data: JobFailureNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        error: 'Error',
        timestamp: new Date(),
      };

      const { html } = getJobFailureEmailTemplate(data);

      expect(html).toContain('Cron A (日次確定データ)');
    });
  });

  describe('getJobSuccessEmailTemplate', () => {
    it('成功通知メールテンプレートを生成する', () => {
      const data: JobSuccessNotification = {
        jobName: 'cron_b',
        runId: 'run-456',
        targetDate: '2024-01-15',
        rowCount: 1000,
        durationMs: 5500,
        timestamp: new Date('2024-01-15T10:05:00.000Z'),
      };

      const { subject, html } = getJobSuccessEmailTemplate(data);

      expect(subject).toBe('[OK] cron_b 完了 - 2024-01-15');
      expect(html).toContain('ジョブ完了通知');
      expect(html).toContain('cron_b');
      expect(html).toContain('run-456');
      expect(html).toContain('2024-01-15');
    });

    it('rowCountをフォーマットする', () => {
      const data: JobSuccessNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        rowCount: 1000000,
        timestamp: new Date(),
      };

      const { html } = getJobSuccessEmailTemplate(data);

      expect(html).toContain('1,000,000');
    });

    it('durationMsを秒単位に変換する', () => {
      const data: JobSuccessNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        durationMs: 5500,
        timestamp: new Date(),
      };

      const { html } = getJobSuccessEmailTemplate(data);

      expect(html).toContain('5.50秒');
    });

    it('rowCountがない場合は「不明」と表示する', () => {
      const data: JobSuccessNotification = {
        jobName: 'cron_a',
        runId: 'run-123',
        timestamp: new Date(),
      };

      const { html } = getJobSuccessEmailTemplate(data);

      expect(html).toContain('不明');
    });

    it('ジョブ名をラベルに変換する', () => {
      const data: JobSuccessNotification = {
        jobName: 'cron_c',
        runId: 'run-123',
        timestamp: new Date(),
      };

      const { html } = getJobSuccessEmailTemplate(data);

      expect(html).toContain('Cron C (投資部門別)');
    });
  });

  describe('getDailySummaryEmailTemplate', () => {
    it('日次サマリーメールテンプレートを生成する', () => {
      const data = {
        date: '2024-01-15',
        jobs: [
          { jobName: 'cron_a', status: 'success' as const, rowCount: 1000 },
          { jobName: 'cron_b', status: 'success' as const, rowCount: 500 },
          { jobName: 'cron_c', status: 'success' as const, rowCount: 200 },
        ],
      };

      const { subject, html } = getDailySummaryEmailTemplate(data);

      expect(subject).toBe('[✓] 日次サマリー - 2024-01-15');
      expect(html).toContain('日次実行サマリー');
      expect(html).toContain('2024-01-15');
    });

    it('全て成功の場合はチェックマークを表示する', () => {
      const data = {
        date: '2024-01-15',
        jobs: [
          { jobName: 'cron_a', status: 'success' as const },
        ],
      };

      const { subject } = getDailySummaryEmailTemplate(data);

      expect(subject).toContain('✓');
    });

    it('失敗がある場合はXマークを表示する', () => {
      const data = {
        date: '2024-01-15',
        jobs: [
          { jobName: 'cron_a', status: 'success' as const },
          { jobName: 'cron_b', status: 'failed' as const },
        ],
      };

      const { subject } = getDailySummaryEmailTemplate(data);

      expect(subject).toContain('✗');
    });

    it('未実行のみの場合は○を表示する', () => {
      const data = {
        date: '2024-01-15',
        jobs: [
          { jobName: 'cron_a', status: 'not_run' as const },
        ],
      };

      const { subject } = getDailySummaryEmailTemplate(data);

      expect(subject).toContain('○');
    });

    it('ステータスバッジを正しく表示する', () => {
      const data = {
        date: '2024-01-15',
        jobs: [
          { jobName: 'cron_a', status: 'success' as const },
          { jobName: 'cron_b', status: 'failed' as const },
          { jobName: 'cron_c', status: 'not_run' as const },
        ],
      };

      const { html } = getDailySummaryEmailTemplate(data);

      expect(html).toContain('成功');
      expect(html).toContain('失敗');
      expect(html).toContain('未実行');
    });

    it('ジョブ名をラベルに変換する', () => {
      const data = {
        date: '2024-01-15',
        jobs: [
          { jobName: 'cron_a', status: 'success' as const },
        ],
      };

      const { html } = getDailySummaryEmailTemplate(data);

      expect(html).toContain('Cron A (日次確定データ)');
    });

    it('日付をHTMLエスケープする', () => {
      const data = {
        date: '<script>alert(1)</script>',
        jobs: [],
      };

      const { html } = getDailySummaryEmailTemplate(data);

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
