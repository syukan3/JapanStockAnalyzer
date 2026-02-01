-- scouter スキーマ: 高配当株スクリーニング結果格納
CREATE SCHEMA IF NOT EXISTS scouter;
GRANT USAGE ON SCHEMA scouter TO authenticated;

CREATE TABLE scouter.high_dividend_screening (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_date        DATE NOT NULL,
  local_code      TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  market          TEXT NOT NULL,
  sector          TEXT,

  -- 定量指標
  close_price     NUMERIC(10,2),
  dividend_yield  NUMERIC(6,3),
  roe             NUMERIC(6,2),
  equity_ratio    NUMERIC(6,2),
  profit_growth   NUMERIC(8,2),
  rsi_14          NUMERIC(5,2),

  -- スコアリング
  nakayama_score  NUMERIC(8,2),
  recommendation  TEXT NOT NULL CHECK (recommendation IN ('BUY','HOLD','PASS')),

  -- 定性フィルタ
  excluded        BOOLEAN NOT NULL DEFAULT FALSE,
  exclude_reason  TEXT,
  manual_check    BOOLEAN NOT NULL DEFAULT TRUE,

  -- メタ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (run_date, local_code)
);

-- 部分インデックス: BUY/HOLD 銘柄の取得・スコア順ソート
CREATE INDEX idx_hds_recommendation
  ON scouter.high_dividend_screening (run_date, recommendation)
  WHERE excluded = FALSE;

CREATE INDEX idx_hds_score
  ON scouter.high_dividend_screening (run_date, nakayama_score DESC)
  WHERE excluded = FALSE;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION scouter.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hds_updated_at
  BEFORE UPDATE ON scouter.high_dividend_screening
  FOR EACH ROW EXECUTE FUNCTION scouter.set_updated_at();

-- RLS
ALTER TABLE scouter.high_dividend_screening ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select" ON scouter.high_dividend_screening
  FOR SELECT TO authenticated USING (TRUE);
GRANT SELECT ON scouter.high_dividend_screening TO authenticated;
