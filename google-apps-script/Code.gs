const SHEET_NAME = 'Inspection_Data';
const VALUE_SCHEMA_VERSION = 2;

function valueSchemaKey_(sheet) {
  return 'valueSchema:' + sheet.getParent().getId() + ':' + sheet.getSheetId();
}

function ensureValueHeaders_(sheet) {
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(String);
  const missing = Array.from({ length: 13 }, (_, i) => 'Value ' + (i + 1)).filter(h => !headers.includes(h));
  if (headers.length + missing.length > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length + missing.length - sheet.getMaxColumns());
  }
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  return headers;
}

// Convert the previous eight-slot layout. Blank is never interpreted as zero.
function upgradeLegacyMeasurement_(item) {
  const result = Object.assign({}, item);
  for (let i = 1; i <= 13; i++) result['value' + i] = '';
  const name = String(item.checkItem || '');
  const set = (dest, source) => { result['value' + dest] = numberOrBlank(item['value' + source]); };
  if (/humidity/i.test(name)) { set(1, 1); set(2, 2); }
  else if (/Sector/i.test(name)) {
    result.value2 = numberOrBlank(item.value2 === '' || item.value2 == null ? item.value3 : item.value2);
  }
  else if (/Cryopump-[AB]/i.test(name)) { set(5, 3); set(6, 4); }
  else if (/Filament/i.test(name)) { set(7, 3); set(8, 4); }
  else if (/water flow/i.test(name)) { for (let i = 0; i < 4; i++) set(9 + i, 5 + i); }
  else if (/pressure/i.test(name)) set(13, 3);
  else if (/power lead/i.test(name)) set(4, 3);
  else if (/upper coil/i.test(name)) set(3, 3);
  else throw new Error('Unrecognized Check Item: ' + name);
  return result;
}

// Run once before deploying. Copy the entire workbook before migrating values.
// If interrupted, a retry reads the original backup, not partly migrated rows.
function migrateValueSchemaV2() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const props = PropertiesService.getScriptProperties();
    const key = valueSchemaKey_(sheet);
    if (props.getProperty(key) !== '2') {
      let backupId = props.getProperty(key + ':backup');
      if (!backupId) {
        const backup = sheet.getParent().copy(sheet.getParent().getName() + '_backup_before_Value13_' +
          Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss'));
        backupId = backup.getId();
        props.setProperty(key + ':backup', backupId);
      }
      const original = SpreadsheetApp.openById(backupId).getSheetByName(SHEET_NAME).getDataRange().getValues();
      const oldHeaders = original.shift().map(h => String(h).trim());
      if (sheet.getLastRow() - 1 !== original.length) throw new Error('Data changed during migration; stop and review backup.');
      const converted = original.map(row => {
        const item = { checkItem: row[oldHeaders.indexOf('Check Item')] };
        for (let n = 1; n <= 8; n++) item['value' + n] = row[oldHeaders.indexOf('Value ' + n)];
        return upgradeLegacyMeasurement_(item);
      });
      const headers = ensureValueHeaders_(sheet);
      for (let n = 1; n <= 13; n++) {
        if (converted.length) sheet.getRange(2, headers.indexOf('Value ' + n) + 1, converted.length, 1)
          .setValues(converted.map(item => [item['value' + n]]));
      }
      SpreadsheetApp.flush();
      props.setProperty(key, '2');
      Logger.log('Migrated rows: ' + converted.length);
      Logger.log('Backup: https://docs.google.com/spreadsheets/d/' + backupId + '/edit');
    }
    createTrendSheets();
    Logger.log('Value schema 2 ready (13 value fields).');
  } finally { lock.releaseLock(); }
}

function doGet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Worksheet not found: ' + SHEET_NAME);
    const values = sheet.getDataRange().getValues();
    const headers = (values.shift() || []).map(h => String(h).trim());
    const rows = values.filter(r => r.some(v => v !== '' && v !== null)).map(r => {
      const result = {};
      headers.forEach((header, i) => {
        if (header) result[header] = formatValue(r[i], header);
      });
      return result;
    });
    return jsonResponse({ ok: true, valueSchemaVersion: Number(PropertiesService.getScriptProperties().getProperty(valueSchemaKey_(sheet)) || 1), rows: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Worksheet not found: ' + SHEET_NAME);
    if (PropertiesService.getScriptProperties().getProperty(valueSchemaKey_(sheet)) !== '2') {
      throw new Error('Run migrateValueSchemaV2 before accepting records.');
    }
    const measurements = Array.isArray(body.measurements) ? body.measurements : [];
    if (!measurements.length) throw new Error('No measurement data received');

    // Map by header, rather than by fixed column position.
    const expected = [
      'Record ID', 'Inspection Date', 'Completion Time', 'Inspection Type',
      'Work Mode', 'Operator 1', 'Operator 2', 'Place', 'Device', 'Parameter ID',
      'Check Item', 'Unit', 'Standard Value', 'Recorded Value',
      'Value 1', 'Value 2', 'Value 3', 'Value 4', 'Value 5', 'Value 6',
      'Value 7', 'Value 8', 'Value 9', 'Value 10', 'Value 11', 'Value 12', 'Value 13', 'Status', 'Remark', 'Created At'
    ];
    let headers = sheet.getLastColumn()
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim())
      : [];
    if (!headers.some(Boolean)) headers = [];
    const missing = expected.filter(h => !headers.includes(h));
    if (missing.length) {
      const firstColumn = headers.length + 1;
      const requiredWidth = headers.length + missing.length;
      if (requiredWidth > sheet.getMaxColumns()) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredWidth - sheet.getMaxColumns());
      }
      sheet.getRange(1, firstColumn, 1, missing.length).setValues([missing]);
      headers = headers.concat(missing);
    }

    const createdAt = new Date();
    const rows = measurements.map(item => {
      if (body.valueSchemaVersion !== 2) item = upgradeLegacyMeasurement_(item);
      const fields = {
        'Record ID': body.recordId || '',
        'Inspection Date': body.inspectionDate || '',
        'Completion Time': body.completionTime || '',
        'Inspection Type': body.inspectionType || '',
        'Work Mode': body.workMode || '',
        'Operator 1': body.operator1 || '',
        'Operator 2': body.operator2 || '',
        'Place': item.place || '',
        'Device': item.device || item.parameterId || '',
        'Parameter ID': item.parameterId || '',
        'Check Item': item.checkItem || '',
        'Unit': item.unit || '',
        'Standard Value': item.standardValue || '',
        'Recorded Value': item.recordedValue == null ? '' : item.recordedValue,
        'Status': item.status || '',
        'Remark': item.remark || '',
        'Created At': createdAt
      };
      // 1: humidity; 2: Celsius; 3: coil K; 4: lead K; 5/6: Cryopump K;
      // 7: A; 8: min; 9..12: flow L/min; 13: pressure Pa.
      for (let n = 1; n <= 13; n++) fields['Value ' + n] = numberOrBlank(item['value' + n]);
      return headers.map(h => Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : '');
    });
    sheet.getRange(Math.max(sheet.getLastRow() + 1, 2), 1, rows.length, headers.length).setValues(rows);
    return jsonResponse({ ok: true, valueSchemaVersion: VALUE_SCHEMA_VERSION, rowsAdded: rows.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function numberOrBlank(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Invalid numeric value: ' + v);
  return n;
}

function formatValue(v, header) {
  if (!(v instanceof Date)) return v;
  const pattern = header === 'Inspection Date' ? 'yyyy-MM-dd'
    : header === 'Completion Time' ? 'HH:mm' : 'yyyy-MM-dd HH:mm:ss';
  return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Taipei', pattern);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
