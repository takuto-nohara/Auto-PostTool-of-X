// ==================== 再スケジュール機能 ====================

/**
 * 失敗したツイートのスケジュールを1日ずつずらして再配置する
 * 複数の失敗ツイートを適切な間隔で再投稿できるようにします
 * 
 * ⚠️ 重要: この関数は失敗ツイートを再スケジュールする際、
 * その後の投稿待ちツイートもすべて自動的にずらします
 * 
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
  const futureTweets = [];
  const now = new Date();

  Logger.log('=== 失敗したツイートの再スケジュール開始 ===');

  // 失敗したツイートと将来の投稿待ちツイートを収集
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if (!tweetContent || !scheduledTime) continue;

    const scheduledDate = new Date(scheduledTime);

    // 失敗したツイートを収集
    if (status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) {
      failedTweets.push({
        row: i + 1,
        originalTime: scheduledDate,
        content: tweetContent,
        status: status
      });
    }
    // 将来の投稿待ちツイートを収集
    else if ((status === CONFIG.STATUS.PENDING || status === '' || !status) && 
             scheduledDate > now) {
      futureTweets.push({
        row: i + 1,
        originalTime: scheduledDate,
        content: tweetContent,
        status: status || CONFIG.STATUS.PENDING
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('ℹ️ 再スケジュールが必要な失敗ツイートはありません');
    return;
  }

  Logger.log(`📋 ${failedTweets.length}件の失敗ツイートを発見しました`);
  Logger.log(`📅 ${futureTweets.length}件の将来の投稿待ちツイートが影響を受けます`);

  // 失敗したツイートを元のスケジュール時刻でソート
  failedTweets.sort((a, b) => a.originalTime - b.originalTime);
  
  // 将来のツイートを時刻でソート
  futureTweets.sort((a, b) => a.originalTime - b.originalTime);

  // 基準時刻を設定（今日の同じ時刻）
  const baseTime = new Date();
  baseTime.setDate(baseTime.getDate() + startDaysFromNow);
  baseTime.setHours(CONFIG.TRIGGER_TIME.HOUR);
  baseTime.setMinutes(CONFIG.TRIGGER_TIME.MINUTE);
  baseTime.setSeconds(0);
  baseTime.setMilliseconds(0);

  Logger.log('');
  Logger.log('【失敗ツイートの再スケジュール】');

  // 各失敗ツイートを1日ずつずらして再スケジュール
  const rescheduledTweets = [];
  for (let i = 0; i < failedTweets.length; i++) {
    const tweet = failedTweets[i];
    const newScheduledTime = new Date(baseTime);
    newScheduledTime.setDate(newScheduledTime.getDate() + (i * intervalDays));

    // スケジュール時刻を更新
    sheet.getRange(tweet.row, CONFIG.COLUMNS.SCHEDULED_TIME + 1).setValue(newScheduledTime);
    
    // ステータスをリセット
    updateTweetStatus(sheet, tweet.row, CONFIG.STATUS.PENDING, '再スケジュール済み', 0);

    rescheduledTweets.push(newScheduledTime);
    Logger.log(`  行 ${tweet.row}: ${formatDate(tweet.originalTime)} → ${formatDate(newScheduledTime)}`);
  }

  // 最後の失敗ツイートのスケジュール時刻を取得
  const lastRescheduledTime = rescheduledTweets[rescheduledTweets.length - 1];

  // 将来の投稿待ちツイートをずらす
  if (futureTweets.length > 0) {
    Logger.log('');
    Logger.log('【将来の投稿待ちツイートの調整】');
    
    let shiftedCount = 0;
    for (const futureTweet of futureTweets) {
      // 最後の再スケジュールツイートと衝突するかチェック
      if (futureTweet.originalTime <= lastRescheduledTime) {
        // 衝突する場合は、最後の再スケジュールツイートの後にずらす
        const newScheduledTime = new Date(lastRescheduledTime);
        newScheduledTime.setDate(newScheduledTime.getDate() + ((shiftedCount + 1) * intervalDays));
        
        sheet.getRange(futureTweet.row, CONFIG.COLUMNS.SCHEDULED_TIME + 1).setValue(newScheduledTime);
        updateTweetStatus(sheet, futureTweet.row, CONFIG.STATUS.PENDING, '自動調整済み', 0);
        
        Logger.log(`  行 ${futureTweet.row}: ${formatDate(futureTweet.originalTime)} → ${formatDate(newScheduledTime)} (自動調整)`);
        shiftedCount++;
      }
    }
    
    if (shiftedCount > 0) {
      Logger.log(`✅ ${shiftedCount}件の将来のツイートを自動調整しました`);
    } else {
      Logger.log('ℹ️ 将来のツイートとの衝突はありませんでした');
    }
  }

  Logger.log('');
  Logger.log('=== 再スケジュール完了 ===');
  Logger.log(`✅ 失敗ツイート: ${failedTweets.length}件を再スケジュール`);
  Logger.log(`📅 スケジュール範囲: ${formatDate(baseTime)} ～ ${formatDate(lastRescheduledTime)}`);
  
  if (futureTweets.length > 0) {
    Logger.log(`🔄 影響を受けた将来のツイート: ${futureTweets.filter((t, i) => t.originalTime <= lastRescheduledTime).length}件`);
  }
}

/**
 * 失敗したツイートを指定した日時から順次再配置する（詳細版）
 * 
 * ⚠️ 重要: この関数は失敗ツイートを再スケジュールする際、
 * その後の投稿待ちツイートもすべて自動的にずらします
 * 
 * @param {Object} options - オプション設定
 *   - startDate: Date - 開始日時（デフォルト: 明日の設定時刻）
 *   - intervalDays: number - 各ツイート間の間隔（日数）（デフォルト: 1）
 *   - sameTimeAsOriginal: boolean - 元のスケジュール時刻を保持するか（デフォルト: false）
 *   - shiftFutureTweets: boolean - 将来のツイートもずらすか（デフォルト: true）
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
    sameTimeAsOriginal: options.sameTimeAsOriginal || false,
    shiftFutureTweets: options.shiftFutureTweets !== undefined ? options.shiftFutureTweets : true
  };

  const rows = sheet.getDataRange().getValues();
  const failedTweets = [];
  const futureTweets = [];
  const now = new Date();

  Logger.log('=== 失敗したツイートの詳細再スケジュール開始 ===');
  Logger.log(`設定: 開始日時=${formatDate(config.startDate)}, 間隔=${config.intervalDays}日, 元の時刻保持=${config.sameTimeAsOriginal}, 将来のツイート調整=${config.shiftFutureTweets}`);

  // 失敗したツイートと将来の投稿待ちツイートを収集
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if (!tweetContent || !scheduledTime) continue;

    const scheduledDate = new Date(scheduledTime);

    // 失敗したツイートを収集
    if (status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) {
      failedTweets.push({
        row: i + 1,
        originalTime: scheduledDate,
        content: tweetContent,
        status: status
      });
    }
    // 将来の投稿待ちツイートを収集（オプションが有効な場合のみ）
    else if (config.shiftFutureTweets && 
             (status === CONFIG.STATUS.PENDING || status === '' || !status) && 
             scheduledDate > now) {
      futureTweets.push({
        row: i + 1,
        originalTime: scheduledDate,
        content: tweetContent,
        status: status || CONFIG.STATUS.PENDING
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('ℹ️ 再スケジュールが必要な失敗ツイートはありません');
    return;
  }

  Logger.log(`📋 ${failedTweets.length}件の失敗ツイートを発見しました`);
  if (config.shiftFutureTweets) {
    Logger.log(`📅 ${futureTweets.length}件の将来の投稿待ちツイートが影響を受ける可能性があります`);
  }

  // 失敗したツイートを元のスケジュール時刻でソート
  failedTweets.sort((a, b) => a.originalTime - b.originalTime);
  
  // 将来のツイートを時刻でソート
  futureTweets.sort((a, b) => a.originalTime - b.originalTime);

  Logger.log('');
  Logger.log('【失敗ツイートの再スケジュール】');

  // 各失敗ツイートを再スケジュール
  const rescheduledTweets = [];
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

    rescheduledTweets.push(newScheduledTime);
    Logger.log(`  行 ${tweet.row}: ${formatDate(tweet.originalTime)} → ${formatDate(newScheduledTime)}`);
  }

  // 最後の失敗ツイートのスケジュール時刻を取得
  const lastRescheduledTime = rescheduledTweets[rescheduledTweets.length - 1];

  // 将来の投稿待ちツイートをずらす
  if (config.shiftFutureTweets && futureTweets.length > 0) {
    Logger.log('');
    Logger.log('【将来の投稿待ちツイートの調整】');
    
    let shiftedCount = 0;
    for (const futureTweet of futureTweets) {
      // 最後の再スケジュールツイートと衝突するかチェック
      if (futureTweet.originalTime <= lastRescheduledTime) {
        // 衝突する場合は、最後の再スケジュールツイートの後にずらす
        const newScheduledTime = new Date(lastRescheduledTime);
        newScheduledTime.setDate(newScheduledTime.getDate() + ((shiftedCount + 1) * config.intervalDays));
        
        // 元の時刻を保持するオプションが有効な場合
        if (config.sameTimeAsOriginal) {
          newScheduledTime.setHours(futureTweet.originalTime.getHours());
          newScheduledTime.setMinutes(futureTweet.originalTime.getMinutes());
          newScheduledTime.setSeconds(futureTweet.originalTime.getSeconds());
        }
        
        sheet.getRange(futureTweet.row, CONFIG.COLUMNS.SCHEDULED_TIME + 1).setValue(newScheduledTime);
        updateTweetStatus(sheet, futureTweet.row, CONFIG.STATUS.PENDING, '自動調整済み', 0);
        
        Logger.log(`  行 ${futureTweet.row}: ${formatDate(futureTweet.originalTime)} → ${formatDate(newScheduledTime)} (自動調整)`);
        shiftedCount++;
      }
    }
    
    if (shiftedCount > 0) {
      Logger.log(`✅ ${shiftedCount}件の将来のツイートを自動調整しました`);
    } else {
      Logger.log('ℹ️ 将来のツイートとの衝突はありませんでした');
    }
  }

  Logger.log('');
  Logger.log('=== 詳細再スケジュール完了 ===');
  Logger.log(`✅ 失敗ツイート: ${failedTweets.length}件を再スケジュール`);
  
  if (config.shiftFutureTweets && futureTweets.length > 0) {
    Logger.log(`🔄 影響を受けた将来のツイート: ${futureTweets.filter((t, i) => t.originalTime <= lastRescheduledTime).length}件`);
  }
}
