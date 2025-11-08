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
 * 既存のヘッダー（投稿日時、投稿内容、状態）はそのままに、
 * 新しいカラム（エラーメッセージ、リトライ回数）を追加します
 */
function initializeSpreadsheetHeaders() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  // 既存のヘッダーを確認
  const firstRow = sheet.getRange(1, 1, 1, 5).getValues()[0];
  
  // 既存の3列（投稿日時、投稿内容、状態）を確認
  const hasBasicHeaders = firstRow[0] && firstRow[1] && firstRow[2];
  
  if (!hasBasicHeaders) {
    // 基本ヘッダーがない場合は全体を設定
    sheet.getRange(1, 1, 1, 5).setValues([[
      '投稿日時',
      '投稿内容',
      '状態',
      'エラーメッセージ',
      'リトライ回数'
    ]]);
    
    // ヘッダー行を太字にする
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    
    Logger.log('✅ ヘッダー行を初期化しました（全5列）');
  } else {
    // 既存ヘッダーがある場合は、4-5列目のみ追加
    if (!firstRow[3]) {
      sheet.getRange(1, 4).setValue('エラーメッセージ');
      sheet.getRange(1, 4).setFontWeight('bold');
      Logger.log('✅ 「エラーメッセージ」列を追加しました');
    }
    if (!firstRow[4]) {
      sheet.getRange(1, 5).setValue('リトライ回数');
      sheet.getRange(1, 5).setFontWeight('bold');
      Logger.log('✅ 「リトライ回数」列を追加しました');
    }
    
    if (firstRow[3] && firstRow[4]) {
      Logger.log('ℹ️ すべてのヘッダー列は既に存在します');
    }
  }
}

/**
 * 過去の投稿データに新しいヘッダー情報（エラーメッセージ、リトライ回数）を追加する
 * 既存の3列（投稿日時、投稿内容、状態）のデータは保持します
 */
function addHeaderColumnsToExistingData() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('エラー: 予約シートが取得できませんでした');
    return;
  }

  Logger.log('=== 既存データへのヘッダー追加開始 ===');

  // 現在のデータ範囲を取得
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  Logger.log(`現在のデータ範囲: ${lastRow}行 × ${lastCol}列`);

  // 既存のヘッダーを確認
  const headerRow = sheet.getRange(1, 1, 1, Math.max(lastCol, 5)).getValues()[0];
  
  // ヘッダーが3列しかない場合、4-5列目を追加
  if (lastCol < 5) {
    Logger.log('新しいヘッダー列を追加中...');
    
    if (!headerRow[3]) {
      sheet.getRange(1, 4).setValue('エラーメッセージ').setFontWeight('bold');
      Logger.log('✅ ヘッダー「エラーメッセージ」を追加');
    }
    
    if (!headerRow[4]) {
      sheet.getRange(1, 5).setValue('リトライ回数').setFontWeight('bold');
      Logger.log('✅ ヘッダー「リトライ回数」を追加');
    }
  }

  // データ行に空の値を初期化（2行目以降）
  if (lastRow > 1) {
    let updatedCount = 0;
    
    for (let i = 2; i <= lastRow; i++) {
      const row = sheet.getRange(i, 1, 1, Math.max(lastCol, 5)).getValues()[0];
      
      // 投稿日時と投稿内容が存在する行のみ処理
      if (row[0] && row[1]) {
        let needsUpdate = false;
        
        // エラーメッセージ列が空の場合
        if (!row[3]) {
          sheet.getRange(i, 4).setValue('');
          needsUpdate = true;
        }
        
        // リトライ回数列が空の場合
        if (!row[4]) {
          sheet.getRange(i, 5).setValue(0);
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          updatedCount++;
        }
      }
    }
    
    Logger.log(`✅ ${updatedCount}行のデータに新しい列を初期化しました`);
  }

  Logger.log('=== 既存データへのヘッダー追加完了 ===');
  Logger.log('');
  Logger.log('【処理結果】');
  Logger.log(`  総行数: ${lastRow}行`);
  Logger.log(`  列数: 3列 → 5列`);
  Logger.log('  追加列: エラーメッセージ, リトライ回数');
  Logger.log('');
  Logger.log('既存データは保持されています。');
}

/**
 * スプレッドシート構造の確認と修正を一括で実行する
 * 既存データを保持しながら、新しい列構造に対応させます
 */
function upgradeSpreadsheetStructure() {
  Logger.log('╔═══════════════════════════════════════════════════════════╗');
  Logger.log('║     スプレッドシート構造のアップグレード実行              ║');
  Logger.log('╚═══════════════════════════════════════════════════════════╝');
  Logger.log('');
  
  const sheet = getSheet(CONFIG.SHEET_NAMES.SCHEDULED);
  if (!sheet) {
    Logger.log('❌ エラー: 予約シートが取得できませんでした');
    return;
  }

  // ステップ1: 現在の構造を確認
  Logger.log('【ステップ1】現在の構造を確認');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, Math.max(lastCol, 5)).getValues()[0];
  
  Logger.log(`  現在の行数: ${lastRow}`);
  Logger.log(`  現在の列数: ${lastCol}`);
  Logger.log(`  現在のヘッダー: ${headerRow.slice(0, lastCol).filter(h => h).join(', ')}`);
  Logger.log('');

  // ステップ2: バックアップの推奨
  Logger.log('【ステップ2】安全性確認');
  Logger.log('  ⚠️  念のため、スプレッドシートのコピーを作成することを推奨します');
  Logger.log('  （ファイル → コピーを作成）');
  Logger.log('');

  // ステップ3: ヘッダーの追加
  Logger.log('【ステップ3】ヘッダーの追加');
  initializeSpreadsheetHeaders();
  Logger.log('');

  // ステップ4: 既存データへの列追加
  Logger.log('【ステップ4】既存データへの列追加');
  addHeaderColumnsToExistingData();
  Logger.log('');

  // ステップ5: 最終確認
  Logger.log('【ステップ5】最終確認');
  const finalLastCol = sheet.getLastColumn();
  const finalHeaderRow = sheet.getRange(1, 1, 1, 5).getValues()[0];
  
  Logger.log(`  更新後の列数: ${finalLastCol}`);
  Logger.log(`  更新後のヘッダー: ${finalHeaderRow.filter(h => h).join(', ')}`);
  Logger.log('');

  if (finalLastCol >= 5 && finalHeaderRow[3] && finalHeaderRow[4]) {
    Logger.log('✅ スプレッドシート構造のアップグレードが完了しました！');
    Logger.log('');
    Logger.log('【構造】');
    Logger.log('  列1: 投稿日時');
    Logger.log('  列2: 投稿内容');
    Logger.log('  列3: 状態');
    Logger.log('  列4: エラーメッセージ（新規追加）');
    Logger.log('  列5: リトライ回数（新規追加）');
  } else {
    Logger.log('⚠️ 一部の列が正しく追加されていない可能性があります');
    Logger.log('   手動で確認してください');
  }
  
  Logger.log('═══════════════════════════════════════════════════════════');
}

