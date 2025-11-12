// ==================== 投稿漏れ検出 ====================

/**
 * スケジュール時刻を過ぎているのにステータスが空白のツイートを失敗として検出する
 * 自動的に「投稿失敗」ステータスを付与します
 * 
 * @param {number} graceMinutes - 猶予時間（分）。この時間内のものは投稿漏れとしない（デフォルト: 10分）
 */
function detectAndMarkMissedTweets(graceMinutes = 10) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  // 猶予期間を設定（マージン + 追加の猶予時間）
  const graceTime = new Date(now.getTime() - (graceMinutes * 60 * 1000));
  let missedCount = 0;

  Logger.log('=== 投稿漏れの検出を開始 ===');
  Logger.log(`現在時刻: ${formatDate(now)}`);
  Logger.log(`猶予期間: ${graceMinutes}分（${formatDate(graceTime)}より前が対象）`);

  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    // スケジュール時刻が設定されており、内容があり、猶予期間を過ぎており、ステータスが空白の場合
    if (scheduledTime && 
        tweetContent && 
        new Date(scheduledTime) < graceTime && 
        (!status || status === '' || status === CONFIG.STATUS.PENDING)) {
      
      const timeDiff = now - new Date(scheduledTime);
      const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutesDiff = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

      // 失敗としてマーク
      updateTweetStatus(
        sheet, 
        i + 1, 
        CONFIG.STATUS.FAILED, 
        `投稿漏れを検出 (${hoursDiff}時間${minutesDiff}分経過)`, 
        0
      );

      missedCount++;
      Logger.log(`⚠️ 行 ${i + 1}: 投稿漏れを検出`);
      Logger.log(`   予定時刻: ${formatDate(new Date(scheduledTime))}`);
      Logger.log(`   経過時間: ${hoursDiff}時間${minutesDiff}分`);
    }
  }

  Logger.log('\n=== 検出完了 ===');
  if (missedCount > 0) {
    Logger.log(`⚠️ ${missedCount}件の投稿漏れを検出し、失敗ステータスを付与しました`);
  } else {
    Logger.log('✅ 投稿漏れは検出されませんでした');
  }

  return missedCount;
}

/**
 * 投稿漏れの詳細レポートを生成する
 * 検出のみ行い、ステータスは変更しません
 */
function reportMissedTweets() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  const missedTweets = [];

  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║              投稿漏れ詳細レポート                         ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log(`実行時刻: ${formatDate(now)}\n`);

  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    // スケジュール時刻を過ぎているのにステータスが空白または「投稿待ち」
    if (scheduledTime && 
        tweetContent && 
        new Date(scheduledTime) < now && 
        (!status || status === '' || status === CONFIG.STATUS.PENDING)) {
      
      const scheduledDate = new Date(scheduledTime);
      const timeDiff = now - scheduledDate;
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hoursDiff = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutesDiff = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

      missedTweets.push({
        row: i + 1,
        scheduledTime: scheduledDate,
        content: tweetContent,
        status: status || '(空白)',
        daysDiff: daysDiff,
        hoursDiff: hoursDiff,
        minutesDiff: minutesDiff
      });
    }
  }

  if (missedTweets.length === 0) {
    Logger.log('✅ 投稿漏れは見つかりませんでした。');
    Logger.log('   すべてのスケジュールされたツイートは適切に処理されています。');
    return [];
  }

  Logger.log(`⚠️ ${missedTweets.length}件の投稿漏れが見つかりました:\n`);

  // 経過時間でソート（古いものから）
  missedTweets.sort((a, b) => a.scheduledTime - b.scheduledTime);

  missedTweets.forEach((tweet, index) => {
    Logger.log(`【${index + 1}】行 ${tweet.row}`);
    Logger.log(`  予定時刻: ${formatDate(tweet.scheduledTime)}`);
    Logger.log(`  経過時間: ${tweet.daysDiff}日 ${tweet.hoursDiff}時間 ${tweet.minutesDiff}分`);
    Logger.log(`  現在のステータス: ${tweet.status}`);
    Logger.log(`  内容: ${tweet.content.substring(0, 60)}${tweet.content.length > 60 ? '...' : ''}`);
    Logger.log('');
  });

  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('推奨アクション:');
  Logger.log('');
  Logger.log('1. detectAndMarkMissedTweets() を実行');
  Logger.log('   → 投稿漏れに失敗ステータスを付与');
  Logger.log('');
  Logger.log('2. rescheduleFailedTweets() を実行');
  Logger.log('   → 失敗ツイートを再スケジュール');
  Logger.log('');
  Logger.log('3. postFailedTweetsNow(5) を実行');
  Logger.log('   → 今すぐ投稿を試行');
  Logger.log('═══════════════════════════════════════════════════════════');

  return missedTweets;
}

