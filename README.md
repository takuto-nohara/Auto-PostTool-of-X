# Auto-PostTool-of-X

Google Apps Script(GAS)を使用したX(旧Twitter)自動投稿ツール

## 📋 概要

このツールは、Google SpreadSheetに予約したツイートを自動的にXに投稿するシステムです。投稿失敗時の自動リトライ機能や、失敗したツイートの再スケジュール機能など、堅牢な投稿管理機能を備えています。

## 🎯 主な機能

- ✅ **スケジュール投稿**: 指定した日時に自動でツイート
- 🔄 **自動リトライ**: 失敗時に最大3回まで自動リトライ（指数バックオフ方式）
- 🤖 **自動リスケジュール**: 投稿失敗を検出して自動的に再スケジュール
- 📊 **詳細なステータス管理**: 投稿成功/失敗/リトライ中などの状態を追跡
- ⚠️ **投稿漏れ検出**: 予定時刻を過ぎているのに投稿されていないツイートを自動検出
- 📅 **柔軟な再スケジュール**: 失敗ツイートを1日ずつずらして再配置
- 🎲 **ランダム投稿**: 写真リンクからランダムに選んで新規予約を作成
- 🔐 **セキュアな認証**: OAuth2.0 + PKCE方式でTwitter API認証

## 📁 ファイル構成

```
Auto-PostTool-of-X/
├── Config.gs                   # 設定と定数
├── OAuth2.gs                   # Twitter OAuth2認証
├── SpreadsheetUtils.gs         # スプレッドシート操作
├── TweetScheduler.gs           # ツイート投稿スケジューラー
├── TwitterAPI.gs               # Twitter API送信処理
├── TriggerManager.gs           # トリガー管理
├── FailedTweetManager.gs       # 失敗ツイート管理
├── Rescheduler.gs              # 再スケジュール機能
├── AutoRescheduler.gs          # 自動リスケジュール機能（新規）
├── MissedTweetDetector.gs      # 投稿漏れ検出
├── Utils.gs                    # ユーティリティ関数
├── Tests.gs                    # テスト関数
└── README.md                   # このファイル
```

## 🚀 セットアップ

### 1. Google Apps Scriptプロジェクトの作成

1. Google SpreadSheetを開く
2. 「拡張機能」→「Apps Script」をクリック
3. すべての`.gs`ファイルをプロジェクトに追加

### 2. OAuth2ライブラリの追加

1. 左サイドバーの「ライブラリ +」をクリック
2. スクリプトID: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
3. 「検索」→最新バージョンを選択→「追加」

### 3. Twitter API認証情報の設定

#### Twitter Developer Portalで取得
1. https://developer.twitter.com/en/portal/dashboard
2. アプリを作成してClient IDとClient Secretを取得

#### GASに設定
```javascript
// 方法1: GASエディタのUI（推奨）
左サイドバー「⚙️ プロジェクトの設定」
→「スクリプト プロパティ」
→「CLIENT_ID」と「CLIENT_SECRET」を追加

// 方法2: コードから設定 (Utils.gs)
setEnvironmentVariables(); // 実行後、関数内の値は削除すること
```

### 4. スプレッドシートの準備

#### 既存のスプレッドシートがある場合
既存の「投稿日時、投稿内容、状態」の3列構造を維持しながら、新しい列を追加します：

```javascript
// 既存データを保持したまま構造をアップグレード (SpreadsheetUtils.gs)
upgradeSpreadsheetStructure();
```

この関数は以下を実行します：
1. 既存の3列（投稿日時、投稿内容、状態）はそのまま保持
2. 新しく2列（エラーメッセージ、リトライ回数）を追加
3. 過去のデータ行にも新しい列を初期化

#### 新規作成の場合
```javascript
initializeSpreadsheetHeaders(); // (SpreadsheetUtils.gs)
```

**最終的なヘッダー構造:**
| 投稿日時 | 投稿内容 | 状態 | エラーメッセージ | リトライ回数 |
|---------|---------|------|----------------|-------------|

**注意:** 既存の3列のヘッダー名（投稿日時、投稿内容、状態）は変更されません。

#### 「写真リンク」シートの作成
既存の構造を使用してください：

