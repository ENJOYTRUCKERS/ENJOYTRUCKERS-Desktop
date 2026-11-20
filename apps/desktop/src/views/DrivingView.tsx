import React from "react";
import {
  Activity,
  AlertTriangle,
  Power,
  Scale,
  Siren,
} from "lucide-react";
import { formatHm } from "../components/shell/BottomTelemetryBar";
import {
  DtsHighwayIcon,
  DtsLocalRoadIcon,
} from "../components/shell/DtsIcons";
import type {
  DesktopFeatureFlags,
  DtsViewId,
  RoadType,
  TelemetryData,
  WorkState,
} from "../types/tachograph";

interface DrivingViewProps {
  pattern: "A" | "B" | "C";
  loginName: string;
  telemetry: TelemetryData;
  workState: WorkState;
  featureFlags: DesktopFeatureFlags;
  hazardWarningText: string | null;
  onChangePattern: (p: "A" | "B" | "C") => void;
  onSetRoadType: (roadType: RoadType) => void;
  onNavigate: (view: DtsViewId) => void;
  onScsInputCommand: (cmd: string) => void;
}

const SPEED_TICKS = [0, 20, 40, 50, 60, 80, 100, 120];
const RPM_TICKS = [0, 1, 2, 3, 4];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArcFlag = endDeg - startDeg <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function getGMultiplierLabel(rank: string): string {
  switch (rank) {
    case "S":
      return "×1.20 (+20%優遇)";
    case "A":
      return "×1.10 (+10%優遇)";
    case "B":
      return "×1.00 (標準)";
    case "C":
      return "×0.85 (-15%減額)";
    case "D":
      return "×0.70 (★5ボーナス没収)";
    default:
      return "×1.00";
  }
}

