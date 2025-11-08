// ==================== 再スケジュール機能 ====================

/**
 * 失敗したツイートのスケジュールを1日ずつずらして再配置する
 * 複数の失敗ツイートを適切な間隔で再投稿できるようにします
 * @param {number} startDaysFromNow - 最初の失敗ツイートを何日後に設定するか（デフォルト: 1）
 * @param {number} intervalDays - 各失敗ツイート間の間隔（日数）（デフォルト: 1）
 */
function rescheduleFailedTweets(startDaysFromNow = 1, intervalDays = 1) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const failedTweets = [];

  Logger.log('=== 失敗したツイートの再スケジュール開始 ===');

  // 失敗したツイートを収集
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && 
        tweetContent && scheduledTime) {
      failedTweets.push({
        row: i + 1,
        originalTime: new Date(scheduledTime),
        content: tweetContent
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('ℹ️ 再スケジュールが必要な失敗ツイートはありません');
    return;
  }

  Logger.log(`📋 ${failedTweets.length}件の失敗ツイートを発見しました`);

  // 失敗したツイートを元のスケジュール時刻でソート
  failedTweets.sort((a, b) => a.originalTime - b.originalTime);

  // 基準時刻を設定（今日の同じ時刻）
  const baseTime = new Date();
  baseTime.setDate(baseTime.getDate() + startDaysFromNow);
  baseTime.setHours(CONFIG.TRIGGER_TIME.HOUR);
  baseTime.setMinutes(CONFIG.TRIGGER_TIME.MINUTE);
  baseTime.setSeconds(0);
  baseTime.setMilliseconds(0);

  // 各失敗ツイートを1日ずつずらして再スケジュール
  for (let i = 0; i < failedTweets.length; i++) {
    const tweet = failedTweets[i];
    const newScheduledTime = new Date(baseTime);
    newScheduledTime.setDate(newScheduledTime.getDate() + (i * intervalDays));

    // スケジュール時刻を更新
    sheet.getRange(tweet.row, CONFIG.COLUMNS.SCHEDULED_TIME + 1).setValue(newScheduledTime);
    
    // ステータスをリセット
    updateTweetStatus(sheet, tweet.row, CONFIG.STATUS.PENDING, '再スケジュール済み', 0);

    Logger.log(`行 ${tweet.row}: ${formatDate(tweet.originalTime)} → ${formatDate(newScheduledTime)}`);
  }

  Logger.log('=== 再スケジュール完了 ===');
  Logger.log(`✅ ${failedTweets.length}件のツイートを再スケジュールしました`);
  Logger.log(`📅 スケジュール範囲: ${formatDate(baseTime)} ～ ${formatDate(new Date(baseTime.getTime() + (failedTweets.length - 1) * intervalDays * 24 * 60 * 60 * 1000))}`);
}

/**
 * 失敗したツイートを指定した日時から順次再配置する（詳細版）
 * @param {Object} options - オプション設定
 *   - startDate: Date - 開始日時（デフォルト: 明日の設定時刻）
 *   - intervalDays: number - 各ツイート間の間隔（日数）（デフォルト: 1）
 *   - sameTimeAsOriginal: boolean - 元のスケジュール時刻を保持するか（デフォルト: false）
 */
function rescheduleFailedTweetsAdvanced(options = {}) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  // デフォルトオプション
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() + 1);
  defaultStartDate.setHours(CONFIG.TRIGGER_TIME.HOUR);
  defaultStartDate.setMinutes(CONFIG.TRIGGER_TIME.MINUTE);
  defaultStartDate.setSeconds(0);
  defaultStartDate.setMilliseconds(0);

  const config = {
    startDate: options.startDate || defaultStartDate,
    intervalDays: options.intervalDays || 1,
    sameTimeAsOriginal: options.sameTimeAsOriginal || false
  };

  const rows = sheet.getDataRange().getValues();
  const failedTweets = [];

  Logger.log('=== 失敗したツイートの詳細再スケジュール開始 ===');
  Logger.log(`設定: 開始日時=${formatDate(config.startDate)}, 間隔=${config.intervalDays}日, 元の時刻保持=${config.sameTimeAsOriginal}`);

  // 失敗したツイートを収集
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && 
        tweetContent && scheduledTime) {
      failedTweets.push({
        row: i + 1,
        originalTime: new Date(scheduledTime),
        content: tweetContent
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('ℹ️ 再スケジュールが必要な失敗ツイートはありません');
    return;
  }

  Logger.log(`📋 ${failedTweets.length}件の失敗ツイートを発見しました`);

  // 失敗したツイートを元のスケジュール時刻でソート
  failedTweets.sort((a, b) => a.originalTime - b.originalTime);

  // 各失敗ツイートを再スケジュール
  for (let i = 0; i < failedTweets.length; i++) {
    const tweet = failedTweets[i];
    let newScheduledTime;

    if (config.sameTimeAsOriginal) {
      // 元の時刻を保持する場合
      newScheduledTime = new Date(config.startDate);
      newScheduledTime.setDate(newScheduledTime.getDate() + (i * config.intervalDays));
      newScheduledTime.setHours(tweet.originalTime.getHours());
      newScheduledTime.setMinutes(tweet.originalTime.getMinutes());
      newScheduledTime.setSeconds(tweet.originalTime.getSeconds());
    } else {
      // 設定時刻を使用する場合
      newScheduledTime = new Date(config.startDate);
      newScheduledTime.setDate(newScheduledTime.getDate() + (i * config.intervalDays));
    }

    // スケジュール時刻を更新
    sheet.getRange(tweet.row, CONFIG.COLUMNS.SCHEDULED_TIME + 1).setValue(newScheduledTime);
    
    // ステータスをリセット
    updateTweetStatus(sheet, tweet.row, CONFIG.STATUS.PENDING, '詳細再スケジュール済み', 0);

    Logger.log(`行 ${tweet.row}: ${formatDate(tweet.originalTime)} → ${formatDate(newScheduledTime)}`);
  }

  Logger.log('=== 詳細再スケジュール完了 ===');
  Logger.log(`✅ ${failedTweets.length}件のツイートを再スケジュールしました`);
}
