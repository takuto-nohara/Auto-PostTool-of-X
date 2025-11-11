// ==================== 設定ヘルパー関数 ====================

/**
 * 1日あたりのツイート数とトリガー時刻を設定する
 * Config.gsの設定を更新し、複数回投稿に対応します
 * 
 * @param {number} tweetsPerDay - 1日あたりのツイート数
 * @param {Array<Object>} triggerTimes - トリガー時刻の配列 [{HOUR: 9, MINUTE: 0}, {HOUR: 18, MINUTE: 0}]
 * 
 * 使用例:
 * // 1日3回投稿（9:00, 15:00, 21:00）
 * setTweetsPerDay(3, [
 *   {HOUR: 9, MINUTE: 0},
 *   {HOUR: 15, MINUTE: 0},
 *   {HOUR: 21, MINUTE: 0}
 * ]);
 */
function setTweetsPerDay(tweetsPerDay, triggerTimes) {
  if (!tweetsPerDay || tweetsPerDay < 1) {
    Logger.log('エラー: tweetsPerDayは1以上の数値を指定してください');
    return;
  }
  
  if (!triggerTimes || !Array.isArray(triggerTimes)) {
    Logger.log('エラー: triggerTimesは配列で指定してください');
    return;
  }
  
  if (triggerTimes.length < tweetsPerDay) {
    Logger.log(`警告: TWEETS_PER_DAY(${tweetsPerDay})に対してTRIGGER_TIMESが不足しています(${triggerTimes.length}個)`);
    Logger.log(`     不足分は既存のトリガー時刻を繰り返し使用します`);
  }
  
  Logger.log('=== ツイート設定の更新 ===');
  Logger.log(`1日あたりのツイート数: ${tweetsPerDay}件`);
  Logger.log('トリガー時刻:');
  triggerTimes.forEach((time, index) => {
    Logger.log(`  ${index + 1}. ${String(time.HOUR).padStart(2, '0')}:${String(time.MINUTE).padStart(2, '0')}`);
  });
  Logger.log('');
  Logger.log('⚠️ 注意: この設定を反映するには、Config.gsファイルを手動で更新する必要があります');
  Logger.log('');
  Logger.log('Config.gsに以下の設定を追加/更新してください:');
  Logger.log('');
  Logger.log(`  TWEETS_PER_DAY: ${tweetsPerDay},`);
  Logger.log('  TRIGGER_TIMES: [');
  triggerTimes.forEach((time, index) => {
    const comma = index < triggerTimes.length - 1 ? ',' : '';
    Logger.log(`    { HOUR: ${time.HOUR}, MINUTE: ${time.MINUTE} }${comma}`);
  });
  Logger.log('  ],');
  Logger.log('');
  Logger.log('設定変更後は、createTrigger()を実行してトリガーを再作成してください');
}

/**
 * 現在の設定を表示する
 */
function showCurrentConfig() {
  const tweetsPerDay = CONFIG.TWEETS_PER_DAY || 1;
  const triggerTimes = CONFIG.TRIGGER_TIMES || [CONFIG.TRIGGER_TIME];
  
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║                    現在の設定                             ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');
  Logger.log(`【投稿頻度】`);
  Logger.log(`  1日あたりのツイート数: ${tweetsPerDay}件`);
  Logger.log('');
  Logger.log(`【トリガー時刻】(${triggerTimes.length}個設定済み)`);
  triggerTimes.forEach((time, index) => {
    Logger.log(`  ${index + 1}. ${String(time.HOUR).padStart(2, '0')}:${String(time.MINUTE).padStart(2, '0')}`);
  });
  Logger.log('');
  Logger.log(`【その他の設定】`);
  Logger.log(`  ツイートプレフィックス: "${CONFIG.TWEET_PREFIX}"`);
  Logger.log(`  スケジュール期間: ${CONFIG.YEARS_TO_SCHEDULE}年後まで`);
  Logger.log(`  マージン: ${CONFIG.MARGIN_MINUTES}分`);
  Logger.log(`  最大リトライ回数: ${CONFIG.RETRY.MAX_ATTEMPTS}回`);
  Logger.log('');
  Logger.log(`【自動リスケジュール】`);
  Logger.log(`  有効: ${CONFIG.AUTO_RESCHEDULE.ENABLED ? 'はい' : 'いいえ'}`);
  if (CONFIG.AUTO_RESCHEDULE.ENABLED) {
    Logger.log(`  開始日: ${CONFIG.AUTO_RESCHEDULE.START_DAYS_FROM_NOW}日後`);
    Logger.log(`  間隔: ${CONFIG.AUTO_RESCHEDULE.INTERVAL_DAYS}日`);
    Logger.log(`  失敗時通知: ${CONFIG.AUTO_RESCHEDULE.NOTIFY_ON_FAILURE ? 'はい' : 'いいえ'}`);
  }
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════════════');
}

