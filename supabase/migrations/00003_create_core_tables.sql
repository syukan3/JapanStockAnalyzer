-- 00003_create_core_tables.sql
-- J-Quants APIデータテーブル

-- 1) 取引カレンダー
create table if not exists jquants_core.trading_calendar (
  calendar_date    date primary key,
  hol_div          text not null,
  is_business_day  boolean not null,
  raw_json         jsonb not null,
  ingested_at      timestamptz not null default now()
);

comment on table jquants_core.trading_calendar is '取引カレンダー (営業日判定用)';
comment on column jquants_core.trading_calendar.hol_div is '0: 非営業日, 1: 営業日, 2: 半日取引';
comment on column jquants_core.trading_calendar.is_business_day is 'hol_div=1,2の場合true';

-- 2) 上場銘柄マスタ（日次スナップショット）
-- local_code は text を使用（char(5)はパディングで非効率、Supabase推奨）
create table if not exists jquants_core.equity_master_snapshot (
  as_of_date       date not null,
  local_code       text not null,
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
  raw_json         jsonb not null,
  ingested_at      timestamptz not null default now(),
  primary key (as_of_date, local_code)
);

comment on table jquants_core.equity_master_snapshot is '上場銘柄マスタ (日次スナップショット)';
comment on column jquants_core.equity_master_snapshot.as_of_date is 'スナップショット日付';
comment on column jquants_core.equity_master_snapshot.local_code is '銘柄コード (5桁)';

create index if not exists idx_equity_master_snapshot_code
  on jquants_core.equity_master_snapshot (local_code, as_of_date desc);

-- 3) 株価（日足）
create table if not exists jquants_core.equity_bar_daily (
  trade_date        date not null,
  local_code        text not null,
  session           text not null default 'DAY',

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

  raw_json          jsonb not null,
  ingested_at       timestamptz not null default now(),
  primary key (local_code, trade_date, session)
);

comment on table jquants_core.equity_bar_daily is '株価 (日足)';
comment on column jquants_core.equity_bar_daily.trade_date is '取引日';
comment on column jquants_core.equity_bar_daily.local_code is '銘柄コード (5桁)';
comment on column jquants_core.equity_bar_daily.session is '取引セッション (DAY, MORNING, AFTERNOON)';
comment on column jquants_core.equity_bar_daily.adjustment_factor is '調整係数';

-- カバリングインデックス：日付検索時にテーブルアクセス削減
create index if not exists idx_equity_bar_daily_date
  on jquants_core.equity_bar_daily (trade_date)
  include (local_code, close, volume);

-- 4) TOPIX（日次）
create table if not exists jquants_core.topix_bar_daily (
  trade_date   date primary key,
  open         numeric(18,6),
  high         numeric(18,6),
  low          numeric(18,6),
  close        numeric(18,6),
  raw_json     jsonb not null,
  ingested_at  timestamptz not null default now()
);

comment on table jquants_core.topix_bar_daily is 'TOPIX (日次)';

-- 5) 投資部門別（縦持ち・訂正対応：published_dateを主キーに含める）
create table if not exists jquants_core.investor_type_trading (
  published_date  date not null,
  start_date      date not null,
  end_date        date not null,
  section         text not null,

  investor_type   text not null,
  metric          text not null, -- sales/purchases/total/balance 等
  value_kjpy      numeric(24,6),

  raw_json        jsonb not null,
  ingested_at     timestamptz not null default now(),

  primary key (published_date, section, start_date, end_date, investor_type, metric)
);

comment on table jquants_core.investor_type_trading is '投資部門別売買状況 (縦持ち)';
comment on column jquants_core.investor_type_trading.published_date is '公表日 (訂正対応のためPKに含む)';
comment on column jquants_core.investor_type_trading.section is '市場区分';
comment on column jquants_core.investor_type_trading.investor_type is '投資主体 (個人, 海外投資家等)';
comment on column jquants_core.investor_type_trading.metric is '指標 (sales, purchases, total, balance等)';

create index if not exists idx_investor_type_trading_period
  on jquants_core.investor_type_trading (section, start_date, end_date)
  include (investor_type, metric, value_kjpy);

-- 6) 財務（サマリー）
-- V2のレスポンスに合わせてPKを確定する必要あり（disclosure_id相当）
-- 実装時にV2 fins/summaryの実際のレスポンスを確認し、一意キーを特定すること
create table if not exists jquants_core.financial_disclosure (
  disclosure_id     text primary key,  -- V2レスポンスの一意キーに合わせて調整
  disclosed_date    date,
  disclosed_time    time,
  local_code        text,

  raw_json          jsonb not null,
  ingested_at       timestamptz not null default now()
);

comment on table jquants_core.financial_disclosure is '財務サマリー (決算情報)';
comment on column jquants_core.financial_disclosure.disclosure_id is 'V2 APIの一意識別子';
comment on column jquants_core.financial_disclosure.disclosed_date is '開示日';
comment on column jquants_core.financial_disclosure.disclosed_time is '開示時刻';

create index if not exists idx_financial_disclosure_code_date
  on jquants_core.financial_disclosure (local_code, disclosed_date desc);

-- 7) 決算発表予定（翌営業日分）
create table if not exists jquants_core.earnings_calendar (
  announcement_date date not null,
  local_code        text not null,
  raw_json          jsonb not null,
  ingested_at       timestamptz not null default now(),
  primary key (announcement_date, local_code)
);

comment on table jquants_core.earnings_calendar is '決算発表予定 (翌営業日分)';
comment on column jquants_core.earnings_calendar.announcement_date is '発表予定日';
comment on column jquants_core.earnings_calendar.local_code is '銘柄コード (5桁)';
