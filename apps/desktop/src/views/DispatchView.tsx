import React, { useState } from "react";
import { FileText, Image as ImageIcon, RefreshCw, X } from "lucide-react";
import type {
  DispatchEventItem,
  DispatchOrderItem,
} from "../types/tachograph";

interface DispatchViewProps {
  orders: DispatchOrderItem[];
  events: DispatchEventItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onUpdateOrderStatus: (orderId: string, action: "accept" | "complete") => void;
  onBack: () => void;
}

export const DispatchView: React.FC<DispatchViewProps> = ({
  orders,
  events,
  isLoading,
  onRefresh,
  onUpdateOrderStatus,
  onBack,
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between overflow-hidden relative min-h-0">
      <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center justify-between text-white shrink-0">
        <span className="flex items-center gap-2 font-bold text-lg">
          <FileText className="w-5 h-5" />
          運行指示書
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="px-2.5 py-1 bg-[#1e6a92] hover:bg-[#247ba8] text-white text-xs font-bold flex items-center gap-1 rounded-[2px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#25283d] px-3 py-1">
        {orders.map((ord) => (
          <div
            key={ord.id}
            className="py-2.5 flex items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-[2px] ${
                    ord.status === "in_progress"
                      ? "bg-[#3ca4d4] text-white"
                      : "bg-[#4e4c73] text-white"
                  }`}
                >
                  {ord.status === "in_progress" ? "運行中" : "指示"}
                </span>
                <span className="text-sm font-bold text-white truncate">
                  {ord.title}
                </span>
              </div>
              <div className="text-xs text-zinc-300 mt-1">
                {ord.sourceCity || "指定なし"} →{" "}
                <span className="text-[#64c4ed] font-bold">
                  {ord.destinationCity || "指定なし"}
                </span>
                {ord.cargoName && (
                  <span className="text-zinc-400 ml-1">({ord.cargoName})</span>
                )}
              </div>
              {ord.notes && (
                <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  {ord.notes}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {ord.parkingImageUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewImage(ord.parkingImageUrl)}
                  className="px-2.5 py-1.5 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold rounded-[2px] flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  駐車図
                </button>
              )}
              {ord.status !== "in_progress" ? (
                <button
                  type="button"
                  onClick={() => onUpdateOrderStatus(ord.id, "accept")}
                  className="px-3 py-1.5 bg-[#3ca4d4] hover:bg-[#4cb4e4] text-white text-xs font-bold rounded-[2px]"
                >
                  受領
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onUpdateOrderStatus(ord.id, "complete")}
                  className="px-3 py-1.5 bg-[#2cc938] hover:bg-[#25ad30] text-white text-xs font-bold rounded-[2px]"
                >
                  完了
                </button>
              )}
            </div>
          </div>
        ))}

        {events.map((ev) => (
          <div
            key={ev.id}
            className="py-2.5 flex items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-[#4e4c73] text-white text-[10px] font-bold rounded-[2px]">
                  イベント
                </span>
                <span className="text-sm font-bold text-white truncate">
                  {ev.title}
                </span>
              </div>
              <div className="text-xs text-zinc-300 mt-1">
                {ev.departure || "集合地"} → {ev.destination || "目的地"}
                {ev.server && (
                  <span className="text-zinc-400 ml-1.5">[{ev.server}]</span>
                )}
              </div>
            </div>

            {(ev.parkingImageUrl || ev.mapImageUrl) && (
              <button
                type="button"
                onClick={() =>
                  setPreviewImage(ev.parkingImageUrl || ev.mapImageUrl)
                }
                className="px-2.5 py-1.5 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold rounded-[2px] flex items-center gap-1 shrink-0"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                案内図
              </button>
            )}
          </div>
        ))}

        {orders.length === 0 && events.length === 0 && (
          <div className="h-44 flex items-center justify-center text-xs text-zinc-400">
            現在受信している運行指示書・イベント予定はありません
          </div>
        )}
      </div>

      <div className="bg-[#222436] px-3 py-2 border-t border-[#32344a] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="bg-[#525074] hover:bg-[#62608a] text-white h-10 px-6 text-sm font-bold rounded-[2px]"
        >
          戻る
        </button>
      </div>

      {previewImage && (
        <div className="absolute inset-0 z-30 bg-black/90 flex flex-col p-3">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold text-[#64c4ed]">
              駐車場案内画像
            </span>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="px-2.5 py-1 bg-[#4e4c73] text-white text-xs font-bold flex items-center gap-1 rounded-[2px]"
            >
              <X className="w-3.5 h-3.5" />
              閉じる
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <img
              src={previewImage}
              alt="Parking preview"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
