import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  FUZZY INFERENCE ENGINE — mirrors MATLAB FIS exactly
// ═══════════════════════════════════════════════════════════

const trimf = (x, a, b, c) => {
  if (x <= a || x >= c) return 0;
  if (x <= b) return b === a ? 1 : (x - a) / (b - a);
  return c === b ? 1 : (c - x) / (c - b);
};

const trapmf = (x, a, b, c, d) => {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
};

const gaussmf = (x, sigma, c) =>
  Math.exp(-((x - c) ** 2) / (2 * sigma ** 2));

// Input MFs
const solarMFs = [
  (x) => trimf(x, 0, 0, 450),
  (x) => trimf(x, 150, 500, 850),
  (x) => trimf(x, 550, 1000, 1000),
];
const windMFs = [
  (x) => trapmf(x, 0, 0, 3, 8),
  (x) => trapmf(x, 3, 7, 14, 18),
  (x) => trapmf(x, 13, 17, 25, 25),
];
const batteryMFs = [
  (x) => gaussmf(x, 22, 0),
  (x) => gaussmf(x, 22, 50),
  (x) => gaussmf(x, 22, 100),
];
const demandMFs = [
  (x) => trimf(x, 0, 0, 45),
  (x) => trimf(x, 20, 50, 80),
  (x) => trimf(x, 55, 100, 100),
];

// Output MFs
const outputMFs = [
  { name: "VeryLow", fn: (x) => trimf(x, 0, 0, 25) },
  { name: "Low",     fn: (x) => trimf(x, 10, 25, 45) },
  { name: "Medium",  fn: (x) => trimf(x, 30, 50, 70) },
  { name: "High",    fn: (x) => trimf(x, 55, 75, 90) },
  { name: "VeryHigh",fn: (x) => trimf(x, 80, 100, 100) },
];

// 15 rules: [sol, wind, bat, dem, out] (1-indexed)
const RULES = [
  [3,3,3,1,5],[3,3,3,2,5],[3,3,2,2,4],[3,2,3,2,4],[2,3,3,2,4],
  [2,2,3,2,3],[2,2,2,2,3],[3,1,2,3,3],[1,3,2,3,3],[2,2,3,3,3],
  [1,1,3,1,2],[1,1,2,2,2],[1,1,1,3,1],[3,3,3,3,4],[1,2,1,3,1],
];

function evalFIS(solar, wind, battery, demand) {
  const ms = [
    solarMFs.map((f) => f(solar)),
    windMFs.map((f) => f(wind)),
    batteryMFs.map((f) => f(battery)),
    demandMFs.map((f) => f(demand)),
  ];

  const N = 500;
  const xs = Array.from({ length: N }, (_, i) => (i / (N - 1)) * 100);
  const aggr = new Array(N).fill(0);
  const firedRules = [];

  RULES.forEach((r, idx) => {
    const alpha = Math.min(
      ms[0][r[0] - 1], ms[1][r[1] - 1],
      ms[2][r[2] - 1], ms[3][r[3] - 1]
    );
    if (alpha > 0.001) {
      firedRules.push({ rule: idx + 1, alpha: +alpha.toFixed(4), output: outputMFs[r[4] - 1].name });
      xs.forEach((x, i) => {
        const y = Math.min(alpha, outputMFs[r[4] - 1].fn(x));
        if (y > aggr[i]) aggr[i] = y;
      });
    }
  });

  const sumW = aggr.reduce((a, b) => a + b, 0);
  const centroid = sumW < 1e-6 ? 50 : xs.reduce((a, x, i) => a + x * aggr[i], 0) / sumW;

  return { centroid: +centroid.toFixed(2), firedRules, aggr, xs };
}

// ═══════════════════════════════════════════════════════════
//  COLOUR HELPERS
// ═══════════════════════════════════════════════════════════
const outputColor = (val) => {
  if (val >= 75) return "#22c55e";
  if (val >= 55) return "#86efac";
  if (val >= 35) return "#facc15";
  if (val >= 15) return "#fb923c";
  return "#ef4444";
};

