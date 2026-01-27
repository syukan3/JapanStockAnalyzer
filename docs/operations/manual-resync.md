# 再実行手順

障害やデータ欠損時の手動再実行方法を説明します。

## 1. GitHub Actions からの手動実行

最も簡単な再実行方法です。

### 手順

1. GitHub リポジトリの **Actions** タブを開く
2. 左サイドバーから対象ワークフローを選択:
   - `Cron A - Daily Data Sync`
   - `Cron B - Earnings Calendar Sync`
   - `Cron C - Investor Types Sync`
3. **Run workflow** ボタンをクリック
4. `main` ブランチを選択して **Run workflow** を実行

### 注意事項

- キャッチアップ機能により、漏れた日付を自動検出して処理します
- 同一日付のデータは冪等性により重複しません（UPSERT）

## 2. ローカル環境でのテスト

開発時にcronジョブの動作を確認する方法です。

### 前提条件

1. `.env.local` に以下の環境変数が設定されていること:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   JQUANTS_API_KEY=...
   CRON_SECRET=your-local-cron-secret  # 任意の値
   ```

2. Supabase への接続:
   - **本番DB**: 上記の環境変数で本番Supabaseに接続
   - **ローカルDB**: `supabase start` でローカルDBを起動し、ローカル用の接続情報を設定

### 手順

1. 開発サーバーを起動:
   ```bash
   npm run dev
   ```

2. 別ターミナルからcurlで呼び出し:
   ```bash
   # Cron A - カレンダーデータ
   curl -X POST "http://localhost:3000/api/cron/jquants/a" \
     -H "Authorization: Bearer your-local-cron-secret" \
     -H "Content-Type: application/json" \
     -d '{"dataset": "calendar"}'

   # Cron A - 株価データ
   curl -X POST "http://localhost:3000/api/cron/jquants/a" \
     -H "Authorization: Bearer your-local-cron-secret" \
     -H "Content-Type: application/json" \
     -d '{"dataset": "equity_bars"}'

   # Cron B - 決算発表予定
   curl -X POST "http://localhost:3000/api/cron/jquants/b" \
     -H "Authorization: Bearer your-local-cron-secret" \
     -H "Content-Type: application/json" \
     -d '{"dataset": "earnings_calendar"}'

   # Cron C - 投資部門別
   curl -X POST "http://localhost:3000/api/cron/jquants/c" \
     -H "Authorization: Bearer your-local-cron-secret" \
     -H "Content-Type: application/json" \
     -d '{"dataset": "investor_types"}'
   ```

### 注意事項

- `Authorization: Bearer` の値は `.env.local` の `CRON_SECRET` と一致させる
- ローカル実行でも本番DBに接続している場合は実データが更新される
- J-Quants API のレート制限（Light: 60リクエスト/分）に注意

## 3. curl での直接呼び出し（本番環境）

特定のデータセットのみ再実行したい場合に使用します。

### Cron A: 日次確定データ

```bash
# 取引カレンダー
curl -X POST "https://your-app.vercel.app/api/cron/jquants/a" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "calendar"}'

# 株価日足
curl -X POST "https://your-app.vercel.app/api/cron/jquants/a" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "equity_bars"}'

# TOPIX
curl -X POST "https://your-app.vercel.app/api/cron/jquants/a" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "topix"}'

# 財務サマリー
curl -X POST "https://your-app.vercel.app/api/cron/jquants/a" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "financial"}'

# 銘柄マスタ
curl -X POST "https://your-app.vercel.app/api/cron/jquants/a" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "equity_master"}'
```

### Cron B: 決算発表予定

```bash
curl -X POST "https://your-app.vercel.app/api/cron/jquants/b" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "earnings_calendar"}'
```

### Cron C: 投資部門別

```bash
# 投資部門別
curl -X POST "https://your-app.vercel.app/api/cron/jquants/c" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "investor_types"}'

# 整合性チェック
curl -X POST "https://your-app.vercel.app/api/cron/jquants/c" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "integrity_check"}'
```

## 4. Supabase からのデータ確認・修正

### データ欠損の確認

```sql
-- データ鮮度確認
SELECT * FROM jquants_ingest.v_data_freshness;

-- 特定期間の株価データ件数確認
SELECT trade_date, COUNT(*) as count
FROM jquants_core.equity_bar_daily
WHERE trade_date >= '2025-01-01'
GROUP BY trade_date
ORDER BY trade_date;

-- 営業日とデータの突合
SELECT
  c.calendar_date,
  c.is_trading_day,
  COALESCE(e.count, 0) as equity_bar_count
FROM jquants_core.trading_calendar c
LEFT JOIN (
  SELECT trade_date, COUNT(*) as count
  FROM jquants_core.equity_bar_daily
  GROUP BY trade_date
) e ON c.calendar_date = e.trade_date
WHERE c.is_trading_day = true
  AND c.calendar_date >= '2025-01-01'
  AND c.calendar_date < CURRENT_DATE
ORDER BY c.calendar_date;
```

### 実行履歴の確認

```sql
-- 失敗ジョブの確認
SELECT * FROM jquants_ingest.v_failed_jobs_24h;

-- 特定日の実行履歴
SELECT *
FROM jquants_ingest.job_runs
WHERE target_date = '2025-01-20'
ORDER BY started_at DESC;
```

### 失敗レコードの削除（再実行のため）

```sql
-- 特定日の失敗レコードを削除して再実行可能にする
DELETE FROM jquants_ingest.job_runs
WHERE job_name = 'cron_a'
  AND target_date = '2025-01-20'
  AND status = 'failed';
```

> **注意**: 成功レコードは削除しないでください。冪等性チェックに使用されます。

## 5. ロック解除

ジョブがタイムアウトしてロックが残った場合の対処。

### ロック状態の確認

```sql
SELECT * FROM jquants_ingest.v_active_locks;
```

### 手動ロック解除

通常は TTL（60秒）で自動解除されますが、即座に解除したい場合:

```sql
UPDATE jquants_ingest.job_locks
SET locked_until = NOW() - INTERVAL '1 second'
WHERE job_name = 'cron_a';
```

## 6. 大量データの再取得

初期導入時や大規模なデータ欠損の場合。

### 環境変数の一時調整

```bash
# キャッチアップ日数を増やす
SYNC_MAX_CATCHUP_DAYS=30
SYNC_LOOKBACK_DAYS=90
```

### 複数回実行

Vercel の 10 秒制限により、1 回の実行で処理できる日数は限られます。
必要に応じて複数回実行してください。

```bash
# 複数回実行してキャッチアップを進める
for i in {1..10}; do
  curl -X POST "https://your-app.vercel.app/api/cron/jquants/a" \
    -H "Authorization: Bearer YOUR_CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"dataset": "equity_bars"}'
  sleep 15  # レート制限を考慮
done
```

## 7. レスポンス確認

再実行後のレスポンス例:

```json
{
  "success": true,
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "dataset": "equity_bars",
  "targetDate": "2025-01-20",
  "fetched": 3850,
  "inserted": 3850,
  "pageCount": 4
}
```

| フィールド | 説明 |
|------------|------|
| `success` | 処理成功フラグ |
| `runId` | 実行 ID（トラブルシューティング用） |
| `dataset` | 処理したデータセット |
| `targetDate` | 処理対象日 |
| `fetched` | API から取得した件数 |
| `inserted` | DB に保存した件数 |
| `pageCount` | ページネーション回数 |
