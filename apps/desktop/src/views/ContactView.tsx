import React from "react";
import { Mail, RefreshCw, Volume2 } from "lucide-react";
import type { TachographMessageItem } from "../types/tachograph";

interface ContactViewProps {
  messages: TachographMessageItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onSendQuickReply: (content: string, quickReplyCode: string) => void;
  onReadAloud: (text: string) => void;
  onBack: () => void;
}

export const ContactView: React.FC<ContactViewProps> = ({
  messages,
  isLoading,
  onRefresh,
  onSendQuickReply,
  onReadAloud,
  onBack,
}) => {
  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between overflow-hidden min-h-0">
      <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center justify-between text-white shrink-0">
        <span className="flex items-center gap-2 font-bold text-lg">
          <Mail className="w-5 h-5" />
          事務所連絡
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="px-2.5 py-1 bg-[#1e6a92] hover:bg-[#247ba8] text-white text-xs font-bold flex items-center gap-1 rounded-[2px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          受信確認
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#25283d] px-3 py-1">
        {messages.map((m) => {
          const isFromOffice = m.direction === "to_vehicle";
          return (
            <div
              key={m.id}
              className="py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`px-1.5 py-0.5 font-bold rounded-[2px] ${
                      isFromOffice
                        ? "bg-[#3ca4d4] text-white"
                        : "bg-[#4e4c73] text-zinc-200"
                    }`}
                  >
                    {isFromOffice ? "事務所" : "車両"}
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
                  className="px-2.5 py-1.5 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold flex items-center gap-1 rounded-[2px] shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  読上
                </button>
              )}
            </div>
          );
        })}

        {messages.length === 0 && (
          <div className="h-40 flex items-center justify-center text-xs text-zinc-400">
            送受信メッセージはありません。下部の定型ボタンから連絡できます。
          </div>
        )}
      </div>

      <div className="bg-[#222436] px-2.5 py-2 border-t border-[#32344a] grid grid-cols-6 gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-10 bg-[#525074] hover:bg-[#62608a] text-white text-xs font-bold rounded-[2px]"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={() => onSendQuickReply("了解しました（はい）", "YES")}
          className="h-10 bg-[#2cc938] hover:bg-[#25ad30] text-white text-xs font-bold rounded-[2px]"
        >
          はい
        </button>
        <button
          type="button"
          onClick={() => onSendQuickReply("対応困難です（いいえ）", "NO")}
          className="h-10 bg-[#858399] hover:bg-[#76748b] text-white text-xs font-bold rounded-[2px]"
        >
          いいえ
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("430休憩を開始します。", "BREAK_START")
          }
          className="h-10 bg-[#3ca4d4] hover:bg-[#4cb4e4] text-white text-xs font-bold rounded-[2px]"
        >
          休憩開始
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("現地到着しました。", "ARRIVED")
          }
          className="h-10 bg-[#3ca4d4] hover:bg-[#4cb4e4] text-white text-xs font-bold rounded-[2px]"
        >
          到着連絡
        </button>
        <button
          type="button"
          onClick={() =>
            onSendQuickReply("渋滞により到着遅延見込みです。", "DELAY")
          }
          className="h-10 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-[2px]"
        >
          遅延連絡
        </button>
      </div>
    </div>
  );
};
