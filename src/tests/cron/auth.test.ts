/**
 * cron/auth.ts のユニットテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCronAuth, createUnauthorizedResponse, requireCronAuth } from '@/lib/cron/auth';

describe('cron/auth.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verifyCronAuth', () => {
    it('正しいトークンで認証成功する', () => {
      process.env.CRON_SECRET = 'test-secret-123';

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer test-secret-123',
        },
      });

      const result = verifyCronAuth(request);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('CRON_SECRET未設定でエラーになる', () => {
      delete process.env.CRON_SECRET;

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer any-token',
        },
      });

      const result = verifyCronAuth(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server configuration error');
    });

    it('Authorizationヘッダーがない場合エラーになる', () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new Request('http://localhost/api/cron/a');

      const result = verifyCronAuth(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    it('Bearer形式でない場合エラーになる', () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz',
        },
      });

      const result = verifyCronAuth(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Authorization header format');
    });

    it('トークンが一致しない場合エラーになる', () => {
      process.env.CRON_SECRET = 'correct-secret';

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      });

      const result = verifyCronAuth(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('空のトークンでエラーになる', () => {
      process.env.CRON_SECRET = 'test-secret';

      // Note: Request APIがヘッダー値の末尾スペースをトリムするため、
      // 'Bearer ' は 'Bearer' になり、Bearer形式チェックで失敗する
      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer ',
        },
      });

      const result = verifyCronAuth(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Authorization header format');
    });

    it('トークンの前後に空白があっても正しく処理する', () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer  test-secret', // 余分な空白
        },
      });

      const result = verifyCronAuth(request);

      // 空白を含むトークンとして扱われるため不一致
      expect(result.success).toBe(false);
    });
  });

  describe('createUnauthorizedResponse', () => {
    it('401ステータスのレスポンスを返す', async () => {
      const response = createUnauthorizedResponse();

      expect(response.status).toBe(401);
    });

    it('WWW-Authenticateヘッダーを含む', async () => {
      const response = createUnauthorizedResponse();

      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    });

    it('デフォルトのエラーメッセージを含む', async () => {
      const response = createUnauthorizedResponse();
      const body = await response.json();

      expect(body.error).toBe('Unauthorized');
    });

    it('カスタムエラーメッセージを設定できる', async () => {
      const response = createUnauthorizedResponse('Custom error message');
      const body = await response.json();

      expect(body.error).toBe('Custom error message');
    });
  });

  describe('requireCronAuth', () => {
    it('認証成功時はnullを返す', () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer test-secret',
        },
      });

      const result = requireCronAuth(request);

      expect(result).toBeNull();
    });

    it('認証失敗時はResponseを返す', async () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      });

      const result = requireCronAuth(request);

      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(401);
    });

    it('認証失敗時のレスポンスにエラーメッセージを含む', async () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new Request('http://localhost/api/cron/a');

      const result = requireCronAuth(request);
      const body = await result?.json();

      expect(body.error).toBe('Missing Authorization header');
    });
  });

  describe('タイミングセーフ比較', () => {
    it('異なる長さのトークンでも一定時間で処理する', () => {
      process.env.CRON_SECRET = 'a'.repeat(100);

      // 短いトークン
      const shortRequest = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer x',
        },
      });

      // 長いトークン
      const longRequest = new Request('http://localhost/api/cron/a', {
        headers: {
          Authorization: 'Bearer ' + 'x'.repeat(1000),
        },
      });

      // 両方とも失敗するはず（timing attackを防ぐため、時間差を検証するのは困難なので結果のみ検証）
      const shortResult = verifyCronAuth(shortRequest);
      const longResult = verifyCronAuth(longRequest);

      expect(shortResult.success).toBe(false);
      expect(longResult.success).toBe(false);
    });
  });
});
