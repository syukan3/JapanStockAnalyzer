-- 00002_create_ingest_tables.sql
-- ジョブ管理テーブル: job_runs, job_run_items, job_locks, job_heartbeat

-- ジョブ実行ログ
create table if not exists jquants_ingest.job_runs (
  run_id        uuid primary key default gen_random_uuid(),
  job_name      text not null check (job_name in ('cron_a', 'cron_b', 'cron_c')),
  target_date   date,                      -- cron_aは「前営業日」、cron_bは「翌営業日」
  status        text not null default 'running' check (status in ('running', 'success', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error_message text,
  meta          jsonb not null default '{}'::jsonb
);

comment on table jquants_ingest.job_runs is 'Cronジョブの実行ログ';
comment on column jquants_ingest.job_runs.job_name is 'ジョブ名 (cron_a, cron_b, cron_c)';
comment on column jquants_ingest.job_runs.target_date is '処理対象日 (cron_a: 前営業日, cron_b: 翌営業日)';
comment on column jquants_ingest.job_runs.status is '実行状態 (running, success, failed)';

-- 冪等性：同一ジョブ×同一target_dateは1回に制限（A/B向け）
create unique index if not exists uq_job_runs_job_target
  on jquants_ingest.job_runs (job_name, target_date)
  where target_date is not null;

-- 監視クエリ用インデックス（失敗ジョブ検索、実行履歴表示）
create index if not exists idx_job_runs_status
  on jquants_ingest.job_runs (status)
  where status = 'failed';  -- 部分インデックス：失敗のみ

create index if not exists idx_job_runs_started_at
  on jquants_ingest.job_runs (started_at desc);

-- job_name + status + started_at の複合インデックス（監視クエリ最適化）
-- WHERE job_name = ? AND status = ? ORDER BY started_at DESC パターン対応
create index if not exists idx_job_runs_job_status_started
  on jquants_ingest.job_runs (job_name, status, started_at desc);

-- データセット単位のログ
create table if not exists jquants_ingest.job_run_items (
  run_id        uuid not null references jquants_ingest.job_runs(run_id) on delete cascade,
  dataset       text not null,  -- 'equity_bar_daily' 等
  status        text not null default 'running' check (status in ('running', 'success', 'failed')),
  row_count     bigint,
  page_count    bigint,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error_message text,
  meta          jsonb not null default '{}'::jsonb,
  primary key (run_id, dataset)
);

comment on table jquants_ingest.job_run_items is 'データセット単位の処理ログ';
comment on column jquants_ingest.job_run_items.dataset is 'データセット名 (equity_bar_daily, topix_bar_daily等)';
comment on column jquants_ingest.job_run_items.row_count is '処理行数';
comment on column jquants_ingest.job_run_items.page_count is 'ページング回数';

-- ロック（同時実行防止）- テーブルベースロック
create table if not exists jquants_ingest.job_locks (
  job_name      text primary key,
  locked_until  timestamptz not null,
  lock_token    uuid not null,
  updated_at    timestamptz not null default now()
);

comment on table jquants_ingest.job_locks is 'テーブルベースロック (同時実行防止)';
comment on column jquants_ingest.job_locks.locked_until is 'ロック有効期限';
comment on column jquants_ingest.job_locks.lock_token is 'ロック解放時の認証トークン';

-- ロック期限切れチェック用インデックス
-- 注: now()は不変関数ではないため部分インデックスでは使用不可
-- クエリ側で WHERE locked_until < now() を指定して絞り込む
create index if not exists idx_job_locks_locked_until
  on jquants_ingest.job_locks (locked_until);

-- 死活監視（ハートビート）
create table if not exists jquants_ingest.job_heartbeat (
  job_name          text primary key,
  last_seen_at      timestamptz not null,
  last_status       text not null check (last_status in ('running', 'success', 'failed')),
  last_run_id       uuid,
  last_target_date  date,
  last_error        text,
  meta              jsonb not null default '{}'::jsonb
);

comment on table jquants_ingest.job_heartbeat is 'ジョブの死活監視用テーブル';
comment on column jquants_ingest.job_heartbeat.last_seen_at is '最終確認時刻';
comment on column jquants_ingest.job_heartbeat.last_status is '最終実行状態';

-- STALE判定用インデックス（監視ビュー最適化）
-- 注: now()は不変関数ではないため部分インデックスでは使用不可
-- クエリ側で WHERE last_seen_at < now() - interval '25 hours' を指定
create index if not exists idx_job_heartbeat_last_seen
  on jquants_ingest.job_heartbeat (last_seen_at);
