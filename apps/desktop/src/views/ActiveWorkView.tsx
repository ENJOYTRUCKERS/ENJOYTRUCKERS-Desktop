import React, { useState } from "react";
import {
  Anchor,
  Bed,
  Coffee,
  Droplets,
  Fuel,
  Hourglass,
  Package,
  PackageOpen,
  TrainFront,
} from "lucide-react";
import { GreenModal } from "../components/shell/GreenModal";
import { NumericKeypad } from "../components/shell/NumericKeypad";
import type { DtsViewId, TelemetryData, WorkState } from "../types/tachograph";

type WorkSubScreen = "main" | "fuel" | "alarm" | "product" | "quantity";

interface ActiveWorkViewProps {
  workState: WorkState;
  telemetry: TelemetryData;
  displayLabel: string;
  alarmMinutesRemaining: number | null;
  onSetAlarmMinutes: (minutes: number | null) => void;
  onToggleLoaded: () => void;
  onFinishWork: () => void;
  onOpenDrivingStatus: () => void;
  onNavigate: (view: DtsViewId) => void;
}

const FUEL_TYPE_OPTIONS = ["ウィング", "宇佐美", "エネフリ", "その他"];
const PRODUCT_OPTIONS = [
  { code: "1", name: "商品A" },
  { code: "2", name: "商品B" },
  { code: "3", name: "商品C" },
  { code: "4", name: "商品D" },
];

