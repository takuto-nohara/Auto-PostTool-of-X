// ==================== トリガー管理 ====================

/**
 * 指定した時間にツイートを送信するためのトリガーを作成します。
 * 翌日の指定時刻に実行されるトリガーを設定します。
 */
function createTrigger() {
  try {
    // 既存のトリガーを削除
    deleteExistingTriggers('createTrigger');

    // 投稿漏れの検出（実行前にチェック）
    Logger.log('--- 投稿漏れをチェック中 ---');
    detectAndMarkMissedTweets();
    Logger.log('');

    // ツイート投稿を実行
    postScheduledTweets();

    // 翌日の指定時刻を設定
    const triggerDay = new Date();
    triggerDay.setDate(triggerDay.getDate() + 1);
    triggerDay.setHours(CONFIG.TRIGGER_TIME.HOUR);
    triggerDay.setMinutes(CONFIG.TRIGGER_TIME.MINUTE);
    triggerDay.setSeconds(0);

    // 新しいトリガーを作成
    ScriptApp.newTrigger('createTrigger')
      .timeBased()
      .at(triggerDay)
      .create();

    // トリガー設定日時を記録
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('TriggerSetAt', triggerDay.toString());

    Logger.log(`次回実行予定: ${triggerDay.toString()}`);
  } catch (error) {
    Logger.log(`トリガー作成中にエラーが発生しました: ${error.message}`);
  }
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