const MF_COLORS = ["#ef4444","#f97316","#22c55e"];
const OUT_COLORS = ["#ef4444","#f97316","#facc15","#86efac","#22c55e"];

// ═══════════════════════════════════════════════════════════
//  SVG MINI CHARTS
// ═══════════════════════════════════════════════════════════
function MFChart({ mfs, range, value, colors, labels }) {
  const W = 260, H = 90, PL = 8, PR = 8, PT = 6, PB = 18;
  const iW = W - PL - PR, iH = H - PT - PB;
  const [min, max] = range;
  const toX = (v) => PL + ((v - min) / (max - min)) * iW;
  const toY = (v) => PT + (1 - v) * iH;
  const pts = (fn) =>
    Array.from({ length: 200 }, (_, i) => {
      const x = min + (i / 199) * (max - min);
      return `${toX(x)},${toY(fn(x))}`;
    }).join(" ");

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <line x1={PL} y1={PT+iH} x2={PL+iW} y2={PT+iH} stroke="#334155" strokeWidth="1"/>
      <line x1={PL} y1={PT}    x2={PL}    y2={PT+iH} stroke="#334155" strokeWidth="1"/>
      {mfs.map((fn, i) => (
        <polyline key={i} points={pts(fn)}
          fill="none" stroke={colors[i]} strokeWidth="1.8" opacity="0.9"/>
      ))}
      {value !== undefined && (
        <line x1={toX(value)} y1={PT} x2={toX(value)} y2={PT+iH}
          stroke="#fff" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.7"/>
      )}
      {labels && [0,1,2].map(i => {
        const xv = min + (i/2)*(max-min);
        return <text key={i} x={toX(xv)} y={H-3} textAnchor="middle"
          fontSize="8" fill="#64748b">{xv % 1 === 0 ? xv : xv.toFixed(0)}</text>;
      })}
    </svg>
  );
}
function Slider({ label, value, min, max, step, unit, onChange, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display:"flex", justifyContent:"space-between",
        marginBottom: 4, fontSize: 12 }}>
        <span style={{ color:"#94a3b8" }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value} {unit}</span>
      </div>
      <div style={{ position:"relative", height: 6, background:"#1e293b",
        borderRadius: 99 }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%",
          width: `${pct}%`, background: color, borderRadius: 99,
          transition:"width 0.1s" }}/>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(+e.target.value)}
          style={{ position:"absolute", inset:"-4px 0", opacity:0,
            cursor:"pointer", width:"100%" }}/>
      </div>
    </div>
  );
}
function GaugeChart({ value }) {
  const W = 200, H = 120, cx = 100, cy = 105, r = 75;

  const valToAngle = (v) => Math.PI - (v / 100) * Math.PI;
  const toXY = (a) => ({
    x: cx + r * Math.cos(a),
    y: cy - r * Math.sin(a)
  });

  const makeArc = (fromVal, toVal, color) => {
    const a1 = valToAngle(fromVal);
    const a2 = valToAngle(toVal);
    const s = toXY(a1);
    const e = toXY(a2);
    return (
      <path
        d={`M${s.x},${s.y} A${r},${r} 0 0,1 ${e.x},${e.y}`}
        fill="none" stroke={color} strokeWidth="14" opacity="0.35"
      />
    );
  };

  const needleAngle = valToAngle(value);
  const needleTip = toXY(needleAngle);
  const col = outputColor(value);

  return (
    <svg width={W} height={H}>
      {/* Background arc zones */}
      {makeArc(0,  20,  "#ef4444")}
      {makeArc(20, 40,  "#f97316")}
      {makeArc(40, 60,  "#facc15")}
      {makeArc(60, 80,  "#86efac")}
      {makeArc(80, 100, "#22c55e")}

      {/* Active arc up to current value */}
      <path
        d={`M${toXY(valToAngle(0)).x},${toXY(valToAngle(0)).y}
            A${r},${r} 0 0,1
            ${toXY(valToAngle(value)).x},${toXY(valToAngle(value)).y}`}
        fill="none" stroke={col} strokeWidth="14" opacity="0.9"
      />

      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={needleTip.x} y2={needleTip.y}
        stroke="#f1f5f9" strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="6" fill="#1e293b" stroke="#f1f5f9" strokeWidth="2"/>

      {/* Value text */}
      <text x={cx} y={cy - 22} textAnchor="middle"
        fontSize="22" fontWeight="bold" fill={col}>{value}</text>
      <text x={cx} y={cy - 8} textAnchor="middle"
        fontSize="9" fill="#94a3b8">% Renewable</text>

      {/* Min/Max labels */}
      <text x={12}   y={H - 4} fontSize="8" fill="#64748b">0%</text>
      <text x={W-20} y={H - 4} fontSize="8" fill="#64748b">100%</text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════
const PRESETS = [
  { name:"☀️ Peak Solar",  solar:900, wind:20, battery:90, demand:50 },
  { name:"🌪️ Stormy Night",solar:20,  wind:22, battery:40, demand:75 },
  { name:"🌆 Evening Peak",solar:100, wind:8,  battery:30, demand:90 },
  { name:"✨ Ideal Mix",   solar:800, wind:18, battery:85, demand:30 },
];

const TABS = ["Dashboard","MF Charts","Output Curve","Rules"];

export default function FuzzyEnergyApp() {
  const [solar,   setSolar]   = useState(700);
  const [wind,    setWind]    = useState(12);
  const [battery, setBattery] = useState(60);
  const [demand,  setDemand]  = useState(50);
  const [tab,     setTab]     = useState(0);
  const [result,  setResult]  = useState(null);

  const compute = useCallback(() => {
    setResult(evalFIS(solar, wind, battery, demand));
  }, [solar, wind, battery, demand]);

  useEffect(() => { compute(); }, [compute]);

  const applyPreset = (p) => {
    setSolar(p.solar); setWind(p.wind);
    setBattery(p.battery); setDemand(p.demand);
  };

  const col = result ? outputColor(result.centroid) : "#facc15";

  return (
    <div style={{ maxWidth: 900, margin:"0 auto", padding:"16px 12px",
      fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ textAlign:"center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color:"#f1f5f9",
          marginBottom: 4 }}>
          ⚡ Renewable Energy Grid Advisor
        </h1>
        <p style={{ fontSize: 12, color:"#64748b" }}>
          Type-1 Mamdani FIS — De Montfort University
        </p>
      </div>

      {/* Presets */}
      <div style={{ display:"flex", gap: 8, marginBottom: 16,
        flexWrap:"wrap", justifyContent:"center" }}>
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => applyPreset(p)}
            style={{ padding:"6px 12px", fontSize: 11, borderRadius: 8,
              border:"1px solid #334155", background:"#1e293b",
              color:"#94a3b8", cursor:"pointer" }}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap: 4, marginBottom: 16,
        borderBottom:"1px solid #1e293b", paddingBottom: 8 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding:"6px 14px", fontSize: 12, borderRadius: 6,
              border:"none", cursor:"pointer",
              background: tab===i ? "#4f46e5" : "transparent",
              color: tab===i ? "#fff" : "#64748b",
              fontWeight: tab===i ? 600 : 400 }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── TAB 0: DASHBOARD ── */}
      {tab === 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
          gap: 16, alignItems:"start" }}>

          {/* Sliders */}
          <div style={{ background:"#1e293b", borderRadius: 12,
            padding: 16, border:"1px solid #334155" }}>
            <h3 style={{ fontSize: 13, color:"#94a3b8",
              marginBottom: 14 }}>Sensor Inputs</h3>
            <Slider label="Solar Irradiance" value={solar} min={0}
              max={1000} step={10} unit="W/m²"
              onChange={setSolar} color="#f97316"/>
            <Slider label="Wind Speed" value={wind} min={0}
              max={25} step={0.5} unit="m/s"
              onChange={setWind} color="#3b82f6"/>
            <Slider label="Battery Charge" value={battery} min={0}
              max={100} step={1} unit="%"
              onChange={setBattery} color="#22c55e"/>
            <Slider label="Grid Demand" value={demand} min={0}
              max={100} step={1} unit="%"
              onChange={setDemand} color="#ef4444"/>
          </div>

          {/* Gauge */}
          <div style={{ background:"#1e293b", borderRadius: 12,
            padding: 16, border:"1px solid #334155",
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center" }}>
            <h3 style={{ fontSize: 13, color:"#94a3b8",
              marginBottom: 12 }}>FIS Output</h3>
            {result && <GaugeChart value={result.centroid}/>}
            {result && (
              <div style={{ marginTop: 8, fontSize: 11,
                color:"#64748b", textAlign:"center" }}>
                {result.firedRules.length} of 15 rules active
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 1: MF CHARTS ── */}
      {tab === 1 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
          gap: 12 }}>
          {[
            { label:"Solar Irradiance (W/m²)", mfs:solarMFs,
              range:[0,1000], val:solar, colors:MF_COLORS },
            { label:"Wind Speed (m/s)", mfs:windMFs,
              range:[0,25], val:wind, colors:MF_COLORS },
            { label:"Battery Charge (%)", mfs:batteryMFs,
              range:[0,100], val:battery, colors:MF_COLORS },
            { label:"Grid Demand (%)", mfs:demandMFs,
              range:[0,100], val:demand, colors:MF_COLORS },
          ].map((inp) => (
            <div key={inp.label} style={{ background:"#1e293b",
              borderRadius: 10, padding: 12,
              border:"1px solid #334155" }}>
              <div style={{ fontSize: 11, color:"#94a3b8",
                marginBottom: 6 }}>{inp.label}</div>
              <MFChart mfs={inp.mfs} range={inp.range}
                value={inp.val} colors={inp.colors} labels/>
              <div style={{ display:"flex", gap: 10, marginTop: 6 }}>
                {["Low","Medium","High"].map((n, i) => {
                  const mu = inp.mfs[i](inp.val);
                  return (
                    <div key={n} style={{ fontSize: 10,
                      color: MF_COLORS[i] }}>
                      {n}: <b>{mu.toFixed(3)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Output MFs */}
          <div style={{ gridColumn:"1/-1", background:"#1e293b",
            borderRadius: 10, padding: 12,
            border:"1px solid #334155" }}>
            <div style={{ fontSize: 11, color:"#94a3b8",
              marginBottom: 6 }}>Renewable Output (%)</div>
            <MFChart
              mfs={outputMFs.map(m => m.fn)}
              range={[0,100]}
              value={result?.centroid}
              colors={OUT_COLORS}
              labels/>
            <div style={{ display:"flex", gap: 10, marginTop: 6,
              flexWrap:"wrap" }}>
              {outputMFs.map((m, i) => (
                <div key={m.name} style={{ fontSize: 10,
                  color: OUT_COLORS[i] }}>
                  {m.name}: <b>{m.fn(result?.centroid??50).toFixed(3)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: OUTPUT CURVE ── */}
      {tab === 2 && result && (
        <div style={{ background:"#1e293b", borderRadius: 12,
          padding: 16, border:"1px solid #334155" }}>
          <h3 style={{ fontSize: 13, color:"#94a3b8",
            marginBottom: 12 }}>Aggregated Output Distribution</h3>
          <svg width="100%" viewBox="0 0 500 140"
            style={{ display:"block" }}>
            <defs>
              <linearGradient id="ag" x1="0" y1="0" x2="1" y2="0">
                {OUT_COLORS.map((c, i) => (
                  <stop key={i} offset={`${i*25}%`} stopColor={c} stopOpacity="0.6"/>
                ))}
              </linearGradient>
            </defs>
            {/* Grid */}
            {[0,25,50,75,100].map(v => (
              <g key={v}>
                <line x1={v*4.8+10} y1={10} x2={v*4.8+10} y2={120}
                  stroke="#334155" strokeWidth="0.5"/>
                <text x={v*4.8+10} y={132} textAnchor="middle"
                  fontSize="8" fill="#475569">{v}</text>
              </g>
            ))}
            {/* Aggregation fill */}
            <polyline
              points={result.aggr.map((y,i) =>
                `${10+i*(490/result.aggr.length)},${110-y*100}`).join(" ")}
              fill="url(#ag)" stroke="none" opacity="0.4"/>
            <polyline
              points={result.aggr.map((y,i) =>
                `${10+i*(490/result.aggr.length)},${110-y*100}`).join(" ")}
              fill="none" stroke={col} strokeWidth="1.5"/>
            {/* Centroid line */}
            <line
              x1={10+result.centroid*4.8} y1={10}
              x2={10+result.centroid*4.8} y2={120}
              stroke="#fff" strokeWidth="2" strokeDasharray="4,3"/>
            <text x={10+result.centroid*4.8} y={8}
              textAnchor="middle" fontSize="9" fill="#fff"
              fontWeight="bold">
              ▼ {result.centroid}%
            </text>
          </svg>
          <div style={{ fontSize: 11, color:"#64748b",
            textAlign:"center", marginTop: 8 }}>
            Centroid defuzzification → <span style={{color:col,
            fontWeight:600}}>{result.centroid}%</span> renewable output
          </div>
        </div>
      )}

      {/* ── TAB 3: RULES ── */}
      {tab === 3 && result && (
        <div style={{ background:"#1e293b", borderRadius: 12,
          padding: 16, border:"1px solid #334155" }}>
          <h3 style={{ fontSize: 13, color:"#94a3b8", marginBottom: 12 }}>
            Rules Firing — {result.firedRules.length} of 15 active
          </h3>
          <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
            {RULES.map((r, idx) => {
              const fired = result.firedRules.find(f => f.rule === idx+1);
              const labels = [["Low","Med","High"],["Low","Med","High"],
                ["Low","Med","High"],["Low","Med","High"],
                ["VL","L","M","H","VH"]];
              return (
                <div key={idx} style={{ display:"flex",
                  alignItems:"center", gap: 8, padding:"6px 10px",
                  borderRadius: 6, fontSize: 11,
                  background: fired ? "#1e3a5f" : "#0f172a",
                  border: `1px solid ${fired ? "#3b82f6" : "#1e293b"}`,
                  opacity: fired ? 1 : 0.4 }}>
                  <span style={{ color:"#64748b", minWidth: 28,
                    fontSize: 10 }}>R{idx+1}</span>
                  <span style={{ flex:1, color:"#94a3b8" }}>
                    Sol:<b style={{color:"#f97316"}}>
                      {labels[0][r[0]-1]}</b>{" "}
                    Win:<b style={{color:"#3b82f6"}}>
                      {labels[1][r[1]-1]}</b>{" "}
                    Bat:<b style={{color:"#22c55e"}}>
                      {labels[2][r[2]-1]}</b>{" "}
                    Dem:<b style={{color:"#ef4444"}}>
                      {labels[3][r[3]-1]}</b>
                    {" → "}
                    <b style={{color:col}}>
                      {labels[4][r[4]-1]}</b>
                  </span>
                  {fired && (
                    <span style={{ color:"#3b82f6", fontSize: 10,
                      fontWeight: 600 }}>
                      α={fired.alpha}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign:"center", marginTop: 20,
        fontSize: 10, color:"#334155" }}>
        Renewable Energy FIS — Fuzzy Logic & Evolutionary Computing —
        De Montfort University
      </div>
    </div>
  );
}