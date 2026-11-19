import React, { useState } from "react";
import { CreditCard, ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import { NumericKeypad } from "../components/shell/NumericKeypad";

interface LoginViewProps {
  loginId: string;
  loginName: string;
  expectedEmployeeId: string;
  driverRank?: string;
  avatarUrl?: string | null;
  icLicenseEnabled: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onConfirmLogin: () => void;
  onIcCardFastAuth: () => void;
  onOpenBrowserAuth: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  loginId,
  loginName,
  expectedEmployeeId,
  driverRank = "DRIVER",
  avatarUrl,
  icLicenseEnabled,
  onDigit,
  onBackspace,
  onConfirmLogin,
  onIcCardFastAuth,
  onOpenBrowserAuth,
}) => {
  const [icScanning, setIcScanning] = useState(false);

  const handleIcTap = () => {
    if (!expectedEmployeeId) {
      onOpenBrowserAuth();
      return;
    }
    setIcScanning(true);
    setTimeout(() => {
      setIcScanning(false);
      onIcCardFastAuth();
    }, 650);
  };

  return (
    <div className="flex-1 bg-[#1c1c21] flex flex-col p-4 justify-between">
      <div className="grid grid-cols-12 gap-3 items-stretch">
        <div className="col-span-7 bg-[#25252c] border border-zinc-700 rounded p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-zinc-700 pb-2">
            <span className="text-zinc-300 text-xs font-bold">乗務員番号</span>
            <div className="w-44 bg-white h-9 rounded-sm flex items-center px-3">
              <span className="text-black text-xl font-mono font-black tracking-widest">
                {loginId}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-300 text-xs font-bold">乗務員名</span>
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={loginName}
                  className="w-6 h-6 rounded-full object-cover border border-zinc-600"
                />
              ) : (
                <UserCheck className="w-4 h-4 text-emerald-400" />
              )}
              <span className="text-white text-sm font-bold truncate max-w-[140px]">
                {loginName}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-zinc-400">
              {expectedEmployeeId
                ? `登録社員番号: ${expectedEmployeeId}`
                : "ポータル連携が必要です"}
            </span>
            <button
              type="button"
              onClick={onOpenBrowserAuth}
              className="text-[11px] bg-[#0f8b8d] hover:bg-[#12a2a5] text-white px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {expectedEmployeeId ? "再連携" : "ブラウザでログイン"}
            </button>
          </div>
        </div>

        {/* Virtual IC Driver's License Reader (Phase 6 feat_ic_license) */}
        <div className="col-span-5 flex flex-col">
          {icLicenseEnabled ? (
            <button
              type="button"
              onClick={handleIcTap}
              className={`flex-1 rounded border p-3 text-left transition-all relative overflow-hidden ${
                icScanning
                  ? "bg-emerald-900/50 border-emerald-400 ring-2 ring-emerald-400"
                  : "bg-gradient-to-br from-[#1f2937] via-[#18202c] to-[#111827] border-sky-500/40 hover:border-sky-400"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-black">
                  ENJOYTRUCKERS IC免許証
                </span>
                <CreditCard className="w-4 h-4 text-sky-300" />
              </div>
              <div className="text-xs font-bold text-white truncate">
                {loginName !== "乗務員不明" ? loginName : "未認証ドライバー"}
              </div>
              <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                ID: {expectedEmployeeId || "--------"} / {driverRank}
              </div>
              <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-bold text-sky-300">
                <span>
                  {icScanning
                    ? "IC免許証 読取中..."
                    : "タッチでワンタップ乗務認証"}
                </span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </button>
          ) : (
            <div className="flex-1 rounded border border-zinc-800 bg-[#222228] p-3 flex flex-col justify-center text-center text-xs text-zinc-400">
              テンキーで乗務員番号を入力し「確定」を押してください
            </div>
          )}
        </div>
      </div>

      <NumericKeypad
        onDigit={onDigit}
        onBackspace={onBackspace}
        onConfirm={onConfirmLogin}
      />
    </div>
  );
};
