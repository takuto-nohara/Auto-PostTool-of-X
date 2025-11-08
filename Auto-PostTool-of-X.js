// ==================== 設定 ====================

/**
 * 環境変数を取得する関数
 * スクリプトプロパティから機密情報を安全に取得します
 */
function getEnvironmentVariables() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    CLIENT_ID: scriptProperties.getProperty('CLIENT_ID'),
    CLIENT_SECRET: scriptProperties.getProperty('CLIENT_SECRET')
  };
}

const CONFIG = {
  // 環境変数から取得（スクリプトプロパティに設定が必要）
  get CLIENT_ID() {
    return PropertiesService.getScriptProperties().getProperty('CLIENT_ID') || '{CLIENT_ID}';
  },
  get CLIENT_SECRET() {
    return PropertiesService.getScriptProperties().getProperty('CLIENT_SECRET') || '{CLIENT_SECRET}';
  },
  SHEET_NAMES: {
    SCHEDULED: '予約',
    PHOTO_LINKS: '写真リンク'
  },
  COLUMNS: {
    SCHEDULED_TIME: 0,
    TWEET_CONTENT: 1,
    STATUS: 2,
    ERROR_MESSAGE: 3,
    RETRY_COUNT: 4
  },
  STATUS: {
    POSTED: '投稿済',
    PENDING: '投稿待ち',
    FAILED: '投稿失敗',
    RETRYING: 'リトライ中'
  },
  RETRY: {
    MAX_ATTEMPTS: 3,           // 最大リトライ回数
    INITIAL_DELAY: 1000,       // 初回リトライまでの待機時間(ミリ秒)
    BACKOFF_MULTIPLIER: 2      // リトライごとの待機時間の倍率
  },
  TWEET_PREFIX: 'チャレラ！開けロイト市警だ！',
  YEARS_TO_SCHEDULE: 14,
  TRIGGER_TIME: {
    HOUR: 19,
    MINUTE: 30
  }
};

// ==================== OAuth2認証関連 ====================

/**
 * Twitter APIに接続するためのOAuth2サービスを設定し、返します。
 * @returns {OAuth2.Service} OAuth2サービスオブジェクト
 */
