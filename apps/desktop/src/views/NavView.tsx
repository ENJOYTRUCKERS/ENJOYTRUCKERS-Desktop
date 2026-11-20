import React, { useState } from "react";
import {
  AlertTriangle,
  Image as ImageIcon,
  Maximize2,
  Menu,
  Minimize2,
  X,
} from "lucide-react";
import { DtsSearchIcon } from "../components/shell/DtsIcons";
import type {
  DesktopFeatureFlags,
  DispatchEventItem,
  DispatchOrderItem,
  DtsViewId,
  TelemetryData,
} from "../types/tachograph";

interface NavViewProps {
  portalUrl: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  telemetry: TelemetryData;
  featureFlags: DesktopFeatureFlags;
  isFullScreenMap: boolean;
  hazardWarningText: string | null;
  activeOrder: DispatchOrderItem | null;
  upcomingEvent: DispatchEventItem | null;
  onRequestToggleFullScreen: () => void;
  onNavigate: (view: DtsViewId) => void;
}

export const NavView: React.FC<NavViewProps> = ({
  portalUrl,
  iframeRef,
  telemetry,
  featureFlags,
  isFullScreenMap,
  hazardWarningText,
  activeOrder,
  upcomingEvent,
  onRequestToggleFullScreen,
  onNavigate,
}) => {
  const [showParkingModal, setShowParkingModal] = useState(false);

  const parkingImageUrl =
    activeOrder?.parkingImageUrl ||
    upcomingEvent?.parkingImageUrl ||
    upcomingEvent?.mapImageUrl ||
    null;

  const srcCity =
    telemetry.source_city ||
    activeOrder?.sourceCity ||
    upcomingEvent?.departure ||
    "";
  const dstCity =
    telemetry.destination_city ||
    activeOrder?.destinationCity ||
    upcomingEvent?.destination ||
    "";

  const locationText =
    srcCity && dstCity
      ? `${srcCity} → ${dstCity}`
      : srcCity || dstCity || "現在地 / ナビゲーション";

  return (
    <div className="flex-1 bg-black relative flex flex-col overflow-hidden min-h-0">
      {hazardWarningText && (
        <div className="absolute top-2 left-2 z-20 px-2.5 py-1 bg-red-600/95 text-white text-xs font-bold flex items-center gap-1.5 shadow animate-pulse">
          <AlertTriangle className="w-3.5 h-3.5" />
          {hazardWarningText}
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={`${portalUrl}/map?embed=desktop`}
        className="w-full flex-1 border-0 min-h-0"
        title="ENJOYTRUCKERS Live Navigation"
      />

      {/* Real DTS-G1D Nav Sub-Footer Bar (231702.png / 233209.png / 233220.png) */}
      <div className="h-8 bg-[#121520] border-t border-[#262a3d] px-2.5 flex items-center justify-between text-xs text-white shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded-full bg-[#3fa7da] text-[#0c0f1a] flex items-center justify-center shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="1,6 10,2 8,6 10,10" />
            </svg>
          </span>
          <span className="font-bold truncate">{locationText}</span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 ml-2">
          {featureFlags.feat_parking_image_push && parkingImageUrl && (
            <button
              type="button"
              onClick={() => setShowParkingModal(true)}
              className="px-2 py-0.5 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-[11px] font-bold flex items-center gap-1 rounded-[2px]"
            >
              <ImageIcon className="w-3 h-3" />
              駐車図
            </button>
          )}
          <button
            type="button"
            onClick={onRequestToggleFullScreen}
            className="p-1 text-zinc-200 hover:text-white"
            title={
              isFullScreenMap
                ? "通常表示へ戻す (Numpad - 長押し)"
                : "全画面表示 (Numpad + 長押し)"
            }
          >
            {isFullScreenMap ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate("dispatch")}
            className="p-1 text-zinc-200 hover:text-white"
            title="目的地・運行指示書"
          >
            <DtsSearchIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="p-1 text-zinc-200 hover:text-white"
            title="ナビ・設定"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Parking / Convoy Guide Image Modal */}
      {showParkingModal && parkingImageUrl && (
        <div className="absolute inset-0 z-30 bg-black/85 flex flex-col p-3">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold text-[#64c4ed] flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" />
              駐車場案内画像 ({activeOrder?.title || upcomingEvent?.title})
            </span>
            <button
              type="button"
              onClick={() => setShowParkingModal(false)}
              className="px-2.5 py-1 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold flex items-center gap-1 rounded-[2px]"
            >
              <X className="w-3.5 h-3.5" />
              閉じる
            </button>
          </div>
          <div className="flex-1 bg-[#0c0f1a] border border-[#2a2e45] flex items-center justify-center overflow-hidden">
            <img
              src={parkingImageUrl}
              alt="Parking Guide"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
