-- 00006_optimize_permissions_and_indexes.sql
-- 権限の最小化とインデックスの追加

-- =============================================================================
-- 1. 権限の最小化
-- =============================================================================
-- anon ロールは使用しないため、権限を削除
-- jquants_ingest は service_role のみがアクセス

-- jquants_ingest スキーマから anon/authenticated の権限を削除
revoke usage on schema jquants_ingest from anon, authenticated;
revoke all on all tables in schema jquants_ingest from anon, authenticated;
revoke all on all sequences in schema jquants_ingest from anon, authenticated;

-- jquants_core スキーマから anon の権限を削除（authenticated は読み取りのみ許可）
revoke usage on schema jquants_core from anon;
revoke all on all tables in schema jquants_core from anon;
revoke all on all sequences in schema jquants_core from anon;

-- authenticated には SELECT のみ許可（ALL から変更）
revoke all on all tables in schema jquants_core from authenticated;
grant select on all tables in schema jquants_core to authenticated;

-- デフォルト権限も修正
alter default privileges in schema jquants_core
  revoke all on tables from anon;
alter default privileges in schema jquants_core
  revoke all on sequences from anon;

alter default privileges in schema jquants_ingest
  revoke all on tables from anon, authenticated;
alter default privileges in schema jquants_ingest
  revoke all on sequences from anon, authenticated;

-- authenticated のデフォルト権限を SELECT のみに
alter default privileges in schema jquants_core
  grant select on tables to authenticated;

-- =============================================================================
-- 2. インデックスの追加
-- =============================================================================

-- earnings_calendar: local_code による検索を最適化
create index if not exists idx_earnings_calendar_code
  on jquants_core.earnings_calendar (local_code, announcement_date desc);

-- topix_bar_daily: 日付範囲クエリのカバリングインデックス（Index-Only Scan対応）
create index if not exists idx_topix_bar_daily_covering
  on jquants_core.topix_bar_daily (trade_date)
  include (open, high, low, close);

-- trading_calendar: 営業日フィルタ付き部分インデックス
create index if not exists idx_trading_calendar_business_days
  on jquants_core.trading_calendar (calendar_date)
  where is_business_day = true;

-- =============================================================================
-- コメント
-- =============================================================================
comment on index jquants_core.idx_earnings_calendar_code is '銘柄コード検索用インデックス';
comment on index jquants_core.idx_topix_bar_daily_covering is 'TOPIX日付範囲クエリ用カバリングインデックス';
comment on index jquants_core.idx_trading_calendar_business_days is '営業日検索用部分インデックス';
