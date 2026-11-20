import React from "react";
import type {
  DtsViewId,
  OverlayState,
  TelemetryData,
  WorkState,
} from "../../types/tachograph";
import { DtsSignalIcon } from "./DtsIcons";

interface TopStatusBarProps {
  time: string;
  isOnline: boolean;
  isGameConnected: boolean;
  telemetry?: TelemetryData;
  workState: WorkState;
  overlayState: OverlayState;
  currentView?: DtsViewId;
  onToggleOverlay: () => void;
  onToggleSos: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  time,
  isOnline,
  isGameConnected,
  workState,
  overlayState,
  onToggleOverlay,
  onToggleSos,
}) => {
  return (
    <header className="h-8 bg-[#1b1e2c] border-b border-[#4aa8d8] px-3 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-2">
        {workState.is_sos && (
          <button
            type="button"
            onClick={onToggleSos}
            className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-bold tracking-wider animate-pulse"
            title="クリックでSOS解除"
          >
            SOS発信中
          </button>
        )}
        {overlayState.enabled && (
          <button
            type="button"
            onClick={onToggleOverlay}
            className="px-2 py-0.5 bg-[#4e4c73]/80 text-white text-[11px] font-bold"
            title="Alt+D でクリックスルー切替"
          >
            {overlayState.clickThrough ? "透過中 (Alt+D)" : "最前面"}
          </button>
        )}
        {workState.is_430_violation && (
          <span className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-bold">
            430超過
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <DtsSignalIcon isOnline={isOnline} isGameConnected={isGameConnected} />
        <span className="tabular-nums text-[15px] font-bold tracking-tight text-white">
          {time}
        </span>
      </div>
    </header>
  );
};
