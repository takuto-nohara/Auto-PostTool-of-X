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
