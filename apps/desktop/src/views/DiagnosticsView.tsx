import React from "react";
import {
  CheckCircle2,
  CloudUpload,
  Database,
  RefreshCw,
  Stethoscope,
  Undo2,
  Wrench,
  XCircle,
} from "lucide-react";
import type {
  CitySyncSummary,
  DtsViewId,
  SystemDiagnosticsReport,
} from "../types/tachograph";

interface DiagnosticsViewProps {
  report: SystemDiagnosticsReport | null;
  isRunning: boolean;
  isRepairing: boolean;
  canSyncCities: boolean;
  isSyncingCities: boolean;
  citySyncResult: CitySyncSummary[] | null;
  onRunDiagnostics: () => void;
  onRepairPlugin: () => void;
  onFlushQueue: () => void;
  onSyncCities: () => void;
  onNavigate: (view: DtsViewId) => void;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  report,
  isRunning,
  isRepairing,
  canSyncCities,
  isSyncingCities,
  citySyncResult,
  onRunDiagnostics,
  onRepairPlugin,
  onFlushQueue,
  onSyncCities,
  onNavigate,
}) => {
  return (
    <div className="flex-1 bg-[#17171d] flex flex-col p-3.5 justify-between overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <span className="text-sm font-black text-sky-300 flex items-center gap-1.5">
          <Stethoscope className="w-4 h-4" />
          DTS-G1D3 システム自己診断 ＆ テレメトリプラグイン修復
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRunDiagnostics}
            disabled={isRunning}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : ""}`}
            />
            再診断
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

      <div className="flex-1 overflow-y-auto space-y-2.5 my-2 pr-1">
        {report ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-[#23232c] border border-zinc-700 rounded p-2.5 flex items-center justify-between">
                <span className="text-zinc-400">認証トークン</span>
                <span
                  className={`font-bold flex items-center gap-1 ${
                    report.tokenConfigured ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {report.tokenConfigured ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {report.tokenConfigured ? "設定済" : "未設定"}
                </span>
              </div>

              <div className="bg-[#23232c] border border-zinc-700 rounded p-2.5 flex items-center justify-between">
                <span className="text-zinc-400">ポータル通信</span>
                <span
                  className={`font-bold flex items-center gap-1 ${
                    report.portalReachable ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {report.portalReachable ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {report.portalReachable ? "正常" : "オフライン"}
                </span>
              </div>

              <div className="bg-[#23232c] border border-zinc-700 rounded p-2.5 flex items-center justify-between">
                <span className="text-zinc-400">未送信日報キュー</span>
                <span className="font-mono font-bold text-white">
                  {report.pendingQueueCount} 件
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              {report.games.map((g) => (
                <div
                  key={g.path}
                  className="bg-[#23232c] border border-zinc-700 rounded p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">{g.game}</span>
                    <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[360px]">
                      {g.path}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] pt-1">
                    <span
                      className={
                        g.dllExists ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      DLL: {g.dllExists ? "OK" : "未配置"}
                    </span>
                    <span
                      className={
                        g.iniExists ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      INI: {g.iniExists ? "OK" : "未生成"}
                    </span>
                    <span
                      className={
                        g.iniTokenOk ? "text-emerald-400" : "text-amber-400"
                      }
                    >
                      Token: {g.iniTokenOk ? "同期済" : "要修復"}
                    </span>
                    <span
                      className={
                        g.iniPortOk ? "text-emerald-400" : "text-amber-400"
                      }
                    >
                      Port 3001: {g.iniPortOk ? "OK" : "要修復"}
                    </span>
                  </div>
                </div>
              ))}
              {report.games.length === 0 && (
                <div className="bg-[#23232c] border border-zinc-700 rounded p-3 text-xs text-amber-300">
                  Steam ライブラリから ETS2 / ATS のインストールフォルダが検出されませんでした。一度ゲームを起動してから「ワンクリック修復」を実行してください。
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-36 flex items-center justify-center text-xs text-zinc-400">
            診断データを取得しています...
          </div>
        )}

        {citySyncResult && citySyncResult.length > 0 && (
          <div className="bg-purple-950/40 border border-purple-500/40 rounded p-2.5 text-xs text-purple-200">
            公式都市辞書抽出結果:{" "}
            {citySyncResult
              .map(
                (s) =>
                  `${s.game.toUpperCase()} (Build ${
                    s.buildId || "N/A"
                  }: 抽出 ${s.extractedCount}件 / 同期 ${s.syncedCount}件)`
              )
              .join(" ・ ")}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        <button
          type="button"
          onClick={onRepairPlugin}
          disabled={isRepairing}
          className="flex-1 h-11 rounded bg-[#0f8b8d] hover:bg-[#12a3a6] text-white text-xs font-black flex items-center justify-center gap-1.5"
        >
          <Wrench className="w-4 h-4" />
          {isRepairing
            ? "DLL・INI修復中..."
            : "テレメトリDLL・INIをワンクリック修復"}
        </button>

        <button
          type="button"
          onClick={onFlushQueue}
          className="px-4 h-11 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5"
        >
          <CloudUpload className="w-4 h-4" />
          未送信キュー再送
        </button>

        {canSyncCities && (
          <button
            type="button"
            onClick={onSyncCities}
            disabled={isSyncingCities}
            className="px-4 h-11 rounded bg-purple-700 hover:bg-purple-600 text-white text-xs font-black flex items-center gap-1.5"
          >
            <Database className="w-4 h-4" />
            {isSyncingCities ? "抽出中..." : "公式.scs都市強制同期"}
          </button>
        )}
      </div>
    </div>
  );
};
