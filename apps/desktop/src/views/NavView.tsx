import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import type {
  DesktopFeatureFlags,
  DispatchEventItem,
  DispatchOrderItem,
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
  onToggleFullScreen: () => void;
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
  onToggleFullScreen,
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
    "出発地";
  const dstCity =
    telemetry.destination_city ||
    activeOrder?.destinationCity ||
    upcomingEvent?.destination ||
    "目的地";

  return (
    <div className="flex-1 bg-black relative flex flex-col overflow-hidden">
      {/* DTS-G1D3 Dispatch Timeline Overlay Bar */}
      {featureFlags.feat_dispatch_orders && (
        <div className="h-8 bg-[#18181f]/95 border-b border-zinc-800 px-3 flex items-center justify-between text-[11px] z-10 shrink-0">
          <div className="flex items-center gap-1.5 font-bold truncate">
            <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[10px]">
              工程
            </span>
            <span className="text-zinc-200 truncate max-w-[110px]">
              1.{srcCity}
            </span>
            <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
            <span className="text-sky-300">2.積込・運行</span>
            <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
            <span className="text-emerald-300 truncate max-w-[110px]">
              3.{dstCity}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {featureFlags.feat_parking_image_push && parkingImageUrl && (
              <button
                type="button"
                onClick={() => setShowParkingModal(true)}
                className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold text-[10px] flex items-center gap-1 hover:bg-amber-500/30"
              >
                <ImageIcon className="w-3 h-3" />
                駐車場案内図
              </button>
            )}
            <button
              type="button"
              onClick={onToggleFullScreen}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              title="全画面地図切替 (Numpad +)"
            >
              {isFullScreenMap ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {hazardWarningText && (
        <div className="absolute top-10 left-3 z-20 px-3 py-1 rounded bg-red-600/95 text-white text-xs font-black flex items-center gap-1.5 shadow-lg animate-pulse">
          <AlertTriangle className="w-3.5 h-3.5" />
          {hazardWarningText}
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={`${portalUrl}/map?embed=desktop`}
        className="w-full flex-1 border-0"
        title="ENJOYTRUCKERS Live Navigation"
      />

      {/* Parking / Convoy Guide Image Overlay Modal */}
      {showParkingModal && parkingImageUrl && (
        <div className="absolute inset-0 z-30 bg-black/85 flex flex-col p-3">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" />
              駐車場・待機場所案内画像 ({activeOrder?.title || upcomingEvent?.title})
            </span>
            <button
              type="button"
              onClick={() => setShowParkingModal(false)}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              閉じる
            </button>
          </div>
          <div className="flex-1 bg-zinc-950 rounded border border-zinc-800 flex items-center justify-center overflow-hidden">
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
