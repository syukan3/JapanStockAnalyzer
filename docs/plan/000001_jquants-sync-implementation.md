# J-Quants API V2 データ同期基盤 実装計画

## 概要

Vercel Cron Jobs (A/B/C) + Next.js App Router + Supabase Postgres で J-Quants API V2 データを日次同期する基盤を構築する。

## ディレクトリ構成

```
JapanStockAnalyzer/
├── src/
│   ├── app/
│   │   ├── api/cron/jquants/
│   │   │   ├── a/route.ts          # Cron A: 日次確定データ
│   │   │   ├── b/route.ts          # Cron B: 決算発表予定
│   │   │   └── c/route.ts          # Cron C: 投資部門別
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       ├── jquants/
│       │   ├── client.ts           # API クライアント
│       │   ├── rate-limiter.ts     # トークンバケット (60 req/min)
│       │   ├── types.ts            # 型定義
│       │   └── endpoints/          # 各エンドポイント
│       ├── supabase/
│       │   ├── client.ts           # ブラウザ用
│       │   └── admin.ts            # Service Role (Cron用)
│       ├── cron/
│       │   ├── auth.ts             # CRON_SECRET 検証
│       │   ├── job-lock.ts         # Advisory Lock
│       │   ├── job-run.ts          # 実行ログ管理
│       │   ├── heartbeat.ts        # 死活監視
│       │   ├── catch-up.ts         # キャッチアップ
│       │   └── handlers/           # A/B/C ビジネスロジック
│       └── utils/
│           ├── date.ts             # JST日付ユーティリティ
│           ├── retry.ts            # 指数バックオフ
│           └── batch.ts            # バッチ処理
├── supabase/migrations/
│   ├── 00001_create_schemas.sql
│   ├── 00002_create_ingest_tables.sql
│   └── 00003_create_core_tables.sql
├── package.json
├── next.config.ts
├── vercel.json
└── .env.local.example
```

## 実装フェーズ

### Phase 1: プロジェクト初期設定

1. **package.json 作成**
   - Next.js 16.1.4 (最新安定版), @supabase/supabase-js, @supabase/ssr, zod
   - TypeScript, Vitest, ESLint

2. **next.config.ts / tsconfig.json**

3. **vercel.json** - Cron スケジュール設定
   ```json
   {
     "crons": [
       { "path": "/api/cron/jquants/a", "schedule": "20 0 * * *" },
       { "path": "/api/cron/jquants/b", "schedule": "20 10 * * *" },
       { "path": "/api/cron/jquants/c", "schedule": "10 3 * * *" }
     ]
   }
   ```

### Phase 2: Supabase マイグレーション

1. **00001_create_schemas.sql**
   - `jquants_core` (データ本体)
   - `jquants_ingest` (ジョブ管理)

2. **00002_create_ingest_tables.sql**
   - `job_locks` - Advisory Lock 用
   - `job_runs` - 実行ログ
   - `job_run_items` - データセット単位ログ
   - `job_heartbeat` - 死活監視

3. **00003_create_core_tables.sql**
   - `trading_calendar` - 取引カレンダー
   - `equity_master_snapshot` - 銘柄マスタ
   - `equity_bar_daily` - 株価日足 (パーティション)
   - `topix_bar_daily` - TOPIX
   - `financial_disclosure` - 財務情報
   - `earnings_calendar` - 決算発表予定
   - `investor_type_trading` - 投資部門別

### Phase 3: 基盤ライブラリ

1. **src/lib/supabase/admin.ts**
   - Service Role Key でサーバー専用クライアント

2. **src/lib/jquants/rate-limiter.ts**
   - トークンバケット: 60 tokens/min
   - 非同期 acquire() でレート制御

3. **src/lib/utils/retry.ts**
   - 指数バックオフ + ジッター
   - 429/5xx で自動リトライ

4. **src/lib/jquants/client.ts**
   - `x-api-key` ヘッダー認証
   - `pagination_key` 全消化
   - `requestPaginated()` ジェネレーター

5. **src/lib/cron/auth.ts**
   - `Authorization: Bearer ${CRON_SECRET}` 検証

6. **src/lib/cron/job-lock.ts**
   - `pg_try_advisory_lock()` で排他制御

