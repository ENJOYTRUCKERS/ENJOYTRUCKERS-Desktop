import React, { useState } from "react";
import type { CitySyncSummary, DtsViewId } from "../types/tachograph";

interface PreDepartureViewProps {
  loginId: string;
  loginName: string;
  citySyncResult: CitySyncSummary[] | null;
  activeDispatchCount: number;
  onDepart: (twoManMode: boolean) => void;
  onBackToLogin: () => void;
  onNavigate: (view: DtsViewId) => void;
}

export const PreDepartureView: React.FC<PreDepartureViewProps> = ({
  loginId,
  loginName,
  citySyncResult,
  activeDispatchCount,
  onDepart,
  onBackToLogin,
  onNavigate,
}) => {
  const [inspectionDone, setInspectionDone] = useState(false);
  const [twoManMode, setTwoManMode] = useState(false);

  const btnStyle =
    "bg-[#494968] hover:bg-[#57577a] active:bg-[#3c3c56] text-white h-[56px] text-[15px] font-bold flex items-center justify-center relative select-none";

  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between min-h-0">
      <div className="flex-1 flex flex-col justify-center px-8 space-y-3.5">
        <div className="flex items-baseline">
          <span className="w-36 text-[17px] font-bold text-zinc-100 shrink-0">
            乗務員番号
          </span>
          <span className="text-white text-[19px] font-bold tabular-nums">
            {loginId || "---"}
          </span>
        </div>

        <div className="flex items-baseline">
          <span className="w-36 text-[17px] font-bold text-zinc-100 shrink-0">
            乗務員名
          </span>
          <span className="text-white text-[19px] font-bold truncate">
            {loginName}
          </span>
        </div>

        {(inspectionDone ||
          twoManMode ||
          (citySyncResult && citySyncResult.length > 0)) && (
          <div className="text-xs text-[#64c4ed] flex items-center gap-4 pt-1">
            {inspectionDone && <span>始業点検: 確認済</span>}
            {twoManMode && <span>乗務区分: ツーマン運行</span>}
            {citySyncResult && citySyncResult.length > 0 && (
              <span className="text-zinc-400">
                都市辞書:{" "}
                {citySyncResult
                  .map((s) => `${s.game.toUpperCase()}:${s.syncedCount}`)
                  .join(" / ")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 実機 5列×2行 始業操作パッド */}
      <div className="grid grid-cols-5 grid-rows-2 gap-[2px] bg-[#1a1c2a] p-[2px] select-none">
        <button
          type="button"
          onClick={() => setInspectionDone((v) => !v)}
          className={
            inspectionDone
              ? "bg-[#26939e] hover:bg-[#2daab6] text-white h-[56px] text-[15px] font-bold"
              : btnStyle
          }
        >
          始業
        </button>

        <button
          type="button"
          onClick={() => onNavigate("diagnostics")}
          className={btnStyle}
        >
          点検
        </button>

        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className={btnStyle}
        >
          設定確認
        </button>

        <button
          type="button"
          onClick={() => setTwoManMode((v) => !v)}
          className={
            twoManMode
              ? "bg-[#26939e] hover:bg-[#2daab6] text-white h-[56px] text-[15px] font-bold"
              : btnStyle
          }
        >
          ツーマン
        </button>

        <button
          type="button"
          onClick={() => onNavigate("academy_exam")}
          className="bg-[#5a2942] hover:bg-[#703352] active:bg-[#471f34] text-white h-[56px] text-[14px] font-bold flex items-center justify-center relative select-none"
        >
          技能試験
        </button>

        <button type="button" onClick={onBackToLogin} className={btnStyle}>
          戻る
        </button>

        <button
          type="button"
          onClick={() => onNavigate("dispatch")}
          className={btnStyle}
        >
          指示書
          {activeDispatchCount > 0 && (
            <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigate("nav")}
          className={btnStyle}
        >
          コース
        </button>

        <div className="bg-[#1b1c2a] h-[56px]" aria-hidden="true" />

        <button
          type="button"
          onClick={() => onDepart(twoManMode)}
          className="bg-gradient-to-b from-[#49b3e3] to-[#3293c4] hover:from-[#57bef0] hover:to-[#3ea1d2] active:from-[#2c88b5] active:to-[#24729b] text-white h-[56px] text-[18px] font-bold"
        >
          出庫
        </button>
      </div>
    </div>
  );
};
