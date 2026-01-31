# Cron処理: Vercel API Route → GitHub Actions 直接実行への移行

## 背景
- Vercel Hobbyの10秒制限でequity_bars（~3000件/日）が完了しない
- チャンク分割でも10秒に収まらない（コールドスタート+DB+API）
- GitHub Actions直接実行なら時間制限なし（月2,000分無料枠、推定使用量270分/月=14%）

## 方針
- GitHub Actionsから`tsx`でTypeScriptスクリプトを直接実行
- 既存のハンドラー(`handleCronA`等)をそのまま再利用
- Vercel APIルートは残す（手動実行・監視用）が、Cronの主経路はGitHub Actions
- チャンク関連コード（不要になった）は削除

## 変更ファイル

### 新規作成
| ファイル | 内容 |
|---|---|
| `scripts/cron/run-cron-a.ts` | Cron A 実行スクリプト（全5データセット順次処理） |
| `scripts/cron/_shared.ts` | Cron スクリプト共通ユーティリティ（環境変数・ロック・ジョブ記録） |

### 修正
| ファイル | 内容 |
|---|---|
| `.github/workflows/cron-a.yml` | curl→`tsx scripts/cron/run-cron-a.ts`に変更 |
| `package.json` | `cron:a` スクリプト追加 |
| `docs/operations/README.md` | アーキテクチャ説明を更新 |
| `docs/operations/manual-resync.md` | 手動実行手順を更新 |
| `docs/architecture/architecture-mermaid.md` | 図を更新 |
| `README.md` | 概要を更新 |

### 削除
| ファイル | 理由 |
|---|---|
| `src/app/api/cron/jquants/a/chunk/route.ts` | チャンク分割不要 |
| `src/lib/cron/handlers/cron-a-chunk.ts` | チャンク分割不要 |

### クリーンアップ（削除に伴う修正）
| ファイル | 内容 |
|---|---|
| `src/lib/cron/handlers/index.ts` | chunk export削除 |
| `src/lib/jquants/endpoints/index.ts` | SinglePage export削除 |
| `src/lib/jquants/endpoints/equity-bars-daily.ts` | SinglePage関数・型削除 |
| `src/lib/jquants/client.ts` | getEquityBarsDailySinglePage削除 |

## 設計詳細

### scripts/cron/run-cron-a.ts
```
#!/usr/bin/env tsx
1. dotenv で .env.local を読み込み（ローカル実行時）
   - GitHub Actionsでは secrets から環境変数が設定済み
2. ロック取得（job_locks）
3. データセットを順次処理:
   calendar → equity_bars → topix → financial → equity_master
4. 各データセットで:
   a. startJobRun
   b. updateHeartbeat(running)
   c. handleCronA(dataset, runId)
   d. completeJobRun + updateHeartbeat(success/failed)
5. ロック解放
6. 失敗時は sendJobFailureEmail + exit(1)
```

### .github/workflows/cron-a.yml
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '22'
      cache: 'npm'
  - run: npm ci
  - run: npx tsx scripts/cron/run-cron-a.ts
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      JQUANTS_API_KEY: ${{ secrets.JQUANTS_API_KEY }}
      RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
      ALERT_EMAIL_TO: ${{ secrets.ALERT_EMAIL_TO }}
```

### 移行のポイント
- `handleCronA` は変更なし（既存のハンドラーをそのまま使う）
- ロック・ジョブ記録・ハートビートは既存の仕組みをそのまま使う
- Vercel APIルート（a/route.ts）は残す（手動テスト・監視用）
- CRON_SECRETはGitHub Actions経路では不要（認証はGitHub側で完結）