function getService() {
  pkceChallengeVerifier();
  const userProps = PropertiesService.getUserProperties();
  const codeVerifier = userProps.getProperty('code_verifier');
  const codeChallenge = userProps.getProperty('code_challenge');

  return OAuth2.createService('twitter')
    .setAuthorizationBaseUrl('https://twitter.com/i/oauth2/authorize')
    .setTokenUrl(`https://api.twitter.com/2/oauth2/token?code_verifier=${codeVerifier}`)
    .setClientId(CONFIG.CLIENT_ID)
    .setClientSecret(CONFIG.CLIENT_SECRET)
    .setCallbackFunction('authCallback')
    .setPropertyStore(userProps)
    .setScope('users.read tweet.read tweet.write offline.access')
    .setParam('response_type', 'code')
    .setParam('code_challenge_method', 'S256')
    .setParam('code_challenge', codeChallenge)
    .setTokenHeaders({
      'Authorization': 'Basic ' + Utilities.base64Encode(`${CONFIG.CLIENT_ID}:${CONFIG.CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    });
}


/**
 * OAuth2認証プロセスの一環として、認証後に呼び出される関数です。
 * @param {Object} request - 認証リクエストオブジェクト
 * @returns {HtmlOutput} 認証結果のHTMLレスポンス
 */
function authCallback(request) {
  const service = getService();
  const authorized = service.handleCallback(request);

  if (authorized) {
    Logger.log('OAuth2認証に成功しました');
    return HtmlService.createHtmlOutput('Success! 認証が完了しました。');
  } else {
    Logger.log('OAuth2認証に失敗しました');
    return HtmlService.createHtmlOutput('Denied. 認証が拒否されました。');
  }
}

/**
 * PKCE認証フローに必要なコードチャレンジとコード検証値を生成します。
 */
function pkceChallengeVerifier() {
  const userProps = PropertiesService.getUserProperties();
  
  if (userProps.getProperty('code_verifier')) {
    return; // 既に生成済みの場合は処理をスキップ
  }

  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';

  // コード検証値の生成(128文字)
  for (let i = 0; i < 128; i++) {
    verifier += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  // コードチャレンジの生成(SHA-256ハッシュ)
  const sha256Hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier);
  const challenge = Utilities.base64Encode(sha256Hash)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  userProps.setProperty('code_verifier', verifier);
  userProps.setProperty('code_challenge', challenge);
  Logger.log('PKCE認証用のコードを生成しました');
}

/**
 * OAuth2認証プロセスに使用されるリダイレクトURIをログに記録します。
 */
function logRedirectUri() {
  const service = getService();
  Logger.log('リダイレクトURI: ' + service.getRedirectUri());
}

/**
 * スクリプトのメイン関数。OAuth2サービスの状態をチェックします。
 */
function main() {
  const service = getService();

  if (service.hasAccess()) {
    Logger.log('既に認証済みです');
  } else {
    const authorizationUrl = service.getAuthorizationUrl();
    Logger.log('以下のURLを開いて認証してください: %s', authorizationUrl);
  }
}



// ==================== スプレッドシート操作 ====================

/**
 * スプレッドシートを取得するヘルパー関数
 * @param {string} sheetName - シート名
 * @returns {Sheet|null} シートオブジェクト
 */
function getSheet(sheetName) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`エラー: シート「${sheetName}」が見つかりません`);
      return null;
    }
    return sheet;
  } catch (error) {
    Logger.log(`エラー: シート取得時にエラーが発生しました: ${error.message}`);
    return null;
  }
}

/**
 * Googleスプレッドシートから予約データを取得します。
 * @returns {Array<Array>} スプレッドシートのデータ配列
 */
function getSpreadsheetData() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) return [];
  
  return sheet.getDataRange().getValues();
}

/**
 * Googleスプレッドシートから写真リンクデータを取得します。
 * @returns {Array<Array>} スプレッドシートのデータ配列
 */
function getSpreadsheetDataLinks() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.PHOTO_LINKS);
  if (!sheet) return [];
  
  return sheet.getDataRange().getValues();
}

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

    // スケジュール時刻を過ぎており、まだ投稿されていない場合
    if (new Date(scheduledTime) <= now && status !== CONFIG.STATUS.POSTED) {
      
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
 * ツイートのステータスを更新する
 * @param {Sheet} sheet - スプレッドシートオブジェクト
 * @param {number} row - 行番号（1始まり）
 * @param {string} status - ステータス
 * @param {string} errorMessage - エラーメッセージ
 * @param {number} retryCount - リトライ回数
 */
function updateTweetStatus(sheet, row, status, errorMessage, retryCount) {
  try {
    sheet.getRange(row, CONFIG.COLUMNS.STATUS + 1).setValue(status);
    
    // エラーメッセージ列が存在する場合は更新
    if (errorMessage) {
      sheet.getRange(row, CONFIG.COLUMNS.ERROR_MESSAGE + 1).setValue(errorMessage);
    }
    
    // リトライ回数列が存在する場合は更新
    if (retryCount !== undefined) {
      sheet.getRange(row, CONFIG.COLUMNS.RETRY_COUNT + 1).setValue(retryCount);
    }
  } catch (error) {
    Logger.log(`ステータス更新エラー (行${row}): ${error.message}`);
  }
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
  for (let i = 1; i < linksData.length; i++) {
    const link = linksData[i][2]; // 3列目がリンク
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
 * 指定された内容でツイートを送信します（リトライ機能付き）
 * @param {string} tweetContent - ツイート内容
 * @param {number} retryCount - 現在のリトライ回数
 * @returns {Object} {success: boolean, error: string, responseCode: number}
 */
function sendTweetWithRetry(tweetContent, retryCount = 0) {
  if (!tweetContent) {
    return { success: false, error: 'ツイート内容が空です', responseCode: null };
  }

  const service = getService();

  if (!service.hasAccess()) {
    const authorizationUrl = service.getAuthorizationUrl();
    Logger.log('認証が必要です。以下のURLを開いてください: %s', authorizationUrl);
    return { success: false, error: '認証が必要です', responseCode: 401 };
  }

  // リトライの場合は待機時間を設定（指数バックオフ）
  if (retryCount > 0) {
    const delay = CONFIG.RETRY.INITIAL_DELAY * Math.pow(CONFIG.RETRY.BACKOFF_MULTIPLIER, retryCount - 1);
    Logger.log(`リトライ前に${delay}ミリ秒待機します...`);
    Utilities.sleep(delay);
  }

  try {
    const url = 'https://api.twitter.com/2/tweets';
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + service.getAccessToken() },
      muteHttpExceptions: true,
      payload: JSON.stringify({ text: tweetContent })
    });

    const responseCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    if (responseCode === 201) {
      Logger.log('✅ ツイート送信成功: ' + (result.data?.id || 'ID不明'));
      return { success: true, error: null, responseCode: responseCode };
    } else {
      // エラーの詳細を解析
      const errorDetail = parseTwitterError(result, responseCode);
      Logger.log(`❌ ツイート送信失敗 (HTTP ${responseCode}): ${errorDetail}`);
      return { success: false, error: errorDetail, responseCode: responseCode };
    }
  } catch (error) {
    const errorMessage = `例外エラー: ${error.message}`;
    Logger.log(`❌ ツイート送信中に例外が発生: ${errorMessage}`);
    return { success: false, error: errorMessage, responseCode: null };
  }
}

/**
 * Twitter APIのエラーレスポンスを解析する
 * @param {Object} result - APIレスポンス
 * @param {number} responseCode - HTTPステータスコード
 * @returns {string} エラーメッセージ
 */
function parseTwitterError(result, responseCode) {
  // Twitter API v2のエラー形式
  if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
    const error = result.errors[0];
    return `${error.message || error.title || 'エラー詳細不明'}`;
  }

  // 詳細情報がある場合
  if (result.detail) {
    return result.detail;
  }

  // HTTPステータスコードに基づくメッセージ
  switch (responseCode) {
    case 400:
      return 'リクエストが不正です';
    case 401:
      return '認証エラー - 再認証が必要です';
    case 403:
      return 'アクセス権限がありません';
    case 429:
      return 'レート制限に達しました - しばらく待ってから再試行してください';
    case 500:
    case 502:
    case 503:
    case 504:
      return `Twitter APIサーバーエラー (${responseCode})`;
    default:
      return `不明なエラー (HTTP ${responseCode})`;
  }
}

/**
 * 指定された内容でツイートを送信します（後方互換性のため残す）
 * @param {string} tweetContent - ツイート内容
 * @returns {boolean} 送信成功した場合true
 * @deprecated sendTweetWithRetryを使用してください
 */
function sendTweet(tweetContent) {
  const result = sendTweetWithRetry(tweetContent, 0);
  return result.success;
}



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

// ==================== テスト用関数 ====================

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
 * 失敗したツイートのスケジュールを1日ずつずらして再配置する
 * 複数の失敗ツイートを適切な間隔で再投稿できるようにします
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

  Logger.log('=== 失敗したツイートの再スケジュール開始 ===');

  // 失敗したツイートを収集
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && 
        tweetContent && scheduledTime) {
      failedTweets.push({
        row: i + 1,
        originalTime: new Date(scheduledTime),
        content: tweetContent
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('ℹ️ 再スケジュールが必要な失敗ツイートはありません');
    return;
  }

  Logger.log(`📋 ${failedTweets.length}件の失敗ツイートを発見しました`);

  // 失敗したツイートを元のスケジュール時刻でソート
  failedTweets.sort((a, b) => a.originalTime - b.originalTime);

  // 基準時刻を設定（今日の同じ時刻）
  const baseTime = new Date();
  baseTime.setDate(baseTime.getDate() + startDaysFromNow);
  baseTime.setHours(CONFIG.TRIGGER_TIME.HOUR);
  baseTime.setMinutes(CONFIG.TRIGGER_TIME.MINUTE);
  baseTime.setSeconds(0);
  baseTime.setMilliseconds(0);

  // 各失敗ツイートを1日ずつずらして再スケジュール
  for (let i = 0; i < failedTweets.length; i++) {
    const tweet = failedTweets[i];
    const newScheduledTime = new Date(baseTime);
    newScheduledTime.setDate(newScheduledTime.getDate() + (i * intervalDays));

    // スケジュール時刻を更新
    sheet.getRange(tweet.row, CONFIG.COLUMNS.SCHEDULED_TIME + 1).setValue(newScheduledTime);
    
    // ステータスをリセット
    updateTweetStatus(sheet, tweet.row, CONFIG.STATUS.PENDING, '再スケジュール済み', 0);

    Logger.log(`行 ${tweet.row}: ${formatDate(tweet.originalTime)} → ${formatDate(newScheduledTime)}`);
  }

  Logger.log('=== 再スケジュール完了 ===');
  Logger.log(`✅ ${failedTweets.length}件のツイートを再スケジュールしました`);
  Logger.log(`📅 スケジュール範囲: ${formatDate(baseTime)} ～ ${formatDate(new Date(baseTime.getTime() + (failedTweets.length - 1) * intervalDays * 24 * 60 * 60 * 1000))}`);
}

/**
 * 失敗したツイートを指定した日時から順次再配置する（詳細版）
 * @param {Object} options - オプション設定
 *   - startDate: Date - 開始日時（デフォルト: 明日の設定時刻）
 *   - intervalDays: number - 各ツイート間の間隔（日数）（デフォルト: 1）
 *   - sameTimeAsOriginal: boolean - 元のスケジュール時刻を保持するか（デフォルト: false）
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
    sameTimeAsOriginal: options.sameTimeAsOriginal || false
  };

  const rows = sheet.getDataRange().getValues();
  const failedTweets = [];

  Logger.log('=== 失敗したツイートの詳細再スケジュール開始 ===');
  Logger.log(`設定: 開始日時=${formatDate(config.startDate)}, 間隔=${config.intervalDays}日, 元の時刻保持=${config.sameTimeAsOriginal}`);

  // 失敗したツイートを収集
  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][CONFIG.COLUMNS.STATUS];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];

    if ((status === CONFIG.STATUS.FAILED || status === CONFIG.STATUS.RETRYING) && 
        tweetContent && scheduledTime) {
      failedTweets.push({
        row: i + 1,
        originalTime: new Date(scheduledTime),
        content: tweetContent
      });
    }
  }

  if (failedTweets.length === 0) {
    Logger.log('ℹ️ 再スケジュールが必要な失敗ツイートはありません');
    return;
  }

  Logger.log(`📋 ${failedTweets.length}件の失敗ツイートを発見しました`);

  // 失敗したツイートを元のスケジュール時刻でソート
  failedTweets.sort((a, b) => a.originalTime - b.originalTime);

  // 各失敗ツイートを再スケジュール
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

    Logger.log(`行 ${tweet.row}: ${formatDate(tweet.originalTime)} → ${formatDate(newScheduledTime)}`);
  }

  Logger.log('=== 詳細再スケジュール完了 ===');
  Logger.log(`✅ ${failedTweets.length}件のツイートを再スケジュールしました`);
}

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
 * スプレッドシートのヘッダー行を初期化する
 * 初回セットアップ時に実行してください
 */
function initializeSpreadsheetHeaders() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  // 既存のヘッダーを確認
  const firstRow = sheet.getRange(1, 1, 1, 5).getValues()[0];
  
  // ヘッダーが空の場合のみ設定
  if (!firstRow[0] || firstRow[0] === '') {
    sheet.getRange(1, 1, 1, 5).setValues([[
      '予約時刻',
      'ツイート内容',
      'ステータス',
      'エラーメッセージ',
      'リトライ回数'
    ]]);
    
    // ヘッダー行を太字にする
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    
    Logger.log('✅ ヘッダー行を初期化しました');
  } else {
    Logger.log('ℹ️ ヘッダー行は既に存在します');
  }
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

/**
 * スケジュール時刻を過ぎているのにステータスが空白のツイートを失敗として検出する
 * 自動的に「投稿失敗」ステータスを付与します
 */
function detectAndMarkMissedTweets() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  let missedCount = 0;

  Logger.log('=== 投稿漏れの検出を開始 ===');
  Logger.log(`現在時刻: ${formatDate(now)}`);

  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    // スケジュール時刻が設定されており、内容があり、現在時刻を過ぎており、ステータスが空白の場合
    if (scheduledTime && 
        tweetContent && 
        new Date(scheduledTime) < now && 
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
  
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('推奨される使い方:');
  Logger.log('');
  Logger.log('1. まず listFailedTweets() で状況を確認');
  Logger.log('2. 少数の場合: postFailedTweetsNow() で今すぐ投稿');
  Logger.log('3. 多数の場合: rescheduleFailedTweets() で分散投稿');
  Logger.log('4. エラーが解決した場合: resetFailedTweets() でリセット');
  Logger.log('═══════════════════════════════════════════════════════════');
}


