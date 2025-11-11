// ==================== 設定 ====================

/**
 * 環境変数を取得する関数
 * スクリプトプロパティから機密情報を安全に取得します
 */
function getEnvironmentVariables() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    CLIENT_ID: scriptProperties.getProperty('CLIENT_ID'),
    CLIENT_SECRET: scriptProperties.getProperty('CLIENT_SECRET')
  };
}

const CONFIG = {
  // 環境変数から取得（スクリプトプロパティに設定が必要）
  get CLIENT_ID() {
    return PropertiesService.getScriptProperties().getProperty('CLIENT_ID') || '{CLIENT_ID}';
  },
  get CLIENT_SECRET() {
    return PropertiesService.getScriptProperties().getProperty('CLIENT_SECRET') || '{CLIENT_SECRET}';
  },
  SHEET_NAMES: {
    SCHEDULED: '予約',      // スケジュール投稿シート（投稿日時|投稿内容|状態|エラーメッセージ|リトライ回数）
    PHOTO_LINKS: '写真リンク' // 写真リンクシート（番号|詳細|リンク）
  },
  COLUMNS: {
    SCHEDULED_TIME: 0,  // 投稿日時（既存）
    TWEET_CONTENT: 1,   // 投稿内容（既存）
    STATUS: 2,          // 状態（既存）
    ERROR_MESSAGE: 3,   // エラーメッセージ（新規追加）
    RETRY_COUNT: 4      // リトライ回数（新規追加）
  },
  STATUS: {
    POSTED: '投稿済',
    PENDING: '投稿待ち',
    FAILED: '投稿失敗',
    RETRYING: 'リトライ中'
  },
  RETRY: {
    MAX_ATTEMPTS: 3,           // 最大リトライ回数
    INITIAL_DELAY: 1000,       // 初回リトライまでの待機時間(ミリ秒)
    BACKOFF_MULTIPLIER: 2      // リトライごとの待機時間の倍率
  },
  AUTO_RESCHEDULE: {
    ENABLED: true,             // 自動リスケジュール機能を有効にするか
    START_DAYS_FROM_NOW: 1,    // 失敗ツイートを何日後から再スケジュールするか
    INTERVAL_DAYS: 1,          // 各失敗ツイート間の間隔（日数）
    NOTIFY_ON_FAILURE: true    // 失敗時に通知を行うか
  },
  TWEET_PREFIX: 'チャレラ！開けロイト市警だ！',
  YEARS_TO_SCHEDULE: 14,
  TWEETS_PER_DAY: 1,             // 1日あたりのツイート数
  TRIGGER_TIMES: [               // 各投稿のトリガー時刻（時:分）
    { HOUR: 19, MINUTE: 29 }
  ],
  TRIGGER_TIME: {                // 後方互換性のため残す（非推奨）
    HOUR: 19,
    MINUTE: 29,
    MARGIN_MINUTES: 5          // トリガー設定時の余裕時間（分）
  },
  MARGIN_MINUTES: 5              // トリガー設定時の余裕時間（分）
};
