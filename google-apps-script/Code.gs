const SHEET_NAME = 'Inspection_Data';
const VALUE_SCHEMA_VERSION = 3;

function valueSchemaKey_(sheet) {
  return 'valueSchema:' + sheet.getParent().getId() + ':' + sheet.getSheetId();
}

function ensureValueHeaders_(sheet) {
  let headers = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim())
    : [];
  if (!headers.some(Boolean)) headers = [];
  const expected = headers.length ? Array.from({ length: 17 }, (_, i) => 'Value ' + (i + 1)) : [
    'Record ID', 'Inspection Date', 'Completion Time', 'Inspection Type',
    'Work Mode', 'Operator 1', 'Operator 2', 'Place', 'Device', 'Parameter ID',
    'Check Item', 'Unit', 'Standard Value', 'Recorded Value',
    ...Array.from({ length: 17 }, (_, i) => 'Value ' + (i + 1)),
    'Status', 'Remark', 'Created At'
  ];
  const missing = expected.filter(h => !headers.includes(h));
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
  throw new Error('Use migrateValueSchemaV3 for the 17-field layout.');
}

function upgradeSchema2Measurement_(item) {
  const result = Object.assign({}, item);
  for (let n = 1; n <= 17; n++) result['value' + n] = '';
  const mapping = {1:1, 2:2, 3:3, 4:7, 5:9, 6:10, 7:11, 8:12, 9:13, 10:14, 11:15, 12:16, 13:17};
  Object.keys(mapping).forEach(n => { result['value' + mapping[n]] = numberOrBlank(item['value' + n]); });
  return result;
}

function normalizeInspectionStamp_(date, time) {
  const tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  const day = date instanceof Date ? Utilities.formatDate(date, tz, 'yyyy-MM-dd') : String(date || '').trim();
  const clock = time instanceof Date ? Utilities.formatDate(time, tz, 'HH:mm') : String(time || '').trim();
  const d = day.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const t = clock.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) throw new Error('Invalid inspection date/time: ' + day + ' ' + clock);
  const canonical = d[1] + '-' + d[2].padStart(2, '0') + '-' + d[3].padStart(2, '0');
  const check = new Date(canonical + 'T12:00:00Z');
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== canonical) throw new Error('Invalid date: ' + day);
  return [canonical, t[1].padStart(2, '0') + ':' + t[2]];
}

function formatValueColumns_(sheet, headers) {
  for (let n = 1; n <= 17; n++) {
    const column = headers.indexOf('Value ' + n) + 1;
    if (!column) throw new Error('Missing Value ' + n);
    sheet.getRange(2, column, sheet.getMaxRows() - 1, 1).setNumberFormat(n === 17 ? '0.000000E+00' : '0.############');
  }
}

function sortInspectionData_(sheet, headers) {
  const count = sheet.getLastRow() - 1;
  if (count < 1) return;
  const dc = headers.indexOf('Inspection Date') + 1, tc = headers.indexOf('Completion Time') + 1;
  if (!dc || !tc) throw new Error('Missing date/time headers.');
  const dr = sheet.getRange(2, dc, count, 1), tr = sheet.getRange(2, tc, count, 1);
  if (dr.getFormulas().some(r => r[0]) || tr.getFormulas().some(r => r[0])) throw new Error('Date/time formulas require manual review before sorting.');
  const dates = dr.getValues(), times = tr.getValues();
  const stamps = dates.map((r, i) => r[0] === '' && times[i][0] === '' ? ['', ''] : normalizeInspectionStamp_(r[0], times[i][0]));
  dr.setNumberFormat('@').setValues(stamps.map(r => [r[0]]));
  tr.setNumberFormat('@').setValues(stamps.map(r => [r[1]]));
  sheet.getRange(2, 1, count, headers.length).sort([{column:dc, ascending:true}, {column:tc, ascending:true}]);
}

