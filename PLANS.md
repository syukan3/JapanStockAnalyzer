# テスト網羅性改善計画

## 現状分析

### テスト済みモジュール（5ファイル / 81テスト）
| ファイル | テスト数 | カバレッジ |
|---------|---------|-----------|
| utils/date.ts | 31 | 100% |
| utils/html.ts | 9 | 100% |
| utils/retry.ts | 16 | 95% |
| jquants/rate-limiter.ts | 13 | 100% |
| supabase/errors.ts | 12 | 100% |

### 未テストモジュール
| カテゴリ | モジュール | 優先度 | 理由 |
|---------|-----------|--------|------|
| API | jquants/client.ts | 高 | API連携の中核、退行リスク大 |
| Cron | cron/auth.ts | 高 | セキュリティ関連 |
| Cron | cron/job-run.ts | 高 | ジョブ実行ログ管理 |
| Cron | cron/job-lock.ts | 高 | 同時実行防止 |
| Cron | cron/heartbeat.ts | 中 | 死活監視 |
| Cron | cron/business-day.ts | 中 | 営業日判定 |
| Cron | cron/catch-up.ts | 中 | キャッチアップロジック |
| Utils | utils/batch.ts | 中 | バッチ処理 |
| Utils | utils/logger.ts | 低 | ロガー |
| Notification | notification/email.ts | 低 | メール通知 |
| Notification | notification/templates.ts | 低 | テンプレート |

---

## 実装計画

### Phase 1: 純粋関数のユニットテスト（推定テスト数: 25-30）

外部依存なしでテスト可能な純粋関数。

#### 1.1 `src/tests/utils/logger.test.ts` (新規)
- `serializeError()` - Errorシリアライズ
  - 通常のError
  - Error with cause (ネスト)
  - 非Errorオブジェクト
  - スタックトレース5行制限
- `shouldLog()` - ログレベル判定
  - 各レベルの優先度確認
- `createLogger()` - ロガー作成
  - デフォルトコンテキスト継承
  - JSON形式出力
  - console.log/warn/error の振り分け
- `logger.child()` - 子ロガー
- `logger.startTimer()` - タイマー計測

#### 1.2 `src/tests/utils/batch.test.ts` (新規)
- `chunkArray()` - 配列分割
  - 均等分割
  - 余りあり分割
  - 空配列
  - サイズより小さい配列

#### 1.3 `src/tests/cron/auth.test.ts` (新規)
- `verifyCronAuth()` - 認証検証
  - 正常なBearerトークン
  - 不正なヘッダー形式
  - トークン不一致
  - 環境変数未設定
- `createUnauthorizedResponse()` - エラーレスポンス
- `requireCronAuth()` - ミドルウェア

#### 1.4 `src/tests/cron/business-day.test.ts` (新規)
- `isBusinessDay()` - 純粋関数部分
  - '1' → true (営業日)
  - '2' → true (半日立会)
  - '0' → false (非営業日)

---

### Phase 2: Supabaseモックを使ったテスト（推定テスト数: 40-50）

Supabaseクライアントをモックして内部ロジックをテスト。

#### 2.1 `src/tests/cron/job-run.test.ts` (新規)
- `startJobRun()` - ジョブ開始
  - 正常INSERT
  - 冪等性（23505エラー）
- `completeJobRun()` - ジョブ完了
  - success/failed ステータス
  - エラーメッセージ切り詰め（10000文字）
- `startJobRunItem()` / `completeJobRunItem()` - アイテム処理
- `getLatestJobRun()` - 最新取得
- `hasJobRunForDate()` - 存在チェック
- `getFailedJobRuns()` - 失敗取得

#### 2.2 `src/tests/cron/job-lock.test.ts` (新規)
- `acquireLock()` - ロック取得
  - 新規取得成功
  - 既存ロック保持中
  - 期限切れロックの上書き
- `releaseLock()` - ロック解放
- `extendLock()` - ロック延長
- `cleanupExpiredLocks()` - 期限切れ削除

#### 2.3 `src/tests/cron/heartbeat.test.ts` (新規)
- `updateHeartbeat()` - UPSERT
- `isJobHealthy()` - 健全性判定
  - レコードなし → unhealthy
  - 古いレコード（25時間以上）→ unhealthy
  - 最後の実行がfailed → unhealthy
