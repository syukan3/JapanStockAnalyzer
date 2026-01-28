/**
 * cron/business-day.ts のユニットテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isBusinessDay,
  isBusinessDayInDB,
  getPreviousBusinessDay,
  getNextBusinessDay,
  getBusinessDays,
  getBusinessDayNDaysAgo,
  getCalendarMaxDate,
  getCalendarMinDate,
  checkCalendarCoverage,
} from '@/lib/cron/business-day';

describe('cron/business-day.ts', () => {
  describe('isBusinessDay (純粋関数)', () => {
    it('holDiv="1" は営業日（true）', () => {
      expect(isBusinessDay('1')).toBe(true);
    });

    it('holDiv="2" は半日取引（true）', () => {
      expect(isBusinessDay('2')).toBe(true);
    });

    it('holDiv="0" は非営業日（false）', () => {
      expect(isBusinessDay('0')).toBe(false);
    });

    it('その他の値は非営業日（false）', () => {
      expect(isBusinessDay('3')).toBe(false);
      expect(isBusinessDay('')).toBe(false);
      expect(isBusinessDay('invalid')).toBe(false);
    });
  });

  describe('isBusinessDayInDB', () => {
    it('営業日の場合trueを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { hol_div: '1' },
            error: null,
          }),
        })),
      };

      const result = await isBusinessDayInDB(mockSupabase as any, '2024-01-15');

      expect(result).toBe(true);
    });

    it('非営業日の場合falseを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { hol_div: '0' },
            error: null,
          }),
        })),
      };

      const result = await isBusinessDayInDB(mockSupabase as any, '2024-01-14');

      expect(result).toBe(false);
    });

    it('データが見つからない場合falseを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' },
          }),
        })),
      };

      const result = await isBusinessDayInDB(mockSupabase as any, '2099-01-01');

      expect(result).toBe(false);
    });
  });

  describe('getPreviousBusinessDay', () => {
    it('前営業日を取得する', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { calendar_date: '2024-01-14', hol_div: '0' }, // 日曜
              { calendar_date: '2024-01-13', hol_div: '0' }, // 土曜
              { calendar_date: '2024-01-12', hol_div: '1' }, // 金曜（営業日）
            ],
            error: null,
          }),
        })),
      };

      const result = await getPreviousBusinessDay(mockSupabase as any, '2024-01-15');

      expect(result).toBe('2024-01-12');
    });

    it('営業日が見つからない場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { calendar_date: '2024-01-14', hol_div: '0' },
              { calendar_date: '2024-01-13', hol_div: '0' },
            ],
            error: null,
          }),
        })),
      };

      const result = await getPreviousBusinessDay(mockSupabase as any, '2024-01-15');

      expect(result).toBeNull();
    });

    it('DBエラーの場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'DB Error' },
          }),
        })),
      };

      const result = await getPreviousBusinessDay(mockSupabase as any, '2024-01-15');

      expect(result).toBeNull();
    });
  });

  describe('getNextBusinessDay', () => {
    it('次営業日を取得する', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { calendar_date: '2024-01-13', hol_div: '0' }, // 土曜
              { calendar_date: '2024-01-14', hol_div: '0' }, // 日曜
              { calendar_date: '2024-01-15', hol_div: '1' }, // 月曜（営業日）
            ],
            error: null,
          }),
        })),
      };

      const result = await getNextBusinessDay(mockSupabase as any, '2024-01-12');

      expect(result).toBe('2024-01-15');
    });

    it('営業日が見つからない場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      };

      const result = await getNextBusinessDay(mockSupabase as any, '2099-12-31');

      expect(result).toBeNull();
    });
  });

  describe('getBusinessDays', () => {
    it('指定期間の営業日リストを取得する', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { calendar_date: '2024-01-15', hol_div: '1' },
              { calendar_date: '2024-01-16', hol_div: '1' },
              { calendar_date: '2024-01-17', hol_div: '1' },
              { calendar_date: '2024-01-18', hol_div: '1' },
              { calendar_date: '2024-01-19', hol_div: '1' },
              { calendar_date: '2024-01-20', hol_div: '0' }, // 土曜
              { calendar_date: '2024-01-21', hol_div: '0' }, // 日曜
            ],
            error: null,
          }),
        })),
      };

      const result = await getBusinessDays(mockSupabase as any, '2024-01-15', '2024-01-21');

      expect(result).toEqual([
        '2024-01-15',
        '2024-01-16',
        '2024-01-17',
        '2024-01-18',
        '2024-01-19',
      ]);
    });

    it('DBエラーの場合空配列を返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'DB Error' },
          }),
        })),
      };

      const result = await getBusinessDays(mockSupabase as any, '2024-01-15', '2024-01-21');

      expect(result).toEqual([]);
    });
  });

  describe('getBusinessDayNDaysAgo', () => {
    it('N営業日前の日付を取得する', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { calendar_date: '2024-01-12', hol_div: '1' }, // 1営業日前
              { calendar_date: '2024-01-11', hol_div: '1' }, // 2営業日前
              { calendar_date: '2024-01-10', hol_div: '1' }, // 3営業日前
            ],
            error: null,
          }),
        })),
      };

      const result = await getBusinessDayNDaysAgo(mockSupabase as any, 2, '2024-01-15');

      expect(result).toBe('2024-01-11');
    });

    it('n=0の場合は基準日を返す', async () => {
      const mockSupabase = {} as any;

      const result = await getBusinessDayNDaysAgo(mockSupabase, 0, '2024-01-15');

      expect(result).toBe('2024-01-15');
    });

    it('営業日が足りない場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { calendar_date: '2024-01-12', hol_div: '1' },
            ],
            error: null,
          }),
        })),
      };

      const result = await getBusinessDayNDaysAgo(mockSupabase as any, 5, '2024-01-15');

      expect(result).toBeNull();
    });
  });

  describe('getCalendarMaxDate', () => {
    it('カレンダーの最新日付を取得する', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { calendar_date: '2025-12-31' },
            error: null,
          }),
        })),
      };

      const result = await getCalendarMaxDate(mockSupabase as any);

      expect(result).toBe('2025-12-31');
    });

    it('データがない場合nullを返す', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        })),
      };

      const result = await getCalendarMaxDate(mockSupabase as any);

      expect(result).toBeNull();
    });
  });

  describe('getCalendarMinDate', () => {
    it('カレンダーの最古日付を取得する', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { calendar_date: '2020-01-01' },
            error: null,
          }),
        })),
      };

      const result = await getCalendarMinDate(mockSupabase as any);

      expect(result).toBe('2020-01-01');
    });
  });

  describe('checkCalendarCoverage', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('カバレッジが十分な場合okを返す', async () => {
      // Promise.all で並列実行されるため、order の ascending 値で min/max を判定
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation((_col: string, opts: { ascending: boolean }) => ({
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { calendar_date: opts.ascending ? '2020-01-01' : '2030-12-31' },
              error: null,
            }),
          })),
        })),
      };

      const result = await checkCalendarCoverage(mockSupabase as any, 370, 370);

      expect(result.ok).toBe(true);
      expect(result.minDate).toBe('2020-01-01');
      expect(result.maxDate).toBe('2030-12-31');
    });

    it('カバレッジが不十分な場合okがfalseになる', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation((_col: string, opts: { ascending: boolean }) => ({
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              // 過去方向不足 (2024-06-01) / 未来方向不足 (2024-12-31)
              data: { calendar_date: opts.ascending ? '2024-06-01' : '2024-12-31' },
              error: null,
            }),
          })),
        })),
      };

      const result = await checkCalendarCoverage(mockSupabase as any, 370, 370);

      expect(result.ok).toBe(false);
    });

    it('カレンダーデータがない場合okがfalseになる', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          })),
        })),
      };

      const result = await checkCalendarCoverage(mockSupabase as any);

      expect(result.ok).toBe(false);
      expect(result.minDate).toBeNull();
      expect(result.maxDate).toBeNull();
    });
  });
});
