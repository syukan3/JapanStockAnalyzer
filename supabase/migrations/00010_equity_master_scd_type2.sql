-- 00010_equity_master_scd_type2.sql
-- 銘柄マスタ SCD Type 2 マイグレーション
--
-- 日次スナップショット（equity_master_snapshot）から
-- 変更履歴方式（equity_master）への移行

-- ============================================
-- 1. 旧テーブルをバックアップ用にリネーム
-- ============================================

ALTER TABLE jquants_core.equity_master_snapshot
  RENAME TO equity_master_snapshot_backup;

-- ============================================
-- 2. 新テーブル作成（SCD Type 2）
-- ============================================

CREATE TABLE jquants_core.equity_master (
  id               bigserial PRIMARY KEY,
  local_code       text NOT NULL,
  company_name     text,
  company_name_en  text,
  sector17_code    text,
  sector17_name    text,
  sector33_code    text,
  sector33_name    text,
  scale_category   text,
  market_code      text,
  market_name      text,
  margin_code      text,
  margin_code_name text,
  valid_from       date NOT NULL,
  valid_to         date,  -- NULL = 現在有効、exclusive（valid_to当日は無効）
  is_current       boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- 制約
  CONSTRAINT uq_equity_master_code_valid_from UNIQUE (local_code, valid_from),
  CONSTRAINT chk_valid_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);

COMMENT ON TABLE jquants_core.equity_master IS '上場銘柄マスタ (SCD Type 2)';
COMMENT ON COLUMN jquants_core.equity_master.local_code IS '銘柄コード (5桁)';
COMMENT ON COLUMN jquants_core.equity_master.valid_from IS '有効開始日（inclusive）';
COMMENT ON COLUMN jquants_core.equity_master.valid_to IS '有効終了日（exclusive、NULLは現在有効）';
COMMENT ON COLUMN jquants_core.equity_master.is_current IS '現在有効フラグ（各銘柄で1レコードのみtrue）';

-- ============================================
-- 3. 部分ユニーク制約（is_current=trueは各銘柄1つのみ）
-- ============================================

CREATE UNIQUE INDEX idx_equity_master_current_unique
  ON jquants_core.equity_master (local_code) WHERE is_current = true;

-- ============================================
-- 4. 検索用インデックス
-- ============================================

-- 銘柄コード + 有効期間での検索用
CREATE INDEX idx_equity_master_code_validity
  ON jquants_core.equity_master (local_code, valid_from, valid_to);

-- 現在有効レコードの一覧取得用
CREATE INDEX idx_equity_master_is_current
  ON jquants_core.equity_master (is_current) WHERE is_current = true;

-- ============================================
-- 5. データ移行（最新スナップショットのみ）
-- ============================================

INSERT INTO jquants_core.equity_master (
  local_code, company_name, company_name_en,
  sector17_code, sector17_name, sector33_code, sector33_name,
  scale_category, market_code, market_name, margin_code, margin_code_name,
  valid_from, valid_to, is_current, created_at
)
SELECT DISTINCT ON (local_code)
  local_code, company_name, company_name_en,
  sector17_code, sector17_name, sector33_code, sector33_name,
  scale_category, market_code, market_name, margin_code, margin_code_name,
  as_of_date AS valid_from,
  NULL AS valid_to,
  true AS is_current,
  ingested_at AS created_at
FROM jquants_core.equity_master_snapshot_backup
ORDER BY local_code, as_of_date DESC;

-- ============================================
-- 6. RLS有効化
-- ============================================

ALTER TABLE jquants_core.equity_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.equity_master FORCE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_equity_master" ON jquants_core.equity_master
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_full_equity_master" ON jquants_core.equity_master
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 7. 互換ビュー作成（監視ビュー用）
-- ============================================

-- 既存コードとの互換性のため、equity_master_snapshotビューを作成
-- 現在有効なレコードのみを表示
CREATE VIEW jquants_core.equity_master_snapshot AS
SELECT
  valid_from AS as_of_date,
  local_code,
  company_name,
  company_name_en,
  sector17_code,
  sector17_name,
  sector33_code,
  sector33_name,
  scale_category,
  market_code,
  market_name,
  margin_code,
  margin_code_name,
  created_at AS ingested_at
FROM jquants_core.equity_master
WHERE is_current = true;

COMMENT ON VIEW jquants_core.equity_master_snapshot IS '上場銘柄マスタ互換ビュー（現在有効レコードのみ）';

-- ============================================
-- 8. バックアップテーブルへのコメント
-- ============================================

COMMENT ON TABLE jquants_core.equity_master_snapshot_backup IS
  '上場銘柄マスタ旧テーブル（バックアップ）- 1週間後に削除予定';

-- ============================================
-- 9. v_data_freshnessビュー更新
-- ============================================
-- equity_master_snapshotが互換ビューになったため再作成

CREATE OR REPLACE VIEW jquants_ingest.v_data_freshness AS
SELECT
  'equity_bar_daily' AS dataset,
  max(trade_date) AS latest_date,
  count(*) AS total_rows
FROM jquants_core.equity_bar_daily
UNION ALL
SELECT
  'trading_calendar',
  max(calendar_date),
  count(*)
FROM jquants_core.trading_calendar
UNION ALL
SELECT
  'topix_bar_daily',
  max(trade_date),
  count(*)
FROM jquants_core.topix_bar_daily
UNION ALL
SELECT
  'equity_master',
  max(valid_from),
  count(*)
FROM jquants_core.equity_master
WHERE is_current = true
UNION ALL
SELECT
  'financial_disclosure',
  max(disclosed_date),
  count(*)
FROM jquants_core.financial_disclosure
UNION ALL
SELECT
  'earnings_calendar',
  max(announcement_date),
  count(*)
FROM jquants_core.earnings_calendar
UNION ALL
SELECT
  'investor_type_trading',
  max(end_date),
  count(*)
FROM jquants_core.investor_type_trading;

COMMENT ON VIEW jquants_ingest.v_data_freshness IS 'データセット別の鮮度確認 (最新日付と件数)';
