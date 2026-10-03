// Inspection trends — grouped by Check Item (K), never Device/Parameter ID.
// Value 1 = humidity; 2 = Celsius; 3 = coil K; 4 = lead K; 5/6 = Cryopump K;
// 7 = current A; 8 = minutes; 9..12 = flow A..D; 13 = pressure Pa.
const TREND_SPREADSHEET_ID = '17aXvogL6PIfW10tz393kTzqatNRmBMoXNGl254yc9YI';
const DATA_SHEET_NAME = 'Inspection_Data';

function trendSeriesFor_(name) {
  if (/humidity/i.test(name)) return [
    { source: 'Value 2', label: 'Temperature (°C)' },
    { source: 'Value 1', label: 'Humidity (%)' }
  ];
  if (/Cryopump-[AB]/.test(name)) return [
    { source: 'Value 5', label: '2nd Temperature (K)' },
    { source: 'Value 6', label: '1st Temperature (K)' }
  ];
  if (/Cryocooler/.test(name)) return [9, 10, 11, 12].map((n, i) => ({
    source: 'Value ' + n, label: 'Flow ' + 'ABCD'[i] + ' (L/min)'
  }));
  if (/water flow/i.test(name)) return [{ source: 'Value 9', label: 'Water Flow (L/min)' }];
  if (/Filament/i.test(name)) return [
    { source: 'Value 7', label: 'Current (A)' },
    { source: 'Value 8', label: 'Operation Time (min)' }
  ];
  if (/Sector/i.test(name)) return [{ source: 'Value 2', label: 'Temperature (°C)' }];
  if (/pressure/i.test(name)) return [{ source: 'Value 13', label: 'Pressure (Pa)' }];
  return [{ source: /power lead/i.test(name) ? 'Value 4' : 'Value 3', label: 'Temperature (K)' }];
}

// Running this function updates trend sheets/charts, never Inspection_Data.
// Existing sheets outside the new Check Item names are not deleted automatically.
function createTrendSheets() {
  const ss = SpreadsheetApp.openById(TREND_SPREADSHEET_ID);
  const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!dataSheet) throw new Error('Worksheet not found: ' + DATA_SHEET_NAME);
  const values = dataSheet.getDataRange().getValues();
  const headers = values.shift().map(v => String(v).trim());
  const columnMap = {};
  headers.forEach((h, i) => { columnMap[h] = i + 1; });
  ['Inspection Date', 'Completion Time', 'Check Item'].forEach(h => {
    if (!columnMap[h]) throw new Error('Missing column: ' + h);
  });
  // The group key is the Check Item header, currently column K.
  const groups = new Map();
  values.forEach(row => {
    const name = String(row[columnMap['Check Item'] - 1] || '').trim();
    if (!name) return;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });
  groups.forEach((rows, name) => createCheckItemTrend_(ss, columnMap, name, rows));
  Logger.log('Updated Check Item trends: ' + groups.size);
}

