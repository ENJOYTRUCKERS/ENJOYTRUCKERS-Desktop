import React from "react";
import { Delete } from "lucide-react";

interface NumericKeypadProps {
  allowDecimal?: boolean;
  confirmLabel?: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onConfirm: () => void;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  allowDecimal = false,
  confirmLabel = "確定",
  onDigit,
  onBackspace,
  onConfirm,
}) => {
  const row1 = ["1", "2", "3", "4", "5"];
  const row2 = ["6", "7", "8", "9", "0"];

  return (
    <div className="grid grid-cols-6 grid-rows-2 gap-1 bg-[#25252b] p-1.5 border border-zinc-700 rounded select-none">
      {row1.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onDigit(n)}
          className="bg-[#3a3a42] hover:bg-[#484852] active:bg-[#555560] text-white h-14 text-2xl font-bold border-b-2 border-r border-[#1c1c20] rounded-sm"
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        className="bg-[#3a3a42] hover:bg-[#484852] active:bg-[#555560] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1c1c20] rounded-sm flex items-center justify-center gap-1"
      >
        <Delete className="w-4 h-4" />
        修正
      </button>

      {row2.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onDigit(n)}
          className="bg-[#3a3a42] hover:bg-[#484852] active:bg-[#555560] text-white h-14 text-2xl font-bold border-b-2 border-r border-[#1c1c20] rounded-sm"
        >
          {n}
        </button>
      ))}
      {allowDecimal ? (
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => onDigit(".")}
            className="bg-[#3a3a42] hover:bg-[#484852] text-white h-14 text-xl font-bold border-b-2 border-r border-[#1c1c20] rounded-sm"
          >
            .
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-[#0f8b8d] hover:bg-[#12a3a6] active:bg-[#0c7072] text-white h-14 text-sm font-black border-b-2 border-r border-[#085a5c] rounded-sm"
          >
            {confirmLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          className="bg-[#0f8b8d] hover:bg-[#12a3a6] active:bg-[#0c7072] text-white h-14 text-lg font-black border-b-2 border-r border-[#085a5c] rounded-sm"
        >
          {confirmLabel}
        </button>
      )}
    </div>
  );
};
