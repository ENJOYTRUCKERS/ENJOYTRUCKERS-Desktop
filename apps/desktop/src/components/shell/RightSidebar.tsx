import React from "react";
import {
  Camera,
  Gauge,
  LayoutGrid,
  Mail,
  Map as MapIcon,
  Route,
  Truck,
} from "lucide-react";
import type {
  DesktopFeatureFlags,
  DtsViewId,
  RoadType,
  WorkState,
} from "../../types/tachograph";

interface RightSidebarProps {
  currentView: DtsViewId;
  workState: WorkState;
  featureFlags: DesktopFeatureFlags;
  unreadMessageCount: number;
  compact?: boolean;
  isCapturingDashcam?: boolean;
  onNavigate: (view: DtsViewId) => void;
  onCycleRoadType: () => void;
  onToggleLoaded: () => void;
  onCaptureDashcam: () => void;
}

const ROAD_LABELS: Record<RoadType, string> = {
  city: "市街地",
  local: "一般道",
  highway: "高速道",
  private: "専用道",
};

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentView,
  workState,
  featureFlags,
  unreadMessageCount,
  compact = false,
  isCapturingDashcam = false,
  onNavigate,
  onCycleRoadType,
  onToggleLoaded,
  onCaptureDashcam,
}) => {
  const widthClass = compact ? "w-16" : "w-24";
  const btnBase =
    "flex-1 flex flex-col items-center justify-center border-b border-zinc-800 transition-colors cursor-pointer select-none px-1";

  return (
    <aside
      className={`${widthClass} bg-[#2b2b30] flex flex-col border-l border-zinc-800 z-10 shrink-0`}
    >
      {/* 1. 走行画面 ⇔ 作業メニュー */}
      <button
        onClick={() =>
          onNavigate(currentView === "work_menu" ? "driving" : "work_menu")
        }
        className={`${btnBase} ${
          currentView === "work_menu"
            ? "bg-[#187f82] text-white"
            : "bg-[#3d3d44] hover:bg-[#4c4c55] text-white"
        }`}
      >
        {currentView === "work_menu" ? (
          <Gauge className="w-5 h-5 mb-1" />
        ) : (
          <LayoutGrid className="w-5 h-5 mb-1" />
        )}
        <span className="text-[11px] font-bold">
          {currentView === "work_menu" ? "走行画面" : "作業選択"}
        </span>
      </button>

      {/* 2. ドラレコ撮影 */}
      {featureFlags.feat_auto_dashcam && (
        <button
          onClick={onCaptureDashcam}
          disabled={isCapturingDashcam}
          className={`${btnBase} ${
            isCapturingDashcam
              ? "bg-amber-600 text-white"
              : "bg-[#3d3d44] hover:bg-[#4c4c55] active:bg-[#2c2c32] text-white"
          }`}
        >
          <Camera className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold">
            {isCapturingDashcam ? "保存中..." : "撮影"}
          </span>
        </button>
      )}

      {/* 3. 道路区分切替 (市街地 / 一般道 / 高速道 / 専用道) */}
      <button
        onClick={onCycleRoadType}
        className={`${btnBase} ${
          workState.road_type === "highway"
            ? "bg-sky-700/80 hover:bg-sky-600 text-white"
            : "bg-[#3d3d44] hover:bg-[#4c4c55] text-white"
        }`}
      >
        <Route className="w-5 h-5 mb-1" />
        <span className="text-[11px] font-bold">
          {ROAD_LABELS[workState.road_type] || "一般道"}
        </span>
      </button>

      {/* 4. 実車 / 空車 */}
      <button
        onClick={onToggleLoaded}
        className={`${btnBase} ${
          workState.is_loaded
            ? "bg-emerald-700/80 hover:bg-emerald-600 text-white"
            : "bg-[#3d3d44] hover:bg-[#4c4c55] text-zinc-200"
        }`}
      >
        <Truck className="w-5 h-5 mb-1" />
        <span className="text-[11px] font-bold">
          {workState.is_loaded ? "実車" : "空車"}
        </span>
      </button>

      {/* 5. 連絡 / 指示書 */}
      <button
        onClick={() =>
          onNavigate(currentView === "contact" ? "dispatch" : "contact")
        }
        className={`${btnBase} relative ${
          currentView === "contact" || currentView === "dispatch"
            ? "bg-[#187f82] text-white"
            : "bg-[#3d3d44] hover:bg-[#4c4c55] text-white"
        }`}
      >
        <Mail className="w-5 h-5 mb-1" />
        <span className="text-[11px] font-bold">連絡・指示</span>
        {unreadMessageCount > 0 && (
          <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-amber-400 text-black text-[10px] font-black flex items-center justify-center">
            {unreadMessageCount}
          </span>
        )}
      </button>

      {/* 6. ナビ地図 ⇔ 走行計器 */}
      <button
        onClick={() => onNavigate(currentView === "nav" ? "driving" : "nav")}
        className={`${btnBase} border-b-0 ${
          currentView === "nav"
            ? "bg-[#ff1155] text-white"
            : "bg-[#3d3d44] hover:bg-[#4c4c55] text-white"
        }`}
      >
        <MapIcon className="w-5 h-5 mb-1" />
        <span className="text-[11px] font-bold">
          {currentView === "nav" ? "計器へ" : "地図"}
        </span>
      </button>
    </aside>
  );
};
