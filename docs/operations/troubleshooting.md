# 障害時追跡方法

障害発生時の調査・対処方法を説明します。

## 1. 障害検知

### メール通知

ジョブ失敗時は `ALERT_EMAIL_TO` に設定したアドレスに通知メールが送信されます。

通知内容:
- ジョブ名
- エラーメッセージ
- 実行 ID
- タイムスタンプ

### 監視ビューでの確認

```sql
-- ジョブの健全性を一覧表示
SELECT * FROM jquants_ingest.v_job_status;
```

| health_status | 意味 |
|---------------|------|
| `OK` | 正常 |
| `FAILED` | 直近の実行が失敗 |
| `STALE` | 25時間以上実行なし |

## 2. 障害パターン別対処

### パターン A: API 認証エラー

**症状**: `401 Unauthorized` または `403 Forbidden`

**原因**:
- J-Quants API キーの期限切れ
- API キーの設定ミス

**対処**:
1. [J-Quants ダッシュボード](https://application.jpx-jquants.com/) でAPIキーを確認・再発行
2. Vercel の環境変数 `JQUANTS_API_KEY` を更新
3. 再デプロイ

### パターン B: レート制限超過

**症状**: `429 Too Many Requests`

**原因**:
- 短時間に大量リクエスト
- 他システムとのAPI キー共有

**対処**:
1. しばらく待つ（通常は 1 分でリセット）
2. `INVESTOR_TYPES_WINDOW_DAYS` を減らす（負荷軽減）
3. 手動実行の頻度を下げる

### パターン C: Supabase 接続エラー

**症状**: `connection refused` または `timeout`

**原因**:
- Supabase の一時障害
- 接続プールの枯渇

**対処**:
1. [Supabase Status](https://status.supabase.com/) を確認
2. しばらく待って再実行
3. 接続文字列（環境変数）を確認

### パターン D: タイムアウト

**症状**: 処理が中断される

**原因**:
- Vercel の 10 秒制限を超過
- J-Quants API のレスポンス遅延

**対処**:
1. ロック状態を確認・解除
   ```sql
   SELECT * FROM jquants_ingest.v_active_locks;
   ```
2. 再実行（キャッチアップ機能で継続）
3. 繰り返す場合は Vercel Pro へのアップグレードを検討

### パターン E: データ不整合

**症状**: 整合性チェックで警告

**確認方法**:
```sql
-- 整合性チェック結果をログから確認
SELECT *
FROM jquants_ingest.job_runs
WHERE job_name = 'cron_c'
ORDER BY started_at DESC
LIMIT 10;
```

**対処**:
1. 欠損データセットを特定
2. 該当 Cron ジョブを手動実行
3. データ鮮度を再確認
   ```sql
   SELECT * FROM jquants_ingest.v_data_freshness;
   ```

## 3. ログ調査

### Vercel ログ

1. Vercel ダッシュボードでプロジェクトを開く
2. **Logs** タブを選択
3. フィルタで絞り込み:
   - Source: `Functions`
   - Level: `Error`
   - Path: `/api/cron/jquants/`

### 構造化ログの読み方

本システムは JSON 形式の構造化ログを出力します。

```json
{
  "level": "error",
  "module": "cron-a",
  "message": "Cron A handler failed",
  "dataset": "equity_bars",
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Rate limit exceeded"
}
```

| フィールド | 説明 |
|------------|------|
| `level` | ログレベル (debug/info/warn/error) |
| `module` | 出力元モジュール |
| `message` | ログメッセージ |
| `runId` | 実行 ID（追跡用） |
| `error` | エラー詳細 |

### GitHub Actions ログ

1. リポジトリの **Actions** タブを開く
2. 失敗したワークフロー実行を選択
3. 失敗したステップの詳細を確認

## 4. 実行履歴の追跡

### 特定実行の詳細

```sql
-- run_id で検索
SELECT *
FROM jquants_ingest.job_runs
WHERE run_id = '550e8400-e29b-41d4-a716-446655440000';

-- 関連するアイテム
SELECT *
FROM jquants_ingest.job_run_items
WHERE run_id = '550e8400-e29b-41d4-a716-446655440000';
```

### 期間指定での検索

```sql
-- 直近 24 時間の全実行
SELECT
  job_name,
  target_date,
  status,
  started_at,
  finished_at,
  error_message
FROM jquants_ingest.job_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;
```

### 失敗パターンの分析

```sql
-- エラーメッセージ別の集計
SELECT
  error_message,
  COUNT(*) as count,
  MAX(started_at) as last_occurrence
FROM jquants_ingest.job_runs
WHERE status = 'failed'
  AND started_at > NOW() - INTERVAL '7 days'
GROUP BY error_message
ORDER BY count DESC;
```

## 5. 復旧確認

### ヘルスチェック

```sql
-- 全ジョブのステータス確認
SELECT
  job_name,
  last_status,
  last_seen_at,
  health_status
FROM jquants_ingest.v_job_status;
```

### データ完全性確認

```sql
-- 欠損営業日の検出（株価）
WITH business_days AS (
  SELECT calendar_date
  FROM jquants_core.trading_calendar
  WHERE is_trading_day = true
    AND calendar_date >= CURRENT_DATE - INTERVAL '30 days'
    AND calendar_date < CURRENT_DATE
),
existing_dates AS (
  SELECT DISTINCT trade_date
  FROM jquants_core.equity_bar_daily
  WHERE trade_date >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT bd.calendar_date AS missing_date
FROM business_days bd
LEFT JOIN existing_dates ed ON bd.calendar_date = ed.trade_date
WHERE ed.trade_date IS NULL
ORDER BY bd.calendar_date;
```

## 6. エスカレーション

以下の場合はエスカレーションを検討してください。

| 状況 | 対応 |
|------|------|
| 3 日以上データ取得できない | J-Quants サポートに問い合わせ |
| Supabase 障害が継続 | Supabase サポートに問い合わせ |
| 原因不明の繰り返し失敗 | アプリケーションログの詳細調査 |

## 7. 予防措置

### 定期確認事項

| 頻度 | 確認項目 |
|------|----------|
| 日次 | `v_job_status` で FAILED/STALE がないか |
| 週次 | `v_data_freshness` でデータ鮮度確認 |
| 月次 | J-Quants API キーの有効期限確認 |

### アラート設定推奨

- Supabase のクエリをスケジュール実行し、異常時にSlack/メール通知
- Vercel の Monitoring 機能でエラーレート監視
