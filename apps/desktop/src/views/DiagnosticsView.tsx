import React from "react";
import { RefreshCw, Stethoscope } from "lucide-react";
import type {
  CitySyncSummary,
  SystemDiagnosticsReport,
} from "../types/tachograph";

interface DiagnosticsViewProps {
  report: SystemDiagnosticsReport | null;
  isRunning: boolean;
  isRepairing: boolean;
  canSyncCities: boolean;
  isSyncingDlc: boolean;
  isSyncingCities: boolean;
  citySyncResult: CitySyncSummary[] | null;
  onRunDiagnostics: () => void;
  onRepairPlugin: () => void;
  onFlushQueue: () => void;
  onSyncDlc: () => void;
  onSyncCities: () => void;
  onBack: () => void;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  report,
  isRunning,
  isRepairing,
  canSyncCities,
  isSyncingDlc,
  isSyncingCities,
  citySyncResult,
  onRunDiagnostics,
  onRepairPlugin,
  onFlushQueue,
  onSyncDlc,
  onSyncCities,
  onBack,
}) => {
  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between overflow-hidden min-h-0">
      <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center justify-between text-white shrink-0">
        <span className="flex items-center gap-2 font-bold text-lg">
          <Stethoscope className="w-5 h-5" />
          点検・システム診断
        </span>
        <button
          type="button"
          onClick={onRunDiagnostics}
          disabled={isRunning}
          className="px-2.5 py-1 bg-[#1e6a92] hover:bg-[#247ba8] text-white text-xs font-bold flex items-center gap-1 rounded-[2px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : ""}`} />
          再診断
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 p-3">
        {report ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-[#151828] border border-[#2a2e45] p-2.5 flex items-center justify-between">
                <span className="text-zinc-300">認証トークン</span>
                <span
                  className={`font-bold ${
                    report.tokenConfigured ? "text-[#4ee05c]" : "text-red-400"
                  }`}
                >
                  {report.tokenConfigured ? "OK" : "未設定"}
                </span>
              </div>
              <div className="bg-[#151828] border border-[#2a2e45] p-2.5 flex items-center justify-between">
                <span className="text-zinc-300">ポータル通信</span>
                <span
                  className={`font-bold ${
                    report.portalReachable ? "text-[#4ee05c]" : "text-red-400"
                  }`}
                >
                  {report.portalReachable ? "正常" : "切断"}
                </span>
              </div>
              <div className="bg-[#151828] border border-[#2a2e45] p-2.5 flex items-center justify-between">
                <span className="text-zinc-300">未送信キュー</span>
                <span className="font-bold text-white tabular-nums">
                  {report.pendingQueueCount} 件
                </span>
              </div>
            </div>

            {report.games.map((g) => (
              <div
                key={g.path}
                className="bg-[#151828] border border-[#2a2e45] p-2.5 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{g.game}</span>
                  <span className="text-[11px] text-zinc-400 truncate max-w-[360px]">
                    {g.path}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[11px] pt-0.5">
                  <span className={g.dllExists ? "text-[#4ee05c]" : "text-red-400"}>
                    DLL: {g.dllExists ? "OK" : "未配置"}
                  </span>
                  <span className={g.iniExists ? "text-[#4ee05c]" : "text-red-400"}>
                    INI: {g.iniExists ? "OK" : "未生成"}
                  </span>
                  <span
                    className={g.iniTokenOk ? "text-[#4ee05c]" : "text-amber-300"}
                  >
                    Token: {g.iniTokenOk ? "同期済" : "要修復"}
                  </span>
                  <span
                    className={g.iniPortOk ? "text-[#4ee05c]" : "text-amber-300"}
                  >
                    Port: {g.iniPortOk ? "OK" : "要修復"}
                  </span>
                </div>
              </div>
            ))}

            {report.games.length === 0 && (
              <div className="bg-[#151828] border border-[#2a2e45] p-3 text-xs text-amber-300">
                ETS2 / ATS インストール先が未検出です。ゲーム起動後に「DLL/INI修復」を実行してください。
              </div>
            )}
          </>
        ) : (
          <div className="h-36 flex items-center justify-center text-xs text-zinc-400">
            診断データを取得しています...
          </div>
        )}

        {citySyncResult && citySyncResult.length > 0 && (
          <div className="bg-[#151828] border border-[#3ca4d4] p-2.5 text-xs text-[#64c4ed]">
            都市辞書同期結果:{" "}
            {citySyncResult
              .map(
                (s) =>
                  `${s.game.toUpperCase()} (${s.buildId || "N/A"}: 抽出${s.extractedCount} / 同期${s.syncedCount})`
              )
              .join(" ・ ")}
          </div>
        )}
      </div>

      <div className="bg-[#222436] px-3 py-2 border-t border-[#32344a] flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-10 px-4 bg-[#525074] hover:bg-[#62608a] text-white text-xs font-bold rounded-[2px]"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onSyncDlc}
          disabled={isSyncingDlc}
          className="h-10 px-3 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold rounded-[2px]"
        >
          {isSyncingDlc ? "DLC同期中..." : "DLC同期"}
        </button>
        <button
          type="button"
          onClick={onFlushQueue}
          className="h-10 px-3 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold rounded-[2px]"
        >
          未送信再送
        </button>
        {canSyncCities && (
          <button
            type="button"
            onClick={onSyncCities}
            disabled={isSyncingCities}
            className="h-10 px-3 bg-[#4e4c73] hover:bg-[#5c5a86] text-white text-xs font-bold rounded-[2px]"
          >
            {isSyncingCities ? "抽出中..." : "都市辞書"}
          </button>
        )}
        <button
          type="button"
          onClick={onRepairPlugin}
          disabled={isRepairing}
          className="ml-auto h-10 px-4 bg-gradient-to-b from-[#55b9ea] to-[#3999cb] hover:from-[#65c4f2] hover:to-[#45a5d6] text-white text-xs font-bold rounded-[2px]"
        >
          {isRepairing ? "修復中..." : "DLL/INI修復"}
        </button>
      </div>
    </div>
  );
};
