/**
 * 上場銘柄マスタ エンドポイント
 *
 * @description J-Quants API V2 /v2/equities/master のデータ取得・保存
 * @see https://jpx-jquants.com/en/spec
 *
 * NOTE: 非営業日を指定した場合、APIは次営業日の情報を返す
 */

import { JQuantsClient, createJQuantsClient } from '../client';
import type { EquityMasterItem, EquityMasterSnapshotRecord } from '../types';
import { getSupabaseAdmin } from '../../supabase/admin';
import { POSTGREST_ERROR_CODES } from '../../supabase/errors';
import { batchUpsert } from '../../utils/batch';
import { createLogger, type LogContext } from '../../utils/logger';

const TABLE_NAME = 'equity_master_snapshot';
const ON_CONFLICT = 'as_of_date,local_code';

export interface FetchEquityMasterParams {
  /** 銘柄コード (5桁) */
  code?: string;
  /** 日付 (YYYY-MM-DD) */
  date?: string;
}

export interface SyncEquityMasterResult {
  /** 取得件数 */
  fetched: number;
  /** 保存件数 */
  inserted: number;
  /** エラー一覧 */
  errors: Error[];
}

/**
 * APIレスポンスをDBレコード形式に変換
 */
export function toEquityMasterRecord(item: EquityMasterItem): EquityMasterSnapshotRecord {
  return {
    as_of_date: item.Date,
    local_code: item.Code,
    company_name: item.CoName,
    company_name_en: item.CoNameEn,
    sector17_code: item.S17,
    sector17_name: item.S17Nm,
    sector33_code: item.S33,
    sector33_name: item.S33Nm,
    scale_category: item.ScaleCat,
    market_code: item.Mkt,
    market_name: item.MktNm,
    margin_code: item.MarginCode,
    margin_code_name: item.MarginCodeNm,
    raw_json: item,
  };
}

/**
 * 上場銘柄マスタを取得
 *
 * @param client J-Quantsクライアント
 * @param params 取得パラメータ
 */
export async function fetchEquityMaster(
  client: JQuantsClient,
  params?: FetchEquityMasterParams
): Promise<EquityMasterItem[]> {
  const response = await client.getEquityMaster(params);
  return response.data;
}

/**
 * 上場銘柄マスタを取得してDBに保存
 *
 * @param params 取得パラメータ
 * @param options オプション
 */
export async function syncEquityMaster(
  params?: FetchEquityMasterParams,
  options?: {
    client?: JQuantsClient;
    logContext?: LogContext;
  }
): Promise<SyncEquityMasterResult> {
  const client = options?.client ?? createJQuantsClient({ logContext: options?.logContext });
  const logger = createLogger({ dataset: 'equity_master', ...options?.logContext });
  const supabase = getSupabaseAdmin();

  const timer = logger.startTimer('Sync equity master');

  try {
    // 1. APIからデータ取得
    logger.info('Fetching equity master', { code: params?.code, date: params?.date });
    const items = await fetchEquityMaster(client, params);

    if (items.length === 0) {
      logger.info('No equity master data found');
      timer.end({ fetched: 0, inserted: 0 });
      return { fetched: 0, inserted: 0, errors: [] };
    }

    logger.info('Fetched equity master', { rowCount: items.length });

    // 2. DBレコード形式に変換
    const records = items.map(toEquityMasterRecord);

    // 3. DBに保存
    const result = await batchUpsert(
      supabase,
      TABLE_NAME,
      records,
      ON_CONFLICT,
      {
        onBatchComplete: (batchIndex, inserted, total) => {
          logger.debug('Batch complete', { batchIndex, inserted, total });
        },
      }
    );

    timer.end({
      fetched: items.length,
      inserted: result.inserted,
      batchCount: result.batchCount,
    });

    return {
      fetched: items.length,
      inserted: result.inserted,
      errors: result.errors,
    };
  } catch (error) {
    timer.endWithError(error as Error);
    throw error;
  }
}

/**
 * 指定日の上場銘柄マスタを同期
 *
 * @param date 日付 (YYYY-MM-DD)
 * @param options オプション
 */
export async function syncEquityMasterForDate(
  date: string,
  options?: {
    client?: JQuantsClient;
    logContext?: LogContext;
  }
): Promise<SyncEquityMasterResult> {
  return syncEquityMaster({ date }, options);
}

