const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("google-apps-script/Code.gs", "utf8"), context);
const rows = [];
for (let day = 0; day < 3653; day++) {
  const date = new Date(Date.UTC(2016, 0, 1) + day * 86400000)
    .toISOString()
    .slice(0, 10);
  for (let time = 0; time < 3; time++)
    rows.push({
      "Check Item": "Room",
      "Inspection Date": date,
      "Completion Time": ["08:00", "12:00", "16:00"][time],
      "Value 1": 40 + time,
      "Value 2": time === 1 ? "" : 22 + time,
    });
}
const daily = context.aggregateTrendRows_(rows, "daily");
assert.equal(daily.length, 3653);
assert.equal(daily[0]["Value 1"], 41);
assert.equal(daily[0]["Value 1 Min"], 40);
assert.equal(daily[0]["Value 1 Max"], 42);
assert.equal(daily[0]["Value 2"], 23);
assert.equal(daily[0]["Value 2 Count"], 2);
assert.equal(daily[0].SampleCount, 3);
assert.equal(context.aggregateTrendRows_(rows, "monthly").length, 120);
assert.equal(context.aggregateTrendRows_(rows, "raw").length, 10959);
let capacity = 1000;
const sheet = {
  getMaxRows: () => capacity,
  getMaxColumns: () => 16,
  getParent: () => ({ getSheets: () => [sheet] }),
  insertRowsAfter: (after, count) => {
    assert.equal(after, capacity);
    capacity += count;
  },
};
context.ensureRowCapacity_(sheet, 2300);
assert.equal(capacity, 4000);
context.ensureRowCapacity_(sheet, 2000);
assert.equal(capacity, 4000);
assert.equal(rows.length, 10959);
console.log(
  "PASS: 10-year aggregation, blank handling, min/max/count, raw retention, row growth.",
);
