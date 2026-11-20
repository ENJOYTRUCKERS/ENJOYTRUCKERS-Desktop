import React from "react";
import { Home } from "lucide-react";
import { formatHm } from "../components/shell/BottomTelemetryBar";
import type { DtsViewId, RoadType, WorkState } from "../types/tachograph";

interface ReturnGarageViewProps {
  workState: WorkState;
  aiReviewEnabled: boolean;
  aiReviewText: string | null;
  isRequestingAiReview: boolean;
  isFinishingDuty: boolean;
  lastFinishedSummary: {
    distanceKm: number;
    gScore: number;
    gRank: string;
    is430Violation: boolean;
    maxContinuousSec: number;
    harshTotal: number;
  } | null;
  onConfirmReturnGarage: () => void;
  onRequestAiReview: () => void;
  onBack: () => void;
  onNavigate: (view: DtsViewId) => void;
}

const ROAD_LABELS: Record<RoadType, string> = {
  city: "市街地",
  local: "一般道",
  highway: "高速道",
  private: "専用道",
};

export const ReturnGarageView: React.FC<ReturnGarageViewProps> = ({
  workState,
  aiReviewEnabled,
  aiReviewText,
  isRequestingAiReview,
  isFinishingDuty,
  lastFinishedSummary,
  onConfirmReturnGarage,
  onRequestAiReview,
  onBack,
  onNavigate,
}) => {
  const summary = lastFinishedSummary || {
    distanceKm: workState.distance_driven_km,
    gScore: workState.g_score,
    gRank: workState.g_rank,
    is430Violation: workState.is_430_violation,
    maxContinuousSec: workState.max_continuous_driving_sec,
    harshTotal:
      workState.harsh_accel_count +
      workState.harsh_brake_count +
      workState.harsh_corner_count +
      workState.impact_count,
  };

  const isCompleted = workState.status === "Idle" && lastFinishedSummary !== null;

  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between overflow-hidden min-h-0">
      {/* Cyan Header Banner */}
      <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center justify-between text-white shrink-0">
        <span className="flex items-center gap-2 font-bold text-lg">
          <Home className="w-5 h-5" />
          {isCompleted ? "帰庫完了（運行終了）" : "帰庫確認"}
        </span>
        <span className="text-xs font-bold">
          {ROAD_LABELS[workState.road_type] || "一般道"} /{" "}
          {workState.is_loaded ? "実車" : "空車"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto">
        <div className="bg-[#151828] border border-[#2a2e45] px-3 py-2 text-xs text-zinc-200 flex items-center justify-between">
          <span>
            {isCompleted
              ? "日報および1Hz圧縮波形データをポータルへ送信しました。お疲れ様でした。"
              : "実車・空車および道路区分に間違いがないかを確認し、「確定」を押してください。"}
          </span>
          <span className="font-bold text-[#64c4ed] shrink-0 ml-2">
            Gランク {summary.gRank} ({summary.gScore.toFixed(1)}点)
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-[#151828] border border-[#2a2e45] p-2">
            <div className="text-[11px] text-zinc-400">実走行距離</div>
            <div className="text-base font-bold text-white tabular-nums mt-0.5">
              {summary.distanceKm.toFixed(1)} km
            </div>
          </div>
          <div className="bg-[#151828] border border-[#2a2e45] p-2">
            <div className="text-[11px] text-zinc-400">最大連続運転</div>
            <div className="text-base font-bold text-white tabular-nums mt-0.5">
              {formatHm(summary.maxContinuousSec)}
            </div>
          </div>
          <div className="bg-[#151828] border border-[#2a2e45] p-2">
            <div className="text-[11px] text-zinc-400">430法令順守</div>
            <div
              className={`text-sm font-bold mt-1 ${
                summary.is430Violation ? "text-red-400" : "text-[#4ee05c]"
              }`}
            >
              {summary.is430Violation ? "違反あり" : "順守"}
            </div>
          </div>
          <div className="bg-[#151828] border border-[#2a2e45] p-2">
            <div className="text-[11px] text-zinc-400">急挙動・衝撃</div>
            <div className="text-base font-bold text-white tabular-nums mt-0.5">
              {summary.harshTotal} 回
            </div>
          </div>
        </div>

        {/* AI Review Panel */}
        <div className="flex-1 bg-[#151828] border border-[#2a2e45] p-2.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-[#2a2e45] pb-1.5 mb-1.5 shrink-0">
            <span className="text-xs font-bold text-[#64c4ed]">
              運行管理者AI 安全運転講評
            </span>
            {aiReviewEnabled && (
              <button
                type="button"
                onClick={onRequestAiReview}
                disabled={isRequestingAiReview}
                className="px-2.5 py-0.5 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-[11px] font-bold rounded-[2px]"
              >
                {isRequestingAiReview ? "取得中..." : "AI講評取得"}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto text-xs text-zinc-200 leading-relaxed">
            {aiReviewText
              ? aiReviewText
              : "帰庫確定後、本日の3軸G評価および430休憩実績にもとづく安全運転講評が表示されます。"}
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-[#222436] px-3 py-2 border-t border-[#32344a] flex items-center justify-between shrink-0">
        {!isCompleted ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="bg-[#525074] hover:bg-[#62608a] text-white h-10 px-6 text-sm font-bold rounded-[2px]"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={onConfirmReturnGarage}
              disabled={isFinishingDuty}
              className="bg-gradient-to-b from-[#55b9ea] to-[#3999cb] hover:from-[#65c4f2] hover:to-[#45a5d6] text-white h-10 px-10 text-base font-bold rounded-[2px]"
            >
              {isFinishingDuty ? "送信中..." : "確定"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onNavigate("login")}
              className="bg-[#525074] hover:bg-[#62608a] text-white h-10 px-6 text-sm font-bold rounded-[2px]"
            >
              乗務員画面
            </button>
            <button
              type="button"
              onClick={() => onNavigate("pre_departure")}
              className="bg-gradient-to-b from-[#55b9ea] to-[#3999cb] hover:from-[#65c4f2] hover:to-[#45a5d6] text-white h-10 px-8 text-sm font-bold rounded-[2px]"
            >
              始業画面へ
            </button>
          </>
        )}
      </div>
    </div>
  );
};