| 番号 | 詳細 | リンク |
|------|------|--------|
| 1 | 一家 | https://twitter.com/Your_ID/status/... |
| 2 | 二階堂 | https://twitter.com/Your_ID/status/... |
| 3 | 桧森 | https://twitter.com/Your_ID/status/... |

**注意:** 
- ヘッダー行は「番号」「詳細」「リンク」の3列構造
- システムは3列目（リンク列）からランダムに選択します
- 既存のデータ構造は変更しないでください

### 5. Twitter認証

```javascript
main(); // ログに認証URLが表示される (OAuth2.gs)
```
表示されたURLを開いて認証を完了

### 6. トリガーの設定

```javascript
createTrigger(); // 翌日19:30に自動実行されるトリガーを作成 (TriggerManager.gs)
```

## 📖 使い方

### 基本的な使用方法

#### 1. ツイートを予約する
スプレッドシートの「予約」シートに以下を入力:
- **投稿日時**: 投稿したい日時
- **投稿内容**: 投稿する文章
- **状態**: 空白または「投稿待ち」

（エラーメッセージとリトライ回数は自動で管理されます）

#### 2. 自動投稿
設定した時刻になると自動的に投稿されます。
- 成功 → ステータスが「投稿済」に
- 失敗 → 自動で最大3回リトライ

### 失敗ツイートの管理

#### 失敗状況の確認
```javascript
// 全体の健全性チェック (MissedTweetDetector.gs)
healthCheck();

// 失敗ツイートの一覧表示 (FailedTweetManager.gs)
listFailedTweets();

// 投稿漏れを検出してマーク (MissedTweetDetector.gs)
detectAndMarkMissedTweets();
```

#### 重要: 再スケジュール時の動作

再スケジュール機能を実行すると、失敗したツイートだけでなく、**その後の投稿待ちツイートもすべて自動的にずらされます**。これにより、スケジュールの重複を防ぎます。

例：
- 11/10、11/11、11/12に投稿予定のツイートがあり
- 11/10のツイートが失敗した場合
- `rescheduleFailedTweets()` を実行すると：
  - 失敗ツイート: 11/10 → 11/11 に移動
  - 元の11/11のツイート → 11/12 に移動
  - 元の11/12のツイート → 11/13 に移動

将来のツイートをずらしたくない場合は、`shiftFutureTweets: false` オプションを使用してください。

#### 失敗ツイートの対処

**パターン1: 今すぐ投稿**
```javascript
postFailedTweetsNow(5); // 最大5件を今すぐ投稿 (FailedTweetManager.gs)
```

**パターン2: 1日ずつ再スケジュール**
```javascript
// 明日から1日ずつ (Rescheduler.gs)
// ⚠️ 注意: 失敗ツイートの後にある投稿待ちツイートも自動的にずらされます
rescheduleFailedTweets();

// 3日後から2日間隔で (Rescheduler.gs)
rescheduleFailedTweets(3, 2);
```

**パターン3: 詳細設定で再スケジュール**
```javascript
// 特定の日時から開始 (Rescheduler.gs)
var startDate = new Date("2025-11-15 19:30:00");
rescheduleFailedTweetsAdvanced({ 
  startDate: startDate, 
  intervalDays: 1 
});

// 元の時刻を保持 (Rescheduler.gs)
rescheduleFailedTweetsAdvanced({ 
  intervalDays: 1, 
  sameTimeAsOriginal: true 
});

// 将来のツイートをずらさない（失敗ツイートのみ再スケジュール）
rescheduleFailedTweetsAdvanced({ 
  intervalDays: 1, 
  shiftFutureTweets: false 
});
```

**パターン4: 手動リトライ**
```javascript
retryFailedTweets(); // すべての失敗ツイートをリトライ (FailedTweetManager.gs)
```

**パターン5: ステータスリセット**
```javascript
resetFailedTweets(); // ステータスを「投稿待ち」に戻す (FailedTweetManager.gs)
```

### 便利な関数

```javascript
// 使い方ガイドを表示 (Utils.gs)
showFailedTweetManagementGuide();

// スプレッドシート構造チェック (Utils.gs)
checkSpreadsheetStructure();

// 環境変数チェック (Utils.gs)
checkEnvironmentVariables();

// 認証状態チェック (OAuth2.gs)
main();

// 全体テスト (Tests.gs)
testAll();

// 自動リスケジュール機能のテスト (Tests.gs)
testAutoReschedule();

// 自動リスケジュール機能のステータス確認 (AutoRescheduler.gs)
showAutoRescheduleStatus();
```

