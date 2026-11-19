import React, { useState } from "react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import type {
  DispatchEventItem,
  DispatchOrderItem,
  DtsViewId,
} from "../types/tachograph";

interface DispatchViewProps {
  orders: DispatchOrderItem[];
  events: DispatchEventItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onUpdateOrderStatus: (orderId: string, action: "accept" | "complete") => void;
  onNavigate: (view: DtsViewId) => void;
}

export const DispatchView: React.FC<DispatchViewProps> = ({
  orders,
  events,
  isLoading,
  onRefresh,
  onUpdateOrderStatus,
  onNavigate,
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  return (
    <div className="flex-1 bg-[#18181f] flex flex-col p-3.5 justify-between overflow-hidden relative">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 shrink-0">
        <span className="text-sm font-black text-teal-300 flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          運行指示書 ＆ 公式コンボイ配車一覧
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            更新
          </button>
          <button
            type="button"
            onClick={() => onNavigate("driving")}
            className="px-2.5 py-1 rounded bg-[#187f82] hover:bg-[#1ca0a4] text-white text-xs font-bold"
          >
            走行画面へ
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 my-2 pr-1">
        {orders.map((ord) => (
          <div
            key={ord.id}
            className="bg-[#23232c] border border-zinc-700 rounded p-2.5 flex items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                    ord.status === "in_progress"
                      ? "bg-sky-500/20 text-sky-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {ord.status === "in_progress" ? "運行中" : "配車指示"}
                </span>
                <span className="text-xs font-black text-white truncate">
                  {ord.title}
                </span>
              </div>
              <div className="text-[11px] text-zinc-300 flex items-center gap-1.5 mt-1">
                <span>{ord.sourceCity || "指定なし"}</span>
                <ArrowRight className="w-3 h-3 text-zinc-500" />
                <span className="text-sky-300 font-bold">
                  {ord.destinationCity || "指定なし"}
                </span>
                {ord.cargoName && (
                  <span className="text-zinc-400">({ord.cargoName})</span>
                )}
              </div>
              {ord.notes && (
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                  指示備考: {ord.notes}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {ord.parkingImageUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewImage(ord.parkingImageUrl)}
                  className="px-2 py-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  駐車図
                </button>
              )}
              {ord.status !== "in_progress" ? (
                <button
                  type="button"
                  onClick={() => onUpdateOrderStatus(ord.id, "accept")}
                  className="px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-black flex items-center gap-1"
                >
                  <Play className="w-3 h-3 fill-current" />
                  受領
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onUpdateOrderStatus(ord.id, "complete")}
                  className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  完了
                </button>
              )}
            </div>
          </div>
        ))}

        {events.map((ev) => (
          <div
            key={ev.id}
            className="bg-[#202029] border border-zinc-800 rounded p-2.5 flex items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-black flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  公式イベント
                </span>
                <span className="text-xs font-bold text-white truncate">
                  {ev.title}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-1">
                <span>{ev.departure || "集合地"}</span>
                <ArrowRight className="w-3 h-3 text-zinc-600" />
                <span className="text-zinc-200">
                  {ev.destination || "目的地"}
                </span>
                {ev.server && (
                  <span className="font-mono text-[10px] text-zinc-500">
                    [{ev.server}]
                  </span>
                )}
              </div>
            </div>

            {(ev.parkingImageUrl || ev.mapImageUrl) && (
              <button
                type="button"
                onClick={() =>
                  setPreviewImage(ev.parkingImageUrl || ev.mapImageUrl)
                }
                className="px-2.5 py-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1 shrink-0"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                駐車場案内図
              </button>
            )}
          </div>
        ))}

        {orders.length === 0 && events.length === 0 && (
          <div className="h-44 flex items-center justify-center text-xs text-zinc-500">
            現在割り当てられている運行指示書・直近のコンボイ予定はありません
          </div>
        )}
      </div>

      {previewImage && (
        <div className="absolute inset-0 z-30 bg-black/90 flex flex-col p-3">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold text-amber-300">
              駐車場・ルート案内画像プレビュー
            </span>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="px-2.5 py-1 rounded bg-zinc-800 text-white text-xs font-bold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              閉じる
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <img
              src={previewImage}
              alt="Parking preview"
              className="max-w-full max-h-full object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
};
