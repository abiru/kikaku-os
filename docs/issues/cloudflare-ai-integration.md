# feat: Cloudflare AI サービス統合（AI Gateway, Workers AI, Vectorize）

## 概要

管理画面でのAI機能をCloudflareスタックに統合し、コスト削減・監視強化・新機能追加を実現する。

## 背景

現在のAI実装:
- Claude API直接呼び出し（`api.anthropic.com`）
- 独自のレート制限・コスト追跡（`rateLimiter.ts`）
- Inboxパターンによる人間承認フロー

Cloudflare AI関連サービスを活用することで、より効率的な運用が可能になる。

## 提案するサービス

### 1. Cloudflare AI Gateway（優先度: 高）

**概要**: 既存のClaude API呼び出しをプロキシ経由に変更

**メリット**:
- キャッシング: 同一プロンプトの重複リクエストを削減（コスト削減）
- ログ・分析: 全リクエストの可視化、トークン使用量追跡
- レート制限: Cloudflare側で追加制御
- フォールバック: Claude障害時に別プロバイダーへ自動切り替え
- リアルタイム監視: ダッシュボードで使用状況確認

**変更箇所**:
```typescript
// Before: claudeClient.ts
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// After: AI Gateway経由
const CLAUDE_API_URL = 'https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic/messages';
```

### 2. Workers AI（優先度: 中）

**概要**: Cloudflareエッジで実行される軽量モデル

**利用可能モデル**:
| カテゴリ | モデル | ユースケース |
|----------|--------|--------------|
| テキスト生成 | `@cf/meta/llama-3.1-8b-instruct` | 軽量な分類・要約 |
| 埋め込み | `@cf/baai/bge-base-en-v1.5` | セマンティック検索 |
| 翻訳 | `@cf/meta/m2m100-1.2b` | 多言語対応 |

**適用候補**:
- ✅ Inboxトリアージ（優先度分類）- 単純分類はLlama 3で十分
- ✅ 商品検索の埋め込み生成 - BGE embeddingsで高速
- ⚠️ 商品説明生成 - 日本語品質は要検証
- ❌ 広告コピー生成 - Claudeが必要

### 3. Vectorize（優先度: 中）

**概要**: ベクトルデータベース（スキーマは`0029_ai_automation.sql`で準備済み）

**適用ユースケース**:
- 商品セマンティック検索（「暖かい照明」→関連商品）
- 類似商品レコメンド
- 顧客セグメント
- 重複商品検出

**必要な設定**:
```toml
# wrangler.tomlに追加
[[vectorize]]
binding = "VECTORIZE"
index_name = "product-embeddings"
```

## 推奨アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    管理画面 (Admin)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │ 高品質生成   │     │ 軽量タスク   │     │ 検索・推薦   │   │
│  │ (広告,説明)  │     │ (分類,要約)  │     │ (類似商品)   │   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘   │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ AI Gateway   │   │ Workers AI   │   │  Vectorize   │    │
│  │ (Claude経由) │   │ (Llama 3)    │   │ (BGE embed)  │    │
│  └──────┬───────┘   └──────────────┘   └──────────────┘    │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │ Anthropic API │                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

## 実装フェーズ

### Phase 1: AI Gateway導入
- [ ] Cloudflare AI Gatewayの作成
- [ ] `claudeClient.ts`のエンドポイント変更
- [ ] 環境変数追加（`AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_ID`）
- [ ] キャッシュ設定の最適化
- [ ] 動作確認・モニタリング

### Phase 2: Vectorize + セマンティック検索
- [ ] Vectorizeインデックス作成
- [ ] `wrangler.toml`にバインディング追加
- [ ] 商品埋め込み生成サービス実装
- [ ] セマンティック検索API実装
- [ ] 管理画面に検索UI追加

### Phase 3: Workers AI活用
- [ ] Workers AIバインディング追加
- [ ] Inboxトリアージの軽量モデル移行
- [ ] コスト比較・品質評価
- [ ] ハイブリッド構成の実装

## 関連ファイル

- `apps/api/src/services/ai/claudeClient.ts` - Claude APIクライアント
- `apps/api/src/services/ai/contentGeneration.ts` - コンテンツ生成
- `apps/api/src/services/ai/workflowAutomation.ts` - ワークフロー自動化
- `apps/api/src/migrations/0029_ai_automation.sql` - AIスキーマ
- `wrangler.toml` - Cloudflareバインディング

## 参考リンク

- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Vectorize](https://developers.cloudflare.com/vectorize/)
