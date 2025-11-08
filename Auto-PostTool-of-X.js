// ==================== 設定 ====================
const CONFIG = {
  CLIENT_ID: '{CLIENT_ID}',
  CLIENT_SECRET: '{CLIENT_SECRET}',
  SHEET_NAMES: {
    SCHEDULED: '予約',
    PHOTO_LINKS: '写真リンク'
  },
  COLUMNS: {
    SCHEDULED_TIME: 0,
    TWEET_CONTENT: 1,
    STATUS: 2
  },
  STATUS: {
    POSTED: '投稿済'
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

  // ヘッダー行をスキップして各行を処理
  for (let i = 1; i < rows.length; i++) {
    const scheduledTime = rows[i][CONFIG.COLUMNS.SCHEDULED_TIME];
    const tweetContent = rows[i][CONFIG.COLUMNS.TWEET_CONTENT];
    const status = rows[i][CONFIG.COLUMNS.STATUS];

    // 投稿条件をチェック
    if (scheduledTime && 
        tweetContent && 
        new Date(scheduledTime) <= now && 
        status !== CONFIG.STATUS.POSTED) {
      
      if (sendTweet(tweetContent)) {
        // ステータスを「投稿済み」に更新
        sheet.getRange(i + 1, CONFIG.COLUMNS.STATUS + 1).setValue(CONFIG.STATUS.POSTED);
        postedCount++;

        // 新しい予約を作成
        const randomTweet = getRandomTweetContent(links);
        if (randomTweet) {
          scheduleTweetForFuture(scheduledTime, randomTweet);
        }
      }
    }
  }

  Logger.log(`投稿完了: ${postedCount}件のツイートを投稿しました`);
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
 * 指定された内容でツイートを送信します。
 * @param {string} tweetContent - ツイート内容
 * @returns {boolean} 送信成功した場合true
 */
function sendTweet(tweetContent) {
  if (!tweetContent) {
    Logger.log('エラー: ツイート内容が空です');
    return false;
  }

  const service = getService();

  if (!service.hasAccess()) {
    const authorizationUrl = service.getAuthorizationUrl();
    Logger.log('認証が必要です。以下のURLを開いてください: %s', authorizationUrl);
    return false;
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

    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 201) {
      Logger.log('ツイート送信成功: ' + JSON.stringify(result, null, 2));
      return true;
    } else {
      Logger.log('ツイート送信失敗: ' + JSON.stringify(result, null, 2));
      return false;
    }
  } catch (error) {
    Logger.log('ツイート送信中にエラーが発生しました: ' + error.message);
    return false;
  }
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

