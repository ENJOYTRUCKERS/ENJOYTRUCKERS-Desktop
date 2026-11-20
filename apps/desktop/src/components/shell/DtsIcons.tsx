import React from "react";

interface IconProps {
  className?: string;
}

/** Top-right signal bars (cellular antenna + optional GPS icon when game connected). */
export const DtsSignalIcon: React.FC<{
  isOnline: boolean;
  isGameConnected?: boolean;
}> = ({ isOnline, isGameConnected = false }) => {
  const barColor = isOnline ? "#ffffff" : "#ef4444";
  return (
    <div className="flex items-center gap-1.5">
      {isGameConnected && (
        <svg
          width="15"
          height="14"
          viewBox="0 0 16 14"
          fill="none"
          aria-label="GPS信号"
        >
          <path
            d="M4.5 2.5L7.5 5.5M6 1L9 4M1.5 5.5L4.5 8.5"
            stroke="#ffffff"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <rect
            x="4"
            y="4"
            width="4.5"
            height="3"
            rx="0.5"
            transform="rotate(-45 6.25 5.5)"
            fill="#ffffff"
          />
          <rect x="9" y="10" width="1.6" height="3" fill="#ffffff" />
          <rect x="11.4" y="8" width="1.6" height="5" fill="#ffffff" />
          <rect x="13.8" y="5.5" width="1.6" height="7.5" fill="#ffffff" />
        </svg>
      )}
      <svg
        width="17"
        height="14"
        viewBox="0 0 18 14"
        fill="none"
        aria-label={isOnline ? "通信接続" : "オフライン"}
      >
        {/* Antenna stem + Y fork */}
        <path
          d="M4.5 13V4.5M1.5 1.5L4.5 4.5L7.5 1.5"
          stroke={barColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 3 Signal bars */}
        <rect x="9.5" y="9" width="1.8" height="4" fill={barColor} />
        <rect x="12.3" y="6" width="1.8" height="7" fill={barColor} />
        <rect
          x="15.1"
          y="2.5"
          width="1.8"
          height="10.5"
          fill={isOnline ? "#ffffff" : "#52525b"}
        />
      </svg>
    </div>
  );
};

/** 撮影 (Camera) */
export const DtsCameraIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 20" fill="currentColor" className={className}>
    <path d="M8.2 2L6.6 4.2H3C1.9 4.2 1 5.1 1 6.2V17C1 18.1 1.9 19 3 19H21C22.1 19 23 18.1 23 17V6.2C23 5.1 22.1 4.2 21 4.2H17.4L15.8 2H8.2ZM12 7C14.8 7 17 9.2 17 12C17 14.8 14.8 17 12 17C9.2 17 7 14.8 7 12C7 9.2 9.2 7 12 7ZM12 9.2C10.5 9.2 9.2 10.5 9.2 12C9.2 13.5 10.5 14.8 12 14.8C13.5 14.8 14.8 13.5 14.8 12C14.8 10.5 13.5 9.2 12 9.2Z" />
  </svg>
);

/** 一般道 (Multi-lane local road with dashed lines & crosswalk bars, matching DTS-G1D) */
export const DtsLocalRoadIcon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Outer vertical lane borders */}
    <rect x="3" y="2" width="1.6" height="20" />
    <rect x="19.4" y="2" width="1.6" height="20" />
    {/* Dashed lane dividers */}
    <rect x="7" y="3" width="1.4" height="3.5" />
    <rect x="7" y="10" width="1.4" height="4" />
    <rect x="7" y="17.5" width="1.4" height="3.5" />
    <rect x="11.3" y="3" width="1.4" height="3.5" />
    <rect x="11.3" y="10" width="1.4" height="4" />
    <rect x="11.3" y="17.5" width="1.4" height="3.5" />
    <rect x="15.6" y="3" width="1.4" height="3.5" />
    <rect x="15.6" y="10" width="1.4" height="4" />
    <rect x="15.6" y="17.5" width="1.4" height="3.5" />
    {/* Crosswalk mid stripes */}
    <rect x="4.6" y="7" width="14.8" height="1.2" opacity="0.7" />
    <rect x="4.6" y="15.5" width="14.8" height="1.2" opacity="0.7" />
  </svg>
);

