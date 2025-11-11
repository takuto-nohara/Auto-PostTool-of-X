// ==================== ツイート投稿処理 ====================

/**
 * スケジュールされたツイートを投稿します。
 */
function postScheduledTweets() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const links = getSpreadsheetDataLinks();
  
  if (links.length === 0) {
    Logger.log('警告: 写真リンクシートにデータがありません');
    return;
  }

  const now = new Date();
  // マージンを考慮した時刻を計算（5分後まで投稿対象）
  const nowWithMargin = new Date(now.getTime() + (CONFIG.TRIGGER_TIME.MARGIN_MINUTES * 60 * 1000));
  let postedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // ヘッダー行をスキップして各行を処理
  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const retryCount = rows[i][CONFIG.COLUMNS.RETRY_COUNT] || 0;

    // 投稿条件をチェック
    if (!scheduledTime || !tweetContent) {
      skippedCount++;
      continue;
    }

    // スケジュール時刻を過ぎており（マージン含む）、まだ投稿されていない場合
    if (new Date(scheduledTime) <= nowWithMargin && status !== CONFIG.STATUS.POSTED) {
      
      // 最大リトライ回数を超えている場合はスキップ
      if (retryCount >= CONFIG.RETRY.MAX_ATTEMPTS) {
        Logger.log(`行 ${i + 1}: 最大リトライ回数に達したためスキップします`);
        updateTweetStatus(sheet, i + 1, CONFIG.STATUS.FAILED, 
          `最大リトライ回数(${CONFIG.RETRY.MAX_ATTEMPTS})に達しました`, retryCount);
        failedCount++;
        continue;
      }

      // リトライ中のステータスを設定
      if (retryCount > 0) {
        updateTweetStatus(sheet, i + 1, CONFIG.STATUS.RETRYING, 
          `リトライ ${retryCount}/${CONFIG.RETRY.MAX_ATTEMPTS}`, retryCount);
      }

      // ツイートを送信
      const result = sendTweetWithRetry(tweetContent, retryCount);
      
      if (result.success) {
        // 投稿成功
        updateTweetStatus(sheet, i + 1, CONFIG.STATUS.POSTED, '投稿成功', 0);
        postedCount++;

        // 新しい予約を作成
        const randomTweet = getRandomTweetContent(links);
        if (randomTweet) {
          scheduleTweetForFuture(scheduledTime, randomTweet);
        }
      } else {
        // 投稿失敗
        const newRetryCount = retryCount + 1;
        const newStatus = newRetryCount >= CONFIG.RETRY.MAX_ATTEMPTS 
          ? CONFIG.STATUS.FAILED 
          : CONFIG.STATUS.RETRYING;
        
        updateTweetStatus(sheet, i + 1, newStatus, result.error, newRetryCount);
        failedCount++;
        
        Logger.log(`行 ${i + 1}: 投稿失敗 (${newRetryCount}/${CONFIG.RETRY.MAX_ATTEMPTS}回目) - ${result.error}`);
      }
    }
  }

  // 結果のサマリーをログ出力
  Logger.log('=== 投稿処理完了 ===');
  Logger.log(`成功: ${postedCount}件`);
  Logger.log(`失敗: ${failedCount}件`);
  Logger.log(`スキップ: ${skippedCount}件`);
}

/**
 * ランダムにツイート内容を取得する関数
 * @param {Array<Array>} linksData - 写真リンクのデータ配列
 * @returns {string|null} ランダムに選ばれたリンク
 */
function getRandomTweetContent(linksData) {
  if (!linksData || linksData.length <= 1) {
    Logger.log('エラー: リンクデータが不足しています');
    return null;
  }

  const allLinks = [];

  // ヘッダー行をスキップしてリンクを収集
  // 写真リンクシートの構造: 番号 | 詳細 | リンク
  for (let i = 1; i < linksData.length; i++) {
    const link = linksData[i][2]; // 3列目（リンク列）
    if (link) {
      allLinks.push(link);
    }
  }

  if (allLinks.length === 0) {
    Logger.log('エラー: 有効なリンクが見つかりません');
    return null;
  }

  // ランダムなリンクを選択
  const randomIndex = Math.floor(Math.random() * allLinks.length);
  return allLinks[randomIndex];
}

