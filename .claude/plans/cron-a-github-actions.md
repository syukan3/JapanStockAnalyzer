# Cron A: GitHub Actions内で完結する方式への移行

## 方針
Vercelの10秒制限を回避するため、Cron AのデータセットごとのSync処理をGitHub Actions内で直接実行する。
Vercel APIルートへのcurl呼び出しを廃止し、`tsx`でスクリプトを直接実行する。

## 変更ファイル

| ファイル | 操作 | 内容 |
|---|---|---|
| `scripts/cron/cron-a.ts` | 新規 | Cron A実行スクリプト（全データセット順次処理） |
| `.github/workflows/cron-a.yml` | 修正 | curl方式 → `tsx scripts/cron/cron-a.ts` に変更 |

## 不要になるファイル（削除）

| ファイル | 理由 |
|---|---|
| `src/app/api/cron/jquants/a/route.ts` | Vercel経由不要 |
| `src/app/api/cron/jquants/a/chunk/route.ts` | チャンク分割不要 |
| `src/lib/cron/handlers/cron-a-chunk.ts` | チャンク分割不要 |

## スクリプト設計: `scripts/cron/cron-a.ts`

既存の `handleCronA` をデータセットごとに順次呼び出す。
ロック・ジョブ管理（`acquireLock`, `startJobRun`, etc.）もスクリプト内で実行。
既存seedスクリプトと同じパターン（`loadEnv` → 処理 → exit code）。

```
1. loadEnv()（GitHub Actionsではenv直接注入するが、ローカル実行用に.env.localも対応）
2. acquireLock → startJobRun → updateHeartbeat
3. 各データセットを順次実行: calendar → equity_bars → topix → financial → equity_master
4. completeJobRun → updateHeartbeat → releaseLock
5. exit 0/1
```

## GitHub Actions ワークフロー設計

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '22'
      cache: 'npm'
  - run: npm ci
  - run: npx tsx scripts/cron/cron-a.ts
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      JQUANTS_API_KEY: ${{ secrets.JQUANTS_API_KEY }}
      CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

## 注意事項
- `src/app/api/cron/jquants/a/route.ts` は手動トリガー用に残す選択肢もあるが、GitHub Actionsで完結するなら不要。管理画面などからの手動実行が必要になった場合は再追加する。
- `handleCronA` と関連ハンドラー（`src/lib/cron/handlers/cron-a.ts`）はそのまま活用する。
- `cron-a-chunk.ts` のハンドラーとAPIルートは削除する。handlers/index.tsからのexportも削除。
