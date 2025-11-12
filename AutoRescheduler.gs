// ==================== 自動リスケジュール機能 ====================

/**
 * 投稿失敗を検出し、自動的に再スケジュールを実行する
 * トリガーから定期的に呼び出されることを想定しています
 * 
 * @param {Object} options - オプション設定
 *   - autoReschedule: boolean - 自動再スケジュールを実行するか（デフォルト: true）
 *   - startDaysFromNow: number - 再スケジュール開始日（デフォルト: 1）
 *   - intervalDays: number - 再スケジュール間隔（デフォルト: 1）
 *   - notifyOnFailure: boolean - 失敗時に通知するか（デフォルト: true）
 * @returns {Object} 処理結果
 */
function autoDetectAndReschedule(options = {}) {
  const config = {
    autoReschedule: options.autoReschedule !== undefined ? options.autoReschedule : true,
    startDaysFromNow: options.startDaysFromNow || 1,
    intervalDays: options.intervalDays || 1,
    notifyOnFailure: options.notifyOnFailure !== undefined ? options.notifyOnFailure : true
  };

  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║        投稿失敗の自動検出と再スケジュール                 ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log(`実行時刻: ${formatDate(new Date())}`);
  Logger.log(`設定: 自動再スケジュール=${config.autoReschedule}, 開始=${config.startDaysFromNow}日後, 間隔=${config.intervalDays}日\n`);

  const result = {
    missedCount: 0,
    failedCount: 0,
    rescheduled: false,
    message: ''
  };

  // ステップ1: 投稿漏れを検出
  Logger.log('【ステップ1】投稿漏れの検出');
  // 猶予時間は長めに設定（投稿処理が実行される前に失敗扱いしないため）
  const missedCount = detectAndMarkMissedTweets(30);
  result.missedCount = missedCount;
  Logger.log('');

  // ステップ2: 失敗ツイートをカウント
  Logger.log('【ステップ2】失敗ツイートの確認');
  const failedTweets = getFailedTweets();
  result.failedCount = failedTweets.length;
  
  if (failedTweets.length === 0) {
    Logger.log('✅ 失敗ツイートはありません');
    result.message = '失敗ツイートなし';
    Logger.log('═══════════════════════════════════════════════════════════');
    return result;
  }

  Logger.log(`⚠️ ${failedTweets.length}件の失敗ツイートが見つかりました`);
  
  // 失敗ツイートの詳細をログ出力
  failedTweets.forEach((tweet, index) => {
    if (index < 5) { // 最初の5件のみ表示
      Logger.log(`  ${index + 1}. 行${tweet.row}: ${formatDate(tweet.originalTime)} - ${tweet.content.substring(0, 30)}...`);
    }
  });
  if (failedTweets.length > 5) {
    Logger.log(`  ... 他 ${failedTweets.length - 5}件`);
  }
  Logger.log('');

  // ステップ3: 自動再スケジュール
  if (config.autoReschedule) {
    Logger.log('【ステップ3】自動再スケジュールの実行');
    try {
      rescheduleFailedTweets(config.startDaysFromNow, config.intervalDays);
      result.rescheduled = true;
      result.message = `${failedTweets.length}件を自動再スケジュール成功`;
      Logger.log(`✅ ${failedTweets.length}件の失敗ツイートを自動再スケジュールしました`);
    } catch (error) {
      Logger.log(`❌ 自動再スケジュール中にエラーが発生: ${error.message}`);
      result.message = `自動再スケジュール失敗: ${error.message}`;
      
      if (config.notifyOnFailure) {
        notifyFailure(failedTweets.length, error.message);
      }
    }
  } else {
    Logger.log('【ステップ3】自動再スケジュールはスキップされました（設定により無効）');
    result.message = `${failedTweets.length}件の失敗を検出（手動対応が必要）`;
  }

  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('【処理結果サマリー】');
  Logger.log(`  投稿漏れ検出: ${result.missedCount}件`);
  Logger.log(`  失敗ツイート: ${result.failedCount}件`);
  Logger.log(`  再スケジュール: ${result.rescheduled ? '実行済み' : '未実行'}`);
  Logger.log(`  メッセージ: ${result.message}`);
  Logger.log('═══════════════════════════════════════════════════════════');

  // スクリプトプロパティに最終実行時刻を記録
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('LastAutoReschedule', new Date().toString());
  scriptProperties.setProperty('LastAutoRescheduleResult', JSON.stringify(result));

  return result;
}

