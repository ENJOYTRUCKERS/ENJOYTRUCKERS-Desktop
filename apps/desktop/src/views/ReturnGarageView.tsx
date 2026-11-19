import React from "react";
import {
  Award,
  Bot,
  CheckCircle2,
  Home,
  Scale,
  Sparkles,
  Undo2,
} from "lucide-react";
import { formatHm } from "../components/shell/BottomTelemetryBar";
import type { DtsViewId, WorkState } from "../types/tachograph";

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
  onNavigate: (view: DtsViewId) => void;
}

export const ReturnGarageView: React.FC<ReturnGarageViewProps> = ({
  workState,
  aiReviewEnabled,
  aiReviewText,
  isRequestingAiReview,
  isFinishingDuty,
  lastFinishedSummary,
  onConfirmReturnGarage,
  onRequestAiReview,
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
    <div className="flex-1 bg-[#18181f] flex flex-col p-3.5 justify-between overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <span className="text-sm font-black text-white flex items-center gap-1.5">
          <Home className="w-4 h-4 text-[#ff1155]" />
          {isCompleted
            ? "帰庫完了・本日乗務日報サマリー"
            : "帰庫確認（運行終了・ポータル日報送信）"}
        </span>
        {!isCompleted && (
          <button
            type="button"
            onClick={() => onNavigate("driving")}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1"
          >
            <Undo2 className="w-3.5 h-3.5" />
            運行へ戻る
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-3 my-2 flex-1 min-h-0">
        <div className="col-span-6 bg-[#23232c] border border-zinc-700 rounded p-3 flex flex-col justify-between">
          <div className="text-xs font-bold text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Award className="w-4 h-4 text-amber-400" />
              安全運転G評価 ＆ 430判定
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-black text-xs">
              Gランク {summary.gRank} ({summary.gScore.toFixed(1)}点)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs my-1">
            <div className="bg-zinc-900 rounded p-2">
              <div className="text-[10px] text-zinc-500">実走行距離</div>
              <div className="font-mono font-black text-white text-sm">
                {summary.distanceKm.toFixed(1)} km
              </div>
            </div>
            <div className="bg-zinc-900 rounded p-2">
              <div className="text-[10px] text-zinc-500">最大連続運転</div>
              <div className="font-mono font-black text-white text-sm">
                {formatHm(summary.maxContinuousSec)}
              </div>
            </div>
            <div className="bg-zinc-900 rounded p-2">
              <div className="text-[10px] text-zinc-500">430法令順守</div>
              <div
                className={`font-black text-xs flex items-center gap-1 ${
                  summary.is430Violation ? "text-red-400" : "text-emerald-400"
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                {summary.is430Violation ? "違反あり" : "完全順守"}
              </div>
            </div>
            <div className="bg-zinc-900 rounded p-2">
              <div className="text-[10px] text-zinc-500">急挙動・衝撃合計</div>
              <div className="font-mono font-black text-white text-sm">
                {summary.harshTotal} 回
              </div>
            </div>
          </div>

          <div className="text-[11px] text-zinc-400">
            {isCompleted
              ? "日報・1Hz圧縮波形データをポータルへ送信しました（Truckyジョブと自動突合されます）。"
              : "「帰庫確定」を押すと1Hz波形・430実績・Gスコアをポータルへ送信し、業務を終了します。"}
          </div>
        </div>

        {/* AI Operation Manager Review (Phase 6 feat_ai_review) */}
        <div className="col-span-6 bg-[#23232c] border border-zinc-700 rounded p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <Bot className="w-4 h-4" />
              AI運行管理者 ワンポイント安全講評
            </span>
            {aiReviewEnabled && (
              <button
                type="button"
                onClick={onRequestAiReview}
                disabled={isRequestingAiReview}
                className="px-2 py-0.5 rounded bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 text-[10px] font-bold flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                {isRequestingAiReview ? "生成中..." : "AI講評を取得"}
              </button>
            )}
          </div>

          <div className="flex-1 bg-zinc-900/90 border border-zinc-800 rounded p-2.5 my-2 overflow-y-auto text-xs text-zinc-200 leading-relaxed">
            {aiReviewText ? (
              aiReviewText
            ) : (
              <span className="text-zinc-500">
                帰庫確定後、本日の3軸G波形・430休憩実績に基づく運行管理者AIの安全運転フィードバックが表示されます。
              </span>
            )}
          </div>

          {!isCompleted ? (
            <button
              type="button"
              onClick={onConfirmReturnGarage}
              disabled={isFinishingDuty}
              className="w-full h-11 rounded bg-[#2cc938] hover:bg-[#25ad30] text-black font-black text-base flex items-center justify-center gap-1.5 shadow-lg"
            >
              <CheckCircle2 className="w-5 h-5" />
              {isFinishingDuty ? "日報送信中..." : "帰庫確定（業務終了・送信）"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate("pre_departure")}
              className="w-full h-11 rounded bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-black text-sm flex items-center justify-center gap-1.5"
            >
              次の乗務準備（始業画面）へ戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