// Run once while the old client is paused; backup and schema marker prevent double conversion.
function migrateValueSchemaV3() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Worksheet not found: ' + SHEET_NAME);
    const props = PropertiesService.getScriptProperties();
    const key = valueSchemaKey_(sheet);
    if (props.getProperty(key) !== '3') {
      if (props.getProperty(key) !== '2' && sheet.getLastRow() > 1) throw new Error('Expected schema 2. Review data before migrating.');
      let backupId = props.getProperty(key + ':v3backup');
      if (!backupId) {
        const backup = sheet.getParent().copy(sheet.getParent().getName() + '_backup_before_Value17_' +
          Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss'));
        backupId = backup.getId();
        props.setProperty(key + ':v3backup', backupId);
      }
      const original = SpreadsheetApp.openById(backupId).getSheetByName(SHEET_NAME).getDataRange().getValues();
      const oldHeaders = (original.shift() || []).map(h => String(h).trim());
      // A wholly blank worksheet has zero rows, not minus one data row.
      if (Math.max(0, sheet.getLastRow() - 1) !== original.length) throw new Error('Data changed during migration; stop and review backup.');
      const converted = original.map(row => {
        const item = { checkItem: row[oldHeaders.indexOf('Check Item')] };
        for (let n = 1; n <= 13; n++) item['value' + n] = row[oldHeaders.indexOf('Value ' + n)];
        normalizeInspectionStamp_(row[oldHeaders.indexOf('Inspection Date')], row[oldHeaders.indexOf('Completion Time')]);
        return upgradeSchema2Measurement_(item);
      });
      const headers = ensureValueHeaders_(sheet);
      for (let n = 1; n <= 17; n++) {
        if (converted.length) sheet.getRange(2, headers.indexOf('Value ' + n) + 1, converted.length, 1)
          .setValues(converted.map(item => [item['value' + n]]));
      }
      SpreadsheetApp.flush();
      formatValueColumns_(sheet, headers);
      props.setProperty(key, '3');
      Logger.log('Migrated rows: ' + converted.length);
      Logger.log('Backup: https://docs.google.com/spreadsheets/d/' + backupId + '/edit');
    }
    sortInspectionData_(sheet, ensureValueHeaders_(sheet));
    createTrendSheets();
    Logger.log('Value schema 3 ready (17 value fields), sorted by inspection date/time.');
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
    if (PropertiesService.getScriptProperties().getProperty(valueSchemaKey_(sheet)) !== '3') {
      throw new Error('Run migrateValueSchemaV3 before accepting records.');
    }
    if (body.valueSchemaVersion !== 3) throw new Error('Refresh to the 17-field client before saving.');
    const stamp = normalizeInspectionStamp_(body.inspectionDate, body.completionTime);
    const measurements = Array.isArray(body.measurements) ? body.measurements : [];
    if (!measurements.length) throw new Error('No measurement data received');

    // Map by header, rather than by fixed column position.
    const expected = [
      'Record ID', 'Inspection Date', 'Completion Time', 'Inspection Type',
      'Work Mode', 'Operator 1', 'Operator 2', 'Place', 'Device', 'Parameter ID',
      'Check Item', 'Unit', 'Standard Value', 'Recorded Value',
      'Value 1', 'Value 2', 'Value 3', 'Value 4', 'Value 5', 'Value 6',
      'Value 7', 'Value 8', 'Value 9', 'Value 10', 'Value 11', 'Value 12', 'Value 13', 'Value 14', 'Value 15', 'Value 16', 'Value 17', 'Status', 'Remark', 'Created At'
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
      const fields = {
        'Record ID': body.recordId || '',
        'Inspection Date': stamp[0],
        'Completion Time': stamp[1],
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
      // 1 humidity; 2 Celsius; 3..6 coil K; 7/8 lead K; 9/10 Cryopump K;
      // 11 A; 12 min; 13..16 flow L/min; 17 pressure Pa.
      for (let n = 1; n <= 17; n++) fields['Value ' + n] = numberOrBlank(item['value' + n]);
      return headers.map(h => Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : '');
    });
    sheet.getRange(Math.max(sheet.getLastRow() + 1, 2), 1, rows.length, headers.length).setValues(rows);
    formatValueColumns_(sheet, headers);
    sortInspectionData_(sheet, headers);
    // Chart limits must follow new values, not remain fixed to migration-day data.
    // A chart failure must not report a saved record as failed (and cause duplicates).
    let trendsUpdated = true;
    try { refreshSavedTrendCharts_(sheet, headers, measurements); }
    catch (chartError) { trendsUpdated = false; Logger.log('Saved; chart refresh failed: ' + chartError); }
    return jsonResponse({ ok: true, valueSchemaVersion: VALUE_SCHEMA_VERSION, rowsAdded: rows.length, trendsUpdated: trendsUpdated });
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
