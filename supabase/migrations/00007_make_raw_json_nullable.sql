-- 00007_make_raw_json_nullable.sql
-- raw_jsonカラムをnullableに変更（コード変更前の安全策）
-- ストレージ削減対応の第1フェーズ

-- 1) trading_calendar
ALTER TABLE jquants_core.trading_calendar ALTER COLUMN raw_json DROP NOT NULL;

-- 2) equity_master_snapshot
ALTER TABLE jquants_core.equity_master_snapshot ALTER COLUMN raw_json DROP NOT NULL;

-- 3) equity_bar_daily
ALTER TABLE jquants_core.equity_bar_daily ALTER COLUMN raw_json DROP NOT NULL;

-- 4) topix_bar_daily
ALTER TABLE jquants_core.topix_bar_daily ALTER COLUMN raw_json DROP NOT NULL;

-- 5) investor_type_trading
ALTER TABLE jquants_core.investor_type_trading ALTER COLUMN raw_json DROP NOT NULL;

-- 6) financial_disclosure
ALTER TABLE jquants_core.financial_disclosure ALTER COLUMN raw_json DROP NOT NULL;

-- 7) earnings_calendar
ALTER TABLE jquants_core.earnings_calendar ALTER COLUMN raw_json DROP NOT NULL;

COMMENT ON COLUMN jquants_core.trading_calendar.raw_json IS '生APIレスポンス (廃止予定、null)';
COMMENT ON COLUMN jquants_core.equity_master_snapshot.raw_json IS '生APIレスポンス (廃止予定、null)';
COMMENT ON COLUMN jquants_core.equity_bar_daily.raw_json IS '生APIレスポンス (廃止予定、null)';
COMMENT ON COLUMN jquants_core.topix_bar_daily.raw_json IS '生APIレスポンス (廃止予定、null)';
COMMENT ON COLUMN jquants_core.investor_type_trading.raw_json IS '生APIレスポンス (廃止予定、null)';
COMMENT ON COLUMN jquants_core.financial_disclosure.raw_json IS '生APIレスポンス (廃止予定、null)';
COMMENT ON COLUMN jquants_core.earnings_calendar.raw_json IS '生APIレスポンス (廃止予定、null)';
