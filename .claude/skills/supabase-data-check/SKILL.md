---
name: supabase-data-check
description: Supabaseのデータ存在確認・最新データ日チェック。「データ確認」「Supabaseチェック」「Cron A/B/Cの結果確認」「○月○日のデータ入ってる？」で使用する。
---

# Supabase データ確認

## 接続方法

環境変数を `.env.local` から読み込み、PostgREST API で直接クエリする。

```bash
source /Users/m-sakae/Source/JapanStockDataPipeline/.env.local
```

### 重要ポイント

- **スキーマ**: テーブルは `public` ではなく `jquants_core` スキーマにある
- **ヘッダー**: `Accept-Profile: jquants_core` を必ず付与する
- **キー**: `SUPABASE_SERVICE_ROLE_KEY` を使う（RLSバイパス）
- **銘柄コード列**: `code` ではなく `local_code`

### 基本クエリテンプレート

```bash
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/{TABLE}?{FILTER}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"
```

---

## Cron 対象テーブル一覧

### Cron A — 日次市場データ（JST 18:40）

| # | テーブル | 日付列 | 内容 |
|---|---|---|---|
| 1 | `trading_calendar` | `calendar_date` | 取引カレンダー（営業日判定） |
| 2 | `equity_bar_daily` | `trade_date` | 株価日足OHLCV（全上場銘柄） |
| 3 | `topix_bar_daily` | `trade_date` | TOPIX日足OHLC |
| 4 | `financial_disclosure` | `disclosed_date` | 財務開示データ |
| 5 | `equity_master_snapshot` | `as_of_date` | 銘柄マスタ（日次スナップショット） |

### Cron B — 決算発表予定（JST 19:20）

| # | テーブル | 日付列 | 内容 |
|---|---|---|---|
| 1 | `earnings_calendar` | `announcement_date` | 翌営業日の決算発表予定銘柄 |

PK: `(announcement_date, local_code)`。土日祝日でも実行される（翌営業日分を返す）。

### Cron C — 投資部門別売買状況 + 整合性チェック（JST 12:10）

| # | テーブル | 日付列 | 内容 |
|---|---|---|---|
| 1 | `investor_type_trading` | `published_date`, `start_date`, `end_date` | 投資部門別売買状況（週次/不定期、縦持ち） |

PK: `(published_date, section, start_date, end_date, investor_type, metric)`。60日スライディングウィンドウで取得。
Cron Cは追加で整合性チェック（カレンダー範囲±370日、株価/TOPIX鮮度3日以内）も実行。

---

## 確認手順

### 1. Cron A — 特定日のデータ存在チェック（{DATE} を置換）

```bash
source /Users/m-sakae/Source/JapanStockDataPipeline/.env.local

echo "=== trading_calendar ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trading_calendar?calendar_date=eq.{DATE}&select=*" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== equity_bar_daily ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/equity_bar_daily?trade_date=eq.{DATE}&select=local_code,trade_date,close&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== topix_bar_daily ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/topix_bar_daily?trade_date=eq.{DATE}&select=*" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== financial_disclosure ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/financial_disclosure?disclosed_date=eq.{DATE}&select=local_code,disclosed_date&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== equity_master_snapshot ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/equity_master_snapshot?as_of_date=eq.{DATE}&select=local_code&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"
```

### 2. Cron B — 特定日の決算発表予定チェック（{DATE} を置換）

```bash
source /Users/m-sakae/Source/JapanStockDataPipeline/.env.local

echo "=== earnings_calendar ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/earnings_calendar?announcement_date=eq.{DATE}&select=announcement_date,local_code&limit=5" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"
```

### 3. Cron C — 投資部門別売買状況チェック（{DATE} を含む期間）

```bash
source /Users/m-sakae/Source/JapanStockDataPipeline/.env.local

echo "=== investor_type_trading (end_date近辺) ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/investor_type_trading?end_date=gte.{DATE}&select=published_date,section,start_date,end_date,investor_type,metric&limit=5&order=end_date.desc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"
```

### 4. 全テーブルの最新データ日チェック

```bash
source /Users/m-sakae/Source/JapanStockDataPipeline/.env.local

echo "=== equity_bar_daily latest ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/equity_bar_daily?select=trade_date&order=trade_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== topix_bar_daily latest ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/topix_bar_daily?select=trade_date&order=trade_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== equity_master_snapshot latest ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/equity_master_snapshot?select=as_of_date&order=as_of_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== earnings_calendar latest ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/earnings_calendar?select=announcement_date&order=announcement_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"

echo ""
echo "=== investor_type_trading latest ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/investor_type_trading?select=published_date,end_date&order=published_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Accept-Profile: jquants_core"
```

---

## 結果の読み方

- `[]`（空配列）→ データなし
- `[{...}]` → データあり
- `trading_calendar` で `is_business_day: true` なのに他テーブルが空 → Cron未実行 or J-Quants API未配信
- `investor_type_trading` は週次データのため、毎営業日にデータがあるとは限らない
- `earnings_calendar` は翌営業日分を前日夜に取り込むため、当日ではなく翌営業日の日付で確認する
