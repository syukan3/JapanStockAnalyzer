---
name: cron-troubleshoot
description: Cron障害の調査・復旧。「Cronが失敗してる」「データが欠損してる」「ワークフロー調査して」「バックフィルして」で使用する。
---

# Cron 障害調査・復旧スキル

Cron ジョブの失敗調査からデータ欠損の特定・バックフィルまでの一連の手順。

---

## Step 1: 失敗ランの特定

```bash
# 直近の実行履歴を確認（Cron A / B / C）
gh run list --workflow="Cron A - Daily Data Sync" --limit 10
gh run list --workflow="Cron B - Earnings Calendar" --limit 10
gh run list --workflow="Cron C - Investor Trading" --limit 10
```

- `failure` / `cancelled` のランを特定する
- Run ID をメモする

## Step 2: エラーログの確認

```bash
# 失敗ステップのログを取得
gh run view {RUN_ID} --log-failed 2>&1 | tail -50

# 特定キーワードでフィルタ（エラー原因の絞り込み）
gh run view {RUN_ID} --log-failed 2>&1 | grep -E "error|FAILED|Error|duplicate|constraint|timeout"
```

### よくあるエラーパターン

| エラー | 原因 | 対処 |
|---|---|---|
| `duplicate key value violates unique constraint` | 同一データの二重挿入 | upsert で冪等なので再実行で解決 |
| `chk_valid_period` | valid_to <= valid_from の SCD クローズ | 同日クローズのロジックを確認 |
| `invalid input syntax for type numeric: ""` | API が空文字を返却 | `toXxxRecord` で空文字→null 変換を追加 |
| `Could not find the 'xxx' column` | スキーマ不一致 | マイグレーション未適用。Supabase ダッシュボードで確認 |
| `exceeded the maximum execution time` | タイムアウト | `timeout-minutes` を一時的に引き上げて再実行 |
| `null !== undefined` で全レコード変更判定 | DB は null、API は undefined | 比較関数で `?? null` 正規化 |

## Step 3: データ欠損の特定

`supabase-data-check` スキルを使い、全テーブルの最新データ日を確認する。

欠損日を特定するには、営業日を取得して各テーブルのデータ件数を照合する：

```bash
source /Users/m-sakae/Source/JapanStockAnalyzer/.env.local

# 直近の営業日を取得（{FROM} {TO} を置換）
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trading_calendar?calendar_date=gte.{FROM}&calendar_date=lte.{TO}&is_business_day=eq.true&select=calendar_date&order=calendar_date.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"
```

各営業日について、以下のテーブルでデータ件数が 0 なら欠損：

| テーブル | 日付列 | 正常件数目安 |
|---|---|---|
| `equity_bar_daily` | `trade_date` | ~4400 |
| `topix_bar_daily` | `trade_date` | 1 |
| `financial_disclosure` | `disclosed_date` | 数十〜数百（日による） |
| `equity_master_snapshot` | `as_of_date` | ~4400 |

## Step 4: バックフィル（データ補完）

### 方法A: 一時スクリプト（推奨）

`scripts/backfill-temp.ts` を作成して実行する。sync 関数は upsert なので冪等。

```typescript
// scripts/backfill-temp.ts
import { syncEquityBarsDailyForDate } from '../src/lib/jquants/endpoints/equity-bars-daily';
import { syncTopixBarsDailyForDate } from '../src/lib/jquants/endpoints/index-topix';
import { syncFinancialSummaryForDate } from '../src/lib/jquants/endpoints/fins-summary';
import { syncEquityMasterForDate } from '../src/lib/jquants/endpoints/equity-master';

// 欠損日とデータセットを指定
const TASKS: { name: string; dates: string[]; fn: (date: string, opts: { logContext: { jobName: string; dataset: string } }) => Promise<{ fetched: number; inserted: number }> }[] = [
  { name: 'equity_bars', dates: ['YYYY-MM-DD'], fn: syncEquityBarsDailyForDate },
  { name: 'topix', dates: ['YYYY-MM-DD'], fn: syncTopixBarsDailyForDate },
  { name: 'financial', dates: ['YYYY-MM-DD'], fn: syncFinancialSummaryForDate },
  { name: 'equity_master_snapshot', dates: ['YYYY-MM-DD'], fn: syncEquityMasterForDate },
];

async function main() {
  for (const task of TASKS) {
    for (const date of task.dates) {
      console.log(`[${task.name}] ${date} ...`);
      try {
        const result = await task.fn(date, { logContext: { jobName: 'backfill', dataset: task.name } });
        console.log(`[${task.name}] ${date} => fetched=${result.fetched}, inserted=${result.inserted}`);
      } catch (e) {
        console.error(`[${task.name}] ${date} FAILED:`, e instanceof Error ? e.message : e);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

実行方法：

```bash
set -a && source .env.local && set +a && npx tsx scripts/backfill-temp.ts
```

**実行後は `scripts/backfill-temp.ts` を削除すること。コミットしない。**

### 方法B: cron-a-direct.ts（equity_bars / equity_master のみ）

現状は前営業日固定。日付指定が必要な場合は方法Aを使う。

```bash
set -a && source .env.local && set +a && npx tsx scripts/cron/cron-a-direct.ts equity_bars
```

### 方法C: GH Actions 手動実行（当日分のみ）

```bash
gh workflow run "Cron A - Daily Data Sync"
gh run list --workflow="Cron A - Daily Data Sync" --limit 1
gh run watch {RUN_ID} --exit-status
```

## Step 5: 補完結果の検証

`supabase-data-check` スキルで欠損日のデータが入ったことを確認する。

---

## 注意事項

- J-Quants API は非営業日を指定すると次営業日のデータを返す場合がある
- `equity_master_snapshot` の upsert は unique 制約で重複エラーが出るが、既にデータがある証拠なので無視してよい
- `financial_disclosure` はデータ件数が日によって大きく変動する（0件の営業日もありうる）
- バックフィルはローカルから実行するため、`.env.local` に `JQUANTS_API_KEY` / `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` が必要
