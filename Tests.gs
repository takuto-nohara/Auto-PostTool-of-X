// ==================== テスト用関数 ====================

/**
 * scheduleTweetForFuture関数のテスト
 * スプレッドシートに新しい予約を追加します。
 */
function testScheduleTweetForFuture() {
  const testDate = new Date();
  testDate.setFullYear(testDate.getFullYear() + CONFIG.YEARS_TO_SCHEDULE);

  const testLink = 'https://example.com/test';
  scheduleTweetForFuture(new Date(), testLink);

  Logger.log('テスト完了: 新しい予約が追加されました');
}

/**
 * getRandomTweetContent関数のテスト
 * ランダムなリンクを取得してログに出力します。
 */
function testGetRandomTweetContent() {
  const linksData = getSpreadsheetDataLinks();

  if (linksData.length === 0) {
    Logger.log('写真リンクシートが見つかりません');
    return;
  }

  const randomContent = getRandomTweetContent(linksData);

  if (randomContent) {
    Logger.log('取得したランダムリンク: ' + randomContent);
  } else {
    Logger.log('ランダムリンクの取得に失敗しました');
  }
}

/**
 * 全体の動作をテストする関数
 */
function testAll() {
  Logger.log('=== 全体テスト開始 ===');
  
  Logger.log('--- 環境変数チェック ---');
  if (!checkEnvironmentVariables()) {
    Logger.log('環境変数が未設定のため、テストを中断します');
    return;
  }
  
  Logger.log('--- 認証状態チェック ---');
  main();
  
  Logger.log('--- スプレッドシートデータ取得テスト ---');
  const scheduledData = getSpreadsheetData();
  Logger.log(`予約データ: ${scheduledData.length}行`);
  
  const linksData = getSpreadsheetDataLinks();
  Logger.log(`写真リンクデータ: ${linksData.length}行`);
  
  Logger.log('--- ランダムリンク取得テスト ---');
  testGetRandomTweetContent();
  
  Logger.log('=== 全体テスト完了 ===');
}

/**
 * ツイート送信機能のテスト
 * 実際にツイートは送信されないテストモード
 */
function testTweetSending() {
  Logger.log('=== ツイート送信テスト開始 ===');
  
  const testContent = 'これはテストツイートです #test ' + new Date().toISOString();
  Logger.log('テスト内容: ' + testContent);
  
  const result = sendTweetWithRetry(testContent, 0);
  
  if (result.success) {
    Logger.log('✅ テスト成功: ツイートが送信されました');
  } else {
    Logger.log(`❌ テスト失敗: ${result.error} (HTTP ${result.responseCode})`);
  }
  
  Logger.log('=== ツイート送信テスト完了 ===');
}

/**
 * エラーハンドリングのテスト
 */
function testErrorHandling() {
  Logger.log('=== エラーハンドリングテスト開始 ===');
  
  // 空のツイート
  Logger.log('--- 空のツイートテスト ---');
  let result = sendTweetWithRetry('', 0);
  Logger.log(`結果: ${result.success ? '成功' : '失敗'} - ${result.error}`);
  
  // 非常に長いツイート（280文字超）
  Logger.log('--- 長文ツイートテスト ---');
  const longTweet = 'あ'.repeat(300);
  result = sendTweetWithRetry(longTweet, 0);
  Logger.log(`結果: ${result.success ? '成功' : '失敗'} - ${result.error}`);
  
  Logger.log('=== エラーハンドリングテスト完了 ===');
}

/**
 * 失敗ツイート管理機能のテスト
 */
function testFailedTweetManagement() {
  Logger.log('=== 失敗ツイート管理機能テスト開始 ===\n');
  
  Logger.log('--- 失敗ツイート一覧の表示 ---');
  const failedTweets = listFailedTweets();
  
  if (failedTweets && failedTweets.length > 0) {
    Logger.log('\n--- 再スケジュールのシミュレーション ---');
    Logger.log('実際には実行しません。実行する場合は以下の関数を使用してください:');
    Logger.log('');
    Logger.log('// 基本的な再スケジュール（明日から1日ずつ）');
    Logger.log('rescheduleFailedTweets();');
    Logger.log('');
    Logger.log('// 3日後から2日間隔で再スケジュール');
    Logger.log('rescheduleFailedTweets(3, 2);');
    Logger.log('');
    Logger.log('// 詳細設定で再スケジュール（元の時刻を保持）');
    Logger.log('rescheduleFailedTweetsAdvanced({ intervalDays: 1, sameTimeAsOriginal: true });');
  }
  
  Logger.log('\n=== 失敗ツイート管理機能テスト完了 ===');
}
