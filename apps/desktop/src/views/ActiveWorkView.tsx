import React, { useState } from "react";
import { AlarmClock, CheckCircle2, Play, Timer } from "lucide-react";
import { formatHms } from "../components/shell/BottomTelemetryBar";
import { NumericKeypad } from "../components/shell/NumericKeypad";
import type { TelemetryData, WorkState } from "../types/tachograph";

interface ActiveWorkViewProps {
  workState: WorkState;
  telemetry: TelemetryData;
  onResumeDriving: () => void;
  onOpenWorkMenu: () => void;
}

export const ActiveWorkView: React.FC<ActiveWorkViewProps> = ({
  workState,
  telemetry,
  onResumeDriving,
  onOpenWorkMenu,
}) => {
  const [alarmMinutes, setAlarmMinutes] = useState<number>(30);
  const [numericValue, setNumericValue] = useState<string>("");
  const [savedNumericNote, setSavedNumericNote] = useState<string | null>(null);

  const isRestOrBreak =
    workState.work_type === "rest" ||
    workState.work_type === "break" ||
    workState.work_type === "ferry" ||
    workState.work_type === "train";

  const splitQualified = workState.current_break_seconds >= 600;
  const totalEffectiveBreakMin = Math.floor(
    (workState.break_bank_seconds +
      (splitQualified ? workState.current_break_seconds : 0)) /
      60
  );

  return (
    <div className="flex-1 bg-[#16161c] flex flex-col p-3.5 justify-between">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7 bg-[#22222a] border border-zinc-700 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded bg-[#187f82] text-white text-xs font-black">
              {workState.work_status_label}
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              {telemetry.source_city || "現在地"}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
              <Timer className="w-4 h-4 text-sky-400" />
              現在の中断・作業経過
            </span>
            <span className="digitacho-font text-3xl font-black text-white">
              {formatHms(workState.current_break_seconds)}
            </span>
          </div>

          <div className="p-2 rounded bg-zinc-900/90 border border-zinc-800 text-xs flex items-center justify-between">
            <span className="text-zinc-300 font-bold">430分割休憩カウント</span>
            <span
              className={`font-mono font-bold ${
                splitQualified ? "text-emerald-400" : "text-amber-300"
              }`}
            >
              {splitQualified
                ? `有効加算中 (累計 ${totalEffectiveBreakMin}分 / 30分)`
                : `あと ${Math.max(
                    0,
                    Math.ceil((600 - workState.current_break_seconds) / 60)
                  )}分で分割休憩有効`}
            </span>
          </div>
        </div>

        <div className="col-span-5 bg-[#22222a] border border-zinc-700 rounded p-3 flex flex-col justify-between">
          {isRestOrBreak ? (
            <>
              <div className="text-xs font-bold text-zinc-300 flex items-center gap-1">
                <AlarmClock className="w-3.5 h-3.5 text-amber-400" />
                休憩目覚まし目安設定
              </div>
              <div className="grid grid-cols-3 gap-1.5 my-1">
                {[10, 15, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAlarmMinutes(m)}
                    className={`py-1.5 rounded text-xs font-bold ${
                      alarmMinutes === m
                        ? "bg-amber-500 text-black font-black"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {m}分
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-zinc-400">
                設定目安: {alarmMinutes}分 (
                {workState.current_break_seconds >= alarmMinutes * 60
                  ? "目安時間達成"
                  : "カウント中"}
                )
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-zinc-300">
                {workState.work_type === "refuel"
                  ? "給油量 (L) 記録"
                  : "荷役・数量メモ入力"}
              </div>
              <div className="bg-white text-black h-9 rounded px-3 flex items-center justify-between font-mono font-black text-lg">
                <span>{numericValue || "0"}</span>
                <span className="text-xs text-zinc-500">
                  {workState.work_type === "refuel" ? "L" : "kg/個"}
                </span>
              </div>
              {savedNumericNote && (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  記録済: {savedNumericNote}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={onOpenWorkMenu}
              className="py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold"
            >
              別作業へ切替
            </button>
            <button
              type="button"
              onClick={onResumeDriving}
              className="py-2 rounded bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-black flex items-center justify-center gap-1"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              走行へ戻る
            </button>
          </div>
        </div>
      </div>

      <NumericKeypad
        allowDecimal
        confirmLabel="数量登録"
        onDigit={(d) => {
          if (d === "." && numericValue.includes(".")) return;
          if (numericValue.length < 7) setNumericValue((v) => v + d);
        }}
        onBackspace={() => setNumericValue((v) => v.slice(0, -1))}
        onConfirm={() => {
          if (numericValue) {
            setSavedNumericNote(
              `${numericValue} ${workState.work_type === "refuel" ? "L" : "単位"}`
            );
          }
        }}
      />
    </div>
  );
};