7. **src/lib/cron/job-run.ts** / **heartbeat.ts**
   - ジョブ開始/完了/失敗のログ記録
   - 死活監視テーブル更新

### Phase 4: J-Quants エンドポイント実装

各エンドポイント (`src/lib/jquants/endpoints/`):
- `trading-calendar.ts` - GET /v2/markets/calendar
- `equity-master.ts` - GET /v2/equities/master
- `equity-bars-daily.ts` - GET /v2/equities/bars/daily (ページング)
- `index-topix.ts` - GET /v2/indices/bars/daily/topix
- `fins-summary.ts` - GET /v2/fins/summary (ページング)
- `earnings-calendar.ts` - GET /v2/equities/earnings-calendar
- `investor-types.ts` - GET /v2/equities/investor-types

### Phase 5: Cron ハンドラー実装

1. **src/lib/cron/handlers/cron-a.ts**
   - 前営業日の確定データ取得
   - 株価、財務、TOPIX、銘柄マスタ、カレンダー
   - キャッチアップロジック (最大5営業日)

2. **src/lib/cron/handlers/cron-b.ts**
   - 翌営業日の決算発表予定

3. **src/lib/cron/handlers/cron-c.ts**
   - 投資部門別 (スライディングウィンドウ60日)
   - 整合性チェック

### Phase 6: Route Handler 実装

各ルート (`src/app/api/cron/jquants/{a,b,c}/route.ts`):
```typescript
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  // 1. CRON_SECRET 認証
  // 2. Advisory Lock 取得
  // 3. job_runs INSERT (running)
  // 4. heartbeat UPDATE (running)
  // 5. ハンドラー実行
  // 6. job_runs UPDATE (success/failed)
  // 7. heartbeat UPDATE (success/failed)
  // 8. Lock 解放
}
```

## 主要ファイル一覧

| ファイル | 役割 |
|---------|------|
| `src/lib/jquants/client.ts` | API クライアント (認証/レート/ページング/リトライ) |
| `src/lib/cron/job-lock.ts` | Advisory Lock で同時実行防止 |
| `src/lib/cron/handlers/cron-a.ts` | メインのデータ同期ロジック |
| `src/app/api/cron/jquants/a/route.ts` | Cron A エントリーポイント |
| `supabase/migrations/00003_create_core_tables.sql` | データスキーマ |

## 環境変数

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
JQUANTS_API_KEY=xxx
CRON_SECRET=xxx
```

## 検証方法

1. **ローカル実行テスト**
   ```bash
   # 開発サーバー起動
   npm run dev

   # Cron エンドポイント呼び出し (認証ヘッダー付き)
   curl -H "Authorization: Bearer $CRON_SECRET" \
        http://localhost:3000/api/cron/jquants/a
   ```

2. **データ確認**
   ```sql
   -- 実行ログ確認
   SELECT * FROM jquants_ingest.job_runs ORDER BY started_at DESC LIMIT 10;

   -- 死活監視確認
   SELECT * FROM jquants_ingest.job_heartbeat;

   -- データ件数確認
   SELECT COUNT(*) FROM jquants_core.equity_bar_daily;
   ```

3. **Vercel デプロイ後**
   - Cron Jobs ダッシュボードで実行履歴確認
   - 401 が返ることを確認 (認証なしアクセス)
   - ログで正常動作確認

## 重要な設計ポイント

1. **冪等性**: 全テーブルで UPSERT (ON CONFLICT DO UPDATE)
2. **排他制御**: `pg_try_advisory_lock()` で二重起動防止
3. **レートリミット**: トークンバケット + 指数バックオフ
4. **ページング**: `pagination_key` を完全消化
5. **キャッチアップ**: 未処理営業日を自動検出・順次処理
6. **死活監視**: 毎回 heartbeat テーブルを更新
7. **raw_json 保持**: API レスポンスをそのまま保存して取りこぼし防止

## 技術スタック

| 技術 | バージョン |
|------|-----------|
| Next.js | 16.1.4 |
| TypeScript | 5.7+ |
| @supabase/supabase-js | 2.47+ |
| @supabase/ssr | 0.5+ |
| zod | 3.24+ |
| vitest | 3.0+ |
