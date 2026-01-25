-- 00004_enable_rls.sql
-- Row Level Security 設定
--
-- 設計方針:
-- 1. Service Role Key はRLSをバイパスするため、Cron処理自体はRLS不要
-- 2. 将来的にフロントエンドを追加する場合に備え、デフォルトで全拒否のRLSを有効化
-- 3. jquants_ingest スキーマは管理用のため、一般ユーザーからはアクセス不可

-- ================================================
-- jquants_core: データ参照用スキーマ
-- 認証済みユーザーは読み取りのみ可能
-- ================================================

-- スキーマへのアクセス権限を付与
grant usage on schema jquants_core to authenticated;

-- 全テーブルへのSELECT権限を付与
grant select on all tables in schema jquants_core to authenticated;

-- 将来作成されるテーブルにも自動でSELECT権限を付与
alter default privileges in schema jquants_core
  grant select on tables to authenticated;

-- 1) equity_master_snapshot
alter table jquants_core.equity_master_snapshot enable row level security;
alter table jquants_core.equity_master_snapshot force row level security;

create policy "authenticated_read_equity_master"
  on jquants_core.equity_master_snapshot
  for select
  to authenticated
  using (true);

-- 2) equity_bar_daily
alter table jquants_core.equity_bar_daily enable row level security;
alter table jquants_core.equity_bar_daily force row level security;

create policy "authenticated_read_equity_bar"
  on jquants_core.equity_bar_daily
  for select
  to authenticated
  using (true);

-- 3) topix_bar_daily
alter table jquants_core.topix_bar_daily enable row level security;
alter table jquants_core.topix_bar_daily force row level security;

create policy "authenticated_read_topix"
  on jquants_core.topix_bar_daily
  for select
  to authenticated
  using (true);

-- 4) trading_calendar
alter table jquants_core.trading_calendar enable row level security;
alter table jquants_core.trading_calendar force row level security;

create policy "authenticated_read_calendar"
  on jquants_core.trading_calendar
  for select
  to authenticated
  using (true);

-- 5) investor_type_trading
alter table jquants_core.investor_type_trading enable row level security;
alter table jquants_core.investor_type_trading force row level security;

create policy "authenticated_read_investor_type"
  on jquants_core.investor_type_trading
  for select
  to authenticated
  using (true);

-- 6) financial_disclosure
alter table jquants_core.financial_disclosure enable row level security;
alter table jquants_core.financial_disclosure force row level security;

create policy "authenticated_read_financial"
  on jquants_core.financial_disclosure
  for select
  to authenticated
  using (true);

-- 7) earnings_calendar
alter table jquants_core.earnings_calendar enable row level security;
alter table jquants_core.earnings_calendar force row level security;

create policy "authenticated_read_earnings"
  on jquants_core.earnings_calendar
  for select
  to authenticated
  using (true);

-- ================================================
-- jquants_ingest: 管理用スキーマ（一般ユーザーアクセス不可）
-- RLS有効化、ポリシーなし = 全拒否
-- ================================================

-- job_runs: RLS有効化、ポリシーなし = 全拒否
alter table jquants_ingest.job_runs enable row level security;
alter table jquants_ingest.job_runs force row level security;
-- ポリシーなし = anon/authenticated からのアクセス全拒否

-- job_run_items
alter table jquants_ingest.job_run_items enable row level security;
alter table jquants_ingest.job_run_items force row level security;

-- job_locks
alter table jquants_ingest.job_locks enable row level security;
alter table jquants_ingest.job_locks force row level security;

-- job_heartbeat
alter table jquants_ingest.job_heartbeat enable row level security;
alter table jquants_ingest.job_heartbeat force row level security;
