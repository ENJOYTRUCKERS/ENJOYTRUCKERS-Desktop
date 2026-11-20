import React, { useEffect, useState } from "react";

interface GreenModalProps {
  open: boolean;
  title: string;
  message: string;
  subMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  autoConfirmSeconds?: number;
  options?: string[];
  singleConfirm?: boolean;
  hideButtons?: boolean;
  onSelectOption?: (option: string) => void;
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
  options,
  singleConfirm = false,
  hideButtons = false,
  onSelectOption,
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
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4 select-none">
      <div className="w-[350px] max-w-[92%] bg-white border border-[#1f2029] rounded-[2px] shadow-2xl overflow-hidden">
        <div className="bg-[#2cc938] text-white text-center font-bold py-1.5 text-[15px] tracking-wide">
          {title}
        </div>

        {options && options.length > 0 ? (
          <div className="bg-white text-[#111111] divide-y divide-zinc-300 max-h-60 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onSelectOption ? onSelectOption(opt) : onConfirm()
                }
                className="w-full text-left px-4 py-3 text-[15px] font-medium hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-white text-[#111111] px-5 py-5 space-y-1.5">
            <p className="text-[15px] font-medium leading-snug">{message}</p>
            {subMessage && (
              <p className="text-zinc-600 text-xs">{subMessage}</p>
            )}
          </div>
        )}

        {!hideButtons && (!options || options.length === 0) && (
          <div
            className={`px-4 pb-3.5 bg-white ${
              singleConfirm
                ? "flex justify-center"
                : "grid grid-cols-2 gap-3"
            }`}
          >
            {!singleConfirm && (
              <button
                type="button"
                onClick={onCancel}
                className="h-10 rounded-[2px] bg-[#858399] hover:bg-[#76748b] active:bg-[#66647a] text-white font-bold text-[15px]"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onConfirm}
              className={`h-10 rounded-[2px] bg-[#858399] hover:bg-[#76748b] active:bg-[#66647a] text-white font-bold text-[15px] ${
                singleConfirm ? "w-44" : ""
              }`}
            >
              {remaining !== null ? `${confirmLabel}(${remaining})` : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
