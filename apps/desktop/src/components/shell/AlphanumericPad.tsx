import React from "react";
import { Delete } from "lucide-react";

interface AlphanumericPadProps {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onConfirm: () => void;
}

const KEYS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
  "L", "M", "N", "P", "R", "S", "T", "U", "W", "-",
];

export const AlphanumericPad: React.FC<AlphanumericPadProps> = ({
  value,
  placeholder = "コード入力",
  onChange,
  onConfirm,
}) => {
  return (
    <div className="bg-[#232329] border border-zinc-700 rounded p-2 space-y-2 select-none">
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white text-black h-9 px-3 rounded flex items-center font-mono font-bold text-base">
          {value || <span className="text-zinc-400 text-xs">{placeholder}</span>}
        </div>
        <button
          type="button"
          onClick={() => onChange(value.slice(0, -1))}
          className="h-9 px-3 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold flex items-center gap-1"
        >
          <Delete className="w-3.5 h-3.5" />
          消去
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-9 px-4 rounded bg-[#0f8b8d] hover:bg-[#12a3a6] text-white text-xs font-black"
        >
          確定
        </button>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(value + k)}
            className="h-8 rounded bg-[#36363f] hover:bg-[#474752] text-white font-mono font-bold text-xs"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
};
