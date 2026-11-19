import React from "react";
import {
  Eye,
  Settings,
  Smartphone,
  Sliders,
  Undo2,
  Volume2,
  Zap,
} from "lucide-react";
import type {
  CompanionInfo,
  DesktopFeatureFlags,
  DtsViewId,
  OverlayState,
} from "../types/tachograph";

interface SettingsViewProps {
  smartAutoMode: boolean;
  voiceEnabled: boolean;
  drivingPattern: "A" | "B" | "C";
  overlayState: OverlayState;
  companionInfo: CompanionInfo | null;
  featureFlags: DesktopFeatureFlags;
  onToggleSmartAuto: (enabled: boolean) => void;
  onToggleVoice: (enabled: boolean) => void;
  onChangeDrivingPattern: (p: "A" | "B" | "C") => void;
  onUpdateOverlay: (
    enabled: boolean,
    clickThrough: boolean,
    alwaysOnTop: boolean,
    opacity: number
  ) => void;
  onToggleCompanion: (enabled: boolean) => void;
  onToggleFeatureFlag: (key: keyof DesktopFeatureFlags) => void;
  onNavigate: (view: DtsViewId) => void;
}

const FLAG_LABELS: { key: keyof DesktopFeatureFlags; label: string }[] = [
  { key: "feat_ic_license", label: "IC免許証ワンタップ認証" },
  { key: "feat_dispatch_orders", label: "運行指示書・工程バー" },
  { key: "feat_office_chat", label: "事務所双方向連絡" },
  { key: "feat_parking_image_push", label: "駐車場案内図表示" },
  { key: "feat_auto_dashcam", label: "衝撃連動・手動ドラレコ" },
  { key: "feat_ai_review", label: "帰庫後AI安全運転講評" },
  { key: "feat_lan_companion", label: "スマホLANコンパニオン" },
  { key: "feat_scs_input", label: "車載機ハザード/回転灯ボタン" },
  { key: "feat_hazard_heatmap", label: "急ブレーキ多発地点警告" },
  { key: "feat_emergency_sos", label: "緊急SOS発信ボタン" },
  { key: "feat_voice_guidance", label: "日本語音声案内・チャイム" },
  { key: "feat_overlay_mode", label: "シングルモニタ透過オーバーレイ" },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  smartAutoMode,
  voiceEnabled,
  drivingPattern,
  overlayState,
  companionInfo,
  featureFlags,
  onToggleSmartAuto,
  onToggleVoice,
  onChangeDrivingPattern,
  onUpdateOverlay,
  onToggleCompanion,
  onToggleFeatureFlag,
  onNavigate,
}) => {
  return (
    <div className="flex-1 bg-[#17171d] flex flex-col p-3.5 justify-between overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 shrink-0">
        <span className="text-sm font-black text-white flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-[#ff1155]" />
          DTS-G1D3 動作モード・透過オーバーレイ・Feature Flag 設定
        </span>
        <button
          type="button"
          onClick={() => onNavigate("driving")}
          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1"
        >
          <Undo2 className="w-3.5 h-3.5" />
          戻る
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 my-2 pr-1">
        {/* Core Mode Row */}
        <div className="grid grid-cols-12 gap-2.5">
          <div className="col-span-6 bg-[#23232c] border border-zinc-700 rounded p-2.5 space-y-2">
            <div className="text-xs font-bold text-teal-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              記録アシスト ＆ 音声案内
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>スマート自動アシストモード</span>
              <button
                type="button"
                onClick={() => onToggleSmartAuto(!smartAutoMode)}
                className={`px-2.5 py-1 rounded font-black text-[11px] ${
                  smartAutoMode
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {smartAutoMode ? "自動アシスト ON" : "リアル手動モード"}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                日本語音声・警告チャイム
              </span>
              <button
                type="button"
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`px-2.5 py-1 rounded font-black text-[11px] ${
                  voiceEnabled
                    ? "bg-sky-600 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {voiceEnabled ? "音声 ON" : "ミュート"}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>標準走行画面パターン</span>
              <div className="flex gap-1">
                {(["A", "B", "C"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChangeDrivingPattern(p)}
                    className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                      drivingPattern === p
                        ? "bg-[#187f82] text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Single-Monitor Overlay & LAN Companion */}
          <div className="col-span-6 bg-[#23232c] border border-zinc-700 rounded p-2.5 space-y-2">
            <div className="text-xs font-bold text-purple-300 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                透過オーバーレイ (Alt+D でクリックスルー)
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateOverlay(
                    !overlayState.enabled,
                    overlayState.clickThrough,
                    !overlayState.enabled,
                    overlayState.opacity
                  )
                }
                className={`px-2 py-0.5 rounded text-[11px] font-black ${
                  overlayState.enabled
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {overlayState.enabled ? "有効" : "無効"}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-zinc-400">不透明度</span>
              <input
                type="range"
                min={35}
                max={100}
                value={Math.round(overlayState.opacity * 100)}
                onChange={(e) =>
                  onUpdateOverlay(
                    overlayState.enabled,
                    overlayState.clickThrough,
                    overlayState.alwaysOnTop,
                    Number(e.target.value) / 100
                  )
                }
                className="flex-1 accent-purple-500"
              />
              <span className="font-mono text-[11px] w-10 text-right">
                {Math.round(overlayState.opacity * 100)}%
              </span>
            </div>

            {featureFlags.feat_lan_companion && (
              <div className="pt-1 border-t border-zinc-800 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-zinc-300">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  LANスマホ副端末:{" "}
                  <span className="font-mono text-[11px] text-sky-300">
                    {companionInfo?.running
                      ? companionInfo.url || `Port ${companionInfo.port}`
                      : "停止中"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onToggleCompanion(!(companionInfo?.running ?? false))
                  }
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    companionInfo?.running
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-700 text-zinc-300"
                  }`}
                >
                  {companionInfo?.running ? "稼働中" : "起動"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Phase 6 Feature Flags Grid */}
        <div className="bg-[#23232c] border border-zinc-700 rounded p-2.5">
          <div className="text-xs font-bold text-zinc-300 flex items-center gap-1 mb-2">
            <Sliders className="w-3.5 h-3.5 text-[#ff1155]" />
            Phase 6 スーパー機能 個別 ON/OFF (Feature Flags)
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FLAG_LABELS.map((item) => {
              const active = featureFlags[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleFeatureFlag(item.key)}
                  className={`px-2 py-1.5 rounded border text-left text-[11px] font-bold flex items-center justify-between transition-colors ${
                    active
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="font-mono text-[10px] ml-1">
                    {active ? "ON" : "OFF"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