/**
 * 設定例を表示する
 */
function showConfigExamples() {
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║                  設定例                                   ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');
  Logger.log('【例1】1日1回投稿（デフォルト）');
  Logger.log('  TWEETS_PER_DAY: 1,');
  Logger.log('  TRIGGER_TIMES: [');
  Logger.log('    { HOUR: 19, MINUTE: 29 }');
  Logger.log('  ],');
  Logger.log('');
  Logger.log('【例2】1日2回投稿（朝と夜）');
  Logger.log('  TWEETS_PER_DAY: 2,');
  Logger.log('  TRIGGER_TIMES: [');
  Logger.log('    { HOUR: 9, MINUTE: 0 },');
  Logger.log('    { HOUR: 21, MINUTE: 0 }');
  Logger.log('  ],');
  Logger.log('');
  Logger.log('【例3】1日3回投稿（朝・昼・夜）');
  Logger.log('  TWEETS_PER_DAY: 3,');
  Logger.log('  TRIGGER_TIMES: [');
  Logger.log('    { HOUR: 9, MINUTE: 0 },');
  Logger.log('    { HOUR: 15, MINUTE: 0 },');
  Logger.log('    { HOUR: 21, MINUTE: 0 }');
  Logger.log('  ],');
  Logger.log('');
  Logger.log('【例4】1日4回投稿（6時間おき）');
  Logger.log('  TWEETS_PER_DAY: 4,');
  Logger.log('  TRIGGER_TIMES: [');
  Logger.log('    { HOUR: 6, MINUTE: 0 },');
  Logger.log('    { HOUR: 12, MINUTE: 0 },');
  Logger.log('    { HOUR: 18, MINUTE: 0 },');
  Logger.log('    { HOUR: 24, MINUTE: 0 }');
  Logger.log('  ],');
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('');
  Logger.log('💡 設定を変更したら:');
  Logger.log('  1. Config.gsファイルを更新');
  Logger.log('  2. createTrigger()を実行してトリガーを再作成');
  Logger.log('  3. 必要に応じてcreateBulkSchedule()で新しいスケジュールを作成');
  Logger.log('');
}

/**
 * 一括スケジュール作成のヘルパー関数
 * 指定した日付から指定日数分のスケジュールを作成します
 * 
 * @param {number} daysToSchedule - スケジュールする日数（デフォルト: 365日）
 * @param {number} startDaysFromNow - 何日後から開始するか（デフォルト: 0 = 今日から）
 */
function createScheduleHelper(daysToSchedule = 365, startDaysFromNow = 0) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + startDaysFromNow);
  startDate.setHours(0, 0, 0, 0);
  
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║            一括スケジュール作成                           ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');
  Logger.log('⚠️ この操作は大量のデータを作成します。実行前に確認してください。');
  Logger.log('');
  Logger.log(`開始日: ${formatDate(startDate)}`);
  Logger.log(`日数: ${daysToSchedule}日`);
  Logger.log(`1日あたり: ${CONFIG.TWEETS_PER_DAY || 1}ツイート`);
  Logger.log(`合計作成数: 約${daysToSchedule * (CONFIG.TWEETS_PER_DAY || 1)}ツイート`);
  Logger.log('');
  
  const confirmed = true; // 実際の環境では確認ダイアログを表示
  
  if (confirmed) {
    createBulkSchedule(startDate, daysToSchedule);
  } else {
    Logger.log('キャンセルされました');
  }
}
