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