function createCheckItemTrend_(ss, map, name, sourceRows) {
  const series = trendSeriesFor_(name);
  series.forEach(s => {
    if (!map[s.source]) throw new Error(name + ': missing ' + s.source);
  });
  const title = ('Trend_' + name.replace(/[\\/?:*\[\]]/g, '_')).substring(0, 100);
  let sheet = ss.getSheetByName(title);
  if (!sheet) sheet = ss.insertSheet(title);
  sheet.getCharts().forEach(chart => sheet.removeChart(chart));
  sheet.clear();
  const headers = ['Inspection Date', 'Completion Time', 'Check Item',
    ...series.map(s => s.label), 'Inspection DateTime'];
  const last = headers.length;
  sheet.getRange(1, 1, 1, last).setValues([headers])
    .setFontWeight('bold').setBackground('#e0efe8').setWrap(true);
  const source = "'" + DATA_SHEET_NAME.replace(/'/g, "''") + "'";
  const refs = ['Inspection Date', 'Completion Time', 'Check Item',
    ...series.map(s => s.source)].map(h => {
      const c = columnToLetter_(map[h]);
      return source + '!' + c + '2:' + c;
    });
  const key = columnToLetter_(map['Check Item']);
  sheet.getRange('A2').setFormula(
    '=IFERROR(SORT(FILTER({' + refs.join(',') + '},' + source + '!' +
    key + '2:' + key + '="' + name.replace(/"/g, '""') +
    '"),1,TRUE,2,TRUE),"")'
  );
  sheet.getRange(2, last).setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF(ISNUMBER(A2:A),INT(A2:A),' +
    'DATEVALUE(LEFT(A2:A,10)))+IF(ISNUMBER(B2:B),MOD(B2:B,1),TIMEVALUE(B2:B))))'
  );
  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('B2:B').setNumberFormat('HH:mm');
  sheet.getRange(2, last, sheet.getMaxRows() - 1).setNumberFormat('yyyy-mm-dd HH:mm');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 2, 155);
  sheet.setColumnWidth(3, 390);
  sheet.setColumnWidths(4, series.length, 185);
  sheet.setColumnWidth(last, 210);
  SpreadsheetApp.flush();
  createCheckItemChart_(sheet, name, series, map, sourceRows, last);
}

function createCheckItemChart_(sheet, name, series, map, sourceRows, dateTimeColumn) {
  const numbers = series.map(s => sourceRows.map(row => row[map[s.source] - 1])
    .filter(v => typeof v === 'number' && isFinite(v)));
  const mean = list => list.reduce((a, b) => a + b, 0) / (list.length || 1);
  const dual = series.length === 2;
  const high = dual && mean(numbers[1]) > mean(numbers[0]) ? 1 : 0;
  // Put primary series first: left = higher numeric magnitude, right = lower.
  const order = dual ? [high, 1 - high] : series.map((_, i) => i);
  const chartSeries = {};
  order.forEach((original, chartIndex) => {
    chartSeries[chartIndex] = {
      targetAxisIndex: dual && chartIndex === 1 ? 1 : 0,
      color: ['#e55b1f', '#1976d2', '#28a745', '#a33bc4'][chartIndex],
      lineDashStyle: chartIndex === 1 ? [6, 3] : [1, 0],
      pointShape: chartIndex === 1 ? 'diamond' : 'circle',
      pointSize: chartIndex === 1 ? 5 : 7
    };
  });
  const axis = (title, nums, extra) => {
    if (!nums.length) return { title: title + extra };
    const low = Math.min(...nums), highValue = Math.max(...nums);
    const pad = Math.max((highValue - low) * 0.15, Math.abs(highValue) * 0.005, 1e-10);
    return { title: title + extra, viewWindow: { min: low - pad, max: highValue + pad } };
  };
  const axes = dual ? {
    0: axis(series[order[0]].label, numbers[order[0]], ' — Primary'),
    1: axis(series[order[1]].label, numbers[order[1]], ' — Secondary')
  } : { 0: axis(series.map(s => s.label).join(' / '), numbers.flat(), '') };
  const builder = sheet.newChart().setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange(1, dateTimeColumn, sheet.getMaxRows(), 1))
    .setNumHeaders(1).setPosition(13, 1, 0, 0)
    .setOption('title', name + ' trend')
    .setOption('width', 1100).setOption('height', 530)
    .setOption('legend', { position: 'top' })
    .setOption('hAxis', {
      title: 'Inspection Date + Completion Time', format: 'yyyy-MM-dd HH:mm'
    })
    .setOption('series', chartSeries).setOption('vAxes', axes);
  order.forEach(i => builder.addRange(sheet.getRange(1, i + 4, sheet.getMaxRows(), 1)));
  sheet.insertChart(builder.build());
}

function columnToLetter_(column) {
  let result = '';
  while (column > 0) {
    const remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}
