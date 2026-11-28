import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

import "./App.css";
import { BottomTelemetryBar } from "./components/shell/BottomTelemetryBar";
import { DtsShell } from "./components/shell/DtsShell";
import { GreenModal } from "./components/shell/GreenModal";
import { RightSidebar } from "./components/shell/RightSidebar";
import { TopStatusBar } from "./components/shell/TopStatusBar";
import { playDtsChime, speakJapanese } from "./lib/voiceEngine";
import {
  DEFAULT_FEATURE_FLAGS,
  type AppConfig,
  type CitySyncSummary,
  type CompanionInfo,
  type DesktopFeatureFlags,
  type DetectedGEvent,
  type DispatchEventItem,
  type DispatchOrderItem,
  type DtsViewId,
  type OverlayState,
  type RoadType,
  type SessionUploadSummary,
  type SmartWorkProposal,
  type SystemDiagnosticsReport,
  type TachographMessageItem,
  type TelemetryData,
  type WorkState,
  type WorkType,
} from "./types/tachograph";
import { ActiveWorkView } from "./views/ActiveWorkView";
import { AcademyExamView } from "./views/AcademyExamView";
import { ContactView } from "./views/ContactView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { DispatchView } from "./views/DispatchView";
import { DrivingView } from "./views/DrivingView";
import { LoginView } from "./views/LoginView";
import { NavView } from "./views/NavView";
import { PreDepartureView } from "./views/PreDepartureView";
import { ReturnGarageView } from "./views/ReturnGarageView";
import { SettingsView } from "./views/SettingsView";
import { SplashView } from "./views/SplashView";
import { WorkMenuView } from "./views/WorkMenuView";

interface DetectedDlc {
  id?: string | null;
  name: string;
}

interface DlcDetectionResult {
  ets2: DetectedDlc[];
  ats: DetectedDlc[];
}

interface HazardSpot {
  x: number;
  y: number;
  count: number;
  dominantType: string;
}

const INITIAL_TELEMETRY: TelemetryData = {
  sdk_version: 16,
  token: "",
  game: "ets2",
  paused: false,
  simulation_time: 0,
  paused_simulation_time: 0,
  local_scale: 1,
  game_time: 0,
  multiplayer_time_offset: 0,
  rest_stop: 0,
  mandatory_break: 0,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  accel_x: 0,
  accel_y: 0,
  accel_z: 0,
  g_lateral: 0,
  g_vertical: 0,
  g_longitudinal: 0,
  g_jerk: 0,
  speed: 0,
  engine_rpm: 0,
  rpm_limit: 2500,
  engine_gear: 0,
  gear: 0,
  cruise_control: 0,
  input_steering: 0,
  input_throttle: 0,
  input_brake: 0,
  input_clutch: 0,
  effective_steering: 0,
  effective_throttle: 0,
  brake: 0,
  effective_clutch: 0,
  parking_brake: false,
  motor_brake: false,
  retarder: 0,
  retarder_steps: 0,
  brake_air_pressure: 0,
  brake_air_warning: false,
  brake_air_emergency: false,
  brake_temperature: 0,
  odometer: 0,
  fuel: 0,
  fuel_capacity: 0,
  fuel_warning: false,
  fuel_avg_consumption: 0,
  fuel_range: 0,
  adblue: 0,
  adblue_warning: false,
  oil_pressure_warning: false,
  water_temp_warning: false,
  battery_voltage_warning: false,
  electric_enabled: false,
  engine_enabled: false,
  lblinker: false,
  rblinker: false,
  hazard: false,
  parking_light: false,
  low_beam: false,
  high_beam: false,
  aux_front: false,
  aux_roof: false,
  beacon: false,
  brake_light: false,
  reverse_light: false,
  wipers: false,
  differential_lock: false,
  lift_axle: false,
  trailer_lift_axle: false,
  wheel_offroad: false,
  wear_engine: 0,
  wear_transmission: 0,
  wear_cabin: 0,
  wear_chassis: 0,
  wear_wheels: 0,
  nav_distance: 0,
  nav_time: 0,
  speed_limit: 0,
  cargo_damage: 0,
  trailer_connected: false,
  trailer_x: 0,
  trailer_y: 0,
  trailer_z: 0,
  trailer_heading: 0,
  trailer_pitch: 0,
  trailer_roll: 0,
  trailer_body_type: "",
  trailer_chain_type: "",
  trailers: [],
  truck_brand_id: "",
  truck_brand: "",
  truck_id: "",
  truck_name: "",
  license_plate: "",
  license_plate_country: "",
  cargo_id: "",
  cargo_name: "",
  cargo_mass: 0,
  source_city_id: "",
  source_city: "",
  destination_city_id: "",
  destination_city: "",
  source_company_id: "",
  source_company: "",
  destination_company_id: "",
  destination_company: "",
  planned_distance_km: 0,
  job_income: 0,
  delivery_time: 0,
  cargo_loaded: false,
  job_market: "",
  is_special_job: false,
  events: [],
  timestamp: 0,
};

const INITIAL_WORK_STATE: WorkState = {
  status: "Idle",
  work_type: "idle",
  road_type: "local",
  is_loaded: false,
  is_smart_auto_mode: true,
  work_seconds: 0,
  rest_seconds: 0,
  continuous_driving_seconds: 0,
  total_driving_seconds: 0,
  current_break_seconds: 0,
  total_break_seconds: 0,
  break_bank_seconds: 0,
  max_continuous_driving_sec: 0,
  start_odometer: 0,
  max_speed: 0,
  is_430_warning: false,
  is_430_violation: false,
  violation_430_count: 0,
  live_g_long: 0,
  live_g_lat: 0,
  live_g_vert: 0,
  max_forward_g: 0,
  max_brake_g: 0,
  max_lateral_g: 0,
  max_vertical_g: 0,
  g_score: 100,
  g_rank: "S",
  harsh_accel_count: 0,
  harsh_brake_count: 0,
  harsh_corner_count: 0,
  high_jerk_count: 0,
  impact_count: 0,
  is_sos: false,
  sos_message: "",
  active_session_id: "",
  distance_driven_km: 0,
  work_status_label: "業務終了",
  pending_queue_count: 0,
};

const ROAD_CYCLE: RoadType[] = ["city", "local", "highway", "private"];