export const DrivingView: React.FC<DrivingViewProps> = ({
  pattern,
  loginName,
  telemetry,
  workState,
  featureFlags,
  hazardWarningText,
  onChangePattern,
  onSetRoadType,
  onNavigate,
  onScsInputCommand,
}) => {
  const speedKmh = Math.round(Math.abs(telemetry.speed || 0));
  const limitKmh = Math.round(telemetry.speed_limit || 0);
  const isOverLimit = limitKmh > 0 && speedKmh > limitKmh + 5;
  const engineRpm = Math.max(0, Math.round(telemetry.engine_rpm || 0));

  const continuousSec = workState.continuous_driving_seconds || 0;
  const contHrs = Math.floor(continuousSec / 3600);
  const contMins = Math.floor((continuousSec % 3600) / 60);

  const totalViolations =
    workState.violation_430_count +
    workState.harsh_accel_count +
    workState.harsh_brake_count +
    workState.harsh_corner_count +
    workState.impact_count;

  const isHighwaySelected =
    workState.road_type === "highway" || workState.road_type === "private";

  // SVG Gauge math: 135 deg (7:30) to 405 deg (4:30), 270 deg sweep
  const startAngle = 135;
  const speedClamped = Math.min(120, Math.max(0, speedKmh));
  const speedEndAngle = startAngle + (speedClamped / 120) * 270;

  const rpmClamped = Math.min(4000, Math.max(0, engineRpm));
  const rpmEndAngle = startAngle + (rpmClamped / 4000) * 270;

  // 30 segments representing 0..5 hours (10 minutes per segment)
  const litSegments =
    continuousSec <= 0
      ? 0
      : Math.min(30, Math.max(1, Math.ceil(continuousSec / 600)));

  const effectiveBreakSec =
    workState.break_bank_seconds +
    (workState.current_break_seconds >= 600
      ? workState.current_break_seconds
      : 0);
  const drivePct = Math.min(100, (continuousSec / 14400) * 100);
  const breakPct = Math.min(100, (effectiveBreakSec / 1800) * 100);

  const gxPx = Math.max(-34, Math.min(34, workState.live_g_lat * 76));
  const gzPx = Math.max(-34, Math.min(34, -workState.live_g_long * 76));

  const cyclePattern = () => {
    const next = pattern === "A" ? "B" : pattern === "B" ? "C" : "A";
    onChangePattern(next);
  };

  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between overflow-hidden min-h-0">
      {/* PATTERN A: Authentic Fujitsu DTS-G1D Dual-Arc Gauges (231651.png) */}
      {pattern === "A" && (
        <div className="flex-1 flex flex-col justify-between px-5 pt-2 pb-1 min-h-0">
          {/* Dual Circular Arc Gauges Row */}
          <div className="flex items-center justify-around pt-1">
            {/* Left Speedometer Arc Gauge */}
            <svg
              width="216"
              height="168"
              viewBox="0 0 216 172"
              className="overflow-visible"
            >
              {/* Outer thin accent ring: 0-60 gray, 60-120 red */}
              <path
                d={describeArc(108, 92, 77, 135, 270)}
                fill="none"
                stroke="#6b7280"
                strokeWidth="2.5"
              />
              <path
                d={describeArc(108, 92, 77, 270, 405)}
                fill="none"
                stroke="#d94848"
                strokeWidth="2.5"
              />
              {/* Main background track */}
              <path
                d={describeArc(108, 92, 65, 135, 405)}
                fill="none"
                stroke="#36394a"
                strokeWidth="12"
              />
              {/* Live speed white arc */}
              {speedClamped > 0 && (
                <path
                  d={describeArc(108, 92, 65, startAngle, speedEndAngle)}
                  fill="none"
                  stroke={isOverLimit ? "#ef4444" : "#ffffff"}
                  strokeWidth="12"
                />
              )}
              {/* Ticks and labels */}
              {SPEED_TICKS.map((val) => {
                const ang = startAngle + (val / 120) * 270;
                const pOut = polarToCartesian(108, 92, 75, ang);
                const pIn = polarToCartesian(108, 92, 71, ang);
                const pLbl = polarToCartesian(108, 92, 50, ang);
                return (
                  <g key={val}>
                    <line
                      x1={pOut.x}
                      y1={pOut.y}
                      x2={pIn.x}
                      y2={pIn.y}
                      stroke="#d4d6e0"
                      strokeWidth="1.2"
                    />
                    <text
                      x={pLbl.x}
                      y={pLbl.y + 3}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#d4d6e0"
                      fontWeight="600"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}
              <text
                x="108"
                y="68"
                textAnchor="middle"
                fontSize="11"
                fill="#b8bccf"
                fontWeight="600"
              >
                速度
              </text>
              <text
                x="108"
                y="107"
                textAnchor="middle"
                fontSize="38"
                fill={isOverLimit ? "#ef4444" : "#ffffff"}
                fontWeight="700"
              >
                {speedKmh}
              </text>
              <text
                x="108"
                y="126"
                textAnchor="middle"
                fontSize="11"
                fill="#b8bccf"
                fontWeight="600"
              >
                km/h
              </text>
            </svg>

            {/* Right Tachometer (RPM) Arc Gauge */}
            <svg
              width="216"
              height="168"
              viewBox="0 0 216 172"
              className="overflow-visible"
            >
              {/* Outer thin accent ring: 0-1 gray, 1-2 green, 2-3 gray, 3-4 red */}
              <path
                d={describeArc(108, 92, 77, 135, 202.5)}
                fill="none"
                stroke="#6b7280"
                strokeWidth="2.5"
              />
              <path
                d={describeArc(108, 92, 77, 202.5, 270)}
                fill="none"
                stroke="#4ad158"
                strokeWidth="3"
              />
              <path
                d={describeArc(108, 92, 77, 270, 337.5)}
                fill="none"
                stroke="#6b7280"
                strokeWidth="2.5"
              />
              <path
                d={describeArc(108, 92, 77, 337.5, 405)}
                fill="none"
                stroke="#d94848"
                strokeWidth="3"
              />
              {/* Main background track */}
              <path
                d={describeArc(108, 92, 65, 135, 405)}
                fill="none"
                stroke="#36394a"
                strokeWidth="12"
              />
              {/* Live RPM green arc */}
              {rpmClamped > 0 && (
                <path
                  d={describeArc(108, 92, 65, startAngle, rpmEndAngle)}
                  fill="none"
                  stroke={engineRpm >= 3000 ? "#ef4444" : "#4ee05c"}
                  strokeWidth="12"
                />
              )}
              {/* Ticks and labels */}
              {RPM_TICKS.map((val) => {
                const ang = startAngle + (val / 4) * 270;
                const pOut = polarToCartesian(108, 92, 75, ang);
                const pIn = polarToCartesian(108, 92, 71, ang);
                const pLbl = polarToCartesian(108, 92, 51, ang);
                return (
                  <g key={val}>
                    <line
                      x1={pOut.x}
                      y1={pOut.y}
                      x2={pIn.x}
                      y2={pIn.y}
                      stroke="#d4d6e0"
                      strokeWidth="1.2"
                    />
                    <text
                      x={pLbl.x}
                      y={pLbl.y + 3}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#d4d6e0"
                      fontWeight="600"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}
              <text
                x="108"
                y="68"
                textAnchor="middle"
                fontSize="10.5"
                fill="#b8bccf"
                fontWeight="600"
              >
                エンジン回転数
              </text>
              <text
                x="108"
                y="105"
                textAnchor="middle"
                fontSize="31"
                fill={engineRpm >= 3000 ? "#ef4444" : "#4ee05c"}
                fontWeight="700"
              >
                {engineRpm}
              </text>
              <text
                x="108"
                y="126"
                textAnchor="middle"
                fontSize="11"
                fill="#b8bccf"
                fontWeight="600"
              >
                rpm
              </text>
            </svg>
          </div>

          {/* Middle Section: Continuous Driving Bar Graph & Violation Counter */}
          <div className="flex items-start justify-between gap-6 px-2">
            {/* Continuous Driving 30-Segment Bar */}
            <div className="w-[62%]">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[13px] font-bold text-zinc-200">
                  連続走行
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-bold text-white tabular-nums leading-none">
                    {contHrs}
                  </span>
                  <span className="text-xs text-zinc-300 font-bold">時間</span>
                  <span className="text-[22px] font-bold text-white tabular-nums leading-none ml-1">
                    {String(contMins).padStart(2, "0")}
                  </span>
                  <span className="text-xs text-zinc-300 font-bold">分</span>
                </div>
              </div>

              <div
                className="grid gap-[2px] h-5"
                style={{ gridTemplateColumns: "repeat(30, minmax(0, 1fr))" }}
              >
                {Array.from({ length: 30 }).map((_, idx) => {
                  const isLit = idx < litSegments;
                  let bg = "#3b3c4f";
                  if (idx >= 21 && idx < 24) {
                    bg = isLit ? "#f5b82e" : "#625a2e";
                  } else if (idx >= 24) {
                    bg = isLit ? "#ef4444" : "#5c2a32";
                  } else if (isLit) {
                    bg = "#48b8e0";
                  }
                  return <div key={idx} style={{ backgroundColor: bg }} />;
                })}
              </div>

              {/* Scale Ticks: 0, 1, 2, 3, 30, 4, 5 */}
              <div className="relative h-4 text-[10px] font-bold text-zinc-300 tabular-nums mt-0.5">
                <span className="absolute left-0">0</span>
                <span className="absolute left-[20%] -translate-x-1/2">1</span>
                <span className="absolute left-[40%] -translate-x-1/2">2</span>
                <span className="absolute left-[60%] -translate-x-1/2">3</span>
                <span className="absolute left-[70%] -translate-x-1/2 text-amber-300">
                  30
                </span>
                <span className="absolute left-[80%] -translate-x-1/2 text-red-400">
                  4
                </span>
                <span className="absolute right-0 text-red-400">5</span>
              </div>
            </div>

            {/* Violation Counter (clickable to open 運転状況/違反 details) */}
            <button
              type="button"
              onClick={() => onChangePattern("C")}
              className="w-[34%] text-left border-b border-zinc-400 pb-1 hover:opacity-90 transition-opacity pt-0.5"
              title="クリックで運転状況・違反詳細を表示"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-bold text-zinc-200">
                  違反
                </span>
                <span
                  className={`text-[24px] font-bold tabular-nums leading-none ${
                    totalViolations > 0 ? "text-amber-400" : "text-white"
                  }`}
                >
                  {totalViolations}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* PATTERN B: Authentic Simple Road-Toggle View (233720.png / 234530.png) */}
      {pattern === "B" && (
        <div className="flex-1 px-8 py-4 flex flex-col justify-center space-y-3 min-h-0">
          <div className="text-sm font-bold text-zinc-200">
            {workState.is_loaded ? "実車" : "空車"}
          </div>
          <div className="text-3xl font-bold text-white tracking-wide truncate">
            {loginName !== "乗務員不明" ? loginName : "ドライバー"}
          </div>
          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onSetRoadType("local")}
              className={`w-32 h-28 rounded-[3px] flex flex-col items-center justify-center gap-2 font-bold text-base transition-colors ${
                !isHighwaySelected
                  ? "bg-gradient-to-b from-[#55b9ea] to-[#3999cb] text-white"
                  : "bg-[#3b3b58] hover:bg-[#49496b] text-zinc-200"
              }`}
            >
              <DtsLocalRoadIcon className="w-8 h-8" />
              <span>一般道</span>
            </button>

            <button
              type="button"
              onClick={() => onSetRoadType("highway")}
              className={`w-32 h-28 rounded-[3px] flex flex-col items-center justify-center gap-2 font-bold text-base transition-colors ${
                isHighwaySelected
                  ? "bg-gradient-to-b from-[#55b9ea] to-[#3999cb] text-white"
                  : "bg-[#3b3b58] hover:bg-[#49496b] text-zinc-200"
              }`}
            >
              <DtsHighwayIcon className="w-8 h-8" />
              <span>高速道</span>
            </button>
          </div>
        </div>
      )}

      {/* PATTERN C: DTS-G1D 運転状況 (3-Axis G Sensor & 430 Compliance Detail) */}
      {pattern === "C" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="h-10 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center justify-between text-white font-bold text-base shrink-0">
            <span className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              運転状況（3軸G・430法令順守）
            </span>
            <span className="text-sm tabular-nums">
              Gランク {workState.g_rank} ({workState.g_score.toFixed(1)}点)
            </span>
          </div>

          <div className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0">
            {/* Left: 3-Axis G Reticle */}
            <div className="col-span-5 bg-[#151828] border border-[#2a2e45] p-2.5 flex flex-col justify-between">
              <div className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>3軸Gセンサー</span>
                <span className="text-[#4eb4e4]">
                  {getGMultiplierLabel(workState.g_rank)}
                </span>
              </div>

              <div className="flex items-center justify-around my-1">
                <div className="w-20 h-20 rounded-full bg-[#0c0f1a] border border-[#3a3f5c] relative flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border border-dashed border-[#3a3f5c]" />
                  <div className="absolute inset-x-0 h-px bg-[#262a3d]" />
                  <div className="absolute inset-y-0 w-px bg-[#262a3d]" />
                  <div
                    style={{ transform: `translate(${gxPx}px, ${gzPx}px)` }}
                    className={`w-3 h-3 rounded-full ${
                      Math.abs(workState.live_g_long) >= 0.3 ||
                      Math.abs(workState.live_g_lat) >= 0.35
                        ? "bg-red-500"
                        : "bg-[#4ee05c]"
                    }`}
                  />
                </div>

                <div className="space-y-0.5 text-[11px] tabular-nums">
                  <div className="text-zinc-300">
                    前後:{" "}
                    <span className="text-white font-bold">
                      {workState.live_g_long >= 0 ? "+" : ""}
                      {workState.live_g_long.toFixed(2)}G
                    </span>
                  </div>
                  <div className="text-zinc-300">
                    左右:{" "}
                    <span className="text-white font-bold">
                      {workState.live_g_lat >= 0 ? "+" : ""}
                      {workState.live_g_lat.toFixed(2)}G
                    </span>
                  </div>
                  <div className="text-zinc-300">
                    上下:{" "}
                    <span className="text-white font-bold">
                      {workState.live_g_vert >= 0 ? "+" : ""}
                      {workState.live_g_vert.toFixed(2)}G
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                <div className="bg-[#0c0f1a] py-1">
                  <div className="text-zinc-400">急加速</div>
                  <div className="font-bold text-white">
                    {workState.harsh_accel_count}
                  </div>
                </div>
                <div className="bg-[#0c0f1a] py-1">
                  <div className="text-zinc-400">急減速</div>
                  <div className="font-bold text-white">
                    {workState.harsh_brake_count}
                  </div>
                </div>
                <div className="bg-[#0c0f1a] py-1">
                  <div className="text-zinc-400">急旋回</div>
                  <div className="font-bold text-white">
                    {workState.harsh_corner_count}
                  </div>
                </div>
                <div className="bg-[#0c0f1a] py-1">
                  <div className="text-zinc-400">衝撃</div>
                  <div className="font-bold text-red-400">
                    {workState.impact_count}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: 430 Compliance & Truck Quick Info */}
            <div className="col-span-7 bg-[#151828] border border-[#2a2e45] p-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-zinc-200 flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5 text-[#4eb4e4]" />
                      430連続運転 (上限 4:00)
                    </span>
                    <span className="tabular-nums text-white">
                      {formatHm(continuousSec)} / 4:00
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#0c0f1a] overflow-hidden">
                    <div
                      className={`h-full ${
                        workState.is_430_violation
                          ? "bg-red-500"
                          : workState.is_430_warning
                          ? "bg-amber-400"
                          : "bg-[#3ca4d4]"
                      }`}
                      style={{ width: `${drivePct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-zinc-200">
                      430分割休憩 (10分以上×計30分)
                    </span>
                    <span className="tabular-nums text-[#4ee05c]">
                      {Math.floor(effectiveBreakSec / 60)}分 / 30分
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#0c0f1a] overflow-hidden">
                    <div
                      className="h-full bg-[#4ee05c]"
                      style={{ width: `${breakPct}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs bg-[#0c0f1a] p-2">
                <div>
                  <div className="text-[10px] text-zinc-400">走行距離</div>
                  <div className="font-bold text-white tabular-nums">
                    {workState.distance_driven_km.toFixed(1)} km
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-400">燃料残量</div>
                  <div className="font-bold text-white tabular-nums">
                    {Math.round(telemetry.fuel || 0)} L
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-400">積荷</div>
                  <div className="font-bold text-white truncate">
                    {telemetry.cargo_name || "なし"}
                  </div>
                </div>
              </div>

              {featureFlags.feat_scs_input && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onScsInputCommand("hazard_warning")}
                    className="h-8 bg-[#494968] hover:bg-[#57577a] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Siren className="w-3.5 h-3.5" />
                    ハザード
                  </button>
                  <button
                    type="button"
                    onClick={() => onScsInputCommand("beacon")}
                    className="h-8 bg-[#494968] hover:bg-[#57577a] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Power className="w-3.5 h-3.5" />
                    回転灯
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Message Strip above Footer (matching real DTS-G1D) */}
      <div className="h-8 border-t border-[#222536] px-4 flex items-center justify-between text-xs shrink-0">
        {hazardWarningText ? (
          <span className="text-red-400 font-bold flex items-center gap-1 truncate animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {hazardWarningText}
          </span>
        ) : (
          <span className="text-zinc-200 truncate">
            {totalViolations === 0
              ? "今のところ違反0です。この調子でいきましょう。"
              : `違反・急挙動を ${totalViolations} 件検知しています。安全運転をお願いします。`}
          </span>
        )}

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={cyclePattern}
            className="px-2 py-0.5 bg-[#2d2f45] hover:bg-[#3d3f5a] text-zinc-200 text-[11px] font-bold rounded-[2px]"
          >
            表示切替
          </button>
          <button
            type="button"
            onClick={() => onNavigate("work_menu")}
            className="px-2 py-0.5 bg-[#2d2f45] hover:bg-[#3d3f5a] text-zinc-200 text-[11px] font-bold rounded-[2px]"
          >
            メニュー
          </button>
        </div>
      </div>
    </div>
  );
};
