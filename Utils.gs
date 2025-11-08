// ==================== ユーティリティ関数 ====================

/**
 * 日時を読みやすい形式でフォーマットする
 * @param {Date} date - フォーマットする日時
 * @returns {string} フォーマットされた日時文字列
 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    return '無効な日時';
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * 環境変数を設定する関数
 * 初回セットアップ時に一度だけ実行してください
 * 実行後は、この関数内の値を削除することを推奨します
 */
function setEnvironmentVariables() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // ⚠️ セキュリティ注意: 実際の値を設定した後、このコードからは削除してください
  scriptProperties.setProperties({
    'CLIENT_ID': 'your-actual-client-id-here',
    'CLIENT_SECRET': 'your-actual-client-secret-here'
  });
  
  Logger.log('✅ 環境変数を設定しました');
  Logger.log('⚠️ セキュリティのため、この関数内の実際の値を削除してください');
}

/**
 * 環境変数が正しく設定されているか確認する関数
 */
function checkEnvironmentVariables() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const clientId = scriptProperties.getProperty('CLIENT_ID');
  const clientSecret = scriptProperties.getProperty('CLIENT_SECRET');
  
  Logger.log('=== 環境変数チェック ===');
  Logger.log('CLIENT_ID: ' + (clientId ? '✅ 設定済み (長さ: ' + clientId.length + ')' : '❌ 未設定'));
  Logger.log('CLIENT_SECRET: ' + (clientSecret ? '✅ 設定済み (長さ: ' + clientSecret.length + ')' : '❌ 未設定'));
  
  if (!clientId || !clientSecret) {
    Logger.log('');
    Logger.log('⚠️ 環境変数が未設定です。以下の方法で設定してください:');
    Logger.log('1. 左サイドバーの「⚙️ プロジェクトの設定」をクリック');
    Logger.log('2. 「スクリプト プロパティ」セクションで値を追加');
    Logger.log('   または');
    Logger.log('3. setEnvironmentVariables() 関数を編集・実行');
  }
  
  return clientId && clientSecret;
}

/**
 * 失敗ツイート管理の使い方を表示する
 */
function showFailedTweetManagementGuide() {
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║         失敗ツイート管理機能 - 使い方ガイド              ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');
  
  Logger.log('【1】失敗したツイートの確認');
  Logger.log('  listFailedTweets();');
  Logger.log('  → 失敗したツイートの一覧とエラー内容を表示');
  Logger.log('');
  
  Logger.log('【2】失敗したツイートの再スケジュール（基本）');
  Logger.log('  rescheduleFailedTweets();');
  Logger.log('  → 明日から1日ずつずらして再スケジュール');
  Logger.log('');
  Logger.log('  rescheduleFailedTweets(3, 2);');
  Logger.log('  → 3日後から2日間隔で再スケジュール');
  Logger.log('');
  
  Logger.log('【3】失敗したツイートの再スケジュール（詳細設定）');
  Logger.log('  // 特定の日時から開始');
  Logger.log('  var startDate = new Date("2025-11-15 19:30:00");');
  Logger.log('  rescheduleFailedTweetsAdvanced({ startDate: startDate, intervalDays: 1 });');
  Logger.log('');
  Logger.log('  // 元のスケジュール時刻を保持');
  Logger.log('  rescheduleFailedTweetsAdvanced({ intervalDays: 1, sameTimeAsOriginal: true });');
  Logger.log('');
  
  Logger.log('【4】失敗したツイートを今すぐ投稿');
  Logger.log('  postFailedTweetsNow(5);');
  Logger.log('  → 最大5件の失敗ツイートを今すぐ投稿');
  Logger.log('');
  
  Logger.log('【5】失敗したツイートを手動リトライ');
  Logger.log('  retryFailedTweets();');
  Logger.log('  → すべての失敗ツイートをその場でリトライ');
  Logger.log('');
  
  Logger.log('【6】失敗したツイートのステータスをリセット');
  Logger.log('  resetFailedTweets();');
  Logger.log('  → ステータスを「投稿待ち」に戻す（元の予約時刻を保持）');
  Logger.log('');
  
  Logger.log('【7】投稿漏れの検出');
  Logger.log('  detectAndMarkMissedTweets();');
  Logger.log('  → 時刻を過ぎているのにステータスが空白のものを検出');
  Logger.log('');
  
  Logger.log('【8】システム全体の健全性チェック');
  Logger.log('  healthCheck();');
  Logger.log('  → 全体の統計と問題のあるツイートを表示');
  Logger.log('');
  
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('推奨される使い方:');
  Logger.log('');
  Logger.log('1. まず healthCheck() で全体の状況を確認');
  Logger.log('2. detectAndMarkMissedTweets() で投稿漏れをマーク');
  Logger.log('3. listFailedTweets() で失敗詳細を確認');
  Logger.log('4. 少数の場合: postFailedTweetsNow() で今すぐ投稿');
  Logger.log('5. 多数の場合: rescheduleFailedTweets() で分散投稿');
  Logger.log('═══════════════════════════════════════════════════════════');
}

/**
 * スプレッドシートの構造を確認して表示する
 */
function checkSpreadsheetStructure() {
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║        スプレッドシート構造の確認                         ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');
  
  // 予約シートの確認
  const scheduledSheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (scheduledSheet) {
    Logger.log('【予約シート】');
    const lastRow = scheduledSheet.getLastRow();
    const lastCol = scheduledSheet.getLastColumn();
    const headers = scheduledSheet.getRange(1, 1, 1, Math.max(lastCol, 5)).getValues()[0];
    
    Logger.log(`  シート名: ${CONFIG.SHEET_NAMES.SCHEDULED}`);
    Logger.log(`  データ行数: ${lastRow}行`);
    Logger.log(`  列数: ${lastCol}列`);
    Logger.log(`  ヘッダー:`);
    for (let i = 0; i < Math.min(headers.length, 5); i++) {
      const header = headers[i] || '(空白)';
      Logger.log(`    ${i + 1}列目: ${header}`);
    }
    
    // 期待される構造と比較
    const expectedHeaders = ['投稿日時', '投稿内容', '状態', 'エラーメッセージ', 'リトライ回数'];
    let structureOk = true;
    for (let i = 0; i < 3; i++) {
      if (!headers[i]) {
        structureOk = false;
        Logger.log(`  ⚠️ 警告: ${i + 1}列目（${expectedHeaders[i]}）が空です`);
      }
    }
    
    if (lastCol < 5) {
      Logger.log(`  ℹ️ 情報: 列数が${lastCol}列です。upgradeSpreadsheetStructure()で5列に拡張できます`);
    } else if (structureOk) {
      Logger.log(`  ✅ 構造は正常です`);
    }
  } else {
    Logger.log('【予約シート】');
    Logger.log('  ❌ エラー: シートが見つかりません');
  }
  
  Logger.log('');
  
  // 写真リンクシートの確認
  const photoLinksSheet = getSheet(CONFIG.SHEET_NAMES.PHOTO_LINKS);
  if (photoLinksSheet) {
    Logger.log('【写真リンクシート】');
    const lastRow = photoLinksSheet.getLastRow();
    const lastCol = photoLinksSheet.getLastColumn();
    const headers = photoLinksSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    Logger.log(`  シート名: ${CONFIG.SHEET_NAMES.PHOTO_LINKS}`);
    Logger.log(`  データ行数: ${lastRow}行`);
    Logger.log(`  列数: ${lastCol}列`);
    Logger.log(`  ヘッダー:`);
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i] || '(空白)';
      Logger.log(`    ${i + 1}列目: ${header}`);
    }
    
    // 3列目（リンク列）のデータ数を確認
    if (lastRow > 1) {
      const linksData = photoLinksSheet.getRange(2, 3, lastRow - 1, 1).getValues();
      const validLinks = linksData.filter(row => row[0] && row[0] !== '').length;
      Logger.log(`  有効なリンク数: ${validLinks}件`);
      
      if (validLinks === 0) {
        Logger.log('  ⚠️ 警告: 有効なリンクがありません');
      } else {
        Logger.log('  ✅ リンクデータは正常です');
      }
    } else {
      Logger.log('  ⚠️ 警告: データ行がありません（ヘッダーのみ）');
    }
    
    // 期待される構造の説明
    if (lastCol !== 3) {
      Logger.log('  ℹ️ 期待される構造: 番号 | 詳細 | リンク（3列）');
    }
  } else {
    Logger.log('【写真リンクシート】');
    Logger.log('  ❌ エラー: シートが見つかりません');
    Logger.log('  ℹ️ シート名「写真リンク」で作成してください');
  }
  
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('構造に問題がある場合:');
  Logger.log('');
  Logger.log('1. 予約シートを拡張する場合:');
  Logger.log('   upgradeSpreadsheetStructure();');
  Logger.log('');
  Logger.log('2. 写真リンクシートを作成する場合:');
  Logger.log('   手動で「写真リンク」シートを作成し、');
  Logger.log('   ヘッダーを「番号 | 詳細 | リンク」に設定してください');
  Logger.log('═══════════════════════════════════════════════════════════');
}

