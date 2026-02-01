-- 4桁証券コード（ticker）カラムを追加
ALTER TABLE scouter.high_dividend_screening
  ADD COLUMN ticker TEXT;

-- 既存データを埋める
UPDATE scouter.high_dividend_screening
  SET ticker = LEFT(local_code, 4);

-- NOT NULL 制約を追加
ALTER TABLE scouter.high_dividend_screening
  ALTER COLUMN ticker SET NOT NULL;

COMMENT ON COLUMN scouter.high_dividend_screening.ticker IS '4桁証券コード（local_codeの先頭4文字）';
