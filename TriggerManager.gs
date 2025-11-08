// ==================== トリガー管理 ====================

/**
 * 指定した時間にツイートを送信するためのトリガーを作成します。
 * 現在時刻が投稿指定時刻よりも前の場合は当日、後の場合は翌日の指定時刻に実行されるトリガーを設定します。
 */
function createTrigger() {
  try {
    // 既存のトリガーを削除
    deleteExistingTriggers('createTrigger');

    // 投稿漏れの検出と自動リスケジュール（実行前にチェック）
    if (CONFIG.AUTO_RESCHEDULE.ENABLED) {
      Logger.log('--- 投稿失敗の自動検出と再スケジュール ---');
      autoDetectAndReschedule({
        autoReschedule: CONFIG.AUTO_RESCHEDULE.ENABLED,
        startDaysFromNow: CONFIG.AUTO_RESCHEDULE.START_DAYS_FROM_NOW,
        intervalDays: CONFIG.AUTO_RESCHEDULE.INTERVAL_DAYS,
        notifyOnFailure: CONFIG.AUTO_RESCHEDULE.NOTIFY_ON_FAILURE
      });
      Logger.log('');
    } else {
      Logger.log('--- 投稿漏れをチェック中（自動リスケジュール無効）---');
      detectAndMarkMissedTweets();
      Logger.log('');
    }

    // ツイート投稿を実行
    postScheduledTweets();

    // 次回実行時刻を計算
    const now = new Date();
    const triggerDay = new Date();
    
    // 今日の指定時刻を設定
    triggerDay.setHours(CONFIG.TRIGGER_TIME.HOUR);
    triggerDay.setMinutes(CONFIG.TRIGGER_TIME.MINUTE);
    triggerDay.setSeconds(0);
    triggerDay.setMilliseconds(0);
    
    // マージンを考慮した判定用の時刻（指定時刻のN分前）
    const marginMinutes = CONFIG.TRIGGER_TIME.MARGIN_MINUTES || 5;
    const triggerDayWithMargin = new Date(triggerDay);
    triggerDayWithMargin.setMinutes(triggerDayWithMargin.getMinutes() - marginMinutes);
    
    // 判定ロジック:
    // 1. 現在時刻が指定時刻を過ぎている → 翌日に設定
    // 2. 現在時刻がマージン時刻より前 → 当日に設定
    // 3. マージン時刻～指定時刻の間 → 翌日に設定（安全のため）
    
    if (now > triggerDay) {
      // 指定時刻を過ぎている → 翌日
      triggerDay.setDate(triggerDay.getDate() + 1);
      const timePassed = now - new Date(now.getFullYear(), now.getMonth(), now.getDate(), CONFIG.TRIGGER_TIME.HOUR, CONFIG.TRIGGER_TIME.MINUTE);
      const timePassedStr = formatTimeDuration(timePassed);
      Logger.log(`📅 投稿時刻を${timePassedStr}過ぎているため、翌日にトリガーを設定します`);
    } else if (now < triggerDayWithMargin) {
      // マージン時刻より前 → 当日
      const timeUntilTrigger = triggerDay - now;
      const timeUntilStr = formatTimeDuration(timeUntilTrigger);
      Logger.log(`📅 投稿時刻まで${timeUntilStr}あるため、本日にトリガーを設定します`);
    } else {
      // マージン時刻～指定時刻の間 → 翌日（安全のため）
      triggerDay.setDate(triggerDay.getDate() + 1);
      const timeUntilOriginal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), CONFIG.TRIGGER_TIME.HOUR, CONFIG.TRIGGER_TIME.MINUTE) - now;
      const timeUntilStr = formatTimeDuration(timeUntilOriginal);
      Logger.log(`📅 投稿時刻まで${timeUntilStr}（マージン${marginMinutes}分以内）のため、翌日にトリガーを設定します`);
    }

    // 新しいトリガーを作成
    ScriptApp.newTrigger('createTrigger')
      .timeBased()
      .at(triggerDay)
      .create();

    // トリガー設定日時を記録
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('TriggerSetAt', triggerDay.toString());

    Logger.log(`次回実行予定: ${triggerDay.toString()}`);
    
    // 実行までの時間を計算して表示
    const timeUntilTrigger = triggerDay - now;
    const timeUntilStr = formatTimeDuration(timeUntilTrigger);
    Logger.log(`⏰ 次回実行まで: ${timeUntilStr}`);
  } catch (error) {
    Logger.log(`トリガー作成中にエラーが発生しました: ${error.message}`);
  }
}

/**
 * ミリ秒を日時分秒の文字列に変換する
 * @param {number} milliseconds - ミリ秒
 * @returns {string} フォーマットされた時間文字列
 */
function formatTimeDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}日`);
  if (hours > 0) parts.push(`${hours}時間`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
  
  return parts.join('');
}

/**
 * 指定した関数名の既存トリガーを削除する
 * @param {string} functionName - 削除対象の関数名
 */
function deleteExistingTriggers(functionName) {
  const allTriggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  for (const trigger of allTriggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    Logger.log(`既存のトリガーを${deletedCount}個削除しました`);
  }
}
