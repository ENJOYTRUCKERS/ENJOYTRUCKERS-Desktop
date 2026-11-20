import React from "react";
import type { RoadType, WorkState } from "../../types/tachograph";

interface BottomTelemetryBarProps {
  workState: WorkState;
  onFlushQueue?: () => void;
}

const ROAD_LABELS: Record<RoadType, string> = {
  city: "市街地",
  local: "一般道",
  highway: "高速道",
  private: "専用道",
};

export function formatHm(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${hrs}:${mins.toString().padStart(2, "0")}`;
}

export function formatHms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export const BottomTelemetryBar: React.FC<BottomTelemetryBarProps> = ({
  workState,
  onFlushQueue,
}) => {
  const breakDisplaySeconds =
    workState.current_break_seconds > 0
      ? workState.current_break_seconds
      : workState.total_break_seconds;

  return (
    <footer className="h-7 bg-[#070910] border-t border-[#1c1f2e] flex items-center px-3 text-[11px] text-[#c8cad6] gap-3.5 w-full shrink-0 select-none">
      <span className="flex items-baseline gap-1">
        <span>連続走行</span>
        <span
          className={`text-[13px] font-bold tabular-nums ${
            workState.is_430_violation
              ? "text-red-500"
              : workState.is_430_warning
              ? "text-amber-400"
              : "text-white"
          }`}
        >
          {formatHm(workState.continuous_driving_seconds)}
        </span>
      </span>

      <span className="flex items-baseline gap-1">
        <span>休憩</span>
        <span className="text-[13px] font-bold tabular-nums text-white">
          {formatHm(breakDisplaySeconds)}
        </span>
      </span>

      <span className="flex items-baseline gap-1">
        <span>出庫から</span>
        <span className="text-[13px] font-bold tabular-nums text-white">
          {formatHm(workState.work_seconds + workState.rest_seconds)}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-2.5 text-[12px] font-bold text-white">
        {workState.pending_queue_count > 0 && onFlushQueue && (
          <button
            type="button"
            onClick={onFlushQueue}
            className="px-1.5 py-0.5 bg-amber-600/80 text-white text-[10px] font-bold rounded-[2px]"
            title="未送信の日報キューを再送"
          >
            再送({workState.pending_queue_count})
          </button>
        )}
        <span>{ROAD_LABELS[workState.road_type] || "一般道"}</span>
        <span>{workState.is_loaded ? "実車" : "空車"}</span>
      </div>
    </footer>
  );
};
