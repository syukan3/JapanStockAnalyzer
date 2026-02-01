-- job_runs の job_name CHECK 制約を拡張し、scouter ジョブを許可する
ALTER TABLE jquants_ingest.job_runs
  DROP CONSTRAINT job_runs_job_name_check;

ALTER TABLE jquants_ingest.job_runs
  ADD CONSTRAINT job_runs_job_name_check
  CHECK (job_name IN ('cron_a', 'cron_b', 'cron_c', 'scouter-high-dividend'));
