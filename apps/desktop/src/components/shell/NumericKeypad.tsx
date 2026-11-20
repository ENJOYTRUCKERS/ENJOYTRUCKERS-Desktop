import React from "react";

interface NumericKeypadProps {
  variant?: "login" | "input";
  allowDecimal?: boolean;
  confirmLabel?: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onConfirm: () => void;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  variant = "input",
  allowDecimal = false,
  confirmLabel = "確定",
  onDigit,
  onBackspace,
  onClear,
  onConfirm,
}) => {
  const row1 = ["1", "2", "3", "4", "5"];
  const row2 = ["6", "7", "8", "9", "0"];
  const keyClass =
    "bg-[#43455c] hover:bg-[#525470] active:bg-[#35374a] text-white h-[54px] text-xl font-bold select-none";

  if (variant === "login") {
    return (
      <div className="grid grid-cols-7 grid-rows-2 gap-[2px] bg-[#181a26] p-[2px] select-none">
        {row1.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onDigit(n)}
            className={keyClass}
          >
            {n}
          </button>
        ))}
        <button type="button" onClick={onBackspace} className={keyClass}>
          ←
        </button>
        <button
          type="button"
          onClick={onClear ?? onBackspace}
          className="bg-[#43455c] hover:bg-[#525470] active:bg-[#35374a] text-white h-[54px] text-xs font-bold leading-tight px-1"
        >
          積算修正
        </button>

        {row2.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onDigit(n)}
            className={keyClass}
          >
            {n}
          </button>
        ))}
        <div className="bg-[#2b2d3e] h-[54px]" aria-hidden="true" />
        <button
          type="button"
          onClick={onConfirm}
          className="bg-[#26939e] hover:bg-[#2daab6] active:bg-[#1e7680] text-white h-[54px] text-base font-bold"
        >
          {confirmLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 grid-rows-2 gap-[2px] bg-[#181a26] p-[2px] select-none">
      {row1.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onDigit(n)}
          className={keyClass}
        >
          {n}
        </button>
      ))}
      {allowDecimal ? (
        <button
          type="button"
          onClick={() => onDigit(".")}
          className={keyClass}
        >
          .
        </button>
      ) : (
        <div className="bg-[#2b2d3e] h-[54px]" aria-hidden="true" />
      )}
      <button type="button" onClick={onBackspace} className={keyClass}>
        ←
      </button>

      {row2.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onDigit(n)}
          className={keyClass}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={onConfirm}
        className="col-span-2 bg-[#5b597c] hover:bg-[#6b698f] active:bg-[#4a4866] text-white h-[54px] text-base font-bold"
      >
        {confirmLabel}
      </button>
    </div>
  );
};
