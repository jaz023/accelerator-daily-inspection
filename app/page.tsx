"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string;
  area: string;
  name: string;
  standard: string;
  kind?: "choice" | "temperatureHumidity";
  options?: string[];
  hint?: string;
};
type Rec = {
  id: string;
  inspection_date: string;
  shift: string;
  mode: string;
  operator_name: string;
  supervisor_name: string;
  status: string;
  abnormal_count: number;
  completed_count: number;
  total_count: number;
  responses_json: string;
  remarks: string;
  created_at: string;
};
const C = (
  id: string,
  area: string,
  name: string,
  standard = "Normal",
  options = ["Normal", "Abnormal"],
): Item => ({ id, area, name, standard, kind: "choice", options });
const N = (
  id: string,
  area: string,
  name: string,
  standard: string,
  hint = "Enter the displayed value",
): Item => ({ id, area, name, standard, hint });
const TH = (id: string, area: string, name: string): Item => ({
  id,
  area,
  name,
  standard: "22-26°C / < 60%",
  kind: "temperatureHumidity",
});
const common: Item[] = [
  TH(
    "room_th",
    "Accelerator room & pit",
    "Accelerator room temperature/Humidity",
  ),
  C(
    "room_ac",
    "Accelerator room & pit",
    "Accelerator room air condition",
    "ON",
    ["ON", "OFF"],
  ),
  TH(
    "bt_th",
    "Accelerator room & pit",
    "BT ambient temperature/Humidity",
  ),
  C("bt_ac", "Accelerator room & pit", "BT air condition", "ON", ["ON", "OFF"]),
  C(
    "water_leak",
    "Accelerator room & pit",
    "Water leakage Check",
    "No leakage",
    ["No leakage", "Leakage"],
  ),
  C(
    "gas_leak",
    "Accelerator room & pit",
    "Gas leakage, unusual odor or frosting",
    "No abnormality",
    ["No abnormality", "Abnormal"],
  ),
  C(
    "noise",
    "Accelerator room & pit",
    "Abnormal noise or vibration",
    "No abnormality",
    ["No abnormality", "Abnormal"],
  ),
  TH(
    "power_th",
    "Power supply room",
    "Power supply room temperature/humidity",
  ),
  C("power_ac", "Power supply room", "Power supply room air condition", "ON", [
    "ON",
    "OFF",
  ]),
  C("power_leak", "Power supply room", "Water leakage Check", "No leakage", [
    "No leakage",
    "Leakage",
  ]),
  C("pump_noise", "Cooling water room", "Pumps — Noise", "No abnormal noise", [
    "No abnormal noise",
    "Abnormal noise",
  ]),
];
const startup: Item[] = [
  C("network", "加速器控制室", "PLC 與 PC 網路狀態", "ONLINE", [
    "ONLINE",
    "OFFLINE",
  ]),
  N(
    "coil",
    "加速器控制室",
    "Upper coil A / B / C / D 最高溫度",
    "各組 <6.7 K",
    "例：2.513 / 3.708 / 3.556 / 3.655 K",
  ),
  N(
    "lead",
    "加速器控制室",
    "Power lead P / N 最高溫度",
    "各組 <65 K",
    "例：44.553 / 44.329 K",
  ),
  N(
    "vacuum_a",
    "加速器控制室",
    "開機前真空壓力 (A)",
    "<2.0E-4 Pa",
    "例：1.9E-4",
  ),
  N("vacuum_ba", "加速器控制室", "通水後壓差 (B-A)", "<0.5E-5 Pa"),
  N("sector", "加速器控制室", "Sector 溫度", "<33 °C"),
  N(
    "filament",
    "加速器控制室",
    "Filament 電流／運轉時間",
    ">90 A / <2000 min",
    "例：100.39 A / 15215 min",
  ),
  N("chimney", "加速器控制室", "Chimney Arc ON 運轉時間", "min"),
  C("water_ready", "加速器控制室", "冷卻水狀態", "Ready", [
    "Ready",
    "Not ready",
  ]),
  C("purity", "加速器控制室", "水質警報", "No alarm", ["No alarm", "Alarm"]),
  N(
    "cryo_a",
    "加速器控制室",
    "Cryopump-A 二級／一級溫度",
    "<20 / <85 K",
    "例：9.7 / 70 K",
  ),
  N(
    "cryo_b",
    "加速器控制室",
    "Cryopump-B 二級／一級溫度",
    "<20 / <85 K",
    "例：9.7 / 73 K",
  ),
  N("cryo_flow", "加速器室與 Pit", "Cryopump 水流量", ">9 L/min"),
  N(
    "cooler_flow",
    "加速器室與 Pit",
    "Cryocooler Comp A / B / C / D 水流量",
    "各組 >9 L/min",
    "例：9.7 / 9.6 / 9.6 / 9.6",
  ),
  C("h2_open", "加速器室與 Pit", "氫氣瓶閥門", "Open", ["Open", "異常"]),
  C(
    "rf_reset",
    "加速器室與 Pit",
    "RF amp cabinet breaker 每日 OFF → ON",
    "每日早晨執行",
    ["已完成", "異常"],
  ),
  C(
    "polarity",
    "加速器室與 Pit",
    "Filament current 極性／接線狀態",
    "每班交換",
    ["Straight", "Cross", "異常"],
  ),
  C("door", "加速器室與 Pit", "室內無人且屏蔽門已關閉", "已確認", [
    "已確認",
    "異常",
  ]),
  C("air_open", "冷卻水室", "乾燥空氣瓶閥門", "Open", ["Open", "異常"]),
  C("switch", "電源供應室", "受電開關", "ON", ["ON", "OFF"]),
  C("cable", "電源供應室", "電纜外觀", "無損傷"),
];
const shutdown: Item[] = [
  C("beam_record", "加速器控制室", "Ion chamber 使用紀錄已保存"),
  N("vacuum_gas", "加速器控制室", "有氣體時真空壓力", "<2.0E-3 Pa"),
  N("coil_stop", "加速器控制室", "Upper coil A/B/C/D 最高溫度", "<6.7 K"),
  N("lead_stop", "加速器控制室", "Power lead P/N 最高溫度", "<65 K"),
  N("cryo_a_stop", "加速器控制室", "Cryopump-A 二級／一級溫度", "<20 / <85 K"),
  N("cryo_b_stop", "加速器控制室", "Cryopump-B 二級／一級溫度", "<20 / <85 K"),
  C("air_close", "冷卻水室", "乾燥空氣瓶閥門已關閉"),
  C("h2_close", "加速器室與 Pit", "氫氣瓶閥門已關閉"),
];
const startupEnglish: Item[] = [
  C(
    "network",
    "Accelerator Control room",
    "PLC & PC network status",
    "ON_LINE",
    ["ON_LINE", "OFF_LINE"],
  ),
  N(
    "coil",
    "Accelerator Control room",
    "Maximum Upper coil temperature",
    "< 6.7 K",
    "A / B / C / D",
  ),
  N(
    "lead",
    "Accelerator Control room",
    "Maximum power lead temperature",
    "< 65 K",
    "P / N",
  ),
  N(
    "vacuum_a",
    "Accelerator Control room",
    "Vacuum pressure (before startup) (A)",
    "<2.0E-4 Pa",
    "e.g. 1.9E-4",
  ),
  N(
    "vacuum_ba",
    "Accelerator Control room",
    "(After pass water) The difference pressure between (B) and (A)",
    "<0.5E-5 Pa",
  ),
  N("sector", "Accelerator Control room", "Sector — Temperature", "< 33 °C"),
  N(
    "filament",
    "Accelerator Control room",
    "Filament current / operation times",
    ">90A / <2000mins",
    "A / Mins",
  ),
  N("chimney", "Accelerator Control room", "Operation time (arc ON)", "Mins"),
  C(
    "water_ready",
    "Accelerator Control room",
    "Cooling water — Water flow rate",
    "Ready",
    ["Ready", "Not ready"],
  ),
  C(
    "purity",
    "Accelerator Control room",
    "Cooling water — Purity",
    "No alarm",
    ["No alarm", "Alarm"],
  ),
  N(
    "cryo_a",
    "Accelerator Control room",
    "Cryopump-A — 2nd temperature / 1st temperature",
    "< 20 / < 85 K",
  ),
  N(
    "cryo_b",
    "Accelerator Control room",
    "Cryopump-B — 2nd temperature / 1st temperature",
    "< 20 / < 85 K",
  ),
  N(
    "cryo_flow",
    "Accelerator room & pit",
    "Cryopump — Water flow rate",
    ">9 L/min",
  ),
  N(
    "cooler_flow",
    "Accelerator room & pit",
    "Cryocooler — Water flow rate (Comp A, B, C, D)",
    ">9 L/min",
    "A / B / C / D",
  ),
  C(
    "h2_open",
    "Accelerator room & pit",
    "Hydrogen gas cylinder valve",
    "Open the valve",
    ["Open the valve", "Abnormal"],
  ),
  C(
    "rf_reset",
    "Accelerator room & pit",
    "RF amp cabinet",
    "Turn the breaker OFF and ON",
    ["Completed", "Abnormal"],
  ),
  C(
    "polarity",
    "Accelerator room & pit",
    "Exchange the polarity of filament current",
    "Exchange the cable",
    ["Straight", "Cross", "Abnormal"],
  ),
  C(
    "door",
    "Accelerator room & pit",
    "No one remains in accelerator room and close the shielding door",
    "No one",
    ["No one & close the door", "Abnormal"],
  ),
  C(
    "air_open",
    "Cooling water room",
    "Dry air gas cylinder valve",
    "Open the valve",
    ["Open the valve", "Abnormal"],
  ),
  C("switch", "Power supply room", "Power-receiving switch", "ON", [
    "ON",
    "OFF",
  ]),
  C("cable", "Power supply room", "Cable", "No damage", [
    "No damage",
    "Damage",
  ]),
];
const shutdownEnglish: Item[] = [
  C(
    "beam_record",
    "Accelerator Control room",
    "Integrated beam use Ion chamber",
    "Record",
    ["Record", "Abnormal"],
  ),
  N(
    "vacuum_gas",
    "Accelerator Control room",
    "Vacuum pressure with gas",
    "< 2.0E-3 Pa",
  ),
  N(
    "coil_stop",
    "Accelerator Control room",
    "Maximum Upper coil temperature",
    "< 6.7 K",
    "A / B / C / D",
  ),
  N(
    "lead_stop",
    "Accelerator Control room",
    "Maximum power lead temperature",
    "< 65 K",
    "P / N",
  ),
  N(
    "cryo_a_stop",
    "Accelerator Control room",
    "Cryopump-A — 2nd temperature / 1st temperature",
    "< 20 / < 85 K",
  ),
  N(
    "cryo_b_stop",
    "Accelerator Control room",
    "Cryopump-B — 2nd temperature / 1st temperature",
    "< 20 / < 85 K",
  ),
  C(
    "air_close",
    "Cooling water room",
    "Dry air gas cylinder",
    "Close the valve",
    ["Close the valve", "Abnormal"],
  ),
  C(
    "h2_close",
    "Accelerator room & pit",
    "Hydrogen gas cylinder",
    "Close the valve",
    ["Close the valve", "Abnormal"],
  ),
];

