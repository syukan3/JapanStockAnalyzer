/**
 * cron/heartbeat.ts のユニットテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateHeartbeat,
  getAllHeartbeats,
  getHeartbeat,
  isJobHealthy,
  checkAllJobsHealth,
} from '@/lib/cron/heartbeat';
import type { HeartbeatRecord } from '@/lib/cron/heartbeat';

describe('cron/heartbeat.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('updateHeartbeat', () => {
    it('ハートビートをUPSERTする', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: upsertMock,
        })),
      };

      await updateHeartbeat(mockSupabase as any, {
        jobName: 'cron_a',
        status: 'success',
        runId: 'run-123',
        targetDate: '2024-01-15',
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          job_name: 'cron_a',
          last_status: 'success',
          last_run_id: 'run-123',
          last_target_date: '2024-01-15',
          last_seen_at: '2024-01-15T10:00:00.000Z',
        }),
        { onConflict: 'job_name' }
      );
    });

    it('エラーメッセージを記録する', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: upsertMock,
        })),
      };

      await updateHeartbeat(mockSupabase as any, {
        jobName: 'cron_a',
        status: 'failed',
        error: 'API timeout',
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          last_status: 'failed',
          last_error: 'API timeout',
        }),
        expect.any(Object)
      );
    });

    it('長いエラーメッセージを切り詰める（1000文字）', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: upsertMock,
        })),
      };

      const longError = 'x'.repeat(1500);
      await updateHeartbeat(mockSupabase as any, {
        jobName: 'cron_a',
        status: 'failed',
        error: longError,
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          last_error: 'x'.repeat(1000) + '...',
        }),
        expect.any(Object)
      );
    });

    it('metaデータを渡せる', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: upsertMock,
        })),
      };

      await updateHeartbeat(mockSupabase as any, {
        jobName: 'cron_a',
        status: 'success',
        meta: { version: '1.0.0' },
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: { version: '1.0.0' },
        }),
        expect.any(Object)
      );
    });

    it('DBエラーでも例外を投げない', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({ error: { message: 'DB Error' } }),
        })),
      };

      await expect(
        updateHeartbeat(mockSupabase as any, {
          jobName: 'cron_a',
          status: 'success',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('getAllHeartbeats', () => {
    it('全ジョブのハートビートを取得する', async () => {
      const mockHeartbeats = [
        { job_name: 'cron_a', last_status: 'success' },
        { job_name: 'cron_b', last_status: 'success' },
        { job_name: 'cron_c', last_status: 'failed' },
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockHeartbeats,
            error: null,
          }),
        })),
      };

      const result = await getAllHeartbeats(mockSupabase as any);

      expect(result).toEqual(mockHeartbeats);
    });

    it('DBエラーの場合は空配列を返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'DB Error' },
          }),
        })),
      };

      const result = await getAllHeartbeats(mockSupabase as any);

      expect(result).toEqual([]);
    });
  });

  describe('getHeartbeat', () => {
    it('特定ジョブのハートビートを取得する', async () => {
      const mockHeartbeat = {
        job_name: 'cron_a',
        last_status: 'success',
        last_seen_at: '2024-01-15T09:00:00.000Z',
      };

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockHeartbeat,
            error: null,
          }),
        })),
      };

      const result = await getHeartbeat(mockSupabase as any, 'cron_a');

      expect(result).toEqual(mockHeartbeat);
    });

    it('見つからない場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        })),
      };

      const result = await getHeartbeat(mockSupabase as any, 'cron_a');

      expect(result).toBeNull();
    });

    it('DBエラーの場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'P0001', message: 'DB Error' },
          }),
        })),
      };

      const result = await getHeartbeat(mockSupabase as any, 'cron_a');

      expect(result).toBeNull();
    });
  });

  describe('isJobHealthy', () => {
    it('正常な場合はhealthy=true', () => {
      const heartbeat: HeartbeatRecord = {
        job_name: 'cron_a',
        last_seen_at: '2024-01-15T09:00:00.000Z', // 1時間前
        last_status: 'success',
        last_run_id: 'run-123',
        last_target_date: '2024-01-15',
        last_error: null,
        meta: {},
      };

      const result = isJobHealthy(heartbeat);

      expect(result.healthy).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('ハートビートがない場合はunhealthy', () => {
      const result = isJobHealthy(null);

      expect(result.healthy).toBe(false);
      expect(result.reason).toBe('No heartbeat record found');
    });

    it('古いハートビート（25時間以上）はunhealthy', () => {
      const heartbeat: HeartbeatRecord = {
        job_name: 'cron_a',
        last_seen_at: '2024-01-14T08:00:00.000Z', // 26時間前
        last_status: 'success',
        last_run_id: 'run-123',
        last_target_date: '2024-01-14',
        last_error: null,
        meta: {},
      };

      const result = isJobHealthy(heartbeat);

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('Stale');
      expect(result.reason).toContain('26 hours ago');
    });

    it('最後の実行が失敗の場合はunhealthy', () => {
      const heartbeat: HeartbeatRecord = {
        job_name: 'cron_a',
        last_seen_at: '2024-01-15T09:00:00.000Z',
        last_status: 'failed',
        last_run_id: 'run-123',
        last_target_date: '2024-01-15',
        last_error: 'API timeout',
        meta: {},
      };

      const result = isJobHealthy(heartbeat);

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('Last run failed');
      expect(result.reason).toContain('API timeout');
    });

    it('閾値をカスタマイズできる', () => {
      const heartbeat: HeartbeatRecord = {
        job_name: 'cron_a',
        last_seen_at: '2024-01-15T08:00:00.000Z', // 2時間前
        last_status: 'success',
        last_run_id: 'run-123',
        last_target_date: '2024-01-15',
        last_error: null,
        meta: {},
      };

      // 閾値1時間でチェック → unhealthy
      const result = isJobHealthy(heartbeat, 1);

      expect(result.healthy).toBe(false);
      expect(result.reason).toContain('Stale');
    });

    it('runningステータスは正常として扱う', () => {
      const heartbeat: HeartbeatRecord = {
        job_name: 'cron_a',
        last_seen_at: '2024-01-15T09:30:00.000Z',
        last_status: 'running',
        last_run_id: 'run-123',
        last_target_date: '2024-01-15',
        last_error: null,
        meta: {},
      };

      const result = isJobHealthy(heartbeat);

      expect(result.healthy).toBe(true);
    });
  });

  describe('checkAllJobsHealth', () => {
    it('全ジョブが正常な場合はhealthy=true', async () => {
      const mockHeartbeats = [
        { job_name: 'cron_a', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'success' },
        { job_name: 'cron_b', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'success' },
        { job_name: 'cron_c', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'success' },
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockHeartbeats,
            error: null,
          }),
        })),
      };

      const result = await checkAllJobsHealth(mockSupabase as any);

      expect(result.healthy).toBe(true);
      expect(result.jobs).toHaveLength(3);
      expect(result.jobs.every((j) => j.healthy)).toBe(true);
    });

    it('一部のジョブが異常な場合はhealthy=false', async () => {
      const mockHeartbeats = [
        { job_name: 'cron_a', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'success' },
        { job_name: 'cron_b', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'failed' },
        { job_name: 'cron_c', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'success' },
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockHeartbeats,
            error: null,
          }),
        })),
      };

      const result = await checkAllJobsHealth(mockSupabase as any);

      expect(result.healthy).toBe(false);
      expect(result.jobs.find((j) => j.jobName === 'cron_b')?.healthy).toBe(false);
    });

    it('ハートビートがないジョブはunhealthy', async () => {
      const mockHeartbeats = [
        { job_name: 'cron_a', last_seen_at: '2024-01-15T09:00:00.000Z', last_status: 'success' },
        // cron_b, cron_c のハートビートなし
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockHeartbeats,
            error: null,
          }),
        })),
      };

      const result = await checkAllJobsHealth(mockSupabase as any);

      expect(result.healthy).toBe(false);
      expect(result.jobs.find((j) => j.jobName === 'cron_b')?.healthy).toBe(false);
      expect(result.jobs.find((j) => j.jobName === 'cron_b')?.reason).toBe('No heartbeat record found');
    });

    it('閾値をカスタマイズできる', async () => {
      const mockHeartbeats = [
        { job_name: 'cron_a', last_seen_at: '2024-01-15T08:00:00.000Z', last_status: 'success' },
        { job_name: 'cron_b', last_seen_at: '2024-01-15T08:00:00.000Z', last_status: 'success' },
        { job_name: 'cron_c', last_seen_at: '2024-01-15T08:00:00.000Z', last_status: 'success' },
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockHeartbeats,
            error: null,
          }),
        })),
      };

      // 閾値1時間でチェック → 全てunhealthy（2時間前）
      const result = await checkAllJobsHealth(mockSupabase as any, 1);

      expect(result.healthy).toBe(false);
      expect(result.jobs.every((j) => !j.healthy)).toBe(true);
    });
  });
});
