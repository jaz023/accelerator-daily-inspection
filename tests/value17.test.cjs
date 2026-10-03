const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const app = fs.readFileSync('docs/app.js', 'utf8');
const client = vm.createContext({ document: {getElementById:()=>({value:'Startup',addEventListener(){},innerHTML:''})} });
vm.runInContext(app.slice(0, app.indexOf('$("mode").onchange')), client);
const backend = vm.createContext({Session:{getScriptTimeZone:()=> 'Asia/Taipei'}});
vm.runInContext(fs.readFileSync('google-apps-script/Code.gs','utf8'),backend);
vm.runInContext(fs.readFileSync('google-apps-script/trend.gs','utf8'),backend);
const plain = x => JSON.parse(JSON.stringify(x));
for (const [name,input,slots] of [
  ['Maximum upper coil temperature','5.1/5.2/5.3/5.4',[3,4,5,6]],
  ['Maximum power lead temperature','61/62',[7,8]],
  ['Cryopump-A 2nd / 1st temperature','9/73',[9,10]],
  ['Filament current / operation times','95/120',[11,12]],
  ['Cryocooler water flow rate (A/B/C/D)','10/11/12/13',[13,14,15,16]],
  ['Vacuum pressure with gas','1e-4',[17]],
  ['Accelerator room temperature / Humidity','24/48',[2,1]],
]) {
  const out=client.measurementFor(['id',name,''],input);
  assert.deepEqual(slots.map(n=>out['value'+n]),plain(client.nums(input)));
  assert.equal(Object.keys(out).filter(k=>/^value\d+$/.test(k)).length,17);
  const chartSlots = plain(client.seriesFor(name)).map(s=>s.column).sort((a,b)=>a-b);
  assert.deepEqual(chartSlots,slots.slice().sort((a,b)=>a-b));
  const sheetSlots=plain(backend.trendSeriesFor_(name)).map(s=>Number(s.source.split(' ')[1])).sort((a,b)=>a-b);
  assert.deepEqual(sheetSlots,chartSlots);
}
assert.throws(()=>client.measurementFor(['coil','Maximum upper coil temperature',''],'5.1'));
const old = Object.fromEntries(Array.from({length:13},(_,i)=>['value'+(i+1),i+1]));
const moved=backend.upgradeSchema2Measurement_(old);
assert.deepEqual(Array.from({length:17},(_,i)=>moved['value'+(i+1)]),[1,2,3,'','','',4,'',5,6,7,8,9,10,11,12,13]);
assert.deepEqual(plain(backend.normalizeInspectionStamp_('2026/9/2','8:00')),['2026-09-02','08:00']);
assert.throws(()=>backend.normalizeInspectionStamp_('2026-02-30','08:00'));
const rows=['2026-10-03 16:00','2026-09-30 12:00','2026-10-03 08:00','2026-09-30 08:00'].map(stamp=>({'Inspection Date':stamp.slice(0,10),'Completion Time':stamp.slice(11),'Check Item':'Maximum upper coil temperature','Value 3':5,'Value 4':5.2,'Value 5':5.4,'Value 6':5.6}));
const model=client.trendModel('Maximum upper coil temperature',rows);
assert.equal(model.series.length,4);
assert.deepEqual(plain(model.rows).map(r=>r['Inspection Date']+' '+r['Completion Time']),['2026-09-30 08:00','2026-09-30 12:00','2026-10-03 08:00','2026-10-03 16:00']);
console.log('PASS: 17-slot mappings, migration, 4/2 series, date validation and historical sorting');
