import React, { useState } from "react";
import {
  Anchor,
  Bed,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  Home,
  Hourglass,
  Mail,
  Package,
  PackageOpen,
  Scale,
  Settings,
  ShieldAlert,
  Stethoscope,
  TrainFront,
} from "lucide-react";
import type { DtsViewId, WorkType } from "../types/tachograph";

interface WorkMenuViewProps {
  onSelectWorkType: (wt: WorkType, label: string) => void;
  onNavigate: (view: DtsViewId) => void;
  onSwitchToCompliancePattern: () => void;
  onTriggerSos: () => void;
}

export const WorkMenuView: React.FC<WorkMenuViewProps> = ({
  onSelectWorkType,
  onNavigate,
  onSwitchToCompliancePattern,
  onTriggerSos,
}) => {
  const [page, setPage] = useState<0 | 1>(0);

  const page1Items = [
    {
      icon: <Package className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "荷積",
      action: () => onSelectWorkType("loading", "荷積"),
    },
    {
      icon: <Hourglass className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "待機",
      action: () => onSelectWorkType("wait", "待機"),
    },
    {
      icon: <PackageOpen className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "荷卸",
      action: () => onSelectWorkType("unloading", "荷卸"),
    },
    {
      icon: <Coffee className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "休憩",
      action: () => onSelectWorkType("rest", "休憩"),
    },
    {
      icon: <ClipboardList className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "点検",
      action: () => onNavigate("diagnostics"),
    },
    {
      icon: <Fuel className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "給油",
      action: () => onSelectWorkType("refuel", "給油"),
    },
    {
      icon: <Droplets className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "洗車",
      action: () => onSelectWorkType("wait", "洗車・整備"),
    },
    {
      icon: <Bed className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "休息",
      action: () => onSelectWorkType("break", "休息"),
    },
    {
      icon: <Home className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "帰庫",
      action: () => onNavigate("return_garage"),
    },
  ];

  const page2Items = [
    {
      icon: <Anchor className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "フェリー",
      action: () => onSelectWorkType("ferry", "フェリー乗船"),
    },
    {
      icon: <TrainFront className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "鉄道移動",
      action: () => onSelectWorkType("train", "鉄道移動"),
    },
    {
      icon: <FileText className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "運行指示書",
      action: () => onNavigate("dispatch"),
    },
    {
      icon: <Mail className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "事務所連絡",
      action: () => onNavigate("contact"),
    },
    {
      icon: <Gauge className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "走行計器",
      action: () => onNavigate("driving"),
    },
    {
      icon: <Scale className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "430順守",
      action: () => onSwitchToCompliancePattern(),
    },
    {
      icon: <Stethoscope className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "自己診断",
      action: () => onNavigate("diagnostics"),
    },
    {
      icon: <Settings className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "各種設定",
      action: () => onNavigate("settings"),
    },
    {
      icon: <ShieldAlert className="w-8 h-8 mb-1.5" strokeWidth={1.6} />,
      label: "緊急SOS",
      action: () => onTriggerSos(),
    },
  ];

  const items = page === 0 ? page1Items : page2Items;

  return (
    <div className="flex-1 bg-[#18181e] flex flex-col items-center justify-center relative p-3">
      <div className="flex items-center justify-center gap-3 w-full px-2">
        <button
          type="button"
          aria-label="前のページ"
          onClick={() => setPage((p) => (p === 0 ? 1 : 0))}
          className="p-2 rounded bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>

        <div className="grid grid-cols-3 gap-2.5 w-full max-w-xl">
          {items.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.action}
              className="flex flex-col items-center justify-center bg-[#187f82] hover:bg-[#1b9397] active:bg-[#115b5d] text-white h-24 rounded shadow-md transition-colors border border-[#22a6aa]"
            >
              {btn.icon}
              <span className="text-base font-black tracking-wider">
                {btn.label}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="次のページ"
          onClick={() => setPage((p) => (p === 0 ? 1 : 0))}
          className="p-2 rounded bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {[0, 1].map((idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setPage(idx as 0 | 1)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              page === idx
                ? "bg-white scale-110"
                : "border border-white/70 opacity-60"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
