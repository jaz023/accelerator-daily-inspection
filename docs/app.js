const API =
  "https://script.google.com/macros/s/AKfycbzCwHSg6xebukXM-WoqBrzgr74Lq31ug_iFPZQG4oXfyQhdfcnjfF0Or3J9RJmw1iJd0g/exec";
const $ = (id) => document.getElementById(id);
const common = [
    [
      "room_th",
      "Accelerator room temperature / Humidity",
      "22-26°C / <60%",
      "th",
    ],
    ["bt_th", "BT line temperature / Humidity", "22-26°C / <60%", "th"],
    [
      "power_th",
      "Power supply room temperature / humidity",
      "22-26°C / <60%",
      "th",
    ],
  ],
  startup = [
    ["coil", "Maximum upper coil temperature", "< 6.7 K"],
    ["lead", "Maximum power lead temperature", "< 65 K"],
    ["vacuum_a", "Vacuum pressure (before startup) (A)", "<2.0E-4 Pa"],
    ["vacuum_ba", "Difference pressure between (B) and (A)", "<0.5E-5 Pa"],
    ["sector", "Sector temperature", "<33 °C"],
    ["filament", "Filament current / operation times", ">90A / <2000mins"],
    ["cryo_a", "Cryopump-A 2nd / 1st temperature", "<20 / <85 K"],
    ["cryo_b", "Cryopump-B 2nd / 1st temperature", "<20 / <85 K"],
    ["cryo_flow", "Cryopump water flow rate", ">9 L/min"],
    ["cooler_flow", "Cryocooler water flow rate (A/B/C/D)", ">9 L/min"],
  ],
  shutdown = [
    ["vacuum_gas", "Vacuum pressure with gas", "<2.0E-3 Pa"],
    ["coil_stop", "Maximum upper coil temperature", "<6.7 K"],
    ["lead_stop", "Maximum power lead temperature", "<65 K"],
    ["cryo_a_stop", "Cryopump-A 2nd / 1st temperature", "<20 / <85 K"],
    ["cryo_b_stop", "Cryopump-B 2nd / 1st temperature", "<20 / <85 K"],
  ];
