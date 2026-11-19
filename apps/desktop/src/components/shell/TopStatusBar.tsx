import React from "react";
import {
  AlertTriangle,
  Bell,
  Eye,
  EyeOff,
  Radio,
  Settings,
  ShieldAlert,
  SignalHigh,
  SignalZero,
  Stethoscope,
} from "lucide-react";
import type {
  DesktopFeatureFlags,
  DtsViewId,
  OverlayState,
  TelemetryData,
  WorkState,
} from "../../types/tachograph";

interface TopStatusBarProps {
  time: string;
  appVersion: string;
  isOnline: boolean;
  isGameConnected: boolean;
  telemetry: TelemetryData;
  workState: WorkState;
  overlayState: OverlayState;
  featureFlags: DesktopFeatureFlags;
  unreadMessageCount: number;
  activeDispatchCount: number;
  currentView: DtsViewId;
  onNavigate: (view: DtsViewId) => void;
  onToggleOverlay: () => void;
  onToggleSos: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  time,
  appVersion,
  isOnline,
  isGameConnected,
  telemetry,
  workState,
  overlayState,
  featureFlags,
  unreadMessageCount,
  activeDispatchCount,
  currentView,
  onNavigate,
  onToggleOverlay,
  onToggleSos,
}) => {
  const gameBadge = isGameConnected
    ? (telemetry.game || "ETS2").toUpperCase()
    : "WAIT";

  return (
    <header className="h-9 bg-[#18181c] border-b border-zinc-800 px-3 flex items-center justify-between text-xs select-none shrink-0">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded bg-[#ff1155] text-white font-black tracking-wider text-[10px]">
          DTS-G1D3
        </span>
        <span
          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] flex items-center gap-1 ${
            isGameConnected
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
          }`}
        >
          <Radio className="w-3 h-3" />
          {gameBadge}
        </span>

        <span
          className={`px-2 py-0.5 rounded font-bold text-[11px] ${
            workState.status === "Working"
              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
              : workState.status === "Resting"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {workState.work_status_label || "業務終了"}
        </span>

        {workState.is_430_violation ? (
          <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[10px] flex items-center gap-1 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            430違反
          </span>
        ) : workState.is_430_warning ? (
          <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            430休憩予告
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {featureFlags.feat_dispatch_orders && activeDispatchCount > 0 && (
          <button
            onClick={() => onNavigate("dispatch")}
            className="px-2 py-0.5 rounded bg-teal-600/30 border border-teal-500/50 text-teal-200 font-bold text-[10px] hover:bg-teal-600/50 transition-colors"
            title="運行指示書"
          >
            指示書 {activeDispatchCount}件
          </button>
        )}

        {featureFlags.feat_office_chat && (
          <button
            onClick={() => onNavigate("contact")}
            className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 transition-colors ${
              unreadMessageCount > 0
                ? "bg-amber-500 text-black animate-pulse"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
            title="事務所連絡"
          >
            <Bell className="w-3 h-3" />
            {unreadMessageCount > 0 ? `未読 ${unreadMessageCount}` : "連絡"}
          </button>
        )}

        {featureFlags.feat_overlay_mode && (
          <button
            onClick={onToggleOverlay}
            className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 transition-colors ${
              overlayState.enabled
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
            title="透過オーバーレイ切替 (Alt+D)"
          >
            {overlayState.clickThrough ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
            {overlayState.enabled
              ? overlayState.clickThrough
                ? "透過中(Alt+D)"
                : "最前面"
              : "OVL"}
          </button>
        )}

        {featureFlags.feat_emergency_sos && (
          <button
            onClick={onToggleSos}
            className={`px-2 py-0.5 rounded font-black text-[10px] flex items-center gap-1 transition-colors ${
              workState.is_sos
                ? "bg-red-600 text-white animate-pulse"
                : "bg-zinc-800 text-red-400 hover:bg-red-950 border border-red-500/30"
            }`}
            title="緊急SOS発報"
          >
            <ShieldAlert className="w-3 h-3" />
            SOS
          </button>
        )}

        <button
          onClick={() =>
            onNavigate(currentView === "diagnostics" ? "driving" : "diagnostics")
          }
          className={`p-1 rounded transition-colors ${
            currentView === "diagnostics"
              ? "bg-sky-600 text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
          title="自己診断・プラグイン修復"
        >
          <Stethoscope className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() =>
            onNavigate(currentView === "settings" ? "driving" : "settings")
          }
          className={`p-1 rounded transition-colors ${
            currentView === "settings"
              ? "bg-sky-600 text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
          title="デジタコ設定"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5 pl-1 border-l border-zinc-800">
          <span className={isOnline ? "text-emerald-400" : "text-red-500"}>
            {isOnline ? (
              <SignalHigh className="w-3.5 h-3.5" />
            ) : (
              <SignalZero className="w-3.5 h-3.5" />
            )}
          </span>
          <span className="font-mono font-bold text-white text-xs">{time}</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            v{appVersion}
          </span>
        </div>
      </div>
    </header>
  );
};
