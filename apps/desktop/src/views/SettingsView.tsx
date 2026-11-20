import React from "react";
import { Settings } from "lucide-react";
import type {
  CompanionInfo,
  DesktopFeatureFlags,
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
  onBack: () => void;
}

const FLAG_LABELS: { key: keyof DesktopFeatureFlags; label: string }[] = [
  { key: "feat_ic_license", label: "IC免許証認証" },
  { key: "feat_dispatch_orders", label: "運行指示書連携" },
  { key: "feat_office_chat", label: "事務所連絡" },
  { key: "feat_parking_image_push", label: "駐車場案内図" },
  { key: "feat_auto_dashcam", label: "自動/手動ドラレコ" },
  { key: "feat_ai_review", label: "帰庫後AI講評" },
  { key: "feat_lan_companion", label: "スマホLAN副端末" },
  { key: "feat_scs_input", label: "ハザード/回転灯連携" },
  { key: "feat_hazard_heatmap", label: "急減速地点警告" },
  { key: "feat_emergency_sos", label: "緊急SOS発信" },
  { key: "feat_voice_guidance", label: "日本語音声案内" },
  { key: "feat_overlay_mode", label: "透過オーバーレイ" },
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
  onBack,
}) => {
  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between overflow-hidden min-h-0">
      <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center text-white font-bold text-lg shrink-0">
        <Settings className="w-5 h-5 mr-2" />
        設定確認
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[#151828] border border-[#2a2e45] p-2.5 space-y-2">
            <div className="font-bold text-[#64c4ed] border-b border-[#2a2e45] pb-1">
              基本動作・走行表示
            </div>
            <div className="flex items-center justify-between">
              <span>スマート自動切替</span>
              <button
                type="button"
                onClick={() => onToggleSmartAuto(!smartAutoMode)}
                className={`px-2.5 py-0.5 font-bold rounded-[2px] ${
                  smartAutoMode
                    ? "bg-[#3ca4d4] text-white"
                    : "bg-[#2d2f45] text-zinc-300"
                }`}
              >
                {smartAutoMode ? "自動 ON" : "手動"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>音声案内・チャイム</span>
              <button
                type="button"
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`px-2.5 py-0.5 font-bold rounded-[2px] ${
                  voiceEnabled
                    ? "bg-[#3ca4d4] text-white"
                    : "bg-[#2d2f45] text-zinc-300"
                }`}
              >
                {voiceEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>標準走行画面</span>
              <div className="flex gap-1">
                {(["A", "B", "C"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChangeDrivingPattern(p)}
                    className={`px-2 py-0.5 font-bold rounded-[2px] ${
                      drivingPattern === p
                        ? "bg-[#3ca4d4] text-white"
                        : "bg-[#2d2f45] text-zinc-300"
                    }`}
                  >
                    {p === "A" ? "A:計器" : p === "B" ? "B:簡易" : "C:3軸G"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#151828] border border-[#2a2e45] p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-[#2a2e45] pb-1">
              <span className="font-bold text-[#64c4ed]">
                透過オーバーレイ (Alt+D)
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
                className={`px-2.5 py-0.5 font-bold rounded-[2px] ${
                  overlayState.enabled
                    ? "bg-[#3ca4d4] text-white"
                    : "bg-[#2d2f45] text-zinc-300"
                }`}
              >
                {overlayState.enabled ? "有効" : "無効"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-300">不透明度</span>
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
                className="flex-1 accent-[#3ca4d4]"
              />
              <span className="tabular-nums w-9 text-right">
                {Math.round(overlayState.opacity * 100)}%
              </span>
            </div>
            {featureFlags.feat_lan_companion && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="truncate text-zinc-300">
                  副端末:{" "}
                  <span className="text-[#64c4ed] font-bold">
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
                  className={`px-2 py-0.5 font-bold rounded-[2px] ${
                    companionInfo?.running
                      ? "bg-[#3ca4d4] text-white"
                      : "bg-[#2d2f45] text-zinc-300"
                  }`}
                >
                  {companionInfo?.running ? "稼働中" : "起動"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#151828] border border-[#2a2e45] p-2.5">
          <div className="font-bold text-[#64c4ed] mb-2">
            機能有効設定 (Feature Flags)
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FLAG_LABELS.map((item) => {
              const active = featureFlags[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleFeatureFlag(item.key)}
                  className={`px-2 py-1.5 border text-left text-[11px] font-bold flex items-center justify-between ${
                    active
                      ? "bg-[#193044] border-[#3ca4d4] text-white"
                      : "bg-[#0e101c] border-[#25283d] text-zinc-500"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="ml-1">{active ? "ON" : "OFF"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-[#222436] px-3 py-2 border-t border-[#32344a] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-10 px-6 bg-[#525074] hover:bg-[#62608a] text-white text-sm font-bold rounded-[2px]"
        >
          戻る
        </button>
      </div>
    </div>
  );
};
