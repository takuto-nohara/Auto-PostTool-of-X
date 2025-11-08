// ==================== Twitter API 送信処理 ====================

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
