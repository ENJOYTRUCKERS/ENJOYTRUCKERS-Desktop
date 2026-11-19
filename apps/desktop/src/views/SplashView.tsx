import React from "react";
import { ShieldCheck } from "lucide-react";

interface SplashViewProps {
  appVersion: string;
  onStart: () => void;
}

export const SplashView: React.FC<SplashViewProps> = ({
  appVersion,
  onStart,
}) => {
  return (
    <div
      onClick={onStart}
      className="flex-1 bg-white flex flex-col items-center justify-center relative p-6 cursor-pointer select-none"
      title="クリックして乗務員認証画面へ"
    >
      <div className="absolute top-4 left-6 flex items-center gap-2 text-zinc-700 text-xs font-black tracking-wider">
        <ShieldCheck className="w-4 h-4 text-[#ff1155]" />
        TRANSTRON / ENJOYTRUCKERS DTS-G1D3
      </div>
      <img
        src="/logo.png"
        alt="ENJOYTRUCKERS"
        className="h-28 mb-10 object-contain pointer-events-none"
      />
      <div className="text-center text-black font-bold text-base leading-relaxed pointer-events-none space-y-1">
        <p>運転される方は安全のため走行中は操作しないでください。</p>
        <p>実際の交通規則および改善基準告示（430ルール）に従って走行してください。</p>
      </div>
      <div className="mt-6 px-4 py-1 rounded-full bg-zinc-100 border border-zinc-300 text-zinc-600 text-xs font-bold">
        画面をタッチまたはクリックして始業
      </div>
      <div className="absolute bottom-4 right-6 text-black text-xs font-mono font-bold pointer-events-none">
        Ver.{appVersion}
      </div>
    </div>
  );
};
