import React, { useState } from "react";
import {
  Activity,
  Anchor,
  Bed,
  ClipboardCheck,
  CloudUpload,
  Coffee,
  Database,
  Droplets,
  Eye,
  FileText,
  Fuel,
  Gauge,
  Home,
  Hourglass,
  Mail,
  Map as MapIcon,
  Package,
  PackageOpen,
  Power,
  RefreshCw,
  Scale,
  Settings,
  ShieldAlert,
  Siren,
  Sparkles,
  Stethoscope,
  TrainFront,
  Undo2,
  UserCheck,
  Volume2,
} from "lucide-react";
import type { DtsViewId, WorkType } from "../types/tachograph";

interface WorkMenuTile {
  key: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
}

interface WorkMenuViewProps {
  canSyncCities: boolean;
  onSelectWorkType: (wt: WorkType, displayLabel: string) => void;
  onNavigate: (view: DtsViewId) => void;
  onOpenDrivingPattern: (pattern: "A" | "B" | "C") => void;
  onToggleOverlay: () => void;
  onToggleVoice: () => void;
  onSyncDlc: () => void;
  onSyncCities: () => void;
  onFlushQueue: () => void;
  onScsInputCommand: (cmd: string) => void;
  onTriggerSos: () => void;
}

export const WorkMenuView: React.FC<WorkMenuViewProps> = ({
  canSyncCities,
  onSelectWorkType,
  onNavigate,
  onOpenDrivingPattern,
  onToggleOverlay,
  onToggleVoice,
  onSyncDlc,
  onSyncCities,
  onFlushQueue,
  onScsInputCommand,
  onTriggerSos,
}) => {
  // Real DTS-G1D lands on Page 2 (index 1, dots: ○ ● ○ ○)
  const [page, setPage] = useState<number>(1);

  const page1Tiles: WorkMenuTile[] = [
    {
      key: "drive_a",
      label: "走行画面",
      icon: <Gauge className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onOpenDrivingPattern("A"),
    },
    {
      key: "drive_c",
      label: "運転状況",
      icon: <Activity className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onOpenDrivingPattern("C"),
    },
    {
      key: "dispatch",
      label: "指示書",
      icon: <FileText className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("dispatch"),
    },
    {
      key: "contact",
      label: "事務所連絡",
      icon: <Mail className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("contact"),
    },
    {
      key: "ferry",
      label: "フェリー",
      icon: <Anchor className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("ferry", "フェリー"),
    },
    {
      key: "train",
      label: "鉄道移動",
      icon: <TrainFront className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("train", "鉄道移動"),
    },
    {
      key: "settings",
      label: "設定確認",
      icon: <Settings className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("settings"),
    },
    {
      key: "overlay",
      label: "透過切替",
      icon: <Eye className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onToggleOverlay(),
    },
    {
      key: "sos",
      label: "緊急SOS",
      icon: <ShieldAlert className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onTriggerSos(),
      danger: true,
    },
  ];

  // Authentic real DTS-G1D primary 3x3 work menu
  const page2Tiles: WorkMenuTile[] = [
    {
      key: "loading",
      label: "荷積",
      icon: <Package className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("loading", "荷積中"),
    },
    {
      key: "wait",
      label: "待機",
      icon: <Hourglass className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("wait", "待機中"),
    },
    {
      key: "unloading",
      label: "荷卸",
      icon: <PackageOpen className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("unloading", "荷卸中"),
    },
    {
      key: "rest",
      label: "休憩",
      icon: <Coffee className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("rest", "休憩中"),
    },
    {
      key: "inspect",
      label: "点検",
      icon: <ClipboardCheck className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("diagnostics"),
    },
    {
      key: "refuel",
      label: "給油",
      icon: <Fuel className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("refuel", "給油中"),
    },
    {
      key: "wash",
      label: "洗車",
      icon: <Droplets className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("wait", "洗車中"),
    },
    {
      key: "break",
      label: "休息",
      icon: <Bed className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSelectWorkType("break", "休息中"),
    },
    {
      key: "return",
      label: "帰庫",
      icon: <Home className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("return_garage"),
    },
  ];

  const page3Tiles: WorkMenuTile[] = [
    {
      key: "dlc",
      label: "DLC同期",
      icon: <RefreshCw className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onSyncDlc(),
    },
    canSyncCities
      ? {
          key: "cities",
          label: "都市辞書",
          icon: <Database className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
          action: () => onSyncCities(),
        }
      : {
          key: "flush",
          label: "未送信再送",
          icon: <CloudUpload className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
          action: () => onFlushQueue(),
        },
    {
      key: "voice",
      label: "音声切替",
      icon: <Volume2 className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onToggleVoice(),
    },
    {
      key: "hazard",
      label: "ハザード",
      icon: <Siren className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onScsInputCommand("hazard_warning"),
    },
    {
      key: "beacon",
      label: "回転灯",
      icon: <Power className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onScsInputCommand("beacon"),
    },
    {
      key: "diag",
      label: "システム診断",
      icon: <Stethoscope className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("diagnostics"),
    },
    {
      key: "pre",
      label: "始業画面",
      icon: <Undo2 className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("pre_departure"),
    },
    {
      key: "driver",
      label: "乗務員切替",
      icon: <UserCheck className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("login"),
    },
    {
      key: "map",
      label: "地図ナビ",
      icon: <MapIcon className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("nav"),
    },
  ];

  const page4Tiles: (WorkMenuTile | null)[] = [
    {
      key: "drive_b",
      label: "シンプル走行",
      icon: <Gauge className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onOpenDrivingPattern("B"),
    },
    {
      key: "law_430",
      label: "430詳細",
      icon: <Scale className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onOpenDrivingPattern("C"),
    },
    {
      key: "ai_review",
      label: "AI講評",
      icon: <Sparkles className="w-8 h-8 mb-1.5" strokeWidth={1.8} />,
      action: () => onNavigate("return_garage"),
    },
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  const pages: (WorkMenuTile | null)[][] = [
    page1Tiles,
    page2Tiles,
    page3Tiles,
    page4Tiles,
  ];
  const currentTiles = pages[page] || page2Tiles;

  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col items-center justify-center relative px-3 py-2 min-h-0">
      <div className="flex items-center justify-center gap-3 w-full">
        <button
          type="button"
          aria-label="前のページ"
          onClick={() => setPage((p) => (p + 3) % 4)}
          className="text-zinc-200 hover:text-white active:scale-95 p-1 transition-all shrink-0"
        >
          <svg width="22" height="32" viewBox="0 0 22 32" fill="currentColor">
            <polygon points="18,2 2,16 18,30" />
          </svg>
        </button>

        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[540px]">
          {currentTiles.map((btn, idx) =>
            btn ? (
              <button
                key={btn.key}
                type="button"
                onClick={btn.action}
                className={`flex flex-col items-center justify-center h-[88px] rounded-[3px] shadow transition-colors text-white ${
                  btn.danger
                    ? "bg-gradient-to-b from-[#b93848] to-[#8e2230] hover:from-[#cc4253] hover:to-[#a12a3a]"
                    : "bg-gradient-to-b from-[#2f9cc8] to-[#217fa6] hover:from-[#38aad6] hover:to-[#288db7] active:from-[#1f759a] active:to-[#185d7c]"
                }`}
              >
                {btn.icon}
                <span className="text-[15px] font-bold tracking-wider">
                  {btn.label}
                </span>
              </button>
            ) : (
              <div
                key={`empty-${idx}`}
                className="h-[88px] rounded-[3px] bg-[#161928] border border-[#22263b]"
                aria-hidden="true"
              />
            )
          )}
        </div>

        <button
          type="button"
          aria-label="次のページ"
          onClick={() => setPage((p) => (p + 1) % 4)}
          className="text-zinc-200 hover:text-white active:scale-95 p-1 transition-all shrink-0"
        >
          <svg width="22" height="32" viewBox="0 0 22 32" fill="currentColor">
            <polygon points="4,2 20,16 4,30" />
          </svg>
        </button>
      </div>

      {/* 4 Pagination Dots */}
      <div className="mt-3 flex items-center justify-center gap-2.5">
        {[0, 1, 2, 3].map((idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`ページ ${idx + 1}`}
            onClick={() => setPage(idx)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              page === idx
                ? "bg-white"
                : "border border-zinc-400 bg-transparent hover:border-white"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
