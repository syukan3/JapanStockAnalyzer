/**
 * 投資部門別売買状況 エンドポイント
 *
 * @description J-Quants API V2 /v2/equities/investor-types のデータ取得・保存
 * @see https://jpx-jquants.com/en/spec
 *
 * NOTE: APIレスポンスを「投資主体 × 指標」の縦持ち形式に変換して保存。
 * published_date（公表日）を主キーに含めることで訂正・再公表に対応。
 */

import { JQuantsClient, createJQuantsClient } from '../client';
import type { InvestorTypeTradingItem, InvestorTypeTradingRecord } from '../types';
import { getSupabaseAdmin } from '../../supabase/admin';
import { POSTGREST_ERROR_CODES } from '../../supabase/errors';
import { batchUpsert } from '../../utils/batch';
import { createLogger, type LogContext } from '../../utils/logger';

const TABLE_NAME = 'investor_type_trading';
const ON_CONFLICT = 'published_date,section,start_date,end_date,investor_type,metric';

export interface FetchInvestorTypesParams {
  /** 取得開始日 (YYYY-MM-DD) */
  from?: string;
  /** 取得終了日 (YYYY-MM-DD) */
  to?: string;
  /** セクション (TSEPrime, TSEStandard, TSEGrowth, Total 等) */
  section?: string;
}

export interface SyncInvestorTypesResult {
  /** 取得件数（APIレスポンス行数） */
  fetched: number;
  /** 保存件数（縦持ち変換後） */
  inserted: number;
  /** エラー一覧 */
  errors: Error[];
}

/** 投資主体種別 */
export const INVESTOR_TYPES = [
  'Prop',     // 証券会社（自己取引）
  'Brok',     // 証券会社（委託）
  'InvTr',    // 投資信託
  'BusCo',    // 事業法人
  'OthCo',    // その他法人
  'InsCo',    // 生保・損保
  'CityBk',   // 都銀・地銀等
  'TrBk',     // 信託銀行
  'OthFI',    // その他金融機関
  'Ind',      // 個人
  'For',      // 外国人
  'Total',    // 合計
] as const;

export type InvestorType = typeof INVESTOR_TYPES[number];

/** セクション種別（J-Quants API V2で返却される値） */
export const SECTIONS = [
  'TSEPrime',     // 東証プライム
  'TSEStandard',  // 東証スタンダード
  'TSEGrowth',    // 東証グロース
  'TSE1st',       // 東証一部（過去データ）
  'TSE2nd',       // 東証二部（過去データ）
  'TSEMothers',   // マザーズ（過去データ）
  'JASDAQ',       // JASDAQ（過去データ）
  'Total',        // 合計
] as const;

export type Section = typeof SECTIONS[number];

/** 指標種別 */
export const METRICS = ['S', 'P', 'T', 'B'] as const;
export type Metric = typeof METRICS[number];

/** 指標名マッピング */
export const METRIC_NAMES: Record<Metric, string> = {
  S: 'sales',      // 売り
  P: 'purchases',  // 買い
  T: 'total',      // 合計
  B: 'balance',    // 残高（差引）
};

/**
 * APIレスポンスを縦持ちレコードに変換
 *
 * 1つのAPIレスポンスから 12投資主体 × 4指標 = 48レコードを生成
 *
 * NOTE: raw_jsonはストレージ効率のため最初のレコード（Total/sales）のみに格納。
 * 他のレコードはraw_json: nullとなる。元データが必要な場合は
 * investor_type='Total', metric='sales'のレコードを参照すること。
 */
export function toInvestorTypeTradingRecords(
  item: InvestorTypeTradingItem
): InvestorTypeTradingRecord[] {
  const records: InvestorTypeTradingRecord[] = [];

  const baseRecord = {
    published_date: item.PubDate,
    start_date: item.StartDate,
    end_date: item.EndDate,
    section: item.Section,
  };

  let isFirstRecord = true;

  // 各投資主体について指標を抽出
  for (const investorType of INVESTOR_TYPES) {
    for (const metricKey of METRICS) {
      const fieldName = `${investorType}${metricKey}` as keyof InvestorTypeTradingItem;
      const value = item[fieldName];

      // 値が存在する場合のみレコード作成
      if (value !== undefined && value !== null) {
        records.push({
          ...baseRecord,
          investor_type: investorType,
          metric: METRIC_NAMES[metricKey],
          value_kjpy: value as number,
          // raw_jsonは最初のレコードのみに格納（ストレージ効率化）
          raw_json: isFirstRecord ? item : null,
        });
        isFirstRecord = false;
      }
    }
  }

  return records;
}

/**
 * 投資部門別売買状況を取得
 *
 * @param client J-Quantsクライアント
 * @param params 取得パラメータ
 */