/**
 * 全体の健全性チェックを実行する
 * 投稿漏れ、失敗ツイート、今後の予定を一括確認
 */
function healthCheck() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const now = new Date();

  let totalScheduled = 0;
  let posted = 0;
  let pending = 0;
  let failed = 0;
  let retrying = 0;
  let missed = 0;
  let upcoming = 0;

  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║           ツイート予約システム - 健全性チェック           ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log(`実行時刻: ${formatDate(now)}\n`);

  // 統計を収集
  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    if (scheduledTime && tweetContent) {
      totalScheduled++;
      const schedDate = new Date(scheduledTime);

      if (status === CONFIG.STATUS.POSTED) {
        posted++;
      } else if (status === CONFIG.STATUS.FAILED) {
        failed++;
      } else if (status === CONFIG.STATUS.RETRYING) {
        retrying++;
      } else if (schedDate > now) {
        upcoming++;
        if (!status || status === '' || status === CONFIG.STATUS.PENDING) {
          pending++;
        }
      } else if (schedDate <= now && (!status || status === '' || status === CONFIG.STATUS.PENDING)) {
        missed++;
      }
    }
  }

  // レポート出力
  Logger.log('【統計情報】');
  Logger.log(`  総予約数: ${totalScheduled}件`);
  Logger.log(`  ✅ 投稿済み: ${posted}件`);
  Logger.log(`  📅 今後の予定: ${upcoming}件`);
  Logger.log(`  ⏳ 投稿待ち: ${pending}件`);
  Logger.log(`  ❌ 投稿失敗: ${failed}件`);
  Logger.log(`  🔄 リトライ中: ${retrying}件`);
  Logger.log(`  ⚠️ 投稿漏れ: ${missed}件`);
  Logger.log('');

  // 問題の警告
  if (missed > 0) {
    Logger.log('⚠️ 警告: 投稿漏れが検出されました！');
    Logger.log(`   ${missed}件のツイートが予定時刻を過ぎていますが投稿されていません。`);
    Logger.log('');
  }

  if (failed > 0 || retrying > 0) {
    Logger.log('⚠️ 注意: 失敗したツイートがあります。');
    Logger.log(`   対応が必要なツイート: ${failed + retrying}件`);
    Logger.log('');
  }

  if (missed === 0 && failed === 0 && retrying === 0) {
    Logger.log('✅ すべて正常です！問題は検出されませんでした。');
    Logger.log('');
  }

  // 推奨アクション
  if (missed > 0 || failed > 0 || retrying > 0) {
    Logger.log('【推奨アクション】');
    if (missed > 0) {
      Logger.log('  1. detectAndMarkMissedTweets() - 投稿漏れに失敗ステータスを付与');
    }
    if (failed > 0 || retrying > 0 || missed > 0) {
      Logger.log('  2. listFailedTweets(true) - 失敗ツイートの詳細を確認');
      Logger.log('  3. rescheduleFailedTweets() - 失敗ツイートを再スケジュール');
    }
  }

  Logger.log('═══════════════════════════════════════════════════════════');

  return {
    total: totalScheduled,
    posted: posted,
    pending: pending,
    failed: failed,
    retrying: retrying,
    missed: missed,
    upcoming: upcoming
  };
}
