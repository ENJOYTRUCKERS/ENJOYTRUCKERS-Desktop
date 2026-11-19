import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface GreenModalProps {
  open: boolean;
  title: string;
  message: string;
  subMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  autoConfirmSeconds?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const GreenModal: React.FC<GreenModalProps> = ({
  open,
  title,
  message,
  subMessage,
  confirmLabel = "確認",
  cancelLabel = "取消",
  autoConfirmSeconds,
  onConfirm,
  onCancel,
}) => {
  const [remaining, setRemaining] = useState<number | null>(
    autoConfirmSeconds ?? null
  );

  useEffect(() => {
    if (!open || !autoConfirmSeconds) {
      setRemaining(null);
      return;
    }
    setRemaining(autoConfirmSeconds);
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          onConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, autoConfirmSeconds, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#232329] border-2 border-[#2cc938] rounded-md shadow-2xl overflow-hidden">
        <div className="bg-[#2cc938] text-black px-4 py-2 font-black text-base tracking-wide flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs font-mono">DTS-G1D3</span>
        </div>
        <div className="p-5 text-center space-y-2">
          <p className="text-white text-lg font-bold leading-snug">{message}</p>
          {subMessage && (
            <p className="text-zinc-400 text-xs">{subMessage}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          <button
            onClick={onCancel}
            className="h-12 rounded bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-800 text-white font-bold text-base flex items-center justify-center gap-1.5 border-b-2 border-zinc-900"
          >
            <XCircle className="w-4 h-4" />
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="h-12 rounded bg-[#2cc938] hover:bg-[#25ad30] active:bg-[#1e8f27] text-black font-black text-base flex items-center justify-center gap-1.5 border-b-2 border-emerald-900"
          >
            <CheckCircle2 className="w-4 h-4" />
            {remaining !== null ? `${confirmLabel}(${remaining})` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