export async function fetchInvestorTypes(
  client: JQuantsClient,
  params?: FetchInvestorTypesParams
): Promise<InvestorTypeTradingItem[]> {
  const response = await client.getInvestorTypes(params);
  return response.data;
}

/**
 * 投資部門別売買状況を取得してDBに保存
 *
 * @param params 取得パラメータ
 * @param options オプション
 */
export async function syncInvestorTypes(
  params?: FetchInvestorTypesParams,
  options?: {
    client?: JQuantsClient;
    logContext?: LogContext;
  }
): Promise<SyncInvestorTypesResult> {
  const client = options?.client ?? createJQuantsClient({ logContext: options?.logContext });
  const logger = createLogger({ dataset: 'investor_type_trading', ...options?.logContext });
  const supabase = getSupabaseAdmin();

  const timer = logger.startTimer('Sync investor types');

  try {
    // 1. APIからデータ取得
    logger.info('Fetching investor types', {
      from: params?.from,
      to: params?.to,
      section: params?.section,
    });
    const items = await fetchInvestorTypes(client, params);

    if (items.length === 0) {
      logger.info('No investor types data found');
      timer.end({ fetched: 0, inserted: 0 });
      return { fetched: 0, inserted: 0, errors: [] };
    }

    logger.info('Fetched investor types', { rowCount: items.length });

    // 2. 縦持ちレコード形式に変換
    const records = items.flatMap(toInvestorTypeTradingRecords);
    logger.info('Converted to vertical records', {
      sourceRows: items.length,
      verticalRows: records.length,
    });

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

/** windowDaysの最大値 */
const MAX_WINDOW_DAYS = 365;

/**
 * スライディングウィンドウで投資部門別を同期
 *
 * @param windowDays 取得日数（デフォルト: 60日、最大: 365日）
 * @param options オプション
 */
export async function syncInvestorTypesWithWindow(
  windowDays: number = 60,
  options?: {
    client?: JQuantsClient;
    logContext?: LogContext;
    baseDate?: Date;
  }
): Promise<SyncInvestorTypesResult> {
  // windowDays の検証
  if (!Number.isFinite(windowDays)) {
    throw new Error('syncInvestorTypesWithWindow: windowDays must be a finite number');
  }
  const validWindowDays = Math.min(Math.max(1, Math.floor(windowDays)), MAX_WINDOW_DAYS);

  const baseDate = options?.baseDate ?? new Date();
  const from = new Date(baseDate);
  from.setDate(from.getDate() - validWindowDays);

  // Asia/Tokyoタイムゾーンで日付をフォーマット
  const formatDate = (d: Date) => {
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    return `${year}-${month}-${day}`;
  };

  return syncInvestorTypes(
    {
      from: formatDate(from),
      to: formatDate(baseDate),
    },
    options
  );
}

/**
 * DBから投資部門別を取得（期間・セクション指定）
 *
 * @param section セクション
 * @param startDate 開始日 (YYYY-MM-DD)
 * @param endDate 終了日 (YYYY-MM-DD)
 * @param options オプション
 * @param options.includeRawJson raw_jsonを含めるか（デフォルト: false）
 */
export async function getInvestorTypesFromDB(
  section: string,
  startDate: string,
  endDate: string,
  options?: { includeRawJson?: boolean }
): Promise<InvestorTypeTradingRecord[] | InvestorTypeTradingBasicRecord[]> {
  const supabase = getSupabaseAdmin();

  // raw_jsonを含める場合
  if (options?.includeRawJson) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('section', section)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .order('start_date', { ascending: true })
      .order('investor_type', { ascending: true })
      .order('metric', { ascending: true });

    if (error) {
      throw error;
    }
    return (data ?? []) as InvestorTypeTradingRecord[];
  }

  // 基本カラムのみ取得（raw_json除外・デフォルト）
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(BASIC_COLUMNS)
    .eq('section', section)
    .gte('start_date', startDate)
    .lte('end_date', endDate)
    .order('start_date', { ascending: true })
    .order('investor_type', { ascending: true })
    .order('metric', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as InvestorTypeTradingBasicRecord[];
}

/**
 * DBから特定の投資主体のデータを取得
 *
 * @param section セクション
 * @param investorType 投資主体
 * @param startDate 開始日 (YYYY-MM-DD)
 * @param endDate 終了日 (YYYY-MM-DD)
 * @param options オプション
 * @param options.includeRawJson raw_jsonを含めるか（デフォルト: false）
 */
export async function getInvestorTypeDataFromDB(
  section: string,
  investorType: InvestorType,
  startDate: string,
  endDate: string,
  options?: { includeRawJson?: boolean }
): Promise<InvestorTypeTradingRecord[] | InvestorTypeTradingBasicRecord[]> {
  const supabase = getSupabaseAdmin();

  // raw_jsonを含める場合
  if (options?.includeRawJson) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('section', section)
      .eq('investor_type', investorType)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .order('start_date', { ascending: true })
      .order('metric', { ascending: true });

    if (error) {
      throw error;
    }
    return (data ?? []) as InvestorTypeTradingRecord[];
  }

  // 基本カラムのみ取得（raw_json除外・デフォルト）
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(BASIC_COLUMNS)
    .eq('section', section)
    .eq('investor_type', investorType)
    .gte('start_date', startDate)
    .lte('end_date', endDate)
    .order('start_date', { ascending: true })
    .order('metric', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as InvestorTypeTradingBasicRecord[];
}

/**
 * DBから最新の公表日を取得
 */
export async function getLatestInvestorTypesPublishedDateFromDB(): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('published_date')
    .order('published_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
      return null;
    }
    throw error;
  }

  return data?.published_date ?? null;
}

