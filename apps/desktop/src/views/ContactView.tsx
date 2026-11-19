import React from "react";
import {
  Check,
  Mail,
  RefreshCw,
  Send,
  Undo2,
  Volume2,
  XCircle,
} from "lucide-react";
import type { DtsViewId, TachographMessageItem } from "../types/tachograph";

interface ContactViewProps {
  messages: TachographMessageItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onSendQuickReply: (content: string, quickReplyCode: string) => void;
  onReadAloud: (text: string) => void;
  onNavigate: (view: DtsViewId) => void;
}

export const ContactView: React.FC<ContactViewProps> = ({
  messages,
  isLoading,
  onRefresh,
  onSendQuickReply,
  onReadAloud,
  onNavigate,
}) => {
  return (
    <div className="flex-1 bg-[#17171d] flex flex-col p-3.5 justify-between overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 shrink-0">
        <span className="text-sm font-black text-sky-300 flex items-center gap-1.5">
          <Mail className="w-4 h-4" />
          事務所（CC管制）双方向メッセージ・定型連絡
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
            受信確認
          </button>
          <button
            type="button"
            onClick={() => onNavigate("driving")}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1"
          >
            <Undo2 className="w-3.5 h-3.5" />
            戻る
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto space-y-2 my-2 pr-1">
        {messages.map((m) => {
          const isFromOffice = m.direction === "to_vehicle";
          return (
            <div
              key={m.id}
              className={`p-2.5 rounded border flex items-center justify-between gap-2 ${
                isFromOffice
                  ? "bg-[#232733] border-sky-500/40"
                  : "bg-[#222229] border-zinc-800"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px]">
                  <span
                    className={`px-1.5 py-0.5 rounded font-black ${
                      isFromOffice
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {isFromOffice ? "事務所 → 車載機" : "車載機 → 事務所"}
                  </span>
                  <span className="text-zinc-400 font-bold">
                    {m.senderName || "運行管理"}
                  </span>
                </div>
                <div className="text-xs font-bold text-white mt-1">
                  {m.content}
                </div>
              </div>
              {isFromOffice && (
                <button
                  type="button"
                  onClick={() => onReadAloud(m.content)}
                  className="px-2.5 py-1.5 rounded bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  読上
                </button>
              )}
            </div>
          );
        })}

        {messages.length === 0 && (
          <div className="h-36 flex items-center justify-center text-xs text-zinc-500">
            送受信メッセージはありません。下部の定型ボタンから事務所へワンタップ連絡できます。
          </div>
        )}
      </div>

      {/* DTS-G1D3 Standard Quick Reply Footer ([戻る / いいえ / はい] + Status Presets) */}
      <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-zinc-800 shrink-0">
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("了解しました（はい）", "YES")
          }
          className="h-11 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1"
        >
          <Check className="w-4 h-4" />
          はい（了解）
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("対応困難です（いいえ）", "NO")
          }
          className="h-11 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs font-black flex items-center justify-center gap-1"
        >
          <XCircle className="w-4 h-4" />
          いいえ
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("430休憩に入ります。異常ありません。", "BREAK_START")
          }
          className="h-11 rounded bg-[#187f82] hover:bg-[#1ca0a4] text-white text-xs font-bold flex items-center justify-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          休憩開始連絡
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("現地到着・荷役作業を開始します。", "ARRIVED")
          }
          className="h-11 rounded bg-[#187f82] hover:bg-[#1ca0a4] text-white text-xs font-bold flex items-center justify-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          現地到着連絡
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("渋滞のため到着が遅延見込みです。", "DELAY")
          }
          className="h-11 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          遅延連絡
        </button>
      </div>
    </div>
  );
};