### 自動リスケジュール機能

このツールは、投稿失敗を自動的に検出して再スケジュールする機能を備えています。

#### 自動で実行される処理

トリガー実行時（毎日設定時刻）に自動で以下を実行：

1. **投稿漏れの検出**: 予定時刻を過ぎているのに投稿されていないツイートを「投稿失敗」として検出
2. **失敗ツイートの確認**: 失敗ステータスのツイートを収集
3. **自動再スケジュール**: 失敗ツイートを設定に基づいて自動的に再配置

#### 手動で実行する場合

```javascript
// デフォルト設定で実行 (AutoRescheduler.gs)
autoDetectAndReschedule();

// カスタム設定で実行
autoDetectAndReschedule({
  autoReschedule: true,      // 自動再スケジュール有効
  startDaysFromNow: 2,       // 2日後から開始
  intervalDays: 1,           // 1日間隔
  notifyOnFailure: true      // 失敗時に通知
});

// 検出のみ（再スケジュールしない）
autoDetectAndReschedule({ autoReschedule: false });
```

#### 設定の変更

`Config.gs`の`AUTO_RESCHEDULE`セクションで設定を変更できます：

```javascript
AUTO_RESCHEDULE: {
  ENABLED: true,              // false にすると自動リスケジュール無効
  START_DAYS_FROM_NOW: 1,     // 失敗ツイートを何日後から再スケジュールするか
  INTERVAL_DAYS: 1,           // 各失敗ツイート間の間隔（日数）
  NOTIFY_ON_FAILURE: true     // 失敗時にログに通知を出力
}
```

## ⚙️ 設定のカスタマイズ

`Config.gs`で以下の設定を変更できます:

```javascript
CONFIG = {
  TWEET_PREFIX: 'チャレラ！開けロイト市警だ！',  // ツイートのプレフィックス
  YEARS_TO_SCHEDULE: 14,                         // 新規予約する年数
  TRIGGER_TIME: {
    HOUR: 19,                                    // 実行時刻（時）
    MINUTE: 30                                   // 実行時刻（分）
  },
  RETRY: {
    MAX_ATTEMPTS: 3,                             // 最大リトライ回数
    INITIAL_DELAY: 1000,                         // 初回リトライ待機時間(ms)
    BACKOFF_MULTIPLIER: 2                        // リトライ間隔の倍率
  },
  AUTO_RESCHEDULE: {
    ENABLED: true,                               // 自動リスケジュール有効化
    START_DAYS_FROM_NOW: 1,                      // 何日後から再スケジュールするか
    INTERVAL_DAYS: 1,                            // 各失敗ツイート間の間隔（日数）
    NOTIFY_ON_FAILURE: true                      // 失敗時に通知を行うか
  }
}
```

## 🔍 ステータス一覧

| ステータス | 説明 |
|-----------|------|
| (空白) | まだ投稿されていない |
| 投稿待ち | 投稿待機中 |
| 投稿済 | 投稿成功 |
| リトライ中 | 失敗後リトライ中 |
| 投稿失敗 | 最大リトライ回数に達して失敗 |

## 🛠️ トラブルシューティング

### 認証エラーが出る
```javascript
main(); // 認証URLを再取得 (OAuth2.gs)
```

### 投稿が実行されない
```javascript
healthCheck(); // 全体の状況を確認 (MissedTweetDetector.gs)
detectAndMarkMissedTweets(); // 投稿漏れを検出 (MissedTweetDetector.gs)
```

### スプレッドシートの構造を確認したい
```javascript
checkSpreadsheetStructure(); // 構造の診断と問題点を表示 (Utils.gs)
```

### エラーメッセージの意味
- `レート制限に達しました` → しばらく待ってから再試行
- `認証エラー` → 再認証が必要
- `投稿漏れを検出` → スケジュール時刻を過ぎているのに未投稿

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献

プルリクエストやIssueは大歓迎です！

## 📧 サポート

問題が発生した場合は、GitHubのIssuesでお知らせください。

