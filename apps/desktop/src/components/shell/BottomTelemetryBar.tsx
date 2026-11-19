import React from "react";
import { CloudUpload } from "lucide-react";
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
  const splitBreakMin = Math.floor(
    (workState.break_bank_seconds +
      (workState.current_break_seconds >= 600
        ? workState.current_break_seconds
        : 0)) /
      60
  );

  const rankColor =
    workState.g_rank === "S"
      ? "text-emerald-400"
      : workState.g_rank === "A"
      ? "text-sky-400"
      : workState.g_rank === "B"
      ? "text-amber-300"
      : workState.g_rank === "C"
      ? "text-orange-400"
      : "text-red-500";

  return (
    <footer className="h-8 bg-[#1e1e24] border-t border-zinc-800 flex items-center px-3 text-[11px] font-bold text-zinc-400 gap-3 w-full shrink-0 select-none">
      <span>
        連続運転
        <span
          className={`ml-1 font-mono ${
            workState.is_430_violation
              ? "text-red-400 font-black"
              : workState.is_430_warning
              ? "text-amber-300 font-black"
              : "text-white"
          }`}
        >
          {formatHm(workState.continuous_driving_seconds)}
        </span>
        <span className="text-zinc-500 font-mono">/4:00</span>
      </span>

      <span>
        430分割休憩
        <span className="text-emerald-300 ml-1 font-mono">
          {Math.min(30, splitBreakMin)}分
        </span>
        <span className="text-zinc-500 font-mono">/30分</span>
      </span>

      <span>
        出庫から
        <span className="text-white ml-1 font-mono">
          {formatHm(workState.work_seconds + workState.rest_seconds)}
        </span>
      </span>

      <span>
        G評価
        <span className={`ml-1 font-mono font-black ${rankColor}`}>
          {workState.g_rank} ({workState.g_score.toFixed(1)})
        </span>
      </span>

      <div className="ml-auto flex items-center gap-2">
        {workState.pending_queue_count > 0 && (
          <button
            onClick={onFlushQueue}
            className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1 hover:bg-amber-500/30"
            title="未送信の日報キューを再送"
          >
            <CloudUpload className="w-3 h-3" />
            未送信 {workState.pending_queue_count}
          </button>
        )}
        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">
          {ROAD_LABELS[workState.road_type] || "一般道"}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded ${
            workState.is_loaded
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-zinc-800 text-zinc-300"
          }`}
        >
          {workState.is_loaded ? "実車" : "空車"}
        </span>
      </div>
    </footer>
  );
};