export const ActiveWorkView: React.FC<ActiveWorkViewProps> = ({
  workState,
  telemetry,
  displayLabel,
  alarmMinutesRemaining,
  onSetAlarmMinutes,
  onToggleLoaded,
  onFinishWork,
  onOpenDrivingStatus,
  onNavigate,
}) => {
  const [subScreen, setSubScreen] = useState<WorkSubScreen>("main");
  const [showKeypad, setShowKeypad] = useState(false);

  // Fuel states (#43-#49)
  const [fuelType, setFuelType] = useState("ウィング");
  const [showFuelTypeModal, setShowFuelTypeModal] = useState(false);
  const [fuelLiters, setFuelLiters] = useState("");
  const [savedFuelNote, setSavedFuelNote] = useState<string | null>(null);

  // Alarm states (#56-#59)
  const [alarmInput, setAlarmInput] = useState("");

  // Cargo / Product states (#76-#83)
  const [productCode, setProductCode] = useState("");
  const [cargoCount, setCargoCount] = useState("");
  const [cargoTons, setCargoTons] = useState("");
  const [quantityFocus, setQuantityFocus] = useState<"count" | "tons">("count");
  const [savedCargoNote, setSavedCargoNote] = useState<string | null>(null);

  // Green toast notification (`登録しました`)
  const [toastText, setToastText] = useState<string | null>(null);

  const showQuickToast = (text: string, onDone?: () => void) => {
    setToastText(text);
    setTimeout(() => {
      setToastText(null);
      if (onDone) onDone();
    }, 1200);
  };

  const elapsedSec = Math.max(0, Math.floor(workState.current_break_seconds || 0));
  const elapsedHrs = Math.floor(elapsedSec / 3600);
  const elapsedMins = Math.floor((elapsedSec % 3600) / 60);

  const effectiveLabel = displayLabel || workState.work_status_label || "作業中";
  const isWashMode = effectiveLabel === "洗車中";
  const isRefuel = workState.work_type === "refuel";
  const isCargoWork =
    workState.work_type === "loading" || workState.work_type === "unloading";
  const isWaitOrRest =
    !isWashMode &&
    (workState.work_type === "wait" ||
      workState.work_type === "rest" ||
      workState.work_type === "break");

  const splitQualified = workState.current_break_seconds >= 600;
  const totalEffectiveBreakMin = Math.floor(
    (workState.break_bank_seconds +
      (splitQualified ? workState.current_break_seconds : 0)) /
      60
  );

  const renderBannerIcon = () => {
    if (isWashMode) return <Droplets className="w-6 h-6" />;
    switch (workState.work_type) {
      case "refuel":
        return <Fuel className="w-6 h-6" />;
      case "loading":
        return <Package className="w-6 h-6" />;
      case "unloading":
        return <PackageOpen className="w-6 h-6" />;
      case "wait":
        return <Hourglass className="w-6 h-6" />;
      case "rest":
        return <Coffee className="w-6 h-6" />;
      case "break":
        return <Bed className="w-6 h-6" />;
      case "ferry":
        return <Anchor className="w-6 h-6" />;
      case "train":
        return <TrainFront className="w-6 h-6" />;
      default:
        return <Hourglass className="w-6 h-6" />;
    }
  };

  const slateBtn =
    "bg-[#525074] hover:bg-[#62608a] active:bg-[#434160] text-white h-10 px-4 text-sm font-bold rounded-[2px]";
  const cyanFinishBtn =
    "bg-gradient-to-b from-[#55b9ea] to-[#3999cb] hover:from-[#65c4f2] hover:to-[#45a5d6] text-white h-10 px-9 text-base font-bold rounded-[2px]";

  // 1. Sub-screen: 燃料量入力 (#43-#49)
  if (subScreen === "fuel") {
    return (
      <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between min-h-0">
        <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center text-white font-bold text-lg shrink-0">
          燃料量
        </div>

        <div className="flex-1 flex flex-col justify-center px-10 space-y-5">
          <div className="flex items-center gap-4">
            <span className="w-28 text-base font-bold text-white">
              タイプ選択
            </span>
            <button
              type="button"
              onClick={() => {
                setShowKeypad(false);
                setShowFuelTypeModal(true);
              }}
              className="flex-1 bg-white text-black h-10 px-3 flex items-center justify-between text-base font-medium"
            >
              <span>{fuelType}</span>
              <span className="text-sm">▼</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="w-28 text-base font-bold text-white">
              数量(L)
            </span>
            <button
              type="button"
              onClick={() => setShowKeypad(true)}
              className="flex-1 bg-white text-black h-10 px-3 flex items-center text-left text-lg font-bold tabular-nums"
            >
              {fuelLiters}
            </button>
          </div>
        </div>

        {showKeypad ? (
          <NumericKeypad
            variant="input"
            allowDecimal
            confirmLabel="確定"
            onDigit={(d) => {
              if (d === "." && fuelLiters.includes(".")) return;
              if (fuelLiters.length < 7) setFuelLiters((v) => v + d);
            }}
            onBackspace={() => setFuelLiters((v) => v.slice(0, -1))}
            onConfirm={() => setShowKeypad(false)}
          />
        ) : (
          <div className="bg-[#222436] px-4 py-2.5 border-t border-[#32344a] flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowKeypad(false);
                setSubScreen("main");
              }}
              className={slateBtn}
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => {
                if (fuelLiters) {
                  setSavedFuelNote(`${fuelType} ${fuelLiters} L`);
                }
                showQuickToast("登録しました", () => setSubScreen("main"));
              }}
              className={cyanFinishBtn}
            >
              確定
            </button>
          </div>
        )}

        <GreenModal
          open={showFuelTypeModal}
          title="選択してください"
          message=""
          options={FUEL_TYPE_OPTIONS}
          onSelectOption={(opt) => {
            setFuelType(opt);
            setShowFuelTypeModal(false);
          }}
          onConfirm={() => setShowFuelTypeModal(false)}
          onCancel={() => setShowFuelTypeModal(false)}
        />

        <GreenModal
          open={Boolean(toastText)}
          title="通知"
          message={toastText || ""}
          hideButtons
          onConfirm={() => setToastText(null)}
          onCancel={() => setToastText(null)}
        />
      </div>
    );
  }

  // 2. Sub-screen: アラーム時間設定 (#56-#58)
  if (subScreen === "alarm") {
    return (
      <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center px-8 space-y-4">
          <div className="text-base font-bold text-white">
            1～120分の範囲で設定してください
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowKeypad(true)}
              className="w-40 bg-white text-black h-10 px-3 flex items-center text-left text-lg font-bold tabular-nums"
            >
              {alarmInput}
            </button>
            <span className="text-base font-bold text-white">分後</span>
          </div>
        </div>

        {showKeypad ? (
          <NumericKeypad
            variant="input"
            allowDecimal
            confirmLabel="確定"
            onDigit={(d) => {
              if (d === ".") return;
              if (alarmInput.length < 3) setAlarmInput((v) => v + d);
            }}
            onBackspace={() => setAlarmInput((v) => v.slice(0, -1))}
            onConfirm={() => setShowKeypad(false)}
          />
        ) : (
          <div className="bg-[#222436] px-4 py-2.5 border-t border-[#32344a] flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowKeypad(false);
                setSubScreen("main");
              }}
              className={slateBtn}
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => {
                const parsed = Number.parseInt(alarmInput, 10);
                if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 120) {
                  onSetAlarmMinutes(parsed);
                }
                setSubScreen("main");
              }}
              className={cyanFinishBtn}
            >
              確定
            </button>
          </div>
        )}
      </div>
    );
  }

  // 3. Sub-screen: 商品選択 (#76-#79)
  if (subScreen === "product") {
    return (
      <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between min-h-0">
        <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center text-white font-bold text-lg shrink-0">
          商品選択
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 divide-y divide-zinc-700">
          <div className="flex items-center gap-4 pb-2.5">
            <span className="w-28 text-base font-bold text-white shrink-0">
              商品コード
            </span>
            <button
              type="button"
              onClick={() => setShowKeypad(true)}
              className="flex-1 bg-white text-black h-9 px-3 flex items-center text-left text-base font-bold tabular-nums"
            >
              {productCode}
            </button>
          </div>
          {PRODUCT_OPTIONS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                setProductCode(item.code);
                setShowKeypad(false);
              }}
              className={`w-full text-left py-2.5 px-2 text-base font-bold ${
                productCode === item.code
                  ? "bg-[#22344d] text-[#64c4ed]"
                  : "text-white hover:bg-[#171b2d]"
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>

        {showKeypad ? (
          <NumericKeypad
            variant="input"
            allowDecimal={false}
            confirmLabel="確定"
            onDigit={(d) => {
              if (productCode.length < 8) setProductCode((v) => v + d);
            }}
            onBackspace={() => setProductCode((v) => v.slice(0, -1))}
            onConfirm={() => setShowKeypad(false)}
          />
        ) : (
          <div className="bg-[#222436] px-4 py-2.5 border-t border-[#32344a] flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowKeypad(false);
                setSubScreen("main");
              }}
              className={slateBtn}
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => {
                setShowKeypad(false);
                setSubScreen("quantity");
              }}
              className={cyanFinishBtn}
            >
              確定
            </button>
          </div>
        )}
      </div>
    );
  }

  // 4. Sub-screen: 個数トン数 (#80-#83)
  if (subScreen === "quantity") {
    const paddedCode = (productCode || "1").padStart(8, "0");
    return (
      <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between min-h-0">
        <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center text-white font-bold text-lg shrink-0">
          個数トン数
        </div>

        <div className="flex-1 flex flex-col justify-center px-10 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setQuantityFocus("count");
                setShowKeypad(true);
              }}
              className="w-56 bg-white text-black h-9 px-3 flex items-center text-left text-base font-bold tabular-nums"
            >
              {cargoCount}
            </button>
            <span className="text-base font-bold text-white">個数</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setQuantityFocus("tons");
                setShowKeypad(true);
              }}
              className="w-56 bg-white text-black h-9 px-3 flex items-center text-left text-base font-bold tabular-nums"
            >
              {cargoTons}
            </button>
            <span className="text-base font-bold text-white">トン</span>
          </div>

          <div className="flex items-center justify-between pt-1 text-sm font-bold text-zinc-300">
            <span>オーダー番号</span>
            <span className="tabular-nums text-white">{paddedCode}</span>
          </div>
        </div>

        {showKeypad ? (
          <NumericKeypad
            variant="input"
            allowDecimal={quantityFocus === "tons"}
            confirmLabel="確定"
            onDigit={(d) => {
              if (quantityFocus === "count") {
                if (d === ".") return;
                if (cargoCount.length < 6) setCargoCount((v) => v + d);
              } else {
                if (d === "." && cargoTons.includes(".")) return;
                if (cargoTons.length < 6) setCargoTons((v) => v + d);
              }
            }}
            onBackspace={() => {
              if (quantityFocus === "count") {
                setCargoCount((v) => v.slice(0, -1));
              } else {
                setCargoTons((v) => v.slice(0, -1));
              }
            }}
            onConfirm={() => setShowKeypad(false)}
          />
        ) : (
          <div className="bg-[#222436] px-4 py-2.5 border-t border-[#32344a] flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowKeypad(false);
                setSubScreen("product");
              }}
              className={slateBtn}
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => {
                setSavedCargoNote(
                  `コード${paddedCode} (${cargoCount || "0"}個 / ${cargoTons || "0"}t)`
                );
                showQuickToast("登録しました", () => setSubScreen("main"));
              }}
              className={cyanFinishBtn}
            >
              確定
            </button>
          </div>
        )}

        <GreenModal
          open={Boolean(toastText)}
          title="通知"
          message={toastText || ""}
          hideButtons
          onConfirm={() => setToastText(null)}
          onCancel={() => setToastText(null)}
        />
      </div>
    );
  }

  // Main Active Work View (給油中 / 荷積中 / 荷卸中 / 待機中 / 休憩中 / 洗車中 / 休息中)
  return (
    <div className="flex-1 bg-[#0c0f1a] flex flex-col justify-between min-h-0">
      {/* Cyan Banner */}
      <div className="h-11 bg-gradient-to-b from-[#3fa7da] to-[#2e8ec0] px-4 flex items-center justify-between text-white shrink-0">
        <div className="flex items-center gap-2.5 font-bold text-lg">
          {renderBannerIcon()}
          <span>{effectiveLabel}</span>
        </div>
        {telemetry.source_city && (
          <span className="text-xs font-bold text-white/90">
            {telemetry.source_city}
          </span>
        )}
      </div>

      {/* Giant Centered Elapsed Timer */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flex items-baseline gap-2 text-white">
          <span className="text-[54px] font-bold tabular-nums leading-none">
            {elapsedHrs}
          </span>
          <span className="text-xl font-bold text-zinc-200">時間</span>
          <span className="text-[54px] font-bold tabular-nums leading-none ml-2">
            {String(elapsedMins).padStart(2, "0")}
          </span>
          <span className="text-xl font-bold text-zinc-200">分経過</span>
        </div>

        {(isWaitOrRest || workState.work_type === "ferry" || workState.work_type === "train") && (
          <div className="mt-3 text-xs text-zinc-300">
            430有効休憩: {Math.min(30, totalEffectiveBreakMin)}分 / 30分（
            {splitQualified
              ? "10分以上有効加算中"
              : `あと${Math.max(1, Math.ceil((600 - elapsedSec) / 60))}分で有効`}
            ）
          </div>
        )}

        {savedFuelNote && isRefuel && (
          <div className="mt-3 text-xs text-[#64c4ed] font-bold">
            給油登録: {savedFuelNote}
          </div>
        )}
        {savedCargoNote && isCargoWork && (
          <div className="mt-3 text-xs text-[#64c4ed] font-bold">
            積載登録: {savedCargoNote}
          </div>
        )}
      </div>

      {/* Bottom Dark Slate Action Bar matching exact DTS-G1D layout per work type */}
      <div className="bg-[#222436] px-3 py-2 border-t border-[#32344a] shrink-0">
        {isRefuel ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSubScreen("fuel")}
                className={`${slateBtn} w-28`}
              >
                燃料
              </button>
              <button
                type="button"
                onClick={() => showQuickToast("オイル点検を記録しました")}
                className={`${slateBtn} w-28`}
              >
                オイル
              </button>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenDrivingStatus}
                  className={`${slateBtn} w-28`}
                >
                  運転状況
                </button>
                <button
                  type="button"
                  onClick={onOpenDrivingStatus}
                  className={`${slateBtn} w-28`}
                >
                  違反
                </button>
              </div>
              <button
                type="button"
                onClick={onFinishWork}
                className={cyanFinishBtn}
              >
                終了
              </button>
            </div>
          </div>
        ) : isCargoWork ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleLoaded}
                className={`${slateBtn} w-28`}
              >
                積載
              </button>
              <button
                type="button"
                onClick={() => setSubScreen("product")}
                className={`${slateBtn} w-28`}
              >
                {workState.work_type === "loading" ? "積選択" : "卸選択"}
              </button>
              <button
                type="button"
                onClick={() => onNavigate("nav")}
                className={`${slateBtn} w-28`}
              >
                地点
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onFinishWork}
                className={cyanFinishBtn}
              >
                終了
              </button>
            </div>
          </div>
        ) : isWaitOrRest ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenDrivingStatus}
                  className={`${slateBtn} w-28`}
                >
                  運転状況
                </button>
                <button
                  type="button"
                  onClick={onOpenDrivingStatus}
                  className={`${slateBtn} w-28`}
                >
                  違反
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("nav")}
                  className={`${slateBtn} w-28`}
                >
                  地点
                </button>
              </div>
              {alarmMinutesRemaining !== null && (
                <span className="text-sm font-bold text-white pr-2">
                  アラーム {alarmMinutesRemaining} 分後
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={() => setSubScreen("alarm")}
                className={`${slateBtn} w-28`}
              >
                アラーム
              </button>
              <button
                type="button"
                onClick={onFinishWork}
                className={cyanFinishBtn}
              >
                終了
              </button>
            </div>
          </div>
        ) : (
          /* 洗車中・フェリー・鉄道移動: 1段構成 (#98, #99) */
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenDrivingStatus}
                className={`${slateBtn} w-28`}
              >
                運転状況
              </button>
              <button
                type="button"
                onClick={onOpenDrivingStatus}
                className={`${slateBtn} w-28`}
              >
                違反
              </button>
            </div>
            <button
              type="button"
              onClick={onFinishWork}
              className={cyanFinishBtn}
            >
              終了
            </button>
          </div>
        )}
      </div>

      <GreenModal
        open={Boolean(toastText)}
        title="通知"
        message={toastText || ""}
        hideButtons
        onConfirm={() => setToastText(null)}
        onCancel={() => setToastText(null)}
      />
    </div>
  );
};