/**
 * 利用可能なセクション一覧を取得（定数から）
 *
 * NOTE: J-Quants APIで返却されるセクション一覧は固定のため、定数を返す
 */
export function getAvailableSections(): readonly string[] {
  return SECTIONS;
}

/**
 * DBに存在するセクション一覧を取得
 *
 * NOTE: 実際にDBに登録されているセクションのみを取得
 * データが取得できない場合やセクションが少ない場合はSECTIONS定数にフォールバック
 *
 * @param options オプション
 * @param options.fallbackToConstants データがない場合に定数を返すか（デフォルト: true）
 */
export async function getAvailableSectionsFromDB(
  options?: { fallbackToConstants?: boolean }
): Promise<string[]> {
  const fallback = options?.fallbackToConstants ?? true;
  const supabase = getSupabaseAdmin();

  // DISTINCTはSupabase JS clientで直接サポートされないため、
  // 最新の公表日のデータからセクションを取得
  const latestDate = await getLatestInvestorTypesPublishedDateFromDB();
  if (!latestDate) {
    return fallback ? [...SECTIONS] : [];
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('section')
    .eq('published_date', latestDate)
    .eq('investor_type', 'Total')
    .eq('metric', 'sales')
    .order('section', { ascending: true });

  if (error) {
    throw error;
  }

  const sections = (data ?? []).map((d: { section: string }) => d.section);

  // データが取得できない場合や極端に少ない場合はフォールバック
  if (fallback && sections.length === 0) {
    return [...SECTIONS];
  }

  return sections;
}

/** 投資部門別取得時の基本カラム（raw_json除外） */
export type InvestorTypeTradingBasicRecord = Pick<
  InvestorTypeTradingRecord,
  | 'published_date'
  | 'start_date'
  | 'end_date'
  | 'section'
  | 'investor_type'
  | 'metric'
  | 'value_kjpy'
  | 'ingested_at'
>;

/** 基本カラムのSELECT文字列 */
const BASIC_COLUMNS =
  'published_date,start_date,end_date,section,investor_type,metric,value_kjpy,ingested_at';

/** limit の最大値（外国人投資家トレンド） */
const MAX_FOREIGN_TREND_LIMIT = 520; // 約10年分

/**
 * DBから外国人投資家の売買動向を取得（よく使われるクエリ）
 *
 * @param section セクション（デフォルト: Total）
 * @param limit 取得件数（デフォルト: 52 = 約1年分、最大: 520 = 約10年分）
 * @param options オプション
 * @param options.includeRawJson raw_jsonを含めるか（デフォルト: false）
 */
export async function getForeignInvestorTrendFromDB(
  section: string = 'Total',
  limit: number = 52,
  options?: { includeRawJson?: boolean }
): Promise<InvestorTypeTradingRecord[] | InvestorTypeTradingBasicRecord[]> {
  // limit の検証
  if (!Number.isFinite(limit)) {
    throw new Error('getForeignInvestorTrendFromDB: limit must be a finite number');
  }
  const validLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_FOREIGN_TREND_LIMIT);

  const supabase = getSupabaseAdmin();

  // raw_jsonを含める場合
  if (options?.includeRawJson) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('section', section)
      .eq('investor_type', 'For')
      .eq('metric', 'balance')
      .order('start_date', { ascending: false })
      .limit(validLimit);

    if (error) {
      throw error;
    }
    // 日付昇順に並び替えて返す
    return ((data ?? []) as InvestorTypeTradingRecord[]).reverse();
  }

  // 基本カラムのみ取得（raw_json除外・デフォルト）
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(BASIC_COLUMNS)
    .eq('section', section)
    .eq('investor_type', 'For')
    .eq('metric', 'balance')
    .order('start_date', { ascending: false })
    .limit(validLimit);

  if (error) {
    throw error;
  }

  // 日付昇順に並び替えて返す
  return ((data ?? []) as InvestorTypeTradingBasicRecord[]).reverse();
}