let trendRows = [];
let backendSchemaVersion = 0;
let saving = false;
let pendingSave = null;
try {
  pendingSave = JSON.parse(
    sessionStorage.getItem("inspectionPending") || "null",
  );
} catch (_) {}
let lastSavedFingerprint = "";
let tablePage = 0;
let trendInfo = {};
let loadGeneration = 0;
function items() {
  return [...common, ...($("mode").value === "Startup" ? startup : shutdown)];
}
function render() {
  $("form").innerHTML = items()
    .map(
      (x) =>
        `<div class="row" data-id="${x[0]}"><div><b>${x[1]}</b><br><small>Standard: ${x[2]}</small></div><input class="v" placeholder="${x[3] === "th" ? "Temperature °C / Humidity %" : /upper coil/i.test(x[1]) ? "Temperature 1 / 2 / 3 / 4 (K)" : /power lead/i.test(x[1]) ? "Temperature 1 / 2 (K)" : "Enter displayed value"}" required><input class="remark" placeholder="Remark"></div>`,
    )
    .join("");
}
function nums(v) {
  return (String(v ?? "").match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || []).map(
    Number,
  );
}
// Schema 3: each value slot has one unit and meaning, for both inspection modes.
function measurementFor(item, recordedValue, remark = "") {
  const numbers = nums(recordedValue);
  const name = item[1];
  const values = Object.fromEntries(
    Array.from({ length: 17 }, (_, i) => ["value" + (i + 1), ""]),
  );
  let columns, unit;
  if (/humidity/i.test(name)) {
    columns = [2, 1];
    unit = "°C / %";
  } else if (/Sector/i.test(name)) {
    columns = [2];
    unit = "°C";
  } else if (/Cryopump-[AB]/i.test(name)) {
    columns = [9, 10];
    unit = "K";
  } else if (/Filament/i.test(name)) {
    columns = [11, 12];
    unit = "A / min";
  } else if (/Cryocooler/i.test(name)) {
    columns = [13, 14, 15, 16];
    unit = "L/min";
  } else if (/water flow/i.test(name)) {
    columns = [13];
    unit = "L/min";
  } else if (/pressure/i.test(name)) {
    columns = [17];
    unit = "Pa";
  } else if (/power lead/i.test(name)) {
    columns = [7, 8];
    unit = "K";
  } else if (/upper coil/i.test(name)) {
    columns = [3, 4, 5, 6];
    unit = "K";
  } else throw new Error("Unknown Check Item: " + name);
  if (
    numbers.length !== columns.length ||
    numbers.some((n) => !Number.isFinite(n))
  ) {
    throw new Error(
      name + ": enter exactly " + columns.length + " numeric value(s).",
    );
  }
  columns.forEach((column, i) => {
    values["value" + column] = numbers[i];
  });
  return {
    parameterId: item[0],
    checkItem: name,
    unit,
    standardValue: item[2],
    recordedValue,
    ...values,
    remark,
  };
}
async function save(ev) {
  ev.preventDefault();
  if (saving) return;
  const rs = [...document.querySelectorAll(".row")],
    op = $("op1").value.trim(),
    miss = rs.filter((r) => !r.querySelector(".v").value.trim());
  if (!op || miss.length) {
    $("status").textContent = miss.length
      ? `Please complete all ${miss.length} remaining value(s).`
      : "Operator 1 is required.";
    $("status").className = "bad";
    return;
  }
  try {
    if (backendSchemaVersion !== 3)
      throw new Error(
        "Backend schema is not ready. Refresh trends before saving.",
      );
    const rows = rs.map((r) =>
      measurementFor(
        items().find((i) => i[0] === r.dataset.id),
        r.querySelector(".v").value,
        r.querySelector(".remark").value,
      ),
    );
    const payload = {
      valueSchemaVersion: 3,
      inspectionDate: $("date").value,
      completionTime: $("time").value,
      inspectionType: $("mode").value,
      workMode: $("op2").value.trim() ? "Two operators" : "Single operator",
      operator1: op,
      operator2: $("op2").value.trim(),
      measurements: rows,
    };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastSavedFingerprint)
      throw new Error(
        "These unchanged values were already saved. Edit the date/time or readings for a new record.",
      );
    if (!pendingSave || pendingSave.fingerprint !== fingerprint)
      pendingSave = { fingerprint, recordId: crypto.randomUUID() };
    payload.recordId = pendingSave.recordId;
    try {
      sessionStorage.setItem("inspectionPending", JSON.stringify(pendingSave));
    } catch (_) {}
    saving = true;
    $("saveButton").disabled = true;
    $("status").textContent = "Saving…";
    const out = await (
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      })
    ).json();
    if (!out.ok) throw Error(out.error);
    lastSavedFingerprint = fingerprint;
    pendingSave = null;
    try {
      sessionStorage.removeItem("inspectionPending");
    } catch (_) {}
    $("status").textContent =
      (out.duplicate
        ? "Already saved; no duplicate rows added."
        : `Saved ${out.rowsAdded} rows.`) +
      (out.trendsUpdated === false
        ? " Sheet chart refresh failed; run createTrendSheets. Do not resubmit."
        : "");
    $("status").className = "ok";
    loadTrends();
  } catch (err) {
    $("status").textContent = "Save failed: " + err.message;
    $("status").className = "bad";
  } finally {
    saving = false;
    $("saveButton").disabled = false;
  }
}
// Match the backend's header names without relying on column positions.
function field(row, name, fallback) {
  return row[name] ?? row[fallback];
}
function checkItem(row) {
  return String(field(row, "Check Item", "checkItem") ?? "").trim();
}
function value(row, n) {
  const raw = field(row, "Value " + n, "value" + n);
  if (raw === null || raw === undefined || String(raw).trim() === "")
    return NaN;
  const number = Number(raw);
  return Number.isFinite(number) ? number : NaN;
}
function seriesFor(name) {
  if (/humidity/i.test(name))
    return [
      { column: 1, label: "Humidity (%)" },
      { column: 2, label: "Temperature (°C)" },
    ];
  if (/Cryopump-[AB]/i.test(name))
    return [
      { column: 10, label: "1st Temperature (K)" },
      { column: 9, label: "2nd Temperature (K)" },
    ];
  if (/Cryocooler/i.test(name))
    return [13, 14, 15, 16].map((column, i) => ({
      column,
      label: "Flow " + "ABCD"[i] + " (L/min)",
    }));
  if (/water flow/i.test(name))
    return [{ column: 13, label: "Water Flow (L/min)" }];
  if (/Filament/i.test(name))
    return [
      { column: 12, label: "Operation Time (min)" },
      { column: 11, label: "Current (A)" },
    ];
  if (/Sector/i.test(name)) return [{ column: 2, label: "Temperature (°C)" }];
  if (/upper coil/i.test(name))
    return [3, 4, 5, 6].map((column, i) => ({
      column,
      label: "Coil " + (i + 1) + " (K)",
    }));
  if (/power lead/i.test(name))
    return [7, 8].map((column, i) => ({
      column,
      label: "Lead " + (i + 1) + " (K)",
    }));
  return [
    {
      column: /pressure/i.test(name) ? 17 : 3,
      label: /pressure/i.test(name) ? "Pressure (Pa)" : "Temperature (K)",
    },
  ];
}
function timestamp(row) {
  const rawDate = field(row, "Inspection Date", "inspectionDate");
  const rawTime = field(row, "Completion Time", "completionTime");
  let date;
  if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    date = new Date(Date.UTC(1899, 11, 30) + Math.floor(rawDate) * 86400000)
      .toISOString()
      .slice(0, 10);
  } else {
    const match = String(rawDate ?? "").match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
    );
    if (!match) return NaN;
    date =
      match[1] +
      "-" +
      match[2].padStart(2, "0") +
      "-" +
      match[3].padStart(2, "0");
  }
  let time;
  if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
    const minutes = Math.round((((rawTime % 1) + 1) % 1) * 1440) % 1440;
    time =
      String(Math.floor(minutes / 60)).padStart(2, "0") +
      ":" +
      String(minutes % 60).padStart(2, "0");
  } else {
    const match = String(rawTime ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return NaN;
    time =
      match[1].padStart(2, "0") + ":" + match[2] + ":" + (match[3] || "00");
  }
  return new Date(date + "T" + time).getTime();
}
function dateLabel(time) {
  const date = new Date(time);
  const two = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    two(date.getMonth() + 1) +
    "-" +
    two(date.getDate()) +
    " " +
    two(date.getHours()) +
    ":" +
    two(date.getMinutes())
  );
}
function trendModel(name, data, from = "", to = "") {
  const rows = data
    .filter((row) => {
      const time = timestamp(row);
      const day = Number.isFinite(time) ? dateLabel(time).slice(0, 10) : "";
      return (
        checkItem(row) === name &&
        day &&
        (!from || day >= from) &&
        (!to || day <= to)
      );
    })
    .sort((a, b) => timestamp(a) - timestamp(b));
  const series = seriesFor(name)
    .map((def) => ({
      ...def,
      values: rows.map((row) => value(row, def.column)),
    }))
    .filter((s) => s.values.some(Number.isFinite));
  const dual = seriesFor(name).length === 2;
  const mean = (s) => {
    const values = s.values.filter(Number.isFinite);
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  // Stable selection by average numeric magnitude; high = primary/left.
  if (dual) series.sort((a, b) => mean(b) - mean(a));
  series.forEach((s, index) => {
    s.axis = dual && index === 1 ? 1 : 0;
  });
  const scales = [0, 1].map((axis) => {
    const numbers = series
      .filter((s) => s.axis === axis)
      .flatMap((s) => s.values.filter(Number.isFinite));
    if (!numbers.length) return null;
    const min = numbers.reduce((a, b) => Math.min(a, b), Infinity),
      max = numbers.reduce((a, b) => Math.max(a, b), -Infinity);
    const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.005, 1e-10);
    return { min: min - pad, max: max + pad };
  });
  return { name, rows, series, scales, dual };
}
function formatNumber(number) {
  if (number !== 0 && Math.abs(number) < 0.001) return number.toExponential(2);
  return Number(number.toPrecision(5)).toString();
}
function emptyChart(message) {
  $("trendStatus").textContent = message;
  $("trendLegend").replaceChildren();
  $("trendTableHead").replaceChildren();
  $("trendTableBody").replaceChildren();
}
function draw() {
  const canvas = $("trendChart"),
    ctx = canvas.getContext("2d");
  const width = canvas.width,
    height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const from = $("trendFrom").value,
    to = $("trendTo").value;
  if (from && to && from > to) {
    emptyChart("Start date must not be after end date.");
    return;
  }
  const model = trendModel(
    $("trendItem").value,
    trendRows,
    trendInfo.aggregation === "raw" ? from : "",
    trendInfo.aggregation === "raw" ? to : "",
  );
  if (!model.rows.length || !model.series.length) {
    emptyChart("No numeric data in the selected date range.");
    return;
  }
  const colors = ["#e55b1f", "#1976d2", "#28a745", "#a33bc4"];
  $("trendLegend").replaceChildren(
    ...model.series.map((s, i) => {
      const label = document.createElement("span");
      label.textContent =
        s.label +
        (model.dual
          ? s.axis === 0
            ? " — Primary / left"
            : " — Secondary / right"
          : "");
      label.style.color = colors[i];
      return label;
    }),
  );
  const left = 95,
    right = model.scales[1] ? 95 : 35,
    top = 35,
    bottom = 90;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  ctx.font = "14px Arial";
  ctx.fillStyle = "#52655e";
  ctx.strokeStyle = "#d8e1dd";
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    model.scales.forEach((scale, axis) => {
      if (!scale) return;
      ctx.textAlign = axis === 0 ? "right" : "left";
      ctx.fillText(
        formatNumber(scale.max - ((scale.max - scale.min) * i) / 4),
        axis === 0 ? left - 12 : width - right + 12,
        y + 5,
      );
    });
  }
  ctx.textAlign = "left";
  const axisLabel = (axis) =>
    model.series
      .filter((s) => s.axis === axis)
      .map((s) => s.label)
      .join(" / ");
  ctx.fillText(axisLabel(0), left, 20);
  if (model.scales[1]) {
    ctx.textAlign = "right";
    ctx.fillText(axisLabel(1), width - right, 20);
  }
  const times = model.rows.map(timestamp),
    minTime = times[0],
    maxTime = times[times.length - 1];
  const xFor = (i) =>
    left +
    plotWidth *
      (maxTime === minTime ? 0.5 : (times[i] - minTime) / (maxTime - minTime));
  const yFor = (value, axis) => {
    const scale = model.scales[axis];
    return top + (plotHeight * (scale.max - value)) / (scale.max - scale.min);
  };
  model.series.forEach((s, index) => {
    ctx.strokeStyle = colors[index];
    ctx.fillStyle = colors[index];
    ctx.lineWidth = 2.5;
    ctx.setLineDash(index === 1 ? [7, 5] : []);
    ctx.beginPath();
    let started = false;
    s.values.forEach((number, i) => {
      if (!Number.isFinite(number)) {
        started = false;
        return;
      }
      const x = xFor(i),
        y = yFor(number, s.axis);
      if (started) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      started = true;
    });
    ctx.stroke();
    ctx.setLineDash([]);
    s.values.forEach((number, i) => {
      if (!Number.isFinite(number)) return;
      const x = xFor(i),
        y = yFor(number, s.axis);
      ctx.beginPath();
      if (index === 1) {
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
      } else ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  // Label actual measurement times, deduplicated and spaced to avoid overlap.
  const ticks = [...new Set(times)],
    picked = [];
  ticks.forEach((time) => {
    const x =
      left +
      plotWidth *
        (minTime === maxTime ? 0.5 : (time - minTime) / (maxTime - minTime));
    if (!picked.length || x - picked[picked.length - 1].x >= 170)
      picked.push({ time, x });
  });
  const lastX = width - right;
  if (minTime !== maxTime && picked[picked.length - 1].time !== maxTime) {
    if (lastX - picked[picked.length - 1].x < 170) picked.pop();
    picked.push({ time: maxTime, x: lastX });
  }
  ctx.fillStyle = "#52655e";
  ctx.textAlign = "center";
  picked.forEach((tick) => {
    const [date, time] = dateLabel(tick.time).split(" ");
    ctx.fillText(date, tick.x, height - 59);
    ctx.fillText(time, tick.x, height - 39);
  });
  ctx.fillText("Inspection Date + Completion Time", width / 2, height - 12);
  $("trendStatus").textContent =
    model.name +
    ": " +
    model.rows.length +
    " records. Grouped by Check Item. " +
    (trendInfo.aggregation !== "raw"
      ? `${trendInfo.aggregation} averages from ${trendInfo.sourceCount} readings; averages may hide spikes. `
      : "") +
    (model.dual
      ? "Higher values: primary / left axis; lower values: secondary / right axis."
      : "Shared Y-axis for all series.");
  const header = document.createElement("tr");
  [
    "Inspection Date + Completion Time",
    "Inspection Type",
    ...model.series.map((s) => s.label),
  ].forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    header.append(th);
  });
  $("trendTableHead").replaceChildren(header);
  $("trendTableBody").replaceChildren(
    ...model.rows
      .slice(tablePage * 200, (tablePage + 1) * 200)
      .map((row, offset) => {
        const i = tablePage * 200 + offset;
        const tr = document.createElement("tr");
        [
          dateLabel(times[i]),
          field(row, "Inspection Type", "inspectionType") || "",
          ...model.series.map((s) =>
            Number.isFinite(s.values[i])
              ? formatNumber(s.values[i]) +
                (trendInfo.aggregation !== "raw"
                  ? ` (min ${formatNumber(row["Value " + s.column + " Min"])}, max ${formatNumber(row["Value " + s.column + " Max"])}, n=${row["Value " + s.column + " Count"]})`
                  : "")
              : "—",
          ),
        ].forEach((text) => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      }),
  );
  $("tablePage").textContent =
    `Page ${tablePage + 1} / ${Math.ceil(model.rows.length / 200)} · ${model.rows.length} rows`;
  $("tablePrev").disabled = tablePage === 0;
  $("tableNext").disabled = (tablePage + 1) * 200 >= model.rows.length;
}
async function loadTrends() {
  const generation = ++loadGeneration;
  $("refreshTrends").disabled = true;
  $("trendStatus").textContent = "Loading Google Sheet data…";
  try {
    const params = new URLSearchParams({
      trend: "1",
      period: $("trendPeriod").value,
    });
    if ($("trendFrom").value) params.set("from", $("trendFrom").value);
    if ($("trendTo").value) params.set("to", $("trendTo").value);
    const selectedName = $("trendItem").value;
    params.set(
      "checkItem",
      selectedName && selectedName !== "Loading…" ? selectedName : common[0][1],
    );
    const response = await fetch(API + "?" + params, { cache: "no-store" });
    if (!response.ok) throw Error("HTTP " + response.status);
    const out = await response.json();
    if (generation !== loadGeneration) return;
    if (!out.ok || !Array.isArray(out.rows))
      throw Error(out.error || "Trend data API is not enabled");
    backendSchemaVersion = Number(out.valueSchemaVersion || 1);
    if (backendSchemaVersion !== 3)
      throw new Error("Deploy the 17-value backend before using this version.");
    trendRows = out.rows;
    trendInfo = {
      aggregation: out.aggregation || "raw",
      sourceCount: out.sourceCount,
    };
    if (out.trendApiVersion !== 1)
      throw new Error(
        "Deploy the long-term backend before using this version.",
      );
    tablePage = 0;
    const selected = $("trendItem").value;
    // Include every configured Check Item, even before its first measurement.
    const names = [
      ...new Set(
        [...common, ...startup, ...shutdown]
          .map((item) => item[1])
          .concat(out.checkItems || trendRows.map(checkItem).filter(Boolean)),
      ),
    ];
    $("trendItem").replaceChildren(
      ...names.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
      }),
    );
    if (names.includes(selected)) $("trendItem").value = selected;
    draw();
  } catch (err) {
    if (generation !== loadGeneration) return;
    trendRows = [];
    $("trendChart").getContext("2d").clearRect(0, 0, 1100, 480);
    emptyChart("Trend data unavailable: " + err.message);
    $("trendStatus").textContent = "Trend data unavailable: " + err.message;
  } finally {
    if (generation === loadGeneration) $("refreshTrends").disabled = false;
  }
}
const now = new Date();
$("date").value = dateLabel(now.getTime()).slice(0, 10);
$("time").value = now.toTimeString().slice(0, 5);
$("mode").onchange = render;
$("form").onsubmit = save;
function setTrendRange() {
  const days = $("trendRange").value;
  if (days === "custom") return;
  $("trendTo").value = days === "all" ? "" : dateLabel(Date.now()).slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - Number(days) + 1);
  $("trendFrom").value =
    days === "all" ? "" : dateLabel(start.getTime()).slice(0, 10);
}
$("trendItem").onchange = loadTrends;
$("trendPeriod").onchange = loadTrends;
$("trendRange").onchange = () => {
  setTrendRange();
  loadTrends();
};
$("trendFrom").onchange = $("trendTo").onchange = () => {
  $("trendRange").value = "custom";
  loadTrends();
};
$("tablePrev").onclick = () => {
  tablePage--;
  draw();
};
$("tableNext").onclick = () => {
  tablePage++;
  draw();
};
$("refreshTrends").onclick = loadTrends;
render();
setTrendRange();
loadTrends();
