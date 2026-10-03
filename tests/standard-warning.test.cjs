const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const app = fs.readFileSync("docs/app.js", "utf8");
const elements = {};
const el = (id) =>
  (elements[id] ||= {
    value: "",
    textContent: "",
    className: "",
    disabled: false,
    replaceChildren() {},
  });
let requests = [],
  reviews = 0,
  decision = "cancel",
  inputRows = [];
const context = vm.createContext({
  document: {
    getElementById: el,
    querySelectorAll: () => inputRows,
    createElement: () => ({}),
  },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  crypto: { randomUUID: () => "test-record" },
  fetch: async (_, options) => {
    requests.push(JSON.parse(options.body));
    return { json: async () => ({ ok: true, rowsAdded: 13 }) };
  },
});
vm.runInContext(app.slice(0, app.indexOf('$("mode").onchange')), context);
vm.runInContext("backendSchemaVersion=3; loadTrends=()=>{};", context);
el("standardReview").showModal = () => {
  reviews++;
  el("standardReview").returnValue = decision;
  el("standardReview").onclose();
};
const measurement = (name, input) =>
  context.measurementFor(["id", name, ""], input);
const warnings = (name, input) =>
  context.standardWarnings(measurement(name, input));
assert.equal(
  warnings("Maximum upper coil temperature", "5/5.2/5.4/5.6").length,
  0,
);
assert.equal(
  warnings("Maximum upper coil temperature", "67/6.7/5/5").length,
  2,
);
assert.equal(warnings("Maximum power lead temperature", "65/66").length, 2);
assert.equal(
  warnings("Accelerator room temperature / Humidity", "22/59").length,
  0,
);
assert.equal(
  warnings("Accelerator room temperature / Humidity", "26.1/60").length,
  2,
);
assert.equal(warnings("Cryopump-A 2nd / 1st temperature", "20/85").length, 2);
assert.equal(
  warnings("Filament current / operation times", "90/2000").length,
  2,
);
assert.equal(
  warnings("Cryocooler water flow rate (A/B/C/D)", "10/9/8/10").length,
  2,
);
assert.equal(
  warnings("Vacuum pressure (before startup) (A)", "2e-4").length,
  1,
);
assert.equal(
  warnings("Difference pressure between (B) and (A)", "5e-6").length,
  1,
);
assert.equal(warnings("Vacuum pressure with gas", "2e-3").length, 1);
assert.equal(warnings("Sector temperature", "33").length, 1);
assert.equal(warnings("Maximum upper coil temperature", "-1/5/5/5").length, 1);
const inputs = [
  "24/48",
  "23/46",
  "25/52",
  "67/5.3/5.4/5.5",
  "61/62",
  "1e-4",
  "1e-6",
  "27",
  "95/120",
  "9/73",
  "9.8/74",
  "10",
  "10/10.2/10.4/10.6",
];
const items = vm.runInContext("[...common,...startup]", context);
inputRows = items.map((item, i) => ({
  dataset: { id: item[0] },
  querySelector: (selector) => ({ value: selector === ".v" ? inputs[i] : "" }),
}));
el("mode").value = "Startup";
el("op1").value = "TEST-WARNING";
el("date").value = "2026-10-03";
el("time").value = "08:00";
(async () => {
  await context.save({ preventDefault() {} });
  assert.equal(requests.length, 0);
  assert.match(el("status").textContent, /Cancelled/);
  assert.equal(el("saveButton").disabled, false);
  decision = "confirm";
  await context.save({ preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].measurements[3].value3, 67);
  assert.equal(requests[0].measurements[3].status, "OUT_OF_STANDARD_CONFIRMED");
  assert.equal(requests[0].measurements[0].status, "WITHIN_STANDARD");
  await context.save({ preventDefault() {} });
  assert.equal(requests.length, 1, "unchanged second submit must not write");
  assert.equal(reviews, 2);
  console.log(
    "PASS: every standard/boundary; cancel sends nothing; confirmed abnormal value retained; duplicate protection.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
