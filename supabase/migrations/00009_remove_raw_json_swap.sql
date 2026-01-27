-- 00009_remove_raw_json_swap.sql
-- raw_jsonカラム削除（新テーブルswap方式）
-- DROP COLUMNではストレージが回収されないため、新テーブル作成→swap方式を採用

-- ============================================
-- 0. 依存ビューを削除（テーブルswap前に必須）
-- ============================================

DROP VIEW IF EXISTS jquants_ingest.v_data_freshness;

-- ============================================
-- 1. trading_calendar
-- ============================================

CREATE TABLE jquants_core.trading_calendar_new (
  calendar_date    date PRIMARY KEY,
  hol_div          text NOT NULL,
  is_business_day  boolean NOT NULL,
  ingested_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO jquants_core.trading_calendar_new (calendar_date, hol_div, is_business_day, ingested_at)
SELECT calendar_date, hol_div, is_business_day, ingested_at
FROM jquants_core.trading_calendar;

DROP TABLE jquants_core.trading_calendar;
ALTER TABLE jquants_core.trading_calendar_new RENAME TO trading_calendar;

COMMENT ON TABLE jquants_core.trading_calendar IS '取引カレンダー (営業日判定用)';
COMMENT ON COLUMN jquants_core.trading_calendar.hol_div IS '0: 非営業日, 1: 営業日, 2: 半日取引';
COMMENT ON COLUMN jquants_core.trading_calendar.is_business_day IS 'hol_div=1,2の場合true';

-- ============================================
-- 2. equity_bar_daily
-- ============================================

CREATE TABLE jquants_core.equity_bar_daily_new (
  trade_date        date NOT NULL,
  local_code        text NOT NULL,
  session           text NOT NULL DEFAULT 'DAY',

  open              numeric(18,6),
  high              numeric(18,6),
  low               numeric(18,6),
  close             numeric(18,6),
  volume            bigint,
  turnover_value    numeric(24,6),

  adjustment_factor numeric(18,10),
  adj_open          numeric(18,6),
  adj_high          numeric(18,6),
  adj_low           numeric(18,6),
  adj_close         numeric(18,6),
  adj_volume        bigint,

  ingested_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (local_code, trade_date, session)
);

INSERT INTO jquants_core.equity_bar_daily_new (
  trade_date, local_code, session, open, high, low, close, volume, turnover_value,
  adjustment_factor, adj_open, adj_high, adj_low, adj_close, adj_volume, ingested_at
)
SELECT
  trade_date, local_code, session, open, high, low, close, volume, turnover_value,
  adjustment_factor, adj_open, adj_high, adj_low, adj_close, adj_volume, ingested_at
FROM jquants_core.equity_bar_daily;

DROP TABLE jquants_core.equity_bar_daily;
ALTER TABLE jquants_core.equity_bar_daily_new RENAME TO equity_bar_daily;

COMMENT ON TABLE jquants_core.equity_bar_daily IS '株価 (日足)';
COMMENT ON COLUMN jquants_core.equity_bar_daily.trade_date IS '取引日';
COMMENT ON COLUMN jquants_core.equity_bar_daily.local_code IS '銘柄コード (5桁)';
COMMENT ON COLUMN jquants_core.equity_bar_daily.session IS '取引セッション (DAY, MORNING, AFTERNOON)';
COMMENT ON COLUMN jquants_core.equity_bar_daily.adjustment_factor IS '調整係数';

-- カバリングインデックス再作成
CREATE INDEX IF NOT EXISTS idx_equity_bar_daily_date
  ON jquants_core.equity_bar_daily (trade_date)
  INCLUDE (local_code, close, volume);

-- ============================================
-- 3. topix_bar_daily
-- ============================================

CREATE TABLE jquants_core.topix_bar_daily_new (
  trade_date   date PRIMARY KEY,
  open         numeric(18,6),
  high         numeric(18,6),
  low          numeric(18,6),
  close        numeric(18,6),
  ingested_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO jquants_core.topix_bar_daily_new (trade_date, open, high, low, close, ingested_at)
SELECT trade_date, open, high, low, close, ingested_at
FROM jquants_core.topix_bar_daily;

DROP TABLE jquants_core.topix_bar_daily;
ALTER TABLE jquants_core.topix_bar_daily_new RENAME TO topix_bar_daily;

COMMENT ON TABLE jquants_core.topix_bar_daily IS 'TOPIX (日次)';

-- ============================================
-- 4. investor_type_trading
-- ============================================

CREATE TABLE jquants_core.investor_type_trading_new (
  published_date  date NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  section         text NOT NULL,

  investor_type   text NOT NULL,
  metric          text NOT NULL,
  value_kjpy      numeric(24,6),

  ingested_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (published_date, section, start_date, end_date, investor_type, metric)
);

INSERT INTO jquants_core.investor_type_trading_new (
  published_date, start_date, end_date, section, investor_type, metric, value_kjpy, ingested_at
)
SELECT
  published_date, start_date, end_date, section, investor_type, metric, value_kjpy, ingested_at
FROM jquants_core.investor_type_trading;

DROP TABLE jquants_core.investor_type_trading;
ALTER TABLE jquants_core.investor_type_trading_new RENAME TO investor_type_trading;

COMMENT ON TABLE jquants_core.investor_type_trading IS '投資部門別売買状況 (縦持ち)';
COMMENT ON COLUMN jquants_core.investor_type_trading.published_date IS '公表日 (訂正対応のためPKに含む)';
COMMENT ON COLUMN jquants_core.investor_type_trading.section IS '市場区分';
COMMENT ON COLUMN jquants_core.investor_type_trading.investor_type IS '投資主体 (個人, 海外投資家等)';
COMMENT ON COLUMN jquants_core.investor_type_trading.metric IS '指標 (sales, purchases, total, balance等)';

-- インデックス再作成
CREATE INDEX IF NOT EXISTS idx_investor_type_trading_period
  ON jquants_core.investor_type_trading (section, start_date, end_date)
  INCLUDE (investor_type, metric, value_kjpy);

-- ============================================
-- 5. financial_disclosure
-- ============================================

CREATE TABLE jquants_core.financial_disclosure_new (
  disclosure_id     text PRIMARY KEY,
  disclosed_date    date,
  disclosed_time    time,
  local_code        text,
  sales             numeric(24,6),
  operating_profit  numeric(24,6),
  ordinary_profit   numeric(24,6),
  net_income        numeric(24,6),
  eps               numeric(18,6),
  bps               numeric(18,6),
  roe               numeric(10,4),
  fiscal_year_start text,
  fiscal_year_end   text,
  period_type       text,
  doc_type          text,
  company_name      text,
  ingested_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO jquants_core.financial_disclosure_new (
  disclosure_id, disclosed_date, disclosed_time, local_code,
  sales, operating_profit, ordinary_profit, net_income, eps, bps, roe,
  fiscal_year_start, fiscal_year_end, period_type, doc_type, company_name, ingested_at
)
SELECT
  disclosure_id, disclosed_date, disclosed_time, local_code,
  sales, operating_profit, ordinary_profit, net_income, eps, bps, roe,
  fiscal_year_start, fiscal_year_end, period_type, doc_type, company_name, ingested_at
FROM jquants_core.financial_disclosure;

DROP TABLE jquants_core.financial_disclosure;
ALTER TABLE jquants_core.financial_disclosure_new RENAME TO financial_disclosure;

COMMENT ON TABLE jquants_core.financial_disclosure IS '財務サマリー (決算情報)';
COMMENT ON COLUMN jquants_core.financial_disclosure.disclosure_id IS 'V2 APIの一意識別子';
COMMENT ON COLUMN jquants_core.financial_disclosure.disclosed_date IS '開示日';
COMMENT ON COLUMN jquants_core.financial_disclosure.disclosed_time IS '開示時刻';
COMMENT ON COLUMN jquants_core.financial_disclosure.sales IS '売上高';
COMMENT ON COLUMN jquants_core.financial_disclosure.operating_profit IS '営業利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.ordinary_profit IS '経常利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.net_income IS '当期純利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.eps IS '1株当たり利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.bps IS '1株当たり純資産';
COMMENT ON COLUMN jquants_core.financial_disclosure.roe IS '自己資本利益率';
COMMENT ON COLUMN jquants_core.financial_disclosure.fiscal_year_start IS '会計年度開始日';
COMMENT ON COLUMN jquants_core.financial_disclosure.fiscal_year_end IS '会計年度終了日';
COMMENT ON COLUMN jquants_core.financial_disclosure.period_type IS '会計期間種別';
COMMENT ON COLUMN jquants_core.financial_disclosure.doc_type IS '書類種別';
COMMENT ON COLUMN jquants_core.financial_disclosure.company_name IS '会社名';

-- インデックス再作成
CREATE INDEX IF NOT EXISTS idx_financial_disclosure_code_date
  ON jquants_core.financial_disclosure (local_code, disclosed_date DESC);

-- ============================================
-- 6. earnings_calendar
-- ============================================

CREATE TABLE jquants_core.earnings_calendar_new (
  announcement_date date NOT NULL,
  local_code        text NOT NULL,
  company_name      text,
  fiscal_year       text,
  fiscal_quarter    text,
  sector_name       text,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_date, local_code)
);

INSERT INTO jquants_core.earnings_calendar_new (
  announcement_date, local_code, company_name, fiscal_year, fiscal_quarter, sector_name, ingested_at
)
SELECT
  announcement_date, local_code, company_name, fiscal_year, fiscal_quarter, sector_name, ingested_at
FROM jquants_core.earnings_calendar;

DROP TABLE jquants_core.earnings_calendar;
ALTER TABLE jquants_core.earnings_calendar_new RENAME TO earnings_calendar;

COMMENT ON TABLE jquants_core.earnings_calendar IS '決算発表予定 (翌営業日分)';
COMMENT ON COLUMN jquants_core.earnings_calendar.announcement_date IS '発表予定日';
COMMENT ON COLUMN jquants_core.earnings_calendar.local_code IS '銘柄コード (5桁)';
COMMENT ON COLUMN jquants_core.earnings_calendar.company_name IS '会社名';
COMMENT ON COLUMN jquants_core.earnings_calendar.fiscal_year IS '決算年度';
COMMENT ON COLUMN jquants_core.earnings_calendar.fiscal_quarter IS '決算期間種別';
COMMENT ON COLUMN jquants_core.earnings_calendar.sector_name IS 'セクター名';

-- ============================================
-- 7. RLS再有効化（全テーブル）
-- ============================================

ALTER TABLE jquants_core.trading_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.trading_calendar FORCE ROW LEVEL SECURITY;

ALTER TABLE jquants_core.equity_bar_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.equity_bar_daily FORCE ROW LEVEL SECURITY;

ALTER TABLE jquants_core.topix_bar_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.topix_bar_daily FORCE ROW LEVEL SECURITY;

ALTER TABLE jquants_core.investor_type_trading ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.investor_type_trading FORCE ROW LEVEL SECURITY;

ALTER TABLE jquants_core.financial_disclosure ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.financial_disclosure FORCE ROW LEVEL SECURITY;

ALTER TABLE jquants_core.earnings_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE jquants_core.earnings_calendar FORCE ROW LEVEL SECURITY;

-- RLSポリシー再作成（authenticated読み取り許可）
CREATE POLICY "authenticated_read_trading_calendar" ON jquants_core.trading_calendar
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_equity_bar_daily" ON jquants_core.equity_bar_daily
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_topix_bar_daily" ON jquants_core.topix_bar_daily
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_investor_type_trading" ON jquants_core.investor_type_trading
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_financial_disclosure" ON jquants_core.financial_disclosure
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_earnings_calendar" ON jquants_core.earnings_calendar
  FOR SELECT TO authenticated USING (true);

-- service_role向けポリシー（full access）
CREATE POLICY "service_role_full_trading_calendar" ON jquants_core.trading_calendar
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_equity_bar_daily" ON jquants_core.equity_bar_daily
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_topix_bar_daily" ON jquants_core.topix_bar_daily
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_investor_type_trading" ON jquants_core.investor_type_trading
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_financial_disclosure" ON jquants_core.financial_disclosure
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_earnings_calendar" ON jquants_core.earnings_calendar
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 9. v_data_freshnessビュー再作成
-- ============================================

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
  'equity_master_snapshot',
  max(as_of_date),
  count(*)
FROM jquants_core.equity_master_snapshot
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
