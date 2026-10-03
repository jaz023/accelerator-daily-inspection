const API =
  "https://script.google.com/macros/s/AKfycbx0Bj7pIwszUgv9O8mkLNjoGUj01i6jMz_wAFYzCER9XBjHOdx1sdtGjD8N79WzQPyqiA/exec";
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
function items() {
  return [...common, ...($("mode").value === "Startup" ? startup : shutdown)];
}
function render() {
  $("form").innerHTML = items()
    .map(
      (x) =>
        `<div class="row" data-id="${x[0]}"><div><b>${x[1]}</b><br><small>Standard: ${x[2]}</small></div><input class="v" placeholder="${x[3] === "th" ? "Temperature °C / Humidity %" : "Enter displayed value"}" required><input class="remark" placeholder="Remark"></div>`,
    )
    .join("");
}
function nums(v) {
  return (String(v ?? "").match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || []).map(
    Number,
  );
}
async function save(ev) {
  ev.preventDefault();
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
  const rows = rs.map((r) => {
    const x = items().find((i) => i[0] === r.dataset.id),
      v = r.querySelector(".v").value,
      n = nums(v),
      th = x[3] === "th",
      flow = /flow/.test(x[0]),
      sector = x[0] === "sector";
    return {
      parameterId: x[0],
      checkItem: x[1],
      unit: th ? "°C / %" : "",
      standardValue: x[2],
      recordedValue: v,
      value1: th ? (n[1] ?? "") : "",
      value2: th || sector ? (n[0] ?? "") : "",
      value3: th || flow || sector ? "" : (n[0] ?? ""),
      value4: th || flow || sector ? "" : (n[1] ?? ""),
      value5: flow ? (n[0] ?? "") : "",
      value6: flow ? (n[1] ?? "") : "",
      value7: flow ? (n[2] ?? "") : "",
      value8: flow ? (n[3] ?? "") : "",
      remark: r.querySelector(".remark").value,
    };
  });
  $("status").textContent = "Saving…";
  try {
    const out = await (
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          recordId: `${$("date").value}-${Date.now()}`,
          inspectionDate: $("date").value,
          completionTime: $("time").value,
          inspectionType: $("mode").value,
          workMode: $("op2").value.trim() ? "Two operators" : "Single operator",
          operator1: op,
          operator2: $("op2").value.trim(),
          measurements: rows,
        }),
      })
    ).json();
    if (!out.ok) throw Error(out.error);
    $("status").textContent = `Saved ${out.rowsAdded} rows.`;
    $("status").className = "ok";
    loadTrends();
  } catch (err) {
    $("status").textContent = "Save failed: " + err.message;
    $("status").className = "bad";
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
      { column: 4, label: "1st Temperature (K)" },
      { column: 3, label: "2nd Temperature (K)" },
    ];
  if (/Cryocooler/i.test(name))
    return [5, 6, 7, 8].map((column, i) => ({
      column,
      label: "Flow " + "ABCD"[i] + " (L/min)",
    }));
  if (/water flow/i.test(name))
    return [{ column: 5, label: "Water Flow (L/min)" }];
  if (/Filament/i.test(name))
    return [
      { column: 4, label: "Operation Time (min)" },
      { column: 3, label: "Current (A)" },
    ];
  if (/Sector/i.test(name)) return [{ column: 2, label: "Temperature (°C)" }];
  return [
    {
      column: 3,
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
    const min = Math.min(...numbers),
      max = Math.max(...numbers);
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
  const model = trendModel($("trendItem").value, trendRows, from, to);
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
    ...model.rows.map((row, i) => {
      const tr = document.createElement("tr");
      [
        dateLabel(times[i]),
        field(row, "Inspection Type", "inspectionType") || "",
        ...model.series.map((s) =>
          Number.isFinite(s.values[i]) ? formatNumber(s.values[i]) : "—",
        ),
      ].forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      });
      return tr;
    }),
  );
}
async function loadTrends() {
  $("refreshTrends").disabled = true;
  $("trendStatus").textContent = "Loading Google Sheet data…";
  try {
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) throw Error("HTTP " + response.status);
    const out = await response.json();
    if (!out.ok || !Array.isArray(out.rows))
      throw Error(out.error || "Trend data API is not enabled");
    trendRows = out.rows;
    const selected = $("trendItem").value;
    // Include every configured Check Item, even before its first measurement.
    const names = [
      ...new Set(
        [...common, ...startup, ...shutdown]
          .map((item) => item[1])
          .concat(trendRows.map(checkItem).filter(Boolean)),
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
    $("trendStatus").textContent = "Trend data unavailable: " + err.message;
  } finally {
    $("refreshTrends").disabled = false;
  }
}
const now = new Date();
$("date").value = dateLabel(now.getTime()).slice(0, 10);
$("time").value = now.toTimeString().slice(0, 5);
$("mode").onchange = render;
$("form").onsubmit = save;
$("trendItem").onchange = draw;
$("trendFrom").onchange = draw;
$("trendTo").onchange = draw;
$("refreshTrends").onclick = loadTrends;
render();
loadTrends();
