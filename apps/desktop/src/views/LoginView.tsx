import React, { useState } from "react";
import { NumericKeypad } from "../components/shell/NumericKeypad";

interface LoginViewProps {
  loginId: string;
  loginName: string;
  expectedEmployeeId: string;
  appVersion: string;
  icLicenseEnabled: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onConfirmLogin: () => void;
  onIcCardFastAuth: () => void;
  onOpenBrowserAuth: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  loginId,
  loginName,
  expectedEmployeeId,
  appVersion,
  icLicenseEnabled,
  onDigit,
  onBackspace,
  onClear,
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
    }, 450);
  };

  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between relative min-h-0">
      <div className="absolute top-1.5 right-3 text-[11px] text-zinc-400 font-sans pointer-events-none">
        Ver.{appVersion}
      </div>

      <div className="flex-1 flex flex-col justify-center px-7 space-y-4">
        <div className="flex items-center">
          <span className="w-32 text-[17px] font-bold text-white shrink-0">
            乗務員番号
          </span>
          <div className="flex-1 bg-white h-10 px-3 flex items-center">
            <span className="text-black text-2xl font-bold tracking-widest tabular-nums">
              {loginId}
            </span>
          </div>
        </div>

        <div className="flex items-center">
          <span className="w-32 text-[17px] font-bold text-white shrink-0">
            乗務員名
          </span>
          <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
            <span className="text-white text-xl font-bold truncate">
              {loginName}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {expectedEmployeeId && icLicenseEnabled && (
                <button
                  type="button"
                  onClick={handleIcTap}
                  className={`px-2.5 py-1 text-xs font-bold text-white rounded-[2px] transition-colors ${
                    icScanning
                      ? "bg-[#26939e]"
                      : "bg-[#43455c] hover:bg-[#525470]"
                  }`}
                >
                  {icScanning ? "読取中..." : "IC免許証タッチ"}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenBrowserAuth}
                className={`px-2.5 py-1 text-xs font-bold text-white rounded-[2px] ${
                  expectedEmployeeId
                    ? "bg-[#2b2d3e] hover:bg-[#3a3c52] text-zinc-300"
                    : "bg-[#26939e] hover:bg-[#2daab6]"
                }`}
              >
                {expectedEmployeeId ? "再連携" : "ブラウザ連携"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <NumericKeypad
        variant="login"
        onDigit={onDigit}
        onBackspace={onBackspace}
        onClear={onClear}
        onConfirm={onConfirmLogin}
      />
    </div>
  );
};
