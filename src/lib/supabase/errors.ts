/**
 * Supabase/PostgREST エラーコード定数
 *
 * @description PostgRESTから返却されるエラーコードを定数化
 * @see https://postgrest.org/en/stable/references/errors.html
 */

/**
 * PostgRESTエラーコード
 *
 * PGRST接頭辞のエラーはPostgRESTが生成するHTTPエラー
 */
export const POSTGREST_ERROR_CODES = {
  /**
   * No rows returned - .single() で該当行がない場合
   *
   * 使用例: レコード未存在をnullで返すケース
   * ```typescript
   * if (error.code === POSTGREST_ERROR_CODES.NO_ROWS_RETURNED) {
   *   return null;
   * }
   * ```
   */
  NO_ROWS_RETURNED: 'PGRST116',

  /**
   * Multiple rows returned - .single() で複数行が返却された場合
   */
  MULTIPLE_ROWS_RETURNED: 'PGRST200',

  /**
   * Requested range not satisfiable
   */
  RANGE_NOT_SATISFIABLE: 'PGRST103',
} as const;

export type PostgrestErrorCode =
  (typeof POSTGREST_ERROR_CODES)[keyof typeof POSTGREST_ERROR_CODES];

/**
 * エラーがPostgRESTエラーかどうかを判定
 *
 * @param error エラーオブジェクト
 * @param code 期待するエラーコード
 */
export function isPostgrestError(
  error: unknown,
  code: PostgrestErrorCode
): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code
  );
}
