import React from "react";
import type { OverlayState } from "../../types/tachograph";

interface DtsShellProps {
  overlayState: OverlayState;
  isSos: boolean;
  topBar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  bottomBar?: React.ReactNode;
  children: React.ReactNode;
}

export const DtsShell: React.FC<DtsShellProps> = ({
  overlayState,
  isSos,
  topBar,
  rightSidebar,
  bottomBar,
  children,
}) => {
  const opacity = overlayState.enabled
    ? Math.max(0.3, Math.min(1.0, overlayState.opacity))
    : 1.0;

  return (
    <div
      style={{ opacity }}
      className={`h-screen w-screen flex flex-col bg-[#0c0f1a] text-white font-sans overflow-hidden select-none ${
        isSos ? "ring-2 ring-inset ring-red-600" : ""
      }`}
    >
      {topBar}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <main className="flex-1 flex flex-col relative overflow-hidden min-h-0">
            {children}
          </main>
          {bottomBar}
        </div>
        {rightSidebar}
      </div>
    </div>
  );
};
