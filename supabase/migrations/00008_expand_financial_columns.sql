-- 00008_expand_financial_columns.sql
-- financial_disclosure と earnings_calendar のカラム展開
-- raw_json削除前に主要データを明示カラムに移行

-- ============================================
-- 1. financial_disclosure カラム展開
-- ============================================

-- 主要財務指標を明示カラムに追加
ALTER TABLE jquants_core.financial_disclosure
  ADD COLUMN IF NOT EXISTS sales numeric(24,6),
  ADD COLUMN IF NOT EXISTS operating_profit numeric(24,6),
  ADD COLUMN IF NOT EXISTS ordinary_profit numeric(24,6),
  ADD COLUMN IF NOT EXISTS net_income numeric(24,6),
  ADD COLUMN IF NOT EXISTS eps numeric(18,6),
  ADD COLUMN IF NOT EXISTS bps numeric(18,6),
  ADD COLUMN IF NOT EXISTS roe numeric(10,4),
  ADD COLUMN IF NOT EXISTS fiscal_year_start text,
  ADD COLUMN IF NOT EXISTS fiscal_year_end text,
  ADD COLUMN IF NOT EXISTS period_type text,
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS company_name text;

COMMENT ON COLUMN jquants_core.financial_disclosure.sales IS '売上高';
COMMENT ON COLUMN jquants_core.financial_disclosure.operating_profit IS '営業利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.ordinary_profit IS '経常利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.net_income IS '当期純利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.eps IS '1株当たり利益';
COMMENT ON COLUMN jquants_core.financial_disclosure.bps IS '1株当たり純資産';
COMMENT ON COLUMN jquants_core.financial_disclosure.roe IS '自己資本利益率';
COMMENT ON COLUMN jquants_core.financial_disclosure.fiscal_year_start IS '会計年度開始日 (YYYY-MM-DD)';
COMMENT ON COLUMN jquants_core.financial_disclosure.fiscal_year_end IS '会計年度終了日 (YYYY-MM-DD)';
COMMENT ON COLUMN jquants_core.financial_disclosure.period_type IS '会計期間種別 (1Q, 2Q, 3Q, FY)';
COMMENT ON COLUMN jquants_core.financial_disclosure.doc_type IS '書類種別';
COMMENT ON COLUMN jquants_core.financial_disclosure.company_name IS '会社名';

-- 既存データを移行（raw_jsonがnullでない場合のみ）
-- NULLIFで空文字列をNULLに変換してからキャスト
UPDATE jquants_core.financial_disclosure SET
  sales = NULLIF(raw_json->>'Sales', '')::numeric,
  operating_profit = NULLIF(raw_json->>'OP', '')::numeric,
  ordinary_profit = NULLIF(raw_json->>'OdP', '')::numeric,
  net_income = NULLIF(raw_json->>'NP', '')::numeric,
  eps = NULLIF(raw_json->>'EPS', '')::numeric,
  bps = NULLIF(raw_json->>'BPS', '')::numeric,
  roe = NULLIF(raw_json->>'ROE', '')::numeric,
  fiscal_year_start = NULLIF(raw_json->>'CurFYSt', ''),
  fiscal_year_end = NULLIF(raw_json->>'CurFYEn', ''),
  period_type = NULLIF(raw_json->>'CurPerType', ''),
  doc_type = NULLIF(raw_json->>'DocType', ''),
  company_name = NULLIF(raw_json->>'CoName', '')
WHERE raw_json IS NOT NULL;

-- ============================================
-- 2. earnings_calendar カラム展開
-- ============================================

ALTER TABLE jquants_core.earnings_calendar
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS fiscal_year text,
  ADD COLUMN IF NOT EXISTS fiscal_quarter text,
  ADD COLUMN IF NOT EXISTS sector_name text;

COMMENT ON COLUMN jquants_core.earnings_calendar.company_name IS '会社名';
COMMENT ON COLUMN jquants_core.earnings_calendar.fiscal_year IS '決算年度';
COMMENT ON COLUMN jquants_core.earnings_calendar.fiscal_quarter IS '決算期間種別 (1Q, 2Q, 3Q, FY)';
COMMENT ON COLUMN jquants_core.earnings_calendar.sector_name IS 'セクター名';

-- 既存データを移行（raw_jsonがnullでない場合のみ）
UPDATE jquants_core.earnings_calendar SET
  company_name = raw_json->>'CoName',
  fiscal_year = raw_json->>'FY',
  fiscal_quarter = raw_json->>'FQ',
  sector_name = raw_json->>'SectorNm'
WHERE raw_json IS NOT NULL;