function formatClockHm(ms: number): string {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  const now = new Date(safeMs);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function App() {
  const portalUrl =
    import.meta.env.VITE_PORTAL_URL || "https://portal.truckers.jp";

  const [currentView, setCurrentView] = useState<DtsViewId>("splash");
  const [previousView, setPreviousView] = useState<DtsViewId>("work_menu");
  const [isFullScreenMap, setIsFullScreenMap] = useState(false);

  const [loginId, setLoginId] = useState("");
  const [loginName, setLoginName] = useState("乗務員不明");
  const [expectedEmployeeId, setExpectedEmployeeId] = useState("");
  const [isTraineeOnly, setIsTraineeOnly] = useState(false);
  const [traineeId, setTraineeId] = useState("");
  const [userSteamId, setUserSteamId] = useState("");
  const [canSyncCities, setCanSyncCities] = useState(false);
  const [telemetryToken, setTelemetryToken] = useState("");

  const [time, setTime] = useState<string>(() => formatClockHm(Date.now()));
  const [appVersion, setAppVersion] = useState("0.1.24");
  const [isOnline, setIsOnline] = useState(false);

  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [workState, setWorkState] = useState<WorkState>(INITIAL_WORK_STATE);
  const [activeWorkDisplayLabel, setActiveWorkDisplayLabel] =
    useState<string>("");
  const [drivingPattern, setDrivingPattern] = useState<"A" | "B" | "C">("A");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [featureFlags, setFeatureFlags] = useState<DesktopFeatureFlags>(
    DEFAULT_FEATURE_FLAGS
  );
  const [overlayState, setOverlayState] = useState<OverlayState>({
    enabled: false,
    clickThrough: false,
    alwaysOnTop: false,
    opacity: 0.92,
  });
  const [companionInfo, setCompanionInfo] = useState<CompanionInfo | null>(
    null
  );

  // Proposal GreenModal state
  const [modalProposal, setModalProposal] = useState<{
    open: boolean;
    workType: WorkType;
    title: string;
    message: string;
    subMessage?: string;
    countdown?: number;
  } | null>(null);

  // Fullscreen map confirmation + hint modal (234104.png / 234113.png)
  const [navFullscreenConfirm, setNavFullscreenConfirm] = useState(false);
  const [navFullscreenHint, setNavFullscreenHint] = useState(false);

  // Wait / Rest alarm state (233824.png / 233844.png)
  const [alarmTargetMs, setAlarmTargetMs] = useState<number | null>(null);
  const [alarmMinutesRemaining, setAlarmMinutesRemaining] = useState<
    number | null
  >(null);
  const [alarmTriggeredModal, setAlarmTriggeredModal] = useState(false);

  // Portal data states
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrderItem[]>([]);
  const [dispatchEvents, setDispatchEvents] = useState<DispatchEventItem[]>([]);
  const [isLoadingDispatch, setIsLoadingDispatch] = useState(false);
  const [officeMessages, setOfficeMessages] = useState<TachographMessageItem[]>(
    []
  );
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const [diagnosticsReport, setDiagnosticsReport] =
    useState<SystemDiagnosticsReport | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [isRepairingPlugin, setIsRepairingPlugin] = useState(false);
  const [isSyncingDlc, setIsSyncingDlc] = useState(false);
  const [isSyncingCities, setIsSyncingCities] = useState(false);
  const [citySyncResult, setCitySyncResult] = useState<
    CitySyncSummary[] | null
  >(null);
  const [isCapturingDashcam, setIsCapturingDashcam] = useState(false);

  const [aiReviewText, setAiReviewText] = useState<string | null>(null);
  const [isRequestingAiReview, setIsRequestingAiReview] = useState(false);
  const [isFinishingDuty, setIsFinishingDuty] = useState(false);
  const [lastFinishedSummary, setLastFinishedSummary] = useState<{
    distanceKm: number;
    gScore: number;
    gRank: string;
    is430Violation: boolean;
    maxContinuousSec: number;
    harshTotal: number;
  } | null>(null);

  const [hazardSpots, setHazardSpots] = useState<HazardSpot[]>([]);
  const [hazardWarningText, setHazardWarningText] = useState<string | null>(
    null
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workStateRef = useRef<WorkState>(workState);
  const currentViewRef = useRef<DtsViewId>(currentView);
  const previousViewRef = useRef<DtsViewId>(previousView);
  const isFullScreenMapRef = useRef<boolean>(isFullScreenMap);
  const isTraineeOnlyRef = useRef<boolean>(false);
  const profileNameRef = useRef<string>("");
  const wsAuthTokenRef = useRef<string>("");
  const voiceEnabledRef = useRef<boolean>(true);
  const featureFlagsRef = useRef<DesktopFeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const alarmTargetMsRef = useRef<number | null>(null);
  const alerted430WarnRef = useRef(false);
  const alerted430ViolRef = useRef(false);
  const lastHazardAlertTimeRef = useRef(0);
  const prevSpeedRef = useRef<number>(0);

  useEffect(() => {
    workStateRef.current = workState;
  }, [workState]);

  useEffect(() => {
    currentViewRef.current = currentView;
    previousViewRef.current = previousView;
    isFullScreenMapRef.current = isFullScreenMap;
    isTraineeOnlyRef.current = isTraineeOnly;
  }, [currentView, previousView, isFullScreenMap, isTraineeOnly]);

  useEffect(() => {
    alarmTargetMsRef.current = alarmTargetMs;
  }, [alarmTargetMs]);

  useEffect(() => {
    voiceEnabledRef.current =
      voiceEnabled && featureFlags.feat_voice_guidance;
    featureFlagsRef.current = featureFlags;
  }, [voiceEnabled, featureFlags]);

  const navigateTo = useCallback((next: DtsViewId) => {
    if (
      isTraineeOnlyRef.current &&
      next !== "academy_exam" &&
      next !== "diagnostics" &&
      next !== "login"
    ) {
      next = "academy_exam";
    }
    playDtsChime("beep", voiceEnabledRef.current);
    setPreviousView(currentViewRef.current);
    setCurrentView(next);
    if (next !== "nav") {
      setIsFullScreenMap(false);
    }
    if (next === "return_garage") {
      speakJapanese("確認してください。", voiceEnabledRef.current);
    }
  }, []);

  const navigateBack = useCallback(() => {
    playDtsChime("beep", voiceEnabledRef.current);
    if (isTraineeOnlyRef.current) {
      setCurrentView("academy_exam");
      return;
    }
    const target =
      previousViewRef.current &&
      previousViewRef.current !== currentViewRef.current &&
      previousViewRef.current !== "splash"
        ? previousViewRef.current
        : workStateRef.current.status === "Idle"
        ? "pre_departure"
        : "work_menu";
    setCurrentView(target);
    setIsFullScreenMap(false);
  }, []);

  const syncInstalledDlcs = useCallback(
    async (explicitToken?: string, showFeedback = false) => {
      try {
        setIsSyncingDlc(true);
        const token =
          explicitToken ||
          telemetryToken ||
          (await invoke<AppConfig>("get_config")).telemetry_token;
        if (!token) {
          if (showFeedback) {
            await message("先にポータル連携ログインを完了してください。", {
              title: "DLC同期",
              kind: "warning",
            });
          }
          return;
        }
        const detected = await invoke<DlcDetectionResult>(
          "detect_installed_dlcs"
        );
        const ets2Dlcs = detected?.ets2 || [];
        const atsDlcs = detected?.ats || [];
        if (ets2Dlcs.length === 0 && atsDlcs.length === 0) {
          if (showFeedback) {
            await message("導入済みのETS2 / ATS DLCが検出されませんでした。", {
              title: "DLC同期",
              kind: "warning",
            });
          }
          return;
        }

        let ets2Count = 0;
        let atsCount = 0;
        if (ets2Dlcs.length > 0) {
          const r = await fetch(`${portalUrl}/api/desktop/dlc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telemetryToken: token,
              game: "ets2",
              dlcs: ets2Dlcs,
            }),
          });
          if (r.ok) {
            const d = await r.json();
            ets2Count = Number(d?.count ?? ets2Dlcs.length);
          }
        }
        if (atsDlcs.length > 0) {
          const r = await fetch(`${portalUrl}/api/desktop/dlc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telemetryToken: token,
              game: "ats",
              dlcs: atsDlcs,
            }),
          });
          if (r.ok) {
            const d = await r.json();
            atsCount = Number(d?.count ?? atsDlcs.length);
          }
        }

        if (showFeedback) {
          await message(
            `DLC同期が完了しました。\nETS2: ${ets2Count}件 / ATS: ${atsCount}件`,
            { title: "DLC同期完了", kind: "info" }
          );
        }
      } catch (e) {
        console.error("Failed to sync DLCs:", e);
      } finally {
        setIsSyncingDlc(false);
      }
    },
    [portalUrl, telemetryToken]
  );

  const handleSyncCities = useCallback(
    async (force = true, silent = false) => {
      try {
        setIsSyncingCities(true);
        const token =
          telemetryToken ||
          (await invoke<AppConfig>("get_config")).telemetry_token;
        if (!token) return;
        const summaries = await invoke<CitySyncSummary[]>(
          "sync_official_cities",
          { token, force }
        );
        setCitySyncResult(summaries);
        if (!silent && summaries.length > 0) {
          const text = summaries
            .map(
              (s) =>
                `${s.game.toUpperCase()}: ${
                  s.skipped
                    ? "最新のためスキップ"
                    : `抽出 ${s.extractedCount}件 / 同期 ${s.syncedCount}件`
                }`
            )
            .join("\n");
          await message(`公式.scs都市辞書の同期が完了しました。\n${text}`, {
            title: "都市辞書抽出完了",
            kind: "info",
          });
        }
      } catch (e) {
        if (!silent) {
          await message(`都市辞書同期エラー: ${String(e)}`, {
            title: "エラー",
            kind: "error",
          });
        }
      } finally {
        setIsSyncingCities(false);
      }
    },
    [telemetryToken]
  );

  const fetchDispatchAndEvents = useCallback(
    async (tokenOverride?: string) => {
      const tok = tokenOverride || telemetryToken;
      if (!tok) return;
      try {
        setIsLoadingDispatch(true);
        const res = await fetch(
          `${portalUrl}/api/desktop/dispatch?token=${encodeURIComponent(tok)}`
        );
        if (res.ok) {
          const data = await res.json();
          const rawOrders = Array.isArray(data?.orders) ? data.orders : [];
          setDispatchOrders(
            rawOrders.map((o: Record<string, unknown>) => ({
              id: String(o.id ?? ""),
              title: String(o.title ?? "運行指示"),
              sourceCity:
                (o.sourceCityJa as string | null) ??
                (o.sourceCityId as string | null) ??
                (o.sourceCity as string | null) ??
                null,
              destinationCity:
                (o.destinationCityJa as string | null) ??
                (o.destinationCityId as string | null) ??
                (o.destinationCity as string | null) ??
                null,
              cargoName:
                (o.cargoHint as string | null) ??
                (o.cargoName as string | null) ??
                null,
              notes: (o.notes as string | null) ?? null,
              parkingImageUrl: (o.parkingImageUrl as string | null) ?? null,
              status:
                o.status === "accepted"
                  ? "in_progress"
                  : String(o.status ?? "published"),
              scheduledAt:
                (o.sentAt as string | null) ??
                (o.scheduledAt as string | null) ??
                null,
              createdAt: String(o.createdAt ?? ""),
            }))
          );

          const rawEvents = Array.isArray(data?.upcomingEvents)
            ? data.upcomingEvents
            : Array.isArray(data?.events)
            ? data.events
            : [];
          setDispatchEvents(
            rawEvents.map((ev: Record<string, unknown>) => ({
              id: String(ev.id ?? ""),
              title: String(ev.name ?? ev.title ?? "公式コンボイ"),
              departure:
                (ev.departureJa as string | null) ??
                (ev.departure as string | null) ??
                null,
              destination:
                (ev.destinationJa as string | null) ??
                (ev.destination as string | null) ??
                null,
              startAt: String(ev.startAt ?? ""),
              meetupAt: (ev.meetupAt as string | null) ?? null,
              parkingImageUrl: (ev.parkingImageUrl as string | null) ?? null,
              mapImageUrl: (ev.mapImageUrl as string | null) ?? null,
              server:
                (ev.serverName as string | null) ??
                (ev.server as string | null) ??
                null,
            }))
          );
        }
      } catch {
        // Ignore offline errors
      } finally {
        setIsLoadingDispatch(false);
      }
    },
    [portalUrl, telemetryToken]
  );

  const fetchOfficeMessages = useCallback(
    async (tokenOverride?: string, speakUnread = false) => {
      const tok = tokenOverride || telemetryToken;
      if (!tok) return;
      try {
        setIsLoadingMessages(true);
        const res = await fetch(
          `${portalUrl}/api/desktop/messages?token=${encodeURIComponent(tok)}`
        );
        if (res.ok) {
          const data = await res.json();
          const rawList = Array.isArray(data?.messages) ? data.messages : [];
          const list: TachographMessageItem[] = rawList.map(
            (m: Record<string, unknown>) => {
              const senderUser = m.senderUser as
                | { name?: string | null }
                | undefined;
              const isToVehicle =
                m.direction === "office_to_driver" ||
                m.direction === "to_vehicle";
              return {
                id: String(m.id ?? ""),
                direction: isToVehicle ? "to_vehicle" : "from_vehicle",
                senderName:
                  (m.senderName as string | null) ?? senderUser?.name ?? null,
                content: String(m.content ?? ""),
                quickReply:
                  (m.quickReply as string | null) ??
                  (m.messageType as string | null) ??
                  null,
                isRead: Boolean(m.isRead),
                createdAt: String(m.createdAt ?? ""),
              };
            }
          );
          setOfficeMessages(list);
          if (speakUnread) {
            const firstUnread = list.find(
              (m) => m.direction === "to_vehicle" && !m.isRead
            );
            if (firstUnread) {
              playDtsChime("confirm", voiceEnabledRef.current);
              speakJapanese(
                `事務所から連絡です。${firstUnread.content}`,
                voiceEnabledRef.current
              );
            }
          }
        }
      } catch {
        // Ignore offline errors
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [portalUrl, telemetryToken]
  );

  const fetchHazardHotspots = useCallback(async () => {
    try {
      const res = await fetch(`${portalUrl}/api/map/hazards?days=90`);
      if (res.ok) {
        const data = await res.json();
        setHazardSpots(
          (data.hotspots || []).map(
            (h: {
              gameX: number;
              gameY: number;
              count: number;
              dominantType: string;
            }) => ({
              x: h.gameX,
              y: h.gameY,
              count: h.count,
              dominantType: h.dominantType,
            })
          )
        );
      }
    } catch {
      // Ignore offline errors
    }
  }, [portalUrl]);

  const fetchProfileWithToken = useCallback(
    async (token: string, autoPopulateLogin = false) => {
      if (!token) return;
      setTelemetryToken(token);
      try {
        const res = await fetch(`${portalUrl}/api/desktop/auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telemetryToken: token }),
        });
        if (res.ok) {
          const data = await res.json();
          setIsOnline(true);
          if (data.wsAuthToken) {
            wsAuthTokenRef.current = data.wsAuthToken;
          }
          if (data.featureFlags) {
            setFeatureFlags((prev) => ({ ...prev, ...data.featureFlags }));
          }
          if (data.user) {
            const traineeOnly = Boolean(data.user.isTraineeOnly);
            const tId = String(data.user.traineeId || "");
            const empId = String(
              data.user.employeeId || (traineeOnly ? tId || data.user.id || "" : "")
            );
            const fetchedName = String(data.user.name || "名称未設定");
            const allowCities = Boolean(
              data.user.canSyncCities ?? data.canSyncCities
            );
            isTraineeOnlyRef.current = traineeOnly;
            setIsTraineeOnly(traineeOnly);
            setTraineeId(tId);
            setExpectedEmployeeId(empId);
            profileNameRef.current = fetchedName;
            setUserSteamId(String(data.user.steamId || ""));
            setCanSyncCities(allowCities);

            if (traineeOnly) {
              setLoginId(empId);
              setLoginName(fetchedName);
              if (currentViewRef.current !== "splash") {
                setCurrentView("academy_exam");
              }
            } else if (autoPopulateLogin) {
              setLoginId(empId);
              setLoginName(fetchedName);
              if (currentViewRef.current === "login" && empId) {
                playDtsChime("confirm", voiceEnabledRef.current);
                setCurrentView("pre_departure");
              }
            }

            syncInstalledDlcs(token);
            fetchDispatchAndEvents(token);
            fetchOfficeMessages(token, false);
            fetchHazardHotspots();

            if (allowCities) {
              invoke<CitySyncSummary[]>("sync_official_cities", {
                token,
                force: false,
              })
                .then((resList) => setCitySyncResult(resList))
                .catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch profile with token", e);
      }
    },
    [
      portalUrl,
      syncInstalledDlcs,
      fetchDispatchAndEvents,
      fetchOfficeMessages,
      fetchHazardHotspots,
    ]
  );

  // Splash 3s auto-transition matching real DTS-G1D boot sequence
  useEffect(() => {
    if (currentView !== "splash") return;
    const t = setTimeout(() => {
      setCurrentView(isTraineeOnlyRef.current ? "academy_exam" : "login");
    }, 3000);
    return () => clearTimeout(t);
  }, [currentView]);

  // Initial Startup Effect
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});

    isEnabled()
      .then((enabled) => {
        if (!enabled) return enable();
      })
      .catch(() => {});

    const checkForAppUpdates = async () => {
      try {
        const update = await check();
        if (update?.available) {
          const yes = await ask(
            `新しいバージョン (${update.version}) が利用可能です。\n今すぐアップデートして再起動しますか？`,
            {
              title: "アップデートのお知らせ",
              kind: "info",
              okLabel: "アップデートして再起動",
              cancelLabel: "後で",
            }
          );
          if (yes) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch {
        // Ignore updater errors on dev machines
      }
    };
    checkForAppUpdates();
    const updateInterval = setInterval(checkForAppUpdates, 15 * 60 * 1000);

    invoke<AppConfig>("get_config")
      .then((cfg) => {
        if (cfg.driving_view_pattern) {
          setDrivingPattern(cfg.driving_view_pattern);
        }
        setVoiceEnabled(cfg.voice_enabled ?? true);
        if (cfg.telemetry_token) {
          fetchProfileWithToken(cfg.telemetry_token, false);
        }
      })
      .catch(() => {});

    invoke<WorkState>("get_work_state")
      .then((ws) => setWorkState(ws))
      .catch(() => {});

    invoke<OverlayState>("get_overlay_state")
      .then((ov) => setOverlayState(ov))
      .catch(() => {});

    invoke<CompanionInfo>("get_companion_info")
      .then((ci) => setCompanionInfo(ci))
      .catch(() => {});

    const unlistenAuth = listen<string>("auth_success", (event) => {
      if (event.payload) {
        fetchProfileWithToken(event.payload, true);
      }
    });

    const unlistenWork = listen<WorkState>("work_state_update", (event) => {
      const next = event.payload;
      setWorkState(next);

      if (next.is_430_warning && !alerted430WarnRef.current) {
        alerted430WarnRef.current = true;
        playDtsChime("warning", voiceEnabledRef.current);
        speakJapanese(
          "連続運転時間が3時間30分を経過しました。早めの休憩をお願いします。",
          voiceEnabledRef.current
        );
      }
      if (!next.is_430_warning) {
        alerted430WarnRef.current = false;
      }

      if (next.is_430_violation && !alerted430ViolRef.current) {
        alerted430ViolRef.current = true;
        playDtsChime("critical", voiceEnabledRef.current);
        speakJapanese(
          "連続運転時間が4時間を超過しました。430ルール違反となります。直ちに30分以上の休憩を取ってください。",
          voiceEnabledRef.current
        );
      }
      if (!next.is_430_violation) {
        alerted430ViolRef.current = false;
      }
    });

    const unlistenOverlay = listen<OverlayState>(
      "overlay_state_changed",
      (event) => {
        setOverlayState(event.payload);
      }
    );

    const unlistenProposal = listen<SmartWorkProposal>(
      "smart_work_proposal",
      (event) => {
        const p = event.payload;
        const wt = (p.suggested_work_type || "rest") as WorkType;
        playDtsChime("confirm", voiceEnabledRef.current);
        if (p.auto_applied) {
          speakJapanese(
            `${p.reason}。作業ステータスを自動で切り替えました。`,
            voiceEnabledRef.current
          );
        } else {
          setModalProposal({
            open: true,
            workType: wt,
            title: "通知",
            message: `${p.reason}。作業を開始しますか？`,
            subMessage: "6秒後に自動で確定します",
            countdown: 6,
          });
        }
      }
    );

    const unlistenGEvent = listen<DetectedGEvent>(
      "tachograph_g_event",
      (event) => {
        const gev = event.payload;
        if (gev.kind === "impact") {
          playDtsChime("critical", voiceEnabledRef.current);
          speakJapanese(
            "強い衝撃を検知しました。周囲の安全を確認してください。",
            voiceEnabledRef.current
          );
          if (featureFlagsRef.current.feat_auto_dashcam && telemetryToken) {
            invoke("capture_dashcam_screenshot", {
              token: telemetryToken,
              reason: "衝撃検知オートドラレコ",
              eventId: null,
            }).catch(() => {});
          }
        } else if (gev.kind === "harsh_brake") {
          playDtsChime("warning", voiceEnabledRef.current);
          speakJapanese(
            "急減速を検知しました。車間距離に注意してください。",
            voiceEnabledRef.current
          );
        } else if (gev.kind === "harsh_corner") {
          playDtsChime("warning", voiceEnabledRef.current);
          speakJapanese(
            "急ハンドルを検知しました。",
            voiceEnabledRef.current
          );
        } else if (gev.kind === "harsh_accel") {
          playDtsChime("warning", voiceEnabledRef.current);
        }
      }
    );

    const unlistenCompanionWork = listen<string>(
      "companion_work_command",
      (event) => {
        const wt = event.payload as WorkType;
        invoke<WorkState>("set_detailed_work_type", { workType: wt })
          .then((ws) => {
            setWorkState(ws);
            setActiveWorkDisplayLabel(ws.work_status_label || "");
            setCurrentView(wt === "driving" ? "driving" : "active_work");
          })
          .catch(() => {});
      }
    );

    const unlistenCompanionSos = listen<boolean>(
      "companion_sos_toggle",
      () => {
        const nextSos = !workStateRef.current.is_sos;
        invoke<WorkState>("trigger_sos", {
          active: nextSos,
          reason: "LANコンパニオンからの緊急SOS",
        })
          .then((ws) => setWorkState(ws))
          .catch(() => {});
      }
    );

    const unlistenUploaded = listen<SessionUploadSummary>(
      "tachograph_session_uploaded",
      () => {
        playDtsChime("confirm", voiceEnabledRef.current);
      }
    );

    const unlistenReset = listen("reset_view", () => {
      if (isTraineeOnlyRef.current) {
        setCurrentView("academy_exam");
        return;
      }
      if (workStateRef.current.status === "Idle") {
        setLoginId("");
        setLoginName("乗務員不明");
        setCurrentView("splash");
      }
    });

    return () => {
      clearInterval(updateInterval);
      unlistenAuth.then((f) => f());
      unlistenWork.then((f) => f());
      unlistenOverlay.then((f) => f());
      unlistenProposal.then((f) => f());
      unlistenGEvent.then((f) => f());
      unlistenCompanionWork.then((f) => f());
      unlistenCompanionSos.then((f) => f());
      unlistenUploaded.then((f) => f());
      unlistenReset.then((f) => f());
    };
  }, [fetchProfileWithToken, telemetryToken]);

  // Clock Sync (/api/desktop/time returns { serverTime }) & Wait/Rest Alarm Ticker
  useEffect(() => {
    let timeOffset = 0;

    const syncServerTime = async () => {
      try {
        const start = Date.now();
        const res = await fetch(`${portalUrl}/api/desktop/time`);
        if (res.ok) {
          const data = await res.json();
          const end = Date.now();
          const latency = (end - start) / 2;
          const serverMs = Number(data?.serverTime ?? data?.timestamp);
          if (Number.isFinite(serverMs)) {
            timeOffset = serverMs + latency - end;
          }
          setIsOnline(true);
        } else {
          setIsOnline(false);
        }
      } catch {
        setIsOnline(false);
      }
    };

    syncServerTime();
    const syncTimer = setInterval(syncServerTime, 15000);

    const clockTimer = setInterval(() => {
      const nowMs = Date.now();
      setTime(formatClockHm(nowMs + (Number.isFinite(timeOffset) ? timeOffset : 0)));

      const target = alarmTargetMsRef.current;
      if (target !== null) {
        const diffMs = target - nowMs;
        if (diffMs <= 0) {
          alarmTargetMsRef.current = null;
          setAlarmTargetMs(null);
          setAlarmMinutesRemaining(null);
          setAlarmTriggeredModal(true);
          playDtsChime("critical", voiceEnabledRef.current);
          speakJapanese("設定した時間になりました。", voiceEnabledRef.current);
        } else {
          setAlarmMinutesRemaining(Math.max(1, Math.ceil(diffMs / 60000)));
        }
      }
    }, 1000);

    return () => {
      clearInterval(syncTimer);
      clearInterval(clockTimer);
    };
  }, [portalUrl]);

  // Periodic Office Message & Dispatch Polling
  useEffect(() => {
    if (!telemetryToken) return;
    const poll = setInterval(() => {
      if (featureFlagsRef.current.feat_office_chat) {
        fetchOfficeMessages(telemetryToken, true);
      }
      if (featureFlagsRef.current.feat_dispatch_orders) {
        fetchDispatchAndEvents(telemetryToken);
      }
    }, 30000);
    return () => clearInterval(poll);
  }, [telemetryToken, fetchOfficeMessages, fetchDispatchAndEvents]);

  // 20Hz Telemetry Listener + WebSocket Sender + Real DTS-G1D Driving Transition + Hazard Warning
  useEffect(() => {
    let wsClient: WebSocket | null = null;
    let lastSendTime = 0;
    let unlistenTelemetry: (() => void) | null = null;
    let isReconnecting = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (
        wsClient &&
        (wsClient.readyState === WebSocket.OPEN ||
          wsClient.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const wsUrl = import.meta.env.VITE_WS_URL || "wss://ws.truckers.jp";
      wsClient = new WebSocket(wsUrl);

      wsClient.onopen = () => {
        isReconnecting = false;
        if (
          wsAuthTokenRef.current &&
          wsClient?.readyState === WebSocket.OPEN
        ) {
          wsClient.send(
            JSON.stringify({
              type: "auth",
              token: wsAuthTokenRef.current,
            })
          );
        }
      };

      wsClient.onclose = () => {
        if (!isReconnecting) {
          isReconnecting = true;
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      wsClient.onerror = () => {
        if (wsClient) wsClient.close();
      };
    };

    if (userSteamId) {
      connect();
    }

    listen<TelemetryData>("telemetry_update", (event) => {
      const ev = event.payload;
      setTelemetry(ev);

      const currSpeed = Math.abs(ev.speed || 0);
      const prevSpeed = prevSpeedRef.current;
      prevSpeedRef.current = currSpeed;

      const ws = workStateRef.current;
      if (ws.status !== "Idle" && !ev.paused && currSpeed > 5) {
        if (
          ws.work_type !== "driving" &&
          ws.work_type !== "ferry" &&
          ws.work_type !== "train" &&
          ws.is_smart_auto_mode
        ) {
          const finishLoading = ws.work_type === "loading";
          Promise.resolve(
            finishLoading && !ws.is_loaded
              ? invoke<WorkState>("set_loaded_state", { isLoaded: true })
              : ws
          )
            .then(() =>
              invoke<WorkState>("set_detailed_work_type", {
                workType: "driving",
              })
            )
            .then((updated) => {
              setWorkState(updated);
              setActiveWorkDisplayLabel("");
              if (currentViewRef.current === "active_work") {
                setCurrentView("driving");
              }
            })
            .catch(() => {});
        } else if (
          prevSpeed <= 5 &&
          currentViewRef.current === "work_menu"
        ) {
          setCurrentView("driving");
        }
      }

      // Hazard Hotspot Proximity Warning (feat_hazard_heatmap)
      if (
        featureFlagsRef.current.feat_hazard_heatmap &&
        hazardSpots.length > 0 &&
        currSpeed > 25
      ) {
        const near = hazardSpots.find((h) => {
          const dx = ev.x - h.x;
          const dz = ev.z - h.y;
          return dx * dx + dz * dz < 650 * 650 && h.count >= 2;
        });
        if (near) {
          setHazardWarningText(
            `注意: 急減速多発地点 (${near.count}件)`
          );
          const nowMs = Date.now();
          if (nowMs - lastHazardAlertTimeRef.current > 90000) {
            lastHazardAlertTimeRef.current = nowMs;
            playDtsChime("warning", voiceEnabledRef.current);
            speakJapanese(
              "この先、急ブレーキ多発地点です。速度に注意してください。",
              voiceEnabledRef.current
            );
          }
        } else {
          setHazardWarningText(null);
        }
      }

      const now = Date.now();
      if (userSteamId && now - lastSendTime > 50) {
        lastSendTime = now;
        const displayName =
          loginName !== "乗務員不明"
            ? loginName
            : profileNameRef.current || "Driver";

        const telemetryPayload = {
          steamId: userSteamId,
          name: displayName,
          game: ev.game,
          x: ev.x,
          y: ev.z,
          z: ev.y,
          heading: ev.heading,
          pitch: ev.pitch,
          roll: ev.roll,
          speed: ev.speed,
          rpm: ev.engine_rpm,
          maxRpm: ev.rpm_limit,
          odometer: ev.odometer,
          fuel: ev.fuel,
          fuelCapacity: ev.fuel_capacity,
          cruiseControl: ev.cruise_control,
          brake: ev.brake,
          retarder: ev.retarder,
          gear: ev.gear,
          gLateral: ev.g_lateral,
          gVertical: ev.g_vertical,
          gLongitudinal: ev.g_longitudinal,
          gScore: workStateRef.current.g_score,
          gRank: workStateRef.current.g_rank,
          continuousDrivingSec:
            workStateRef.current.continuous_driving_seconds,
          is430Warning: workStateRef.current.is_430_warning,
          is430Violation: workStateRef.current.is_430_violation,
          isSos: workStateRef.current.is_sos,
          lights: {
            blinkerLeft: Boolean(ev.lblinker),
            blinkerRight: Boolean(ev.rblinker),
            hazard: Boolean(ev.hazard),
            beacon: Boolean(ev.beacon),
            brake: Boolean(ev.brake_light),
            lowBeam: Boolean(ev.low_beam),
            highBeam: Boolean(ev.high_beam),
          },
          trailer_connected: Boolean(ev.trailer_connected),
          trailers:
            ev.trailers && ev.trailers.length > 0
              ? ev.trailers.map((t) => ({
                  index: t.index,
                  connected: t.connected,
                  x: t.x,
                  y: t.y,
                  z: t.altitude,
                  heading: t.heading,
                  pitch: t.pitch,
                  roll: t.roll,
                  bodyType: t.bodyType || undefined,
                  chainType: t.chainType || undefined,
                }))
              : ev.trailer_connected
              ? [
                  {
                    index: 0,
                    connected: true,
                    x: ev.trailer_x ?? 0,
                    y: ev.trailer_z ?? 0,
                    z: ev.trailer_y,
                    heading: ev.trailer_heading ?? 0,
                    pitch: ev.trailer_pitch,
                    roll: ev.trailer_roll,
                    bodyType: ev.trailer_body_type || undefined,
                    chainType: ev.trailer_chain_type || undefined,
                  },
                ]
              : [],
          truck:
            ev.truck_brand || ev.truck_name
              ? {
                  brand: ev.truck_brand || undefined,
                  name: ev.truck_name || undefined,
                  licensePlate: ev.license_plate || undefined,
                }
              : undefined,
          job:
            ev.cargo_name || ev.destination_city || ev.nav_distance
              ? {
                  cargo: ev.cargo_name || undefined,
                  cargoMassKg: ev.cargo_mass || undefined,
                  sourceCity: ev.source_city || undefined,
                  destinationCity: ev.destination_city || undefined,
                  sourceCompany: ev.source_company || undefined,
                  destinationCompany: ev.destination_company || undefined,
                  plannedDistanceKm: ev.planned_distance_km || undefined,
                  navDistanceMeters: ev.nav_distance || undefined,
                  speedLimitKph: ev.speed_limit || undefined,
                  cargoDamage: ev.cargo_damage || undefined,
                }
              : undefined,
          workState: workStateRef.current,
        };

        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
          wsClient.send(
            JSON.stringify({
              type: "telemetry_update",
              ...(wsAuthTokenRef.current
                ? { wsAuthToken: wsAuthTokenRef.current }
                : {}),
              payload: telemetryPayload,
            })
          );
        }

        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "ENJOY_DESKTOP_TELEMETRY",
            payload: telemetryPayload,
          },
          "*"
        );
      }
    }).then((f) => {
      unlistenTelemetry = f;
    });

    return () => {
      if (unlistenTelemetry) unlistenTelemetry();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsClient) {
        wsClient.onclose = null;
        wsClient.close();
      }
    };
  }, [userSteamId, loginName, hazardSpots]);

  const requestNavFullscreen = useCallback(() => {
    if (isFullScreenMapRef.current) {
      playDtsChime("beep", voiceEnabledRef.current);
      setIsFullScreenMap(false);
    } else {
      playDtsChime("beep", voiceEnabledRef.current);
      setNavFullscreenConfirm(true);
    }
  }, []);

  const confirmEnterFullscreenMap = useCallback(() => {
    setNavFullscreenConfirm(false);
    setCurrentView("nav");
    setIsFullScreenMap(true);
    playDtsChime("confirm", voiceEnabledRef.current);
    setNavFullscreenHint(true);
    setTimeout(() => {
      setNavFullscreenHint(false);
    }, 2000);
  }, []);

  // Numpad + / - Hotkeys matching real hardware top physical + / - buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "NumpadAdd" || e.code === "NumpadSubtract") {
        e.preventDefault();
        if (!pressTimer.current) {
          pressTimer.current = setTimeout(() => {
            pressTimer.current = null;
            if (e.code === "NumpadSubtract") {
              if (isFullScreenMapRef.current) {
                setIsFullScreenMap(false);
                playDtsChime("beep", voiceEnabledRef.current);
              } else if (currentViewRef.current === "nav") {
                const target =
                  previousViewRef.current && previousViewRef.current !== "nav"
                    ? previousViewRef.current
                    : "work_menu";
                setCurrentView(target);
              }
            } else if (e.code === "NumpadAdd") {
              if (currentViewRef.current === "nav") {
                requestNavFullscreen();
              } else {
                setPreviousView(currentViewRef.current);
                setCurrentView("nav");
                setNavFullscreenConfirm(true);
              }
            }
          }, 800);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "NumpadAdd" || e.code === "NumpadSubtract") {
        e.preventDefault();
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
          if (
            currentViewRef.current === "nav" &&
            iframeRef.current?.contentWindow
          ) {
            iframeRef.current.contentWindow.postMessage(
              e.code === "NumpadAdd" ? "zoomIn" : "zoomOut",
              "*"
            );
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [requestNavFullscreen]);

  const isGameConnected =
    telemetry.timestamp > 0 &&
    Math.floor(Date.now() / 1000) - telemetry.timestamp <= 3;

  const openLoginBrowser = async () => {
    try {
      await openUrl(`${portalUrl}/auth/desktop`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmLogin = async () => {
    if (!expectedEmployeeId) {
      await openLoginBrowser();
      return;
    }
    if (!loginId) {
      setLoginId(expectedEmployeeId);
    }
    const checkId = loginId || expectedEmployeeId;
    if (checkId === expectedEmployeeId) {
      const resolvedName =
        profileNameRef.current ||
        (loginName !== "乗務員不明" ? loginName : "認証ドライバー");
      setLoginId(checkId);
      setLoginName(resolvedName);
      playDtsChime("confirm", voiceEnabledRef.current);
      speakJapanese(
        `${resolvedName}さん、認証を確認しました。`,
        voiceEnabledRef.current
      );
      setCurrentView(isTraineeOnlyRef.current ? "academy_exam" : "pre_departure");
    } else {
      playDtsChime("warning", voiceEnabledRef.current);
      setLoginId("");
      setLoginName("乗務員不明");
      await message("乗務員番号が一致しません。", {
        title: "認証エラー",
        kind: "error",
      });
    }
  };

  const handleIcCardFastAuth = () => {
    if (!expectedEmployeeId) return;
    const resolvedName =
      profileNameRef.current ||
      (loginName !== "乗務員不明" ? loginName : "認証ドライバー");
    setLoginId(expectedEmployeeId);
    setLoginName(resolvedName);
    playDtsChime("confirm", voiceEnabledRef.current);
    speakJapanese(
      `IC免許証を確認しました。${resolvedName}さん、本日もご安全に。`,
      voiceEnabledRef.current
    );
    setCurrentView(isTraineeOnlyRef.current ? "academy_exam" : "pre_departure");
  };

  const handleDepart = async (twoManMode = false) => {
    try {
      setLastFinishedSummary(null);
      setAiReviewText(null);
      setActiveWorkDisplayLabel("");
      const ws = await invoke<WorkState>("set_detailed_work_type", {
        workType: "driving",
      });
      setWorkState(ws);
      playDtsChime("departure", voiceEnabledRef.current);
      speakJapanese(
        `${
          twoManMode ? "ツーマン運行で" : ""
        }出庫します。安全運転でお願いします。`,
        voiceEnabledRef.current
      );
      const movingNow = Math.abs(telemetry.speed || 0) > 5;
      setCurrentView(movingNow ? "driving" : "work_menu");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectWorkType = async (wt: WorkType, displayLabel: string) => {
    try {
      const ws = await invoke<WorkState>("set_detailed_work_type", {
        workType: wt,
      });
      setWorkState(ws);
      setActiveWorkDisplayLabel(displayLabel || ws.work_status_label || "");
      if (wt === "driving") {
        playDtsChime("confirm", voiceEnabledRef.current);
        setCurrentView("driving");
      } else {
        playDtsChime("confirm", voiceEnabledRef.current);
        speakJapanese(`${displayLabel}を開始します。`, voiceEnabledRef.current);
        setCurrentView("active_work");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinishActiveWork = async () => {
    try {
      const wasLoading = workStateRef.current.work_type === "loading";
      setAlarmTargetMs(null);
      setAlarmMinutesRemaining(null);
      if (wasLoading && !workStateRef.current.is_loaded) {
        await invoke<WorkState>("set_loaded_state", { isLoaded: true });
      }
      const ws = await invoke<WorkState>("set_detailed_work_type", {
        workType: "driving",
      });
      setWorkState(ws);
      setActiveWorkDisplayLabel("");
      playDtsChime("confirm", voiceEnabledRef.current);
      const movingNow = Math.abs(telemetry.speed || 0) > 5;
      setCurrentView(movingNow ? "driving" : "work_menu");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetRoadType = async (roadType: RoadType) => {
    try {
      const ws = await invoke<WorkState>("set_road_type", { roadType });
      setWorkState(ws);
      playDtsChime("beep", voiceEnabledRef.current);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCycleRoadType = async () => {
    const idx = ROAD_CYCLE.indexOf(workState.road_type);
    const next = ROAD_CYCLE[(idx + 1) % ROAD_CYCLE.length];
    await handleSetRoadType(next);
  };

  const handleToggleLoaded = async () => {
    try {
      const ws = await invoke<WorkState>("set_loaded_state", {
        isLoaded: !workState.is_loaded,
      });
      setWorkState(ws);
      playDtsChime("beep", voiceEnabledRef.current);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCaptureDashcam = async () => {
    if (!telemetryToken || isCapturingDashcam) return;
    try {
      setIsCapturingDashcam(true);
      playDtsChime("beep", voiceEnabledRef.current);
      await invoke("capture_dashcam_screenshot", {
        token: telemetryToken,
        reason: "車載機手動撮影",
        eventId: null,
      });
      playDtsChime("confirm", voiceEnabledRef.current);
    } catch (e) {
      console.warn("Dashcam capture error:", e);
    } finally {
      setIsCapturingDashcam(false);
    }
  };

  const handleToggleOverlay = async () => {
    try {
      const next = await invoke<OverlayState>("toggle_overlay_click_through");
      setOverlayState(next);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateOverlay = async (
    enabled: boolean,
    clickThrough: boolean,
    alwaysOnTop: boolean,
    opacity: number
  ) => {
    try {
      const next = await invoke<OverlayState>("set_overlay_mode", {
        enabled,
        clickThrough,
        alwaysOnTop,
        opacity,
      });
      setOverlayState(next);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleVoice = async (enabled: boolean) => {
    setVoiceEnabled(enabled);
    try {
      const cfg = await invoke<AppConfig>("get_config");
      await invoke("save_app_preferences", {
        preferences: { ...cfg, voice_enabled: enabled },
      });
    } catch {
      // Ignore
    }
  };

  const handleToggleSos = async () => {
    const nextActive = !workState.is_sos;
    try {
      const ws = await invoke<WorkState>("trigger_sos", {
        active: nextActive,
        reason: nextActive ? "車載機SOSスイッチ発報" : "SOS解除",
      });
      setWorkState(ws);
      if (nextActive) {
        playDtsChime("critical", voiceEnabledRef.current);
        speakJapanese(
          "緊急SOSを発信しました。管制マップへ現在地を通知しています。",
          voiceEnabledRef.current
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRequestAiReview = useCallback(
    async (overrideMetrics?: {
      distanceKm: number;
      gScore: number;
      gRank: string;
      is430Violation: boolean;
      maxContinuousSec: number;
    }) => {
      if (!telemetryToken) return;
      try {
        setIsRequestingAiReview(true);
        const m = overrideMetrics || {
          distanceKm: workState.distance_driven_km,
          gScore: workState.g_score,
          gRank: workState.g_rank,
          is430Violation: workState.is_430_violation,
          maxContinuousSec: workState.max_continuous_driving_sec,
        };
        const res = await fetch(`${portalUrl}/api/desktop/ai-review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: telemetryToken,
            sessionId: workState.active_session_id || undefined,
            metrics: {
              distanceDrivenKm: m.distanceKm,
              gScore: m.gScore,
              gRank: m.gRank,
              is430Violation: m.is430Violation,
              maxContinuousDrivingSec: m.maxContinuousSec,
              harshAccelCount: workState.harsh_accel_count,
              harshBrakeCount: workState.harsh_brake_count,
              harshCornerCount: workState.harsh_corner_count,
              sourceCity: telemetry.source_city,
              destinationCity: telemetry.destination_city,
              cargoName: telemetry.cargo_name,
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const reviewText = data.aiReviewText || data.review;
          if (reviewText) {
            setAiReviewText(reviewText);
            speakJapanese(reviewText, voiceEnabledRef.current);
          }
        }
      } catch {
        // Ignore offline errors
      } finally {
        setIsRequestingAiReview(false);
      }
    },
    [portalUrl, telemetryToken, workState, telemetry]
  );

  const handleConfirmReturnGarage = async () => {
    try {
      setIsFinishingDuty(true);
      setAlarmTargetMs(null);
      setAlarmMinutesRemaining(null);
      const snapshot = {
        distanceKm: workState.distance_driven_km,
        gScore: workState.g_score,
        gRank: workState.g_rank,
        is430Violation: workState.is_430_violation,
        maxContinuousSec: workState.max_continuous_driving_sec,
        harshTotal:
          workState.harsh_accel_count +
          workState.harsh_brake_count +
          workState.harsh_corner_count +
          workState.impact_count,
      };
      setLastFinishedSummary(snapshot);

      await invoke("set_work_status", { status: "IDLE" });
      const ws = await invoke<WorkState>("get_work_state");
      setWorkState(ws);

      playDtsChime("return", voiceEnabledRef.current);
      speakJapanese("お疲れ様でした。", voiceEnabledRef.current);

      if (featureFlags.feat_ai_review) {
        handleRequestAiReview(snapshot);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFinishingDuty(false);
    }
  };

  const handleRunDiagnostics = useCallback(async () => {
    try {
      setIsRunningDiagnostics(true);
      const rep = await invoke<SystemDiagnosticsReport>(
        "run_system_diagnostics"
      );
      setDiagnosticsReport(rep);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunningDiagnostics(false);
    }
  }, []);

  const handleRepairPlugin = async () => {
    try {
      setIsRepairingPlugin(true);
      const rep = await invoke<SystemDiagnosticsReport>(
        "repair_plugin_installation"
      );
      setDiagnosticsReport(rep);
      playDtsChime("confirm", voiceEnabledRef.current);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRepairingPlugin(false);
    }
  };

  useEffect(() => {
    if (currentView === "diagnostics") {
      handleRunDiagnostics();
    }
  }, [currentView, handleRunDiagnostics]);

  const handleFlushQueue = async () => {
    try {
      await invoke<number>("flush_offline_queue");
      if (currentView === "diagnostics") {
        handleRunDiagnostics();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    action: "accept" | "complete"
  ) => {
    if (!telemetryToken) return;
    try {
      const res = await fetch(`${portalUrl}/api/desktop/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: telemetryToken, orderId, action }),
      });
      if (res.ok) {
        playDtsChime("confirm", voiceEnabledRef.current);
        fetchDispatchAndEvents(telemetryToken);
      }
    } catch {
      // Ignore offline errors
    }
  };

  const handleSendQuickReply = async (
    content: string,
    quickReplyCode: string
  ) => {
    if (!telemetryToken) return;
    try {
      const res = await fetch(`${portalUrl}/api/desktop/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: telemetryToken,
          content,
          messageType: quickReplyCode,
        }),
      });
      if (res.ok) {
        playDtsChime("confirm", voiceEnabledRef.current);
        fetchOfficeMessages(telemetryToken, false);
      }
    } catch {
      // Ignore offline errors
    }
  };

  const handleToggleFeatureFlag = async (key: keyof DesktopFeatureFlags) => {
    const nextFlags = { ...featureFlags, [key]: !featureFlags[key] };
    setFeatureFlags(nextFlags);
    try {
      const cfg = await invoke<AppConfig>("get_config");
      await invoke("save_app_preferences", {
        preferences: {
          ...cfg,
          feature_flags: nextFlags,
        },
      });
      if (telemetryToken) {
        await fetch(`${portalUrl}/api/desktop/flags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: telemetryToken, flags: nextFlags }),
        }).catch(() => {});
      }
    } catch {
      // Ignore errors
    }
  };

  const handleSetAlarmMinutes = (minutes: number | null) => {
    if (minutes === null) {
      setAlarmTargetMs(null);
      setAlarmMinutesRemaining(null);
    } else {
      setAlarmTargetMs(Date.now() + minutes * 60 * 1000);
      setAlarmMinutesRemaining(minutes);
      playDtsChime("confirm", voiceEnabledRef.current);
    }
  };

  const unreadMessageCount = officeMessages.filter(
    (m) => m.direction === "to_vehicle" && !m.isRead
  ).length;
  const activeDispatchCount =
    dispatchOrders.filter((o) => o.status !== "completed").length +
    dispatchEvents.length;

  const showChrome =
    currentView !== "splash" &&
    !isFullScreenMap &&
    !(isTraineeOnly && currentView === "academy_exam");
  const isDrivingMoving =
    currentView === "driving" && Math.abs(telemetry.speed || 0) > 1;
  const isActiveWork = currentView === "active_work";

  const handleReturnFromNav = () => {
    if (workState.status === "Idle") {
      navigateTo(loginId ? "pre_departure" : "login");
    } else {
      navigateTo("work_menu");
    }
  };

  return (
    <DtsShell
      overlayState={overlayState}
      isSos={workState.is_sos}
      topBar={
        showChrome ? (
          <TopStatusBar
            time={time}
            isOnline={isOnline}
            isGameConnected={isGameConnected}
            telemetry={telemetry}
            workState={workState}
            overlayState={overlayState}
            currentView={currentView}
            onToggleOverlay={handleToggleOverlay}
            onToggleSos={handleToggleSos}
          />
        ) : null
      }
      rightSidebar={
        showChrome ? (
          <RightSidebar
            currentView={currentView}
            workState={workState}
            featureFlags={featureFlags}
            unreadMessageCount={unreadMessageCount}
            compact={currentView === "nav"}
            isCapturingDashcam={isCapturingDashcam}
            isDrivingMoving={isDrivingMoving}
            isActiveWork={isActiveWork}
            onNavigate={navigateTo}
            onCycleRoadType={handleCycleRoadType}
            onToggleLoaded={handleToggleLoaded}
            onCaptureDashcam={handleCaptureDashcam}
            onReturnFromNav={handleReturnFromNav}
            onOpenSearchFromNav={() => navigateTo("dispatch")}
          />
        ) : null
      }
      bottomBar={
        showChrome ? (
          <BottomTelemetryBar
            workState={workState}
            onFlushQueue={handleFlushQueue}
          />
        ) : null
      }
    >
      {currentView === "splash" && (
        <SplashView
          appVersion={appVersion}
          onStart={() => setCurrentView("login")}
        />
      )}

      {currentView === "login" && (
        <LoginView
          loginId={loginId}
          loginName={loginName}
          expectedEmployeeId={expectedEmployeeId}
          appVersion={appVersion}
          icLicenseEnabled={featureFlags.feat_ic_license}
          onDigit={(d) => {
            playDtsChime("beep", voiceEnabledRef.current);
            if (loginId.length < 8) setLoginId((v) => v + d);
          }}
          onBackspace={() => {
            playDtsChime("beep", voiceEnabledRef.current);
            setLoginId((v) => v.slice(0, -1));
          }}
          onClear={() => {
            playDtsChime("beep", voiceEnabledRef.current);
            setLoginId("");
          }}
          onConfirmLogin={handleConfirmLogin}
          onIcCardFastAuth={handleIcCardFastAuth}
          onOpenBrowserAuth={openLoginBrowser}
        />
      )}

      {currentView === "pre_departure" && (
        <PreDepartureView
          loginId={loginId}
          loginName={loginName}
          citySyncResult={citySyncResult}
          activeDispatchCount={activeDispatchCount}
          onDepart={handleDepart}
          onBackToLogin={() => navigateTo("login")}
          onNavigate={navigateTo}
        />
      )}

      {currentView === "driving" && (
        <DrivingView
          pattern={drivingPattern}
          loginName={loginName !== "乗務員不明" ? loginName : profileNameRef.current || "ドライバー"}
          telemetry={telemetry}
          workState={workState}
          featureFlags={featureFlags}
          hazardWarningText={hazardWarningText}
          onChangePattern={(p) => setDrivingPattern(p)}
          onSetRoadType={handleSetRoadType}
          onNavigate={navigateTo}
          onScsInputCommand={(cmd) => {
            invoke("send_scs_input_command", { command: cmd }).catch(() => {});
            playDtsChime("beep", voiceEnabledRef.current);
          }}
        />
      )}

      {currentView === "work_menu" && (
        <WorkMenuView
          canSyncCities={canSyncCities}
          onSelectWorkType={handleSelectWorkType}
          onNavigate={navigateTo}
          onOpenDrivingPattern={(p) => {
            setDrivingPattern(p);
            navigateTo("driving");
          }}
          onToggleOverlay={handleToggleOverlay}
          onToggleVoice={() => handleToggleVoice(!voiceEnabled)}
          onSyncDlc={() => syncInstalledDlcs(undefined, true)}
          onSyncCities={() => handleSyncCities(true, false)}
          onFlushQueue={handleFlushQueue}
          onScsInputCommand={(cmd) => {
            invoke("send_scs_input_command", { command: cmd }).catch(() => {});
            playDtsChime("beep", voiceEnabledRef.current);
          }}
          onTriggerSos={handleToggleSos}
        />
      )}

      {currentView === "active_work" && (
        <ActiveWorkView
          workState={workState}
          telemetry={telemetry}
          displayLabel={activeWorkDisplayLabel}
          alarmMinutesRemaining={alarmMinutesRemaining}
          onSetAlarmMinutes={handleSetAlarmMinutes}
          onToggleLoaded={handleToggleLoaded}
          onFinishWork={handleFinishActiveWork}
          onOpenDrivingStatus={() => {
            setDrivingPattern("C");
            navigateTo("driving");
          }}
          onNavigate={navigateTo}
        />
      )}

      {currentView === "nav" && (
        <NavView
          portalUrl={portalUrl}
          iframeRef={iframeRef}
          telemetry={telemetry}
          featureFlags={featureFlags}
          isFullScreenMap={isFullScreenMap}
          hazardWarningText={hazardWarningText}
          activeOrder={
            dispatchOrders.find((o) => o.status === "in_progress") ||
            dispatchOrders[0] ||
            null
          }
          upcomingEvent={dispatchEvents[0] || null}
          onRequestToggleFullScreen={requestNavFullscreen}
          onNavigate={navigateTo}
        />
      )}

      {currentView === "dispatch" && (
        <DispatchView
          orders={dispatchOrders}
          events={dispatchEvents}
          isLoading={isLoadingDispatch}
          onRefresh={() => fetchDispatchAndEvents()}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onBack={navigateBack}
        />
      )}

      {currentView === "contact" && (
        <ContactView
          messages={officeMessages}
          isLoading={isLoadingMessages}
          onRefresh={() => fetchOfficeMessages(undefined, false)}
          onSendQuickReply={handleSendQuickReply}
          onReadAloud={(txt) => speakJapanese(txt, true)}
          onBack={navigateBack}
        />
      )}

      {currentView === "return_garage" && (
        <ReturnGarageView
          workState={workState}
          aiReviewEnabled={featureFlags.feat_ai_review}
          aiReviewText={aiReviewText}
          isRequestingAiReview={isRequestingAiReview}
          isFinishingDuty={isFinishingDuty}
          lastFinishedSummary={lastFinishedSummary}
          onConfirmReturnGarage={handleConfirmReturnGarage}
          onRequestAiReview={() => handleRequestAiReview()}
          onBack={navigateBack}
          onNavigate={navigateTo}
        />
      )}

      {currentView === "diagnostics" && (
        <DiagnosticsView
          report={diagnosticsReport}
          isRunning={isRunningDiagnostics}
          isRepairing={isRepairingPlugin}
          canSyncCities={canSyncCities}
          isSyncingDlc={isSyncingDlc}
          isSyncingCities={isSyncingCities}
          citySyncResult={citySyncResult}
          onRunDiagnostics={handleRunDiagnostics}
          onRepairPlugin={handleRepairPlugin}
          onFlushQueue={handleFlushQueue}
          onSyncDlc={() => syncInstalledDlcs(undefined, true)}
          onSyncCities={() => handleSyncCities(true, false)}
          onBack={navigateBack}
        />
      )}

      {currentView === "settings" && (
        <SettingsView
          smartAutoMode={workState.is_smart_auto_mode}
          voiceEnabled={voiceEnabled}
          drivingPattern={drivingPattern}
          overlayState={overlayState}
          companionInfo={companionInfo}
          featureFlags={featureFlags}
          onToggleSmartAuto={(enabled) => {
            invoke<WorkState>("set_smart_auto_mode", { enabled })
              .then((ws) => setWorkState(ws))
              .catch(() => {});
          }}
          onToggleVoice={handleToggleVoice}
          onChangeDrivingPattern={async (p) => {
            setDrivingPattern(p);
            try {
              const cfg = await invoke<AppConfig>("get_config");
              await invoke("save_app_preferences", {
                preferences: { ...cfg, driving_view_pattern: p },
              });
            } catch {
              // Ignore
            }
          }}
          onUpdateOverlay={handleUpdateOverlay}
          onToggleCompanion={async (enabled) => {
            try {
              const ci = await invoke<CompanionInfo>(
                "set_lan_companion_enabled",
                { enabled }
              );
              setCompanionInfo(ci);
              const cfg = await invoke<AppConfig>("get_config");
              await invoke("save_app_preferences", {
                preferences: { ...cfg, lan_companion_enabled: enabled },
              });
            } catch (e) {
              console.error(e);
            }
          }}
          onToggleFeatureFlag={handleToggleFeatureFlag}
          onBack={navigateBack}
        />
      )}

      {currentView === "academy_exam" && (
        <AcademyExamView
          portalUrl={portalUrl}
          telemetryToken={telemetryToken}
          telemetry={telemetry}
          isGameConnected={isGameConnected}
          isTraineeOnly={isTraineeOnly}
          driverName={
            loginName !== "乗務員不明"
              ? loginName
              : profileNameRef.current || "研修生"
          }
          traineeId={traineeId || expectedEmployeeId}
          onOpenDiagnostics={() => navigateTo("diagnostics")}
          onSwitchAccount={openLoginBrowser}
          onOverlayChange={(next) => setOverlayState(next)}
          onBack={navigateBack}
        />
      )}

      {/* Location-linked Smart Work Proposal Modal */}
      <GreenModal
        open={Boolean(modalProposal?.open)}
        title={modalProposal?.title || "通知"}
        message={modalProposal?.message || ""}
        subMessage={modalProposal?.subMessage}
        autoConfirmSeconds={modalProposal?.countdown}
        onConfirm={() => {
          if (modalProposal) {
            const wt = modalProposal.workType;
            setModalProposal(null);
            handleSelectWorkType(wt, wt);
          }
        }}
        onCancel={() => setModalProposal(null)}
      />

      {/* Nav Fullscreen Confirmation Modal (#70: 234104.png) */}
      <GreenModal
        open={navFullscreenConfirm}
        title="通知"
        message="ナビを全画面表示しますか？"
        cancelLabel="取消"
        confirmLabel="確認"
        onConfirm={confirmEnterFullscreenMap}
        onCancel={() => setNavFullscreenConfirm(false)}
      />

      {/* Nav Fullscreen Return Hint (#71: 234113.png) */}
      <GreenModal
        open={navFullscreenHint}
        title="通知"
        message="ーボタン長押しで戻ります"
        hideButtons
        onConfirm={() => setNavFullscreenHint(false)}
        onCancel={() => setNavFullscreenHint(false)}
      />

      {/* Wait / Rest Alarm Trigger Modal (#60: 233844.png) */}
      <GreenModal
        open={alarmTriggeredModal}
        title="待機中アラーム。"
        message="時間になりました。"
        confirmLabel="確定"
        singleConfirm
        onConfirm={() => setAlarmTriggeredModal(false)}
        onCancel={() => setAlarmTriggeredModal(false)}
      />
    </DtsShell>
  );
}

export default App;