/**
 * 指定年数後にランダムで選んだツイートを予約する関数
 * TWEETS_PER_DAYとTRIGGER_TIMESの設定に基づいて、同じ日に複数の予約を作成します
 * @param {Date} scheduledTime - 元のスケジュール時間
 * @param {string} link - リンク詳細
 */
function scheduleTweetForFuture(scheduledTime, link) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) return;

  // 指定年数後の日時を計算
  const futureDate = new Date(scheduledTime);
  futureDate.setFullYear(futureDate.getFullYear() + CONFIG.YEARS_TO_SCHEDULE);

  // スプレッドシートに新しい予約を追加
  const newRow = [
    futureDate, 
    CONFIG.TWEET_PREFIX + link, 
    ''
  ];
  
  sheet.appendRow(newRow);
  Logger.log(`新しい予約を追加しました: ${futureDate}`);
}

/**
 * 指定した日付から、1日あたりの投稿数とトリガー時刻に基づいて
 * 複数日分のスケジュールを一括作成する関数
 * @param {Date} startDate - 開始日
 * @param {number} daysToSchedule - スケジュールする日数
 */
function createBulkSchedule(startDate, daysToSchedule) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  const linksSheet = getSheet(CONFIG.SHEET_NAMES.PHOTO_LINKS);
  
  if (!sheet || !linksSheet) {
    Logger.log('エラー: シートが取得できませんでした');
    return;
  }

  const links = getSpreadsheetDataLinks();
  if (links.length === 0) {
    Logger.log('エラー: 写真リンクシートにデータがありません');
    return;
  }

  const tweetsPerDay = CONFIG.TWEETS_PER_DAY || 1;
  const triggerTimes = CONFIG.TRIGGER_TIMES || [CONFIG.TRIGGER_TIME];
  
  // TWEETS_PER_DAYの数だけトリガー時刻を使用
  const usedTriggerTimes = triggerTimes.slice(0, tweetsPerDay);
  
  if (usedTriggerTimes.length < tweetsPerDay) {
    Logger.log(`警告: TWEETS_PER_DAY(${tweetsPerDay})に対してTRIGGER_TIMESが不足しています(${triggerTimes.length}個)`);
    Logger.log(`     利用可能な${usedTriggerTimes.length}個のトリガー時刻のみを使用します`);
  }

  Logger.log('=== 一括スケジュール作成開始 ===');
  Logger.log(`開始日: ${formatDate(startDate)}`);
  Logger.log(`日数: ${daysToSchedule}日`);
  Logger.log(`1日あたりのツイート数: ${tweetsPerDay}件`);
  Logger.log(`使用するトリガー時刻: ${usedTriggerTimes.length}個`);
  Logger.log('');

  let totalScheduled = 0;
  const newRows = [];

  for (let day = 0; day < daysToSchedule; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + day);

    for (let tweetIndex = 0; tweetIndex < usedTriggerTimes.length; tweetIndex++) {
      const triggerTime = usedTriggerTimes[tweetIndex];
      const scheduledTime = new Date(currentDate);
      scheduledTime.setHours(triggerTime.HOUR);
      scheduledTime.setMinutes(triggerTime.MINUTE);
      scheduledTime.setSeconds(0);
      scheduledTime.setMilliseconds(0);

      const randomTweet = getRandomTweetContent(links);
      if (randomTweet) {
        newRows.push([
          scheduledTime,
          CONFIG.TWEET_PREFIX + randomTweet,
          ''
        ]);
        totalScheduled++;
      }
    }

    if ((day + 1) % 100 === 0) {
      Logger.log(`進捗: ${day + 1}/${daysToSchedule}日分作成完了`);
    }
  }

  // 一括でスプレッドシートに追加
  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
    Logger.log('');
    Logger.log('=== 一括スケジュール作成完了 ===');
    Logger.log(`合計 ${totalScheduled}件のツイートをスケジュールしました`);
    Logger.log(`期間: ${formatDate(startDate)} ～ ${formatDate(new Date(startDate.getTime() + (daysToSchedule - 1) * 24 * 60 * 60 * 1000))}`);
  } else {
    Logger.log('エラー: スケジュールを作成できませんでした');
  }
}
