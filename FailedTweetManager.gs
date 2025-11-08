// ==================== 失敗ツイート管理 ====================

/**
 * 失敗したツイートを手動でリトライする
 * ステータスが「投稿失敗」または「リトライ中」のツイートを再試行します
 */
function retryFailedTweets() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  let retriedCount = 0;
  let successCount = 0;

  Logger.log('=== 失敗したツイートのリトライを開始 ===');

  for (let i = 1; i < rows.length; i++) {
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const retryCount = rows[i][CONFIG.COLUMNS.RETRY_COUNT] || 0;

    // 失敗またはリトライ中のツイートを再試行
    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && tweetContent) {
      Logger.log(`行 ${i + 1}: リトライを試行...`);
      retriedCount++;

      const result = sendTweetWithRetry(tweetContent, 0); // リトライカウントをリセット

      if (result.success) {
        updateTweetStatus(sheet, i + 1, CONFIG.STATUS.POSTED, '手動リトライで成功', 0);
        successCount++;
        Logger.log(`行 ${i + 1}: ✅ リトライ成功`);
      } else {
        const newRetryCount = retryCount + 1;
        updateTweetStatus(sheet, i + 1, CONFIG.STATUS.FAILED, result.error, newRetryCount);
        Logger.log(`行 ${i + 1}: ❌ リトライ失敗 - ${result.error}`);
      }

      // レート制限を避けるため、少し待機
      if (i < rows.length - 1) {
        Utilities.sleep(2000);
      }
    }
  }

  Logger.log('=== リトライ処理完了 ===');
  Logger.log(`リトライ試行: ${retriedCount}件`);
  Logger.log(`成功: ${successCount}件`);
  Logger.log(`失敗: ${retriedCount - successCount}件`);
}

/**
 * 失敗したツイートの一覧を表示する
 * 失敗の原因や詳細情報を確認できます
 * @param {boolean} includeDetection - 投稿漏れの検出も行うか（デフォルト: false）
 */
function listFailedTweets(includeDetection = false) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  // 投稿漏れの検出を行う場合
  if (includeDetection) {
    Logger.log('--- まず投稿漏れを検出します ---\n');
    detectAndMarkMissedTweets();
    Logger.log('');
  }

  const rows = sheet.getDataRange().getValues();
  const failedTweets = [];

  Logger.log('=== 失敗したツイート一覧 ===');

  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const errorMessage = rows[i][CONFIG.COLUMNS.ERROR_MESSAGE] || '(エラーメッセージなし)';
    const retryCount = rows[i][CONFIG.COLUMNS.RETRY_COUNT] || 0;

    if (status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) {
      failedTweets.push({
        row: i + 1,
        scheduledTime: scheduledTime,
        content: tweetContent,
        status: status,
        error: errorMessage,
        retryCount: retryCount
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('✅ 失敗したツイートはありません');
    return;
  }

  Logger.log(`📋 合計 ${failedTweets.length}件の失敗ツイートがあります\n`);

  failedTweets.forEach((tweet, index) => {
    Logger.log(`【${index + 1}】行 ${tweet.row}`);
    Logger.log(`  予定時刻: ${formatDate(new Date(tweet.scheduledTime))}`);
    Logger.log(`  ステータス: ${tweet.status}`);
    Logger.log(`  リトライ回数: ${tweet.retryCount}回`);
    Logger.log(`  エラー: ${tweet.error}`);
    Logger.log(`  内容: ${tweet.content.substring(0, 50)}${tweet.content.length > 50 ? '...' : ''}`);
    Logger.log('');
  });

  Logger.log('=== 一覧表示完了 ===');
  return failedTweets;
}

/**
 * 失敗したツイートを今すぐ投稿する
 * すべての失敗ツイートを順次投稿します（レート制限に注意）
 * @param {number} maxTweets - 最大投稿数（デフォルト: 5）
 */
function postFailedTweetsNow(maxTweets = 5) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const links = getSpreadsheetDataLinks();
  let postedCount = 0;
  let failedCount = 0;

  Logger.log('=== 失敗したツイートを今すぐ投稿 ===');
  Logger.log(`最大投稿数: ${maxTweets}件`);

  for (let i = 1; i < rows.length && postedCount < maxTweets; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && tweetContent) {
      Logger.log(`\n行 ${i + 1}: 投稿を試行中...`);

      const result = sendTweetWithRetry(tweetContent, 0);

      if (result.success) {
        updateTweetStatus(sheet, i + 1, CONFIG.STATUS.POSTED, '即時投稿成功', 0);
        postedCount++;
        Logger.log(`✅ 投稿成功 (${postedCount}/${maxTweets})`);

        // 新しい予約を作成
        const randomTweet = getRandomTweetContent(links);
        if (randomTweet) {
          scheduleTweetForFuture(scheduledTime, randomTweet);
        }
      } else {
        failedCount++;
        Logger.log(`❌ 投稿失敗: ${result.error}`);
      }

      // レート制限を避けるため待機（次のツイートがある場合のみ）
      if (postedCount < maxTweets && i < rows.length - 1) {
        Logger.log('⏳ 3秒待機中...');
        Utilities.sleep(3000);
      }
    }
  }

  Logger.log('\n=== 即時投稿完了 ===');
  Logger.log(`✅ 成功: ${postedCount}件`);
  Logger.log(`❌ 失敗: ${failedCount}件`);
}

/**
 * 投稿失敗のツイートをリセットする
 * ステータスを空にし、リトライ回数を0にします
 */
function resetFailedTweets() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  let resetCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    if (status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) {
      sheet.getRange(i + 1, CONFIG.COLUMNS.STATUS + 1).setValue(CONFIG.STATUS.PENDING);
      sheet.getRange(i + 1, CONFIG.COLUMNS.ERROR_MESSAGE + 1).setValue('');
      sheet.getRange(i + 1, CONFIG.COLUMNS.RETRY_COUNT + 1).setValue(0);
      resetCount++;
    }
  }

  Logger.log(`✅ ${resetCount}件の失敗ツイートをリセットしました`);
}
