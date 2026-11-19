import React from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  Fuel,
  Gauge,
  LayoutGrid,
  Navigation,
  Power,
  Scale,
  ShieldCheck,
  Siren,
  Truck,
} from "lucide-react";
import { formatHm } from "../components/shell/BottomTelemetryBar";
import type {
  DesktopFeatureFlags,
  DtsViewId,
  TelemetryData,
  WorkState,
} from "../types/tachograph";

interface DrivingViewProps {
  pattern: "A" | "B" | "C";
  telemetry: TelemetryData;
  workState: WorkState;
  featureFlags: DesktopFeatureFlags;
  hazardWarningText: string | null;
  onChangePattern: (p: "A" | "B" | "C") => void;
  onNavigate: (view: DtsViewId) => void;
  onScsInputCommand: (cmd: string) => void;
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
  telemetry,
  workState,
  featureFlags,
  hazardWarningText,
  onChangePattern,
  onNavigate,
  onScsInputCommand,
}) => {
  const speedKmh = Math.round(Math.abs(telemetry.speed || 0));
  const limitKmh = Math.round(telemetry.speed_limit || 0);
  const isOverLimit = limitKmh > 0 && speedKmh > limitKmh + 5;
  const gearLabel =
    telemetry.gear > 0
      ? `D${telemetry.gear}`
      : telemetry.gear < 0
      ? `R${Math.abs(telemetry.gear)}`
      : "N";

  const drivePct = Math.min(
    100,
    (workState.continuous_driving_seconds / 14400) * 100
  );
  const effectiveBreakSec =
    workState.break_bank_seconds +
    (workState.current_break_seconds >= 600
      ? workState.current_break_seconds
      : 0);
  const breakPct = Math.min(100, (effectiveBreakSec / 1800) * 100);

  // G-ball reticle coordinates (-0.5G..+0.5G mapped to -36px..+36px)
  const gxPx = Math.max(-36, Math.min(36, workState.live_g_lat * 80));
  const gzPx = Math.max(-36, Math.min(36, -workState.live_g_long * 80));

  return (
    <div className="flex-1 bg-[#141418] flex flex-col p-3 justify-between overflow-hidden">
      {/* Top Pattern Switcher & Hazard Alert Banner */}
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-1">
          {(["A", "B", "C"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChangePattern(p)}
              className={`px-2.5 py-1 rounded text-xs font-black transition-colors ${
                pattern === p
                  ? "bg-[#187f82] text-white border border-teal-400/50"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {p === "A"
                ? "画面A: 速度・3軸G"
                : p === "B"
                ? "画面B: 運行・車両"
                : "画面C: 430法令順守"}
            </button>
          ))}
        </div>

        {hazardWarningText ? (
          <div className="px-2.5 py-1 rounded bg-red-600/90 text-white text-xs font-black flex items-center gap-1.5 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            {hazardWarningText}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-400 font-mono">
            走行距離:{" "}
            <span className="text-white font-bold">
              {workState.distance_driven_km.toFixed(1)} km
            </span>
          </div>
        )}
      </div>

      {/* PATTERN A: Digital Speed + 3-Axis G Reticle + 430 Continuous Gauge */}
      {pattern === "A" && (
        <div className="flex-1 grid grid-cols-12 gap-2.5 min-h-0">
          {/* Left: Digital Speedometer & RPM */}
          <div className="col-span-5 bg-[#1d1d24] border border-zinc-800 rounded p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-sky-400" />
                現在車速 / ギア
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-sky-300 font-mono font-black text-xs">
                GEAR {gearLabel}
              </span>
            </div>

            <div className="flex items-baseline justify-center gap-2 my-1">
              <span
                className={`digitacho-font text-6xl font-black tracking-tight ${
                  isOverLimit ? "text-red-400" : "text-white"
                }`}
              >
                {speedKmh}
              </span>
              <span className="text-sm font-bold text-zinc-400">km/h</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">制限速度</span>
                <span
                  className={`font-mono font-bold ${
                    isOverLimit ? "text-red-400" : "text-zinc-200"
                  }`}
                >
                  {limitKmh > 0 ? `${limitKmh} km/h` : "---"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">エンジン回転</span>
                <span className="font-mono font-bold text-zinc-200">
                  {Math.round(telemetry.engine_rpm || 0)} rpm
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-sky-500 to-red-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      ((telemetry.engine_rpm || 0) /
                        Math.max(2200, telemetry.rpm_limit || 2500)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Center: 3-Axis G Sensor Target & Smoothness Score */}
          <div className="col-span-4 bg-[#1d1d24] border border-zinc-800 rounded p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                3軸Gセンサー (0.4s平滑)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-black text-xs">
                ランク {workState.g_rank}
              </span>
            </div>

            <div className="flex items-center justify-around my-1">
              {/* 2D G Reticle */}
              <div className="w-24 h-24 rounded-full bg-[#131317] border border-zinc-700 relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border border-dashed border-zinc-700" />
                <div className="absolute inset-x-0 h-px bg-zinc-800" />
                <div className="absolute inset-y-0 w-px bg-zinc-800" />
                <div
                  style={{
                    transform: `translate(${gxPx}px, ${gzPx}px)`,
                  }}
                  className={`w-3.5 h-3.5 rounded-full transition-transform duration-75 shadow-md ${
                    Math.abs(workState.live_g_long) >= 0.3 ||
                    Math.abs(workState.live_g_lat) >= 0.35
                      ? "bg-red-500 ring-2 ring-red-300"
                      : "bg-emerald-400"
                  }`}
                />
              </div>

              <div className="space-y-1 text-[11px] font-mono">
                <div>
                  前後:{" "}
                  <span className="text-white font-bold">
                    {workState.live_g_long >= 0 ? "+" : ""}
                    {workState.live_g_long.toFixed(2)}G
                  </span>
                </div>
                <div>
                  左右:{" "}
                  <span className="text-white font-bold">
                    {workState.live_g_lat >= 0 ? "+" : ""}
                    {workState.live_g_lat.toFixed(2)}G
                  </span>
                </div>
                <div>
                  上下:{" "}
                  <span className="text-white font-bold">
                    {workState.live_g_vert >= 0 ? "+" : ""}
                    {workState.live_g_vert.toFixed(2)}G
                  </span>
                </div>
                <div className="text-emerald-400 font-bold">
                  {workState.g_score.toFixed(1)} 点
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
              <div className="bg-zinc-900 rounded py-1">
                <div className="text-zinc-500">急加速</div>
                <div className="font-mono font-bold text-white">
                  {workState.harsh_accel_count}
                </div>
              </div>
              <div className="bg-zinc-900 rounded py-1">
                <div className="text-zinc-500">急減速</div>
                <div className="font-mono font-bold text-white">
                  {workState.harsh_brake_count}
                </div>
              </div>
              <div className="bg-zinc-900 rounded py-1">
                <div className="text-zinc-500">急旋回</div>
                <div className="font-mono font-bold text-white">
                  {workState.harsh_corner_count}
                </div>
              </div>
              <div className="bg-zinc-900 rounded py-1">
                <div className="text-zinc-500">衝撃</div>
                <div className="font-mono font-bold text-red-400">
                  {workState.impact_count}
                </div>
              </div>
            </div>
          </div>

          {/* Right: 430 Rule Summary & Quick Actions */}
          <div className="col-span-3 bg-[#1d1d24] border border-zinc-800 rounded p-3 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-zinc-400 flex items-center justify-between">
                <span>430連続運転</span>
                <span className="font-mono text-white">
                  {formatHm(workState.continuous_driving_seconds)} / 4:00
                </span>
              </div>
              <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    workState.is_430_violation
                      ? "bg-red-500"
                      : workState.is_430_warning
                      ? "bg-amber-400"
                      : "bg-sky-500"
                  }`}
                  style={{ width: `${drivePct}%` }}
                />
              </div>

              <div className="text-xs font-bold text-zinc-400 flex items-center justify-between pt-1">
                <span>有効休憩(10分以上)</span>
                <span className="font-mono text-emerald-300">
                  {Math.floor(effectiveBreakSec / 60)}分 / 30分
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${breakPct}%` }}
                />
              </div>
            </div>

            {featureFlags.feat_scs_input && (
              <div className="grid grid-cols-2 gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => onScsInputCommand("hazard_warning")}
                  className="py-1.5 rounded bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <Siren className="w-3 h-3" />
                  ハザード
                </button>
                <button
                  type="button"
                  onClick={() => onScsInputCommand("beacon")}
                  className="py-1.5 rounded bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <Power className="w-3 h-3" />
                  回転灯
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigate("work_menu")}
              className="w-full py-2 rounded bg-[#187f82] hover:bg-[#1ca0a4] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              作業選択メニュー
            </button>
          </div>
        </div>
      )}

      {/* PATTERN B: Route, Cargo, Fuel & Vehicle Status */}
      {pattern === "B" && (
        <div className="flex-1 grid grid-cols-12 gap-2.5 min-h-0">
          <div className="col-span-7 bg-[#1d1d24] border border-zinc-800 rounded p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                <Navigation className="w-4 h-4" />
                現在受注中の配送ジョブ
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {telemetry.job_market || "フリー走行"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 my-1">
              <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                <div className="text-[10px] text-zinc-500">出発地 / 荷主</div>
                <div className="text-sm font-black text-white truncate">
                  {telemetry.source_city || "---"}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {telemetry.source_company || "---"}
                </div>
              </div>
              <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                <div className="text-[10px] text-zinc-500">目的地 / 納品先</div>
                <div className="text-sm font-black text-sky-300 truncate">
                  {telemetry.destination_city || "---"}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {telemetry.destination_company || "---"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-[10px] text-zinc-500">積荷 / 重量</div>
                <div className="font-bold text-white truncate">
                  {telemetry.cargo_name || "空車"}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {telemetry.cargo_mass > 0
                    ? `${(telemetry.cargo_mass / 1000).toFixed(1)} t`
                    : "0.0 t"}
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-[10px] text-zinc-500">残ナビ距離</div>
                <div className="font-mono font-bold text-white">
                  {telemetry.nav_distance > 0
                    ? `${(telemetry.nav_distance / 1000).toFixed(0)} km`
                    : "---"}
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2">
                <div className="text-[10px] text-zinc-500">貨物ダメージ</div>
                <div
                  className={`font-mono font-bold ${
                    (telemetry.cargo_damage || 0) > 0.01
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  {((telemetry.cargo_damage || 0) * 100).toFixed(1)} %
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-5 bg-[#1d1d24] border border-zinc-800 rounded p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-sky-400" />
                車両テレメトリ・燃料
              </span>
              <span className="text-[11px] font-mono text-zinc-400 truncate max-w-[140px]">
                {telemetry.truck_brand} {telemetry.truck_name}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Fuel className="w-3.5 h-3.5 text-amber-400" />
                  燃料残量
                </span>
                <span className="font-mono font-bold text-white">
                  {Math.round(telemetry.fuel || 0)} L /{" "}
                  {Math.round(telemetry.fuel_capacity || 0)} L
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">航続可能距離</span>
                <span className="font-mono font-bold text-zinc-200">
                  {Math.round(telemetry.fuel_range || 0)} km
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">ブレーキ空気圧</span>
                <span className="font-mono font-bold text-zinc-200">
                  {(telemetry.brake_air_pressure || 0).toFixed(0)} PSI
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">オドメーター</span>
                <span className="font-mono font-bold text-zinc-200">
                  {Math.round(telemetry.odometer || 0).toLocaleString()} km
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("return_garage")}
              className="w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700"
            >
              帰庫・運行終了画面へ
            </button>
          </div>
        </div>
      )}

      {/* PATTERN C: DTS-G1D3 Law Compliance (430 Rule) & EJ-POINT v2 Gauge Board */}
      {pattern === "C" && (
        <div className="flex-1 bg-[#1d1d24] border border-zinc-800 rounded p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
              <Scale className="w-4 h-4" />
              DTS-G1D3 改善基準告示（430ルール）＆ EJ-POINT v2 安全評価モニタ
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-black ${
                workState.is_430_violation
                  ? "bg-red-600 text-white"
                  : "bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {workState.is_430_violation
                ? "430違反（プラス報酬没収）"
                : "430法令順守中"}
            </span>
          </div>

          <div className="space-y-3 my-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-zinc-300">
                  連続運転時間（上限 4時間00分 / 3時間30分で予告）
                </span>
                <span className="font-mono font-bold text-white">
                  {formatHm(workState.continuous_driving_seconds)} / 4:00 (最大{" "}
                  {formatHm(workState.max_continuous_driving_sec)})
                </span>
              </div>
              <div className="w-full h-3.5 bg-zinc-900 rounded overflow-hidden border border-zinc-700 relative">
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                  style={{ left: "87.5%" }}
                  title="3時間30分 予告ライン"
                />
                <div
                  className={`h-full transition-all ${
                    workState.is_430_violation
                      ? "bg-red-600"
                      : workState.is_430_warning
                      ? "bg-amber-400"
                      : "bg-sky-500"
                  }`}
                  style={{ width: `${drivePct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-zinc-300">
                  430有効分割休憩（1回10分以上 × 合計30分で連続運転リセット）
                </span>
                <span className="font-mono font-bold text-emerald-300">
                  有効合計 {Math.floor(effectiveBreakSec / 60)}分 / 30分 (現在中断{" "}
                  {Math.floor(workState.current_break_seconds / 60)}分)
                </span>
              </div>
              <div className="w-full h-3.5 bg-zinc-900 rounded overflow-hidden border border-zinc-700">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${breakPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800 text-xs">
            <div className="bg-zinc-900 rounded p-2 flex items-center justify-between">
              <span className="text-zinc-400 flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                Gスコア
              </span>
              <span className="font-mono font-black text-white">
                {workState.g_score.toFixed(1)} ({workState.g_rank})
              </span>
            </div>
            <div className="bg-zinc-900 rounded p-2 flex items-center justify-between">
              <span className="text-zinc-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                G倍率試算
              </span>
              <span className="font-mono font-bold text-emerald-300">
                {getGMultiplierLabel(workState.g_rank)}
              </span>
            </div>
            <div className="bg-zinc-900 rounded p-2 flex items-center justify-between">
              <span className="text-zinc-400">最大前後/横G</span>
              <span className="font-mono font-bold text-zinc-200">
                {Math.max(workState.max_forward_g, workState.max_brake_g).toFixed(
                  2
                )}
                G / {workState.max_lateral_g.toFixed(2)}G
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