/** 高速道 (Expressway tollgate / overpass icon, matching DTS-G1D) */
export const DtsHighwayIcon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Overpass top deck + pillars + road underneath */}
    <rect x="2" y="7" width="20" height="3.2" rx="0.5" />
    <rect x="5" y="10.2" width="2.2" height="5.3" />
    <rect x="16.8" y="10.2" width="2.2" height="5.3" />
    <path d="M9.5 3L11.2 3V7H9.5V3ZM12.8 3H14.5V7H12.8V3Z" />
    <path d="M8.5 14L6 21H9.5L11 14H8.5ZM13 14L14.5 21H18L15.5 14H13Z" />
    <rect x="11.4" y="14.5" width="1.2" height="2.4" />
    <rect x="11.4" y="18.2" width="1.2" height="2.6" />
  </svg>
);

/** 実車 (Truck with SOLID filled cargo box, matching DTS-G1D) */
export const DtsTruckLoadedIcon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 26 18" fill="currentColor" className={className}>
    {/* Solid cargo body */}
    <rect x="1" y="2.5" width="14.8" height="9.6" rx="0.5" />
    {/* Cab with cutout window using evenodd */}
    <path
      fillRule="evenodd"
      d="M16.8 5.2H21.2L24.6 9.1V12.5H16.8V5.2ZM18.3 6.6V9.2H23L20.8 6.6H18.3Z"
    />
    {/* Wheels */}
    <circle cx="6.2" cy="14.2" r="2.2" />
    <circle cx="20.4" cy="14.2" r="2.2" />
  </svg>
);

/** 空車 (Truck with HOLLOW outlined cargo box, matching DTS-G1D) */
export const DtsTruckEmptyIcon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 26 18" fill="none" className={className}>
    {/* Hollow cargo frame */}
    <rect
      x="1.6"
      y="3.1"
      width="13.6"
      height="8.4"
      rx="0.4"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    {/* Cab with cutout window */}
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M16.8 5.2H21.2L24.6 9.1V12.5H16.8V5.2ZM18.3 6.6V9.2H23L20.8 6.6H18.3Z"
    />
    {/* Wheels */}
    <circle cx="6.2" cy="14.2" r="2.2" fill="currentColor" />
    <circle cx="20.4" cy="14.2" r="2.2" fill="currentColor" />
  </svg>
);

/** 連絡 (Phone receiver + envelope, matching DTS-G1D) */
export const DtsContactIcon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 24 20" fill="currentColor" className={className}>
    {/* Phone handset left */}
    <path d="M5.2 2.2C4.3 2.2 3.2 3.1 2.8 4.2C2.1 6.2 2.8 9.6 5.1 12.6C7.1 15.2 9.4 16.9 11.4 17.5C12.3 17.8 13.3 17.3 13.8 16.5L14.4 15.5C14.7 15 14.5 14.3 14 14L11.7 12.7C11.2 12.4 10.6 12.6 10.3 13.1L9.8 13.8C8.9 13.3 7.7 12.2 6.8 10.9C5.9 9.7 5.5 8.5 5.4 7.7L6.2 7.2C6.7 6.9 6.9 6.3 6.7 5.8L5.9 3.1C5.7 2.5 5.6 2.2 5.2 2.2Z" />
    {/* Envelope top flap + lower body with transparent V-gap */}
    <polygon points="11.6,3 22,3 16.8,6.7" />
    <polygon points="11,3.9 16.8,8.1 22.6,3.9 22.6,11 11,11" />
  </svg>
);

/** 地図 (Windowed map icon, matching DTS-G1D) */
export const DtsMapIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 20" fill="currentColor" className={className}>
    <rect
      x="2"
      y="2.5"
      width="20"
      height="15"
      rx="1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <rect x="2" y="2.5" width="20" height="3.2" />
    <path
      d="M5 9.5L10.5 7.8L14 10.8L19 9"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
    <circle cx="12" cy="13.2" r="1.7" />
  </svg>
);

/** 3x3 White grid icon (returns from Nav to Tachograph menu) */
export const DtsGrid3x3Icon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
    <rect x="2" y="2" width="4" height="4" />
    <rect x="8" y="2" width="4" height="4" />
    <rect x="14" y="2" width="4" height="4" />
    <rect x="2" y="8" width="4" height="4" />
    <rect x="8" y="8" width="4" height="4" />
    <rect x="14" y="8" width="4" height="4" />
    <rect x="2" y="14" width="4" height="4" />
    <rect x="8" y="14" width="4" height="4" />
    <rect x="14" y="14" width="4" height="4" />
  </svg>
);

/** Magnifying glass search icon */
export const DtsSearchIcon: React.FC<IconProps> = ({
  className = "w-5 h-5",
}) => (
  <svg viewBox="0 0 22 22" fill="none" className={className}>
    <circle
      cx="9.5"
      cy="9.5"
      r="5.5"
      stroke="currentColor"
      strokeWidth="2.3"
    />
    <path
      d="M14 14L19 19"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);
