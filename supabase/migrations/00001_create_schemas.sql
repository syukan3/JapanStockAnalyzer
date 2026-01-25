-- 00001_create_schemas.sql
-- スキーマ作成: jquants_core (データ参照用), jquants_ingest (管理用)
--
-- 注意: Supabase Dashboard > Settings > API > API Exposed Schemas に
-- jquants_core, jquants_ingest を追加する必要がある場合あり

create schema if not exists jquants_core;
create schema if not exists jquants_ingest;

comment on schema jquants_core is 'J-Quants API から取得したコアデータを格納するスキーマ';
comment on schema jquants_ingest is 'データ取り込みジョブの管理・監視用スキーマ';
