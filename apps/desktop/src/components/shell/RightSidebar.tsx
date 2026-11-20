import React from "react";
import type {
  DesktopFeatureFlags,
  DtsViewId,
  RoadType,
  WorkState,
} from "../../types/tachograph";
import {
  DtsCameraIcon,
  DtsContactIcon,
  DtsGrid3x3Icon,
  DtsHighwayIcon,
  DtsLocalRoadIcon,
  DtsMapIcon,
  DtsSearchIcon,
  DtsTruckEmptyIcon,
  DtsTruckLoadedIcon,
} from "./DtsIcons";

interface RightSidebarProps {
  currentView: DtsViewId;
  workState: WorkState;
  featureFlags: DesktopFeatureFlags;
  unreadMessageCount: number;
  compact?: boolean;
  isCapturingDashcam?: boolean;
  isDrivingMoving?: boolean;
  isActiveWork?: boolean;
  onNavigate: (view: DtsViewId) => void;
  onCycleRoadType: () => void;
  onToggleLoaded: () => void;
  onCaptureDashcam: () => void;
  onReturnFromNav?: () => void;
  onOpenSearchFromNav?: () => void;
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
  isDrivingMoving = false,
  isActiveWork = false,
  onNavigate,
  onCycleRoadType,
  onToggleLoaded,
  onCaptureDashcam,
  onReturnFromNav,
  onOpenSearchFromNav,
}) => {
  const isHighwayLike =
    workState.road_type === "highway" || workState.road_type === "private";

  const widthClass = compact ? "w-[54px]" : "w-[126px]";
  const activeStyle =
    "bg-[#4e4c73] hover:bg-[#5c5a86] active:bg-[#3f3d60] text-white border-b border-[#242438] cursor-pointer";
  const disabledStyle =
    "bg-[#1b1c2a] text-[#55576b] border-b border-[#161724] cursor-not-allowed";

  const roadDisabled = isActiveWork;
  const loadedDisabled = isActiveWork;
  const cameraDisabled = isCapturingDashcam || !featureFlags.feat_auto_dashcam;
  const contactDisabled =
    !compact && (isDrivingMoving || !featureFlags.feat_office_chat);

  const layoutClass = compact
    ? "flex-1 flex items-center justify-center relative select-none"
    : "flex-1 flex flex-row items-center justify-start gap-2.5 px-3.5 relative select-none";

  const roadIcon = isHighwayLike ? (
    <DtsHighwayIcon className="w-5 h-5 shrink-0" />
  ) : (
    <DtsLocalRoadIcon className="w-5 h-5 shrink-0" />
  );

  const truckIcon = workState.is_loaded ? (
    <DtsTruckLoadedIcon className="w-5 h-5 shrink-0" />
  ) : (
    <DtsTruckEmptyIcon className="w-5 h-5 shrink-0" />
  );

  return (
    <aside
      className={`${widthClass} bg-[#1b1c2a] flex flex-col border-l border-[#242438] z-10 shrink-0`}
    >
      {/* 1. 撮影 (Dashcam) */}
      <button
        type="button"
        disabled={cameraDisabled}
        onClick={onCaptureDashcam}
        title="撮影"
        className={`${layoutClass} ${cameraDisabled ? disabledStyle : activeStyle}`}
      >
        <DtsCameraIcon className="w-5 h-5 shrink-0" />
        {!compact && (
          <span className="text-[14px] font-bold tracking-wide">
            {isCapturingDashcam ? "保存中" : "撮影"}
          </span>
        )}
      </button>

      {/* 2. 道路区分 (一般道 / 高速道 / 市街地 / 専用道) */}
      <button
        type="button"
        disabled={roadDisabled}
        onClick={onCycleRoadType}
        title={ROAD_LABELS[workState.road_type] || "一般道"}
        className={`${layoutClass} ${roadDisabled ? disabledStyle : activeStyle}`}
      >
        {roadIcon}
        {!compact && (
          <span className="text-[14px] font-bold tracking-wide">
            {ROAD_LABELS[workState.road_type] || "一般道"}
          </span>
        )}
      </button>

      {/* 3. 実車 / 空車 */}
      <button
        type="button"
        disabled={loadedDisabled}
        onClick={onToggleLoaded}
        title={workState.is_loaded ? "実車" : "空車"}
        className={`${layoutClass} ${
          loadedDisabled ? disabledStyle : activeStyle
        }`}
      >
        {truckIcon}
        {!compact && (
          <span className="text-[14px] font-bold tracking-wide">
            {workState.is_loaded ? "実車" : "空車"}
          </span>
        )}
      </button>

      {/* 4. Wide: 連絡 (Disabled while moving) / Compact Nav: 検索 */}
      {compact ? (
        <button
          type="button"
          onClick={() =>
            onOpenSearchFromNav ? onOpenSearchFromNav() : onNavigate("dispatch")
          }
          title="検索・運行指示書"
          className={`${layoutClass} ${activeStyle}`}
        >
          <DtsSearchIcon className="w-5 h-5 shrink-0" />
        </button>
      ) : (
        <button
          type="button"
          disabled={contactDisabled}
          onClick={() =>
            onNavigate(currentView === "contact" ? "work_menu" : "contact")
          }
          title="連絡"
          className={`${layoutClass} ${
            contactDisabled ? disabledStyle : activeStyle
          }`}
        >
          <DtsContactIcon className="w-5 h-5 shrink-0" />
          <span className="text-[14px] font-bold tracking-wide">連絡</span>
          {unreadMessageCount > 0 && !contactDisabled && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-amber-400" />
          )}
        </button>
      )}

      {/* 5. Wide: 地図 / Compact Nav: 3x3メニュー復帰 */}
      {compact ? (
        <button
          type="button"
          onClick={() =>
            onReturnFromNav ? onReturnFromNav() : onNavigate("work_menu")
          }
          title="デジタコメニュー"
          className={`${layoutClass} border-b-0 ${activeStyle}`}
        >
          <DtsGrid3x3Icon className="w-5 h-5 shrink-0" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onNavigate("nav")}
          title="地図"
          className={`${layoutClass} border-b-0 ${activeStyle}`}
        >
          <DtsMapIcon className="w-5 h-5 shrink-0" />
          <span className="text-[14px] font-bold tracking-wide">地図</span>
        </button>
      )}
    </aside>
  );
};
