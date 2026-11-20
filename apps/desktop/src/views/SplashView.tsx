import React from "react";

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
      title="クリックしてログイン画面へ"
    >
      <img
        src="/logo.png"
        alt="ENJOYTRUCKERS"
        className="h-32 mb-14 object-contain pointer-events-none"
      />
      <div className="text-center text-[#111111] font-bold text-base leading-relaxed pointer-events-none space-y-1">
        <p>運転される方は安全のため走行中は操作しないでください。</p>
        <p>実際の交通規則に従って走行してください。</p>
      </div>
      <div className="absolute bottom-4 right-6 text-[#111111] text-sm font-bold pointer-events-none">
        Ver.{appVersion}
      </div>
    </div>
  );
};