function Signature({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ref.current!,
      r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const c = ref.current!,
      p = point(e),
      x = c.getContext("2d")!;
    x.beginPath();
    x.moveTo(p.x, p.y);
    c.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = ref.current!,
      p = point(e),
      x = c.getContext("2d")!;
    x.lineWidth = 2.2;
    x.lineCap = "round";
    x.strokeStyle = "#17231f";
    x.lineTo(p.x, p.y);
    x.stroke();
  }
  function up() {
    drawing.current = false;
    onChange(ref.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = ref.current!,
      x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    onChange("");
  }
  return (
    <label className="signature">
      {label}
      <canvas
        ref={ref}
        width="500"
        height="130"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      />
      <button type="button" onClick={clear}>
        Clear signature
      </button>
      {value && <span>✓ Signed</span>}
    </label>
  );
}

function paperMeta(x: Item) {
  const control = x.area === "Accelerator Control room",
    cool = x.area === "Cooling water room",
    power = x.area === "Power supply room";
  let device = x.name.split(" ")[0],
    sub = control
      ? "Beam Scheduler"
      : cool
        ? "Building"
        : power
          ? "Building / Power supply"
          : "Accelerator / Building";
  if (x.name.includes("Cryopump"))
    device = x.name.includes("-A")
      ? "Cryopump-A"
      : x.name.includes("-B")
        ? "Cryopump-B"
        : "Cryopump";
  else if (x.name.includes("Cryocooler")) device = "Cryocooler";
  else if (x.name.includes("Vacuum")) device = "Cyclotron vacuum chamber";
  else if (
    x.name.includes("air condition") ||
    x.name.includes("temperature/Humidity") ||
    x.name.includes("temperature/humidity")
  )
    device = "Building";
  else if (x.name.includes("Water leakage")) device = "Cooling water manifold";
  return {
    place: x.area,
    sub,
    device,
    unit: x.standard.match(/Pa|K|°C|L\/min|min|%RH/)?.[0] || "----",
    remark: x.id.includes("coil")
      ? "Upper coil: A/B/C/D"
      : x.id.includes("lead")
        ? "Power lead: P/N"
        : x.id.includes("ac")
          ? "Air condition: ON or OFF"
          : "",
  };
}

function paperExportItems(mode: string) {
  const source = [...startupEnglish, ...shutdownEnglish, ...common];
  const ids =
    mode === "startup"
      ? [
          "coil", "lead", "vacuum_a", "vacuum_ba", "sector", "filament",
          "chimney", "cryo_a", "cryo_b", "cryo_flow", "cooler_flow",
          "room_th", "bt_th", "power_th",
        ]
      : [
          "vacuum_gas", "coil_stop", "lead_stop", "cryo_a_stop", "cryo_b_stop",
          "room_th", "bt_th", "power_th",
        ];
  return ids.map((id) => source.find((item) => item.id === id)!).filter(Boolean);
}

export default function Home() {
  const [screen, setScreen] = useState<"list" | "form" | "detail">("list"),
    [mode, setMode] = useState<"startup" | "shutdown">("startup"),
    [rows, setRows] = useState<Rec[]>([]),
    [chosen, setChosen] = useState<Rec | null>(null),
    [v, setV] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState({
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    shift: "Day shift",
    workMode: "Two operators",
    singleReason: "",
    operator1: "",
    operator2: "",
    signature1: "",
    signature2: "",
    remarks: "",
  });
  const abnormalValues = new Set([
    "Abnormal",
    "OFF_LINE",
    "Not ready",
    "Alarm",
    "OFF",
  ]);
  const items = useMemo(
      () => paperExportItems(mode),
      [mode],
    ),
    done = items.filter((x) => v[x.id]?.trim()).length,
    bad = Object.values(v).filter((x) => abnormalValues.has(x)).length;
  const load = () =>
    fetch("/api/inspections", { cache: "no-store" })
      .then((r) => r.json())
      .then(setRows);
  useEffect(() => {
    load();
  }, []);
  const begin = (m: "startup" | "shutdown") => {
    setMode(m);
    setV({});
    setScreen("form");
  };
  async function save(e: FormEvent, final: boolean) {
    e.preventDefault();
    const single = meta.workMode === "Single-operator exception";
    if (!meta.operator1.trim() || (!single && !meta.operator2.trim()))
      return alert(
        single ? "Enter the operator name." : "Enter both operator names.",
      );
    if (single && !meta.singleReason.trim())
      return alert("A reason is required for a single-operator exception.");
    if (final && (!meta.signature1 || (!single && !meta.signature2)))
      return alert(
        single
          ? "The operator must sign before submission."
          : "Both operators must sign before submission.",
      );
    if (final && done < items.length)
      return alert("Complete all required checks before submission.");
    const r = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: meta.date,
        shift: meta.shift,
        operator: single
          ? meta.operator1
          : `${meta.operator1} / ${meta.operator2}`,
        supervisor: "",
        remarks: meta.remarks,
        mode,
        status: final ? "completed" : "draft",
        responses: {
          ...v,
          _inspection_time: final
            ? new Date().toTimeString().slice(0, 5)
            : meta.time,
          _work_mode: meta.workMode,
          _single_reason: meta.singleReason,
          _operator1: meta.operator1,
          _operator2: single ? "" : meta.operator2,
          _signature1: meta.signature1,
          _signature2: single ? "" : meta.signature2,
        },
        measurements: items.map((item) => {
          const paper = paperMeta(item);
          const recordedValue = v[item.id] || "";
          const numericValues = recordedValue.match(
            /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
          ) || [];
          return {
            place: paper.place,
            device: paper.device,
            parameterId: item.id,
            checkItem: item.name,
            unit: paper.unit,
            standardValue: item.standard,
            recordedValue,
            value1: numericValues[0] || "",
            value2: numericValues[1] || "",
            value3: numericValues[2] || "",
            value4: numericValues[3] || "",
            status: abnormalValues.has(recordedValue) ? "Abnormal" : "Normal",
            remark: paper.remark,
          };
        }),
        abnormalCount: bad,
        completedCount: done,
        totalCount: items.length,
      }),
    });
    const result = (await r.json()) as { sheetSync?: string };
    if (!r.ok) return alert("Unable to save the record.");
    if (final && result.sheetSync === "failed")
      alert(
        "The inspection was saved, but Google Sheets sync failed. Please contact the system administrator.",
      );
    await load();
    setScreen("list");
  }
  const temperatureOptions = Array.from({ length: 41 }, (_, i) =>
    (15 + i * 0.5).toFixed(1),
  );
  const humidityOptions = Array.from({ length: 61 }, (_, i) => String(20 + i));
  function thPart(value: string, index: number) {
    return value.match(/\d+(?:\.\d+)?/g)?.[index] || "";
  }
  function setTemperatureHumidity(
    id: string,
    temperature: string,
    humidity: string,
  ) {
    setV({
      ...v,
      [id]: temperature && humidity ? `${temperature} °C / ${humidity} %` : "",
    });
  }
  function exportExcel() {
    const head = [
        "Record ID",
        "Date",
        "Time",
        "Shift",
        "Type",
        "Work mode",
        "Single-operator reason",
        "Operator 1",
        "Operator 2",
        "Place",
        "Check items",
        "Standard value",
        "Check",
        "Abnormal",
        "Remark",
        "Created at",
      ],
      lines = [head];
    for (const r of rows) {
      const data = JSON.parse(r.responses_json || "{}"),
        list = paperExportItems(r.mode);
      for (const x of list)
        lines.push([
          r.id,
          r.inspection_date,
          data._inspection_time || "",
          r.shift,
          r.mode === "startup" ? "Startup" : "Shutdown",
          data._work_mode || "Two operators",
          data._single_reason || "",
          data._operator1 || r.operator_name,
          data._operator2 || "",
          x.area,
          x.name,
          x.standard,
          data[x.id] || "",
          abnormalValues.has(data[x.id]) ? "Yes" : "No",
          r.remarks,
          r.created_at,
        ]);
    }
    const csv =
        "\uFEFF" +
        lines
          .map((a) =>
            a
              .map((z) => `"${String(z ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\r\n"),
      u = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = u;
    a.download = `Accelerator_daily_inspection_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(u);
  }
  function exportPaperExcel(record: Rec) {
    const data = JSON.parse(record.responses_json || "{}"),
      list = paperExportItems(record.mode),
      esc = (value: unknown) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;"),
      rowsHtml = list
        .map((x) => {
          const m = paperMeta(x);
          return `<tr><td>${esc(m.place)}</td><td>${esc(m.sub)}</td><td>${esc(m.device)}</td><td>${esc(x.name)}</td><td class="center">${esc(m.unit)}</td><td class="center">${esc(x.standard)}</td><td class="center">${esc(data[x.id] || "")}</td><td>${esc(m.remark)}</td></tr>`;
        })
        .join(""),
      secondOperator =
        data._work_mode === "Single-operator exception"
          ? `Single-operator exception: ${esc(data._single_reason || "")}`
          : `Operator 2: ${esc(data._operator2 || "")}`,
      html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:10pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #222;padding:4px;vertical-align:middle}th{font-weight:bold;text-align:center;background:#e7e7e7}.top td{border:0;font-weight:bold;font-size:12pt}.center{text-align:center}.sheet-title{font-weight:bold;margin-top:12px}.sign td{height:28px}</style></head><body><table><tr class="top"><td colspan="7">${record.mode === "startup" ? "Startup" : "Shutdown"}</td><td>${record.mode === "startup" ? "Rev.02" : "Rev.01"}</td></tr><tr><th>Place</th><th>Sub system</th><th>Device</th><th>Check items</th><th>(Unit)</th><th>Standard value</th><th>Check</th><th>Remark</th></tr>${rowsHtml}</table><div class="sheet-title">Daily ${record.mode === "startup" ? "Startup" : "Shutdown"} Sheet</div><table class="sign"><tr><td>Supervisor: ____________________</td><td>Date: ${esc(record.inspection_date)}</td><td>Time: ${esc(data._inspection_time || "")}</td><td>Operator 1: ${esc(data._operator1 || record.operator_name)}</td></tr><tr><td colspan="2">${secondOperator}</td><td colspan="2">Operator signature(s): Recorded electronically</td></tr></table></body></html>`,
      url = URL.createObjectURL(
        new Blob(["\uFEFF", html], {
          type: "application/vnd.ms-excel;charset=utf-8",
        }),
      ),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Daily_${record.mode === "startup" ? "Startup" : "Shutdown"}_${record.inspection_date}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const groups = items.reduce<Record<string, Item[]>>((a, x) => {
    (a[x.area] ??= []).push(x);
    return a;
  }, {});
  return (
    <main>
      <header>
        <div className="brand">
          <b>A</b>
          <span>
            <strong>Accelerator Daily Inspection</strong>
            <small>Digital Record System</small>
          </span>
        </div>
        <nav>
          <button onClick={() => setScreen("list")}>Records</button>
          <button onClick={() => begin("startup")}>New Startup</button>
          <button onClick={() => begin("shutdown")}>New Shutdown</button>
        </nav>
      </header>
      {screen === "list" && (
        <div className="page">
          <section className="hero">
            <div>
              <em>DAILY OPERATIONS</em>
              <h1>Daily inspection at a glance</h1>
              <p>
                Operator signatures, exception tracking and parameter analysis.
              </p>
            </div>
            <div>
              <button onClick={exportExcel}>Export analysis CSV</button>
              <button className="primary" onClick={() => begin("startup")}>
                ＋ Startup Inspection
              </button>
              <button onClick={() => begin("shutdown")}>
                ＋ Shutdown Inspection
              </button>
            </div>
          </section>
          <section className="cards">
            <article>
              <small>Total records</small>
              <b>{rows.length}</b>
            </article>
            <article>
              <small>Draft records</small>
              <b>{rows.filter((x) => x.status !== "completed").length}</b>
            </article>
            <article>
              <small>Abnormal items</small>
              <b>{rows.reduce((a, x) => a + x.abnormal_count, 0)}</b>
            </article>
          </section>
          <section className="panel">
            <div className="panelTitle">
              <h2>Inspection records</h2>
              <button onClick={load}>Refresh</button>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Type</th>
                    <th>Operator(s)</th>
                    <th>Progress</th>
                    <th>Abnormal</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => {
                          setChosen(r);
                          setScreen("detail");
                        }}
                      >
                        <td>{r.inspection_date}</td>
                        <td>{r.shift}</td>
                        <td>
                          <i>{r.mode === "startup" ? "Startup" : "Shutdown"}</i>
                        </td>
                        <td>{r.operator_name}</td>
                        <td>
                          {r.completed_count}/{r.total_count}
                        </td>
                        <td className="danger">{r.abnormal_count || "—"}</td>
                        <td>
                          <i className={r.status}>
                            {r.status === "completed" ? "Completed" : "Draft"}
                          </i>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="empty">
                        No records yet. Create the first inspection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {screen === "form" && (
        <form className="page" onSubmit={(e) => save(e, false)}>
          <div className="title">
            <div>
              <button type="button" onClick={() => setScreen("list")}>
                ← Back
              </button>
              <em>{mode.toUpperCase()}</em>
              <h1>
                Daily {mode === "startup" ? "Startup" : "Shutdown"} Inspection
              </h1>
            </div>
            <div className="count">
              <b>
                {done}/{items.length}
              </b>
              <small>Completed</small>
            </div>
          </div>
          <section className="modePanel">
            <strong>Work mode</strong>
            <div className="buttons">
              {["Two operators", "Single-operator exception"].map((option) => (
                <button
                  type="button"
                  key={option}
                  className={meta.workMode === option ? "yes" : ""}
                  onClick={() =>
                    setMeta({
                      ...meta,
                      workMode: option,
                      operator2:
                        option === "Single-operator exception"
                          ? ""
                          : meta.operator2,
                      signature2:
                        option === "Single-operator exception"
                          ? ""
                          : meta.signature2,
                    })
                  }
                >
                  {option}
                </button>
              ))}
            </div>
            {meta.workMode === "Single-operator exception" && (
              <label>
                Reason for single-operator exception *
                <textarea
                  value={meta.singleReason}
                  onChange={(e) =>
                    setMeta({ ...meta, singleReason: e.target.value })
                  }
                  placeholder="e.g. night shift or temporary staffing shortage"
                />
              </label>
            )}
          </section>
          <section className="meta">
            <label>
              Date
              <input
                type="date"
                value={meta.date}
                onChange={(e) => setMeta({ ...meta, date: e.target.value })}
              />
            </label>
            <label>
              Completion time (recorded automatically on submission)
              <input type="time" value={meta.time} readOnly />
            </label>
            <label>
              Shift
              <select
                value={meta.shift}
                onChange={(e) => setMeta({ ...meta, shift: e.target.value })}
              >
                <option>Day shift</option>
                <option>Evening shift</option>
                <option>Night shift</option>
              </select>
            </label>
            <div
              className={`operatorEntry ${
                meta.workMode === "Single-operator exception" ? "full" : ""
              }`}
            >
              <label>
                Operator 1 *
                <input
                  value={meta.operator1}
                  onChange={(e) =>
                    setMeta({ ...meta, operator1: e.target.value })
                  }
                />
              </label>
              <Signature
                label="Operator 1 handwritten signature *"
                value={meta.signature1}
                onChange={(x) => setMeta({ ...meta, signature1: x })}
              />
            </div>
            {meta.workMode === "Two operators" && (
              <div className="operatorEntry">
                <label>
                  Operator 2 *
                  <input
                    value={meta.operator2}
                    onChange={(e) =>
                      setMeta({ ...meta, operator2: e.target.value })
                    }
                  />
                </label>
                <Signature
                  label="Operator 2 handwritten signature *"
                  value={meta.signature2}
                  onChange={(x) => setMeta({ ...meta, signature2: x })}
                />
              </div>
            )}
          </section>
          {Object.entries(groups).map(([area, xs], n) => (
            <section className="group" key={area}>
              <h2>
                <span>{n + 1}</span>
                {area}
                <small>{xs.length} items</small>
              </h2>
              {xs.map((x) => (
                <div className="check" key={x.id}>
                  <div>
                    <strong>{x.name}</strong>
                    <small>Standard: {x.standard}</small>
                  </div>
                  {x.kind === "choice" ? (
                    <div className="buttons">
                      {x.options!.map((o) => (
                        <button
                          key={o}
                          type="button"
                          className={
                            v[x.id] === o
                              ? abnormalValues.has(o)
                                ? "no"
                                : "yes"
                              : ""
                          }
                          onClick={() => setV({ ...v, [x.id]: o })}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : x.kind === "temperatureHumidity" ? (
                    <div className="temperatureHumidity">
                      <label>
                        Temperature (°C)
                        <select
                          value={thPart(v[x.id] || "", 0)}
                          onChange={(e) =>
                            setTemperatureHumidity(
                              x.id,
                              e.target.value,
                              thPart(v[x.id] || "", 1),
                            )
                          }
                        >
                          <option value="">Select</option>
                          {temperatureOptions.map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Humidity (%RH)
                        <select
                          value={thPart(v[x.id] || "", 1)}
                          onChange={(e) =>
                            setTemperatureHumidity(
                              x.id,
                              thPart(v[x.id] || "", 0),
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Select</option>
                          {humidityOptions.map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <input
                      value={v[x.id] || ""}
                      onChange={(e) => setV({ ...v, [x.id]: e.target.value })}
                      placeholder={x.hint || "Enter the displayed value"}
                    />
                  )}
                </div>
              ))}
            </section>
          ))}
          <section className="notes">
            <label>
              Remark / abnormal handling
              <textarea
                value={meta.remarks}
                onChange={(e) => setMeta({ ...meta, remarks: e.target.value })}
              />
            </label>
          </section>
          <div className="actions">
            <span className={bad ? "danger" : ""}>
              {bad
                ? `⚠ ${bad} abnormal item(s). Enter the handling details.`
                : "Completion time is recorded automatically. Required operator signature(s) must be present."}
            </span>
            <button type="submit">Save draft</button>
            <button
              type="button"
              className="primary"
              onClick={(e) => save(e as unknown as FormEvent, true)}
            >
              Submit completed inspection
            </button>
          </div>
        </form>
      )}
      {screen === "detail" && chosen && (
        <div className="page">
          <div className="printbar">
            <button onClick={() => setScreen("list")}>← Back</button>
            <div>
              <button onClick={() => exportPaperExcel(chosen)}>
                Export Excel sheet
              </button>
              <button className="primary" onClick={() => print()}>
                Print / Save as PDF
              </button>
            </div>
          </div>
          <article className="report paperReport">
            {(() => {
              const d = JSON.parse(chosen.responses_json || "{}");
              return (
                <>
                  <div className="paperTop">
                    <b>{chosen.mode === "startup" ? "Startup" : "Shutdown"}</b>
                    <span>
                      {chosen.mode === "startup" ? "Rev.02" : "Rev.01"}
                    </span>
                  </div>
                  <table className="paperTable">
                    <thead>
                      <tr>
                        <th>Place</th>
                        <th>Sub system</th>
                        <th>Device</th>
                        <th>Check items</th>
                        <th>(Unit)</th>
                        <th>Standard value</th>
                        <th>Check</th>
                        <th>Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperExportItems(chosen.mode).map((x) => {
                        const z = d[x.id] || "—",
                          m = paperMeta(x);
                        return (
                          <tr
                            key={x.id}
                            className={abnormalValues.has(z) ? "abnormal" : ""}
                          >
                            <td>{m.place}</td>
                            <td>{m.sub}</td>
                            <td>{m.device}</td>
                            <td>{x.name}</td>
                            <td>{m.unit}</td>
                            <td>{x.standard}</td>
                            <td>
                              <b>{z}</b>
                            </td>
                            <td>{m.remark}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="paperSign">
                    <b>
                      Daily {chosen.mode === "startup" ? "Startup" : "Shutdown"}{" "}
                      Sheet
                    </b>
                    <span>Supervisor: ______________________________</span>
                    <span>Date: {chosen.inspection_date}</span>
                    <span>Time: {d._inspection_time || "—"}</span>
                    <span>Operator 1: {d._operator1 || "—"}</span>
                    <span>
                      Mode: {d._work_mode || "Two operators"}
                      {d._single_reason ? `（${d._single_reason}）` : ""}
                    </span>
                    {d._work_mode !== "Single-operator exception" && (
                      <span>Operator 2: {d._operator2 || "—"}</span>
                    )}
                  </div>
                  <div className="signaturePrint">
                    {d._signature1 && (
                      <figure>
                        <img src={d._signature1} alt="Operator 1 signature" />
                        <figcaption>Operator 1</figcaption>
                      </figure>
                    )}
                    {d._signature2 && (
                      <figure>
                        <img src={d._signature2} alt="Operator 2 signature" />
                        <figcaption>Operator 2</figcaption>
                      </figure>
                    )}
                  </div>
                  <div className="reportNotes">
                    <small>Remark / abnormal handling</small>
                    <p>{chosen.remarks || "None"}</p>
                  </div>
                  <footer>
                    Record ID: {chosen.id}　Created at:
                    {new Date(chosen.created_at).toLocaleString("zh-TW")}
                  </footer>
                </>
              );
            })()}
          </article>
        </div>
      )}
    </main>
  );
}
