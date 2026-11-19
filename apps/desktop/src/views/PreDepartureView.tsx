import React, { useState } from "react";
import {
  CheckSquare,
  ClipboardCheck,
  Database,
  FileText,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Stethoscope,
  Undo2,
  Users,
} from "lucide-react";
import type { CitySyncSummary, DtsViewId } from "../types/tachograph";

interface PreDepartureViewProps {
  loginId: string;
  loginName: string;
  canSyncCities: boolean;
  isSyncingDlc: boolean;
  isSyncingCities: boolean;
  citySyncResult: CitySyncSummary[] | null;
  activeDispatchCount: number;
  onSyncDlc: () => void;
  onSyncCities: () => void;
  onDepart: () => void;
  onBackToLogin: () => void;
  onNavigate: (view: DtsViewId) => void;
}

export const PreDepartureView: React.FC<PreDepartureViewProps> = ({
  loginId,
  loginName,
  canSyncCities,
  isSyncingDlc,
  isSyncingCities,
  citySyncResult,
  activeDispatchCount,
  onSyncDlc,
  onSyncCities,
  onDepart,
  onBackToLogin,
  onNavigate,
}) => {
  const [checkedBrake, setCheckedBrake] = useState(true);
  const [checkedLights, setCheckedLights] = useState(true);
  const [checkedTires, setCheckedTires] = useState(true);
  const [checkedCondition, setCheckedCondition] = useState(true);
  const [twoManMode, setTwoManMode] = useState(false);

  const allInspected =
    checkedBrake && checkedLights && checkedTires && checkedCondition;

  return (
    <div className="flex-1 bg-[#1b1b21] flex flex-col p-3.5 justify-between">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 bg-[#24242c] border border-zinc-700 rounded p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-700 pb-1.5">
            <span className="text-xs font-bold text-zinc-400">乗務員情報</span>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              認証済 #{loginId}
            </span>
          </div>
          <div className="text-base font-black text-white truncate">
            {loginName}
          </div>
          <div className="text-[11px] text-zinc-400 flex items-center justify-between">
            <span>乗務形態: {twoManMode ? "ツーマン運行" : "ワンマン運行"}</span>
            {citySyncResult && citySyncResult.length > 0 && (
              <span className="text-sky-300 font-mono">
                都市辞書:{" "}
                {citySyncResult
                  .map((s) => `${s.game.toUpperCase()}:${s.syncedCount}`)
                  .join(" / ")}
              </span>
            )}
          </div>
        </div>

        {/* 日常点検・始業点呼チェック */}
        <div className="col-span-6 bg-[#24242c] border border-zinc-700 rounded p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-teal-300">
            <span className="flex items-center gap-1">
              <ClipboardCheck className="w-3.5 h-3.5" />
              始業前・日常点検チェック
            </span>
            <span className="text-[10px] text-zinc-400">
              {allInspected ? "全項目OK" : "未完了あり"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {[
              {
                label: "制動装置・エア圧",
                val: checkedBrake,
                set: setCheckedBrake,
              },
              {
                label: "灯火類・ウインカー",
                val: checkedLights,
                set: setCheckedLights,
              },
              {
                label: "タイヤ・連結装置",
                val: checkedTires,
                set: setCheckedTires,
              },
              {
                label: "体調・アルコール点呼",
                val: checkedCondition,
                set: setCheckedCondition,
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => item.set(!item.val)}
                className={`px-2 py-1 rounded border text-left flex items-center gap-1.5 font-bold ${
                  item.val
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DTS-G1D3 2行×5列 始業メニューパッド */}
      <div className="grid grid-cols-5 grid-rows-2 gap-1.5 bg-[#26262e] p-2 border border-zinc-700 rounded">
        <button
          type="button"
          onClick={() => {
            setCheckedBrake(true);
            setCheckedLights(true);
            setCheckedTires(true);
            setCheckedCondition(true);
          }}
          className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          始業点検一括OK
        </button>

        <button
          type="button"
          onClick={() => onNavigate("diagnostics")}
          className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
        >
          <Stethoscope className="w-4 h-4 text-sky-400" />
          システム診断
        </button>

        <button
          type="button"
          onClick={onSyncDlc}
          disabled={isSyncingDlc}
          className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
        >
          <RefreshCw
            className={`w-4 h-4 text-teal-300 ${
              isSyncingDlc ? "animate-spin" : ""
            }`}
          />
          {isSyncingDlc ? "DLC同期中..." : "DLC同期"}
        </button>

        <button
          type="button"
          onClick={() => setTwoManMode((v) => !v)}
          className={`h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1 ${
            twoManMode
              ? "bg-amber-600 text-white"
              : "bg-[#383842] hover:bg-[#464652] text-white"
          }`}
        >
          <Users className="w-4 h-4" />
          {twoManMode ? "ツーマン:ON" : "ツーマン"}
        </button>

        {canSyncCities ? (
          <button
            type="button"
            onClick={onSyncCities}
            disabled={isSyncingCities}
            className="bg-purple-800/80 hover:bg-purple-700 text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
            title="公式バニラ＋公式DLCの.scsから都市辞書を抽出・同期"
          >
            <Database
              className={`w-4 h-4 ${isSyncingCities ? "animate-spin" : ""}`}
            />
            {isSyncingCities ? "都市抽出中..." : "都市辞書抽出"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
          >
            <Settings className="w-4 h-4 text-zinc-300" />
            各種設定
          </button>
        )}

        <button
          type="button"
          onClick={onBackToLogin}
          className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
        >
          <Undo2 className="w-4 h-4" />
          戻る
        </button>

        <button
          type="button"
          onClick={() => onNavigate("dispatch")}
          className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1 relative"
        >
          <FileText className="w-4 h-4 text-amber-300" />
          運行指示書
          {activeDispatchCount > 0 && (
            <span className="absolute top-1 right-1.5 px-1.5 rounded-full bg-amber-400 text-black text-[10px] font-black">
              {activeDispatchCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className="bg-[#383842] hover:bg-[#464652] text-white h-14 text-xs font-bold border-b-2 border-r border-[#1e1e24] rounded-sm flex flex-col items-center justify-center gap-1"
        >
          <Settings className="w-4 h-4 text-zinc-300" />
          オーバーレイ/音声
        </button>

        <button
          type="button"
          onClick={onDepart}
          className="col-span-2 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white h-14 text-xl font-black border-b-2 border-r border-blue-950 rounded-sm flex items-center justify-center gap-2 shadow-lg"
        >
          <Play className="w-5 h-5 fill-current" />
          出庫（運行開始）
        </button>
      </div>
    </div>
  );
};