/** 銘柄マスタ取得時の基本カラム（raw_json除外） */
export type EquityMasterBasicRecord = Pick<
  EquityMasterSnapshotRecord,
  | 'as_of_date'
  | 'local_code'
  | 'company_name'
  | 'company_name_en'
  | 'sector17_code'
  | 'sector17_name'
  | 'sector33_code'
  | 'sector33_name'
  | 'scale_category'
  | 'market_code'
  | 'market_name'
  | 'margin_code'
  | 'margin_code_name'
  | 'ingested_at'
>;

/** 基本カラムのSELECT文字列 */
const BASIC_COLUMNS =
  'as_of_date,local_code,company_name,company_name_en,sector17_code,sector17_name,sector33_code,sector33_name,scale_category,market_code,market_name,margin_code,margin_code_name,ingested_at';

/**
 * DBから銘柄マスタを取得（単一銘柄・最新日付）
 *
 * @param localCode 銘柄コード (5桁)
 * @param options オプション
 * @param options.includeRawJson raw_jsonを含めるか（デフォルト: false）
 */
export async function getEquityMasterFromDB(
  localCode: string,
  options?: { includeRawJson?: boolean }
): Promise<EquityMasterSnapshotRecord | EquityMasterBasicRecord | null> {
  const supabase = getSupabaseAdmin();

  // raw_jsonを含める場合
  if (options?.includeRawJson) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('local_code', localCode)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
        return null;
      }
      throw error;
    }
    return data as EquityMasterSnapshotRecord;
  }

  // 基本カラムのみ取得（raw_json除外・デフォルト）
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(BASIC_COLUMNS)
    .eq('local_code', localCode)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
      return null;
    }
    throw error;
  }

  return data as EquityMasterBasicRecord;
}

/**
 * DBから銘柄マスタを取得（指定日付）
 *
 * @param localCode 銘柄コード (5桁)
 * @param asOfDate 日付 (YYYY-MM-DD)
 * @param options オプション
 * @param options.includeRawJson raw_jsonを含めるか（デフォルト: false）
 */
export async function getEquityMasterByDateFromDB(
  localCode: string,
  asOfDate: string,
  options?: { includeRawJson?: boolean }
): Promise<EquityMasterSnapshotRecord | EquityMasterBasicRecord | null> {
  const supabase = getSupabaseAdmin();

  // raw_jsonを含める場合
  if (options?.includeRawJson) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('local_code', localCode)
      .eq('as_of_date', asOfDate)
      .single();

    if (error) {
      if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
        return null;
      }
      throw error;
    }
    return data as EquityMasterSnapshotRecord;
  }

  // 基本カラムのみ取得（raw_json除外・デフォルト）
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(BASIC_COLUMNS)
    .eq('local_code', localCode)
    .eq('as_of_date', asOfDate)
    .single();

  if (error) {
    if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
      return null;
    }
    throw error;
  }

  return data as EquityMasterBasicRecord;
}

/**
 * DBから全銘柄を取得（指定日付）
 *
 * @param asOfDate 日付 (YYYY-MM-DD)
 * @param options オプション
 * @param options.includeRawJson raw_jsonを含めるか（デフォルト: false）
 */
export async function getAllEquityMasterByDateFromDB(
  asOfDate: string,
  options?: { includeRawJson?: boolean }
): Promise<EquityMasterSnapshotRecord[] | EquityMasterBasicRecord[]> {
  const supabase = getSupabaseAdmin();

  // raw_jsonを含める場合
  if (options?.includeRawJson) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('as_of_date', asOfDate)
      .order('local_code', { ascending: true });

    if (error) {
      throw error;
    }
    return (data ?? []) as EquityMasterSnapshotRecord[];
  }

  // 基本カラムのみ取得（raw_json除外・デフォルト）
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(BASIC_COLUMNS)
    .eq('as_of_date', asOfDate)
    .order('local_code', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as EquityMasterBasicRecord[];
}

/**
 * DBから最新の銘柄マスタ日付を取得
 */
export async function getLatestEquityMasterDateFromDB(): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('as_of_date')
    .order('as_of_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
      return null;
    }
    throw error;
  }

  return data?.as_of_date ?? null;
}