- `checkAllJobsHealth()` - 全ジョブチェック

#### 2.4 `src/tests/cron/business-day.test.ts` (追加)
- DB参照関数
  - `isBusinessDayInDB()`
  - `getPreviousBusinessDay()`
  - `getNextBusinessDay()`
  - `getBusinessDays()`
  - `getCalendarMaxDate()` / `getCalendarMinDate()`

#### 2.5 `src/tests/cron/catch-up.test.ts` (新規)
- `findMissingBusinessDays()` - 欠落検出
- `needsCatchUp()` - キャッチアップ必要判定
- `determineTargetDates()` - 処理対象日決定

#### 2.6 `src/tests/utils/batch.test.ts` (追加)
- `batchUpsert()` - バッチUPSERT
  - 複数バッチ処理
  - continueOnError フラグ
  - onBatchComplete コールバック
- `batchSelect()` - バッチSELECT
  - ページネーション
  - filter/orderBy オプション
- `batchProcess()` - 並列処理
  - 並列数制限

---

### Phase 3: 外部APIモックを使ったテスト（推定テスト数: 20-25）

fetch/外部SDKをモックしてAPIクライアントをテスト。

#### 3.1 `src/tests/jquants/client.test.ts` (新規)
- コンストラクタ
  - APIキーなしでエラー
  - オプション設定
- `request()` - 基本リクエスト
  - 成功レスポンス
  - レート制限適用確認
  - エラーハンドリング（400, 401, 429, 500）
- `requestPaginated()` - ページネーション
  - 複数ページ取得
  - pagination_key の処理
- 各エンドポイントメソッド
  - `getTradingCalendar()`
  - `getEquityMaster()`
  - `getEquityBarsDaily()`

#### 3.2 `src/tests/notification/email.test.ts` (新規)
- `getResendClient()` - 初期化
  - APIキー未設定 → null
- `sendJobFailureEmail()` - 失敗通知
  - Resendモック
  - エラー時のログ出力
- `sendJobSuccessEmail()` - 成功通知
  - NOTIFY_ON_SUCCESS フラグ
- `sendConsecutiveFailureAlert()` - 連続失敗警告

#### 3.3 `src/tests/notification/templates.test.ts` (新規)
- `getJobNameLabel()` - ジョブ名翻訳
- `getJobFailureEmailTemplate()` - 失敗テンプレート
  - HTMLエスケープ適用確認
  - スタイル確認
- `getJobSuccessEmailTemplate()` - 成功テンプレート
- `getDailySummaryEmailTemplate()` - サマリーテンプレート

---

### Phase 4: 設定更新

#### 4.1 `vitest.config.ts` の coverage.include 拡張
```typescript
coverage: {
  include: [
    // 既存
    'src/lib/utils/date.ts',
    'src/lib/utils/html.ts',
    'src/lib/utils/retry.ts',
    'src/lib/jquants/rate-limiter.ts',
    'src/lib/supabase/errors.ts',
    // 追加
    'src/lib/utils/logger.ts',
    'src/lib/utils/batch.ts',
    'src/lib/jquants/client.ts',
    'src/lib/cron/auth.ts',
    'src/lib/cron/job-run.ts',
    'src/lib/cron/job-lock.ts',
    'src/lib/cron/heartbeat.ts',
    'src/lib/cron/business-day.ts',
    'src/lib/cron/catch-up.ts',
    'src/lib/notification/email.ts',
    'src/lib/notification/templates.ts',
  ],
}
```

---

## 実装順序

1. **Phase 1** - 純粋関数テスト（依存なし、すぐ実装可能）
2. **Phase 2** - Supabaseモックテスト（モックヘルパー作成後）
3. **Phase 3** - 外部APIモックテスト（fetch/SDKモック後）
4. **Phase 4** - vitest.config.ts 更新

---

## 期待される成果

| 指標 | 現在 | 目標 |
|------|------|------|
| テストファイル数 | 5 | 15+ |
| テスト数 | 81 | 170+ |
| カバレッジ対象モジュール | 5 | 16+ |
| ステートメントカバレッジ | 98% (限定) | 80%+ (全体) |

---

## モックヘルパー（共通化）

`src/tests/helpers/supabase-mock.ts` を作成して再利用:

```typescript
export function createMockSupabaseClient() {
  return {
    from: vi.fn((table) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };
}
```
