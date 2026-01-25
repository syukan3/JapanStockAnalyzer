-- 00005_create_monitoring_views.sql
-- 監視用ビュー

-- 直近24時間の失敗ジョブ
create or replace view jquants_ingest.v_failed_jobs_24h as
select
  job_name,
  target_date,
  status,
  error_message,
  started_at,
  finished_at
from jquants_ingest.job_runs
where status = 'failed'
  and started_at > now() - interval '24 hours'
order by started_at desc;

comment on view jquants_ingest.v_failed_jobs_24h is '直近24時間の失敗ジョブ一覧';

-- 各ジョブの最終実行状況
create or replace view jquants_ingest.v_job_status as
select
  h.job_name,
  h.last_status,
  h.last_seen_at,
  h.last_target_date,
  h.last_error,
  case
    when h.last_seen_at < now() - interval '25 hours' then 'STALE'
    when h.last_status = 'failed' then 'FAILED'
    else 'OK'
  end as health_status
from jquants_ingest.job_heartbeat h;

comment on view jquants_ingest.v_job_status is '各ジョブの最終実行状況とヘルスチェック';

-- データ鮮度確認
create or replace view jquants_ingest.v_data_freshness as
select
  'equity_bar_daily' as dataset,
  max(trade_date) as latest_date,
  count(*) as total_rows
from jquants_core.equity_bar_daily
union all
select
  'trading_calendar',
  max(calendar_date),
  count(*)
from jquants_core.trading_calendar
union all
select
  'topix_bar_daily',
  max(trade_date),
  count(*)
from jquants_core.topix_bar_daily
union all
select
  'equity_master_snapshot',
  max(as_of_date),
  count(*)
from jquants_core.equity_master_snapshot
union all
select
  'financial_disclosure',
  max(disclosed_date),
  count(*)
from jquants_core.financial_disclosure
union all
select
  'earnings_calendar',
  max(announcement_date),
  count(*)
from jquants_core.earnings_calendar
union all
select
  'investor_type_trading',
  max(end_date),
  count(*)
from jquants_core.investor_type_trading;

comment on view jquants_ingest.v_data_freshness is 'データセット別の鮮度確認 (最新日付と件数)';

-- ジョブ実行履歴サマリー（直近7日間）
create or replace view jquants_ingest.v_job_runs_summary_7d as
select
  job_name,
  status,
  count(*) as run_count,
  min(started_at) as first_run,
  max(started_at) as last_run
from jquants_ingest.job_runs
where started_at > now() - interval '7 days'
group by job_name, status
order by job_name, status;

comment on view jquants_ingest.v_job_runs_summary_7d is '直近7日間のジョブ実行サマリー';

-- ロック状態確認
create or replace view jquants_ingest.v_active_locks as
select
  job_name,
  locked_until,
  lock_token,
  updated_at,
  case
    when locked_until > now() then 'ACTIVE'
    else 'EXPIRED'
  end as lock_status
from jquants_ingest.job_locks
order by locked_until desc;

comment on view jquants_ingest.v_active_locks is '現在のロック状態確認';