/**
 * 失敗ツイートを取得する（内部用ヘルパー関数）
 * @returns {Array} 失敗ツイートの配列
 */
function getFailedTweets() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  const failedTweets = [];

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && 
        tweetContent && scheduledTime) {
      failedTweets.push({
        row: i + 1,
        originalTime: new Date(scheduledTime),
        content: tweetContent,
        status: status
      });
    }
  }

  return failedTweets;
}

/**
 * 失敗通知を行う（将来的にメール通知などに拡張可能）
 * @param {number} failedCount - 失敗件数
 * @param {string} errorMessage - エラーメッセージ
 */
function notifyFailure(failedCount, errorMessage) {
  Logger.log('');
  Logger.log('🔔 ═════════════ 失敗通知 ═════════════');
  Logger.log(`   ${failedCount}件の投稿失敗を検出しました`);
  Logger.log(`   エラー: ${errorMessage}`);
  Logger.log(`   手動での確認と対応をお願いします`);
  Logger.log('═══════════════════════════════════════');
  
  // 将来的にはここでメール通知やSlack通知などを追加可能
  // 例: MailApp.sendEmail(...)
}

/**
 * 自動リスケジュールの設定を確認・表示する
 */
function showAutoRescheduleStatus() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const lastRun = scriptProperties.getProperty('LastAutoReschedule');
  const lastResult = scriptProperties.getProperty('LastAutoRescheduleResult');

  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║          自動リスケジュール - ステータス                  ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');

  if (lastRun) {
    Logger.log(`最終実行時刻: ${lastRun}`);
    
    if (lastResult) {
      try {
        const result = JSON.parse(lastResult);
        Logger.log('');
        Logger.log('【最終実行結果】');
        Logger.log(`  投稿漏れ検出: ${result.missedCount}件`);
        Logger.log(`  失敗ツイート: ${result.failedCount}件`);
        Logger.log(`  再スケジュール: ${result.rescheduled ? '実行済み' : '未実行'}`);
        Logger.log(`  メッセージ: ${result.message}`);
      } catch (e) {
        Logger.log('結果の解析に失敗しました');
      }
    }
  } else {
    Logger.log('⚠️ まだ一度も実行されていません');
  }

  Logger.log('');
  Logger.log('【現在の設定】');
  Logger.log('  Config.gsで設定を確認してください');
  Logger.log('');
  Logger.log('【使用方法】');
  Logger.log('  // デフォルト設定で実行');
  Logger.log('  autoDetectAndReschedule();');
  Logger.log('');
  Logger.log('  // カスタム設定で実行');
  Logger.log('  autoDetectAndReschedule({');
  Logger.log('    autoReschedule: true,    // 自動再スケジュール有効');
  Logger.log('    startDaysFromNow: 2,     // 2日後から開始');
  Logger.log('    intervalDays: 1,         // 1日間隔');
  Logger.log('    notifyOnFailure: true    // 失敗時に通知');
  Logger.log('  });');
  Logger.log('');
  Logger.log('  // 検出のみ（再スケジュールなし）');
  Logger.log('  autoDetectAndReschedule({ autoReschedule: false });');
  Logger.log('═══════════════════════════════════════════════════════════');
}

/**
 * 自動リスケジュールの履歴をクリアする
 */
function clearAutoRescheduleHistory() {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.deleteProperty('LastAutoReschedule');
  scriptProperties.deleteProperty('LastAutoRescheduleResult');
  Logger.log('✅ 自動リスケジュールの履歴をクリアしました');
}
