import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  RefreshCw,
  ShieldAlert,
  Square,
  UploadCloud,
  Video,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import type {
  AcademyEnvironmentReport,
  AcademyExamStatusResponse,
  AcademyLiveStats,
  OverlayState,
  TelemetryData,
} from "../types/tachograph";

interface AcademyExamViewProps {
  portalUrl: string;
  telemetryToken: string;
  telemetry: TelemetryData;
  isGameConnected: boolean;
  onOverlayChange?: (next: OverlayState) => void;
  onBack: () => void;
}

interface TelemetryStopResult {
  stats: AcademyLiveStats;
  movingIntervals: { startSec: number; endSec: number }[];
  traceGzipBase64: string;
}

interface UploadProgressPayload {
  examId: string;
  phase: string;
  chunkIndex: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
}

type ExamStep = "ready" | "recording" | "uploading" | "done" | "error";

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export const AcademyExamView: React.FC<AcademyExamViewProps> = ({
  portalUrl,
  telemetryToken,
  telemetry,
  isGameConnected,
  onOverlayChange,
  onBack,
}) => {
  const [step, setStep] = useState<ExamStep>("ready");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [envReport, setEnvReport] = useState<AcademyEnvironmentReport | null>(
    null
  );
  const [portalStatus, setPortalStatus] =
    useState<AcademyExamStatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active recording session state
  const [activeExamId, setActiveExamId] = useState<string>("");
  const [activeExamCode, setActiveExamCode] = useState<string>("");
  const [liveStats, setLiveStats] = useState<AcademyLiveStats | null>(null);
  const [videoHasAudio, setVideoHasAudio] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressPayload | null>(null);

  // Pending retry state if upload failed
  const [pendingUploadArgs, setPendingUploadArgs] = useState<{
    examId: string;
    fileName: string;
    mimeType: string;
    completePayloadJson: string;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const recordingStartMsRef = useRef<number>(0);
  const recordingDimsRef = useRef<{
    width: number;
    height: number;
    hasAudio: boolean;
    mimeType: string;
    ext: string;
  }>({
    width: 1280,
    height: 720,
    hasAudio: false,
    mimeType: "video/webm",
    ext: "webm",
  });

  const refreshDiagnostics = useCallback(async () => {
    setLoadingStatus(true);
    setErrorMsg(null);
    try {
      const env = await invoke<AcademyEnvironmentReport>(
        "inspect_academy_environment"
      );
      setEnvReport(env);

      if (!telemetryToken) {
        setErrorMsg("デジタコの認証トークンが未設定です。ログインしてください。");
        return;
      }

      const res = await fetch(`${portalUrl}/api/desktop/academy-exam/status`, {
        headers: {
          Authorization: `Bearer ${telemetryToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || "ポータル受験資格の確認に失敗しました。");
      } else {
        setPortalStatus(data as AcademyExamStatusResponse);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "環境診断中にエラーが発生しました。");
    } finally {
      setLoadingStatus(false);
    }
  }, [portalUrl, telemetryToken]);

  useEffect(() => {
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  // Poll live stats while recording
  useEffect(() => {
    if (step !== "recording") return;
    const timer = setInterval(() => {
      invoke<AcademyLiveStats>("get_academy_exam_live_stats")
        .then((s) => setLiveStats(s))
        .catch(() => {});
    }, 500);
    return () => clearInterval(timer);
  }, [step]);

  // Listen to upload progress from Rust
  useEffect(() => {
    const unlistenPromise = listen<UploadProgressPayload>(
      "academy_upload_progress",
      (ev) => {
        setUploadProgress(ev.payload);
      }
    );
    return () => {
      unlistenPromise.then((u) => u()).catch(() => {});
    };
  }, []);

  const stopTracks = () => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      mediaStreamRef.current = null;
    }
  };

  const restoreOverlay = async () => {
    try {
      const next = await invoke<OverlayState>("set_overlay_mode", {
        enabled: false,
        clickThrough: false,
        alwaysOnTop: false,
        opacity: 0.92,
      });
      onOverlayChange?.(next);
    } catch {
      // ignore
    }
  };

  const handleStartExam = async () => {
    if (!telemetryToken) {
      setErrorMsg("認証トークンがありません。");
      return;
    }
    setErrorMsg(null);

    try {
      // Re-inspect environment right before starting
      const freshEnv = await invoke<AcademyEnvironmentReport>(
        "inspect_academy_environment"
      );
      setEnvReport(freshEnv);

      if (!freshEnv.modsClean) {
        setErrorMsg(
          `ETS2に有効なMODが ${freshEnv.activeModsCount} 件検出されました。すべて無効化してから再診断してください。`
        );
        return;
      }

      // Request screen + system audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // @ts-ignore Chromium WebView2 hint
          systemAudio: "include",
        } as any,
      });

      const videoTrack = stream.getVideoTracks()[0];
      const audioTracks = stream.getAudioTracks();
      const hasAudio = audioTracks.length > 0;
      const settings = videoTrack?.getSettings?.() || {};
      const width = Number(settings.width) || 1280;
      const height = Number(settings.height) || 720;

      if (!hasAudio) {
        const proceedWithoutAudio = window.confirm(
          "システム音声が共有されていません。\n受験ルールでは「音声の共有を有効化」が推奨されています。このまま続行しますか？（キャンセルすると画面共有選択からやり直せます）"
        );
        if (!proceedWithoutAudio) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
      }

      const prereqVerified =
        freshEnv.prereqBooksVerifiedLocal ||
        (portalStatus?.steamAcademy1CompletedCount ?? 0) >= 4;
      const prereqSource = freshEnv.prereqBooksVerifiedLocal
        ? "sii_local"
        : (portalStatus?.steamAcademy1CompletedCount ?? 0) >= 4
        ? "steam_achievements"
        : "unverified";

      // Create submission on portal
      const startRes = await fetch(
        `${portalUrl}/api/desktop/academy-exam/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${telemetryToken}`,
          },
          body: JSON.stringify({
            modsClean: freshEnv.modsClean,
            activeModsCount: freshEnv.activeModsCount,
            activeMods: freshEnv.activeMods,
            prereqBooksVerified: prereqVerified,
            prereqSource,
            siiBeforeHash: freshEnv.siiHash,
            siiBeforeMtime: freshEnv.siiMtime,
            videoHasAudio: hasAudio,
            videoWidth: width,
            videoHeight: height,
          }),
        }
      );

      const startData = await startRes.json();
      if (!startRes.ok || !startData?.submissionId) {
        stream.getTracks().forEach((t) => t.stop());
        setErrorMsg(startData?.error || "試験セッションの開始に失敗しました。");
        return;
      }

      const examId: string = startData.submissionId;
      const examCode: string = startData.examCode;

      // Pick best supported codec
      const preferredTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      const mimeType =
        preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ||
        "video/webm";
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";

      recordingDimsRef.current = { width, height, hasAudio, mimeType, ext };
      setVideoHasAudio(hasAudio);
      setActiveExamId(examId);
      setActiveExamCode(examCode);

      await invoke("academy_video_begin", { examId, ext });
      await invoke("start_academy_exam_telemetry", { examId });

      writeChainRef.current = Promise.resolve();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          const blob = ev.data;
          writeChainRef.current = writeChainRef.current.then(async () => {
            const buf = await blob.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buf));
            await invoke("academy_video_append_chunk", { examId, bytes });
          });
        }
      };

      if (videoTrack) {
        videoTrack.onended = () => {
          // User clicked native "Stop sharing"
          if (mediaRecorderRef.current?.state === "recording") {
            void handleFinishAndSubmit();
          }
        };
      }

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingStartMsRef.current = Date.now();
      recorder.start(2000);
      setStep("recording");

      // Enable compact overlay so examCode & stationary/moving badge stays visible
      try {
        const nextOv = await invoke<OverlayState>("set_overlay_mode", {
          enabled: true,
          clickThrough: false,
          alwaysOnTop: true,
          opacity: 0.9,
        });
        onOverlayChange?.(nextOv);
      } catch {
        // ignore
      }
    } catch (err: any) {
      stopTracks();
      setErrorMsg(
        err?.name === "NotAllowedError"
          ? "画面共有がキャンセルされました。"
          : err?.message || "録画の開始に失敗しました。"
      );
    }
  };

  const executeUpload = async (args: {
    examId: string;
    fileName: string;
    mimeType: string;
    completePayloadJson: string;
  }) => {
    setStep("uploading");
    setErrorMsg(null);
    setPendingUploadArgs(args);

    try {
      await invoke("academy_upload_submission", {
        portalUrl,
        token: telemetryToken,
        examId: args.examId,
        fileName: args.fileName,
        mimeType: args.mimeType,
        completePayloadJson: args.completePayloadJson,
      });
      setPendingUploadArgs(null);
      setStep("done");
      await refreshDiagnostics();
    } catch (err: any) {
      setStep("error");
      setErrorMsg(
        err?.message ||
          "アップロードに失敗しました。録画はローカルに保存されていますので再送信できます。"
      );
    }
  };

  const handleFinishAndSubmit = async () => {
    if (!activeExamId) return;
    setStep("uploading");
    setErrorMsg(null);

    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          const prevOnStop = rec.onstop;
          rec.onstop = (ev) => {
            if (typeof prevOnStop === "function") prevOnStop.call(rec, ev);
            resolve();
          };
          rec.stop();
        });
      }
      stopTracks();
      await writeChainRef.current;
      await restoreOverlay();

      const telResult = await invoke<TelemetryStopResult>(
        "stop_academy_exam_telemetry"
      );
      const afterEnv = await invoke<AcademyEnvironmentReport>(
        "inspect_academy_environment"
      );
      setEnvReport(afterEnv);

      await invoke("academy_video_finalize", { examId: activeExamId });

      const durationSec = Math.max(
        1,
        Math.round((Date.now() - recordingStartMsRef.current) / 1000)
      );
      const { width, height, hasAudio, mimeType, ext } =
        recordingDimsRef.current;
      const fileName = `${activeExamCode}_${activeExamId}.${ext}`;

      const completePayload = {
        durationSec,
        modsClean: afterEnv.modsClean,
        siiAfterHash: afterEnv.siiHash,
        siiAfterMtime: afterEnv.siiMtime,
        siiDiff: {
          completedScenariosCount: afterEnv.completedScenarios.length,
          completedScenarios: afterEnv.completedScenarios.slice(0, 40),
        },
        telemetrySampleCount: telResult.stats.sampleCount,
        movingSeconds: telResult.stats.movingSeconds,
        stationarySeconds: telResult.stats.stationarySeconds,
        maxSpeedKmh: telResult.stats.maxSpeedKmh,
        gearSwitchCount: telResult.stats.gearSwitchCount,
        reverseSeconds: telResult.stats.reverseSeconds,
        maxForwardG: telResult.stats.maxForwardG,
        maxBrakeG: telResult.stats.maxBrakeG,
        maxLateralG: telResult.stats.maxLateralG,
        impactCount: telResult.stats.impactCount,
        startTruckDamage: telResult.stats.startTruckDamage,
        endTruckDamage: telResult.stats.currentTruckDamage,
        damageDelta: telResult.stats.damageDelta,
        blinkerUsageCount: telResult.stats.blinkerUsageCount,
        hazardUsageCount: telResult.stats.hazardUsageCount,
        movingIntervals: telResult.movingIntervals,
        traceGzipBase64: telResult.traceGzipBase64,
        fileName,
        mimeType,
        videoHasAudio: hasAudio,
        videoWidth: width,
        videoHeight: height,
      };

      await executeUpload({
        examId: activeExamId,
        fileName,
        mimeType,
        completePayloadJson: JSON.stringify(completePayload),
      });
    } catch (err: any) {
      await restoreOverlay();
      setStep("error");
      setErrorMsg(err?.message || "試験データの終了処理に失敗しました。");
    }
  };

  const handleAbortExam = async () => {
    if (!activeExamId) return;
    if (!window.confirm("受験を中止しますか？（15秒未満の場合は回数を消費しません）")) {
      return;
    }

    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stop();
      }
      stopTracks();
      await writeChainRef.current;
      await invoke("stop_academy_exam_telemetry").catch(() => {});
      await invoke("academy_cleanup_local_video", { examId: activeExamId }).catch(
        () => {}
      );
      await restoreOverlay();

      const durationSec = Math.max(
        0,
        Math.round((Date.now() - recordingStartMsRef.current) / 1000)
      );
      await fetch(
        `${portalUrl}/api/desktop/academy-exam/${activeExamId}/abort`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${telemetryToken}`,
          },
          body: JSON.stringify({
            durationSec,
            reason: "ユーザーによる中止",
          }),
        }
      );

      setActiveExamId("");
      setActiveExamCode("");
      setStep("ready");
      await refreshDiagnostics();
    } catch (err: any) {
      setErrorMsg(err?.message || "中止処理に失敗しました。");
    }
  };

  const prereqOk =
    Boolean(envReport?.prereqBooksVerifiedLocal) ||
    (portalStatus?.steamAcademy1CompletedCount ?? 0) >= 4;
  const canStart =
    Boolean(portalStatus?.eligible) &&
    Boolean(envReport?.modsClean) &&
    !loadingStatus;

  return (
    <div className="flex-1 bg-[#0c0f1a] text-white flex flex-col min-h-0 overflow-hidden">
      {/* Subheader */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#14182a] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={step === "recording" || step === "uploading"}
            onClick={onBack}
            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs font-bold flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>戻る</span>
          </button>
          <span className="text-sm font-black tracking-wide">
            ドライビングアカデミー 技能試験
          </span>
        </div>

        <button
          type="button"
          disabled={loadingStatus || step === "recording" || step === "uploading"}
          onClick={refreshDiagnostics}
          className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs font-bold flex items-center gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
          <span>再診断</span>
        </button>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {step === "recording" && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border-2 border-red-500 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white font-black animate-pulse">
                  <CircleDot className="w-3 h-3" /> REC
                </span>
                <span className="font-mono font-black text-sm">
                  {activeExamCode}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-sm font-black">
                {videoHasAudio ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-amber-400" />
                )}
                <span>{formatClock(liveStats?.elapsedSec ?? 0)}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-black/40">
                <div className="text-[10px] text-zinc-400">速度</div>
                <div className="font-mono font-black text-sm">
                  {Math.abs(telemetry.speed).toFixed(1)}
                </div>
              </div>
              <div className="p-2 rounded bg-black/40">
                <div className="text-[10px] text-zinc-400">視点制限</div>
                <div
                  className={`font-bold text-[11px] ${
                    liveStats?.isMovingNow ? "text-sky-400" : "text-emerald-400"
                  }`}
                >
                  {liveStats?.isMovingNow ? "車内のみ" : "全視点可"}
                </div>
              </div>
              <div className="p-2 rounded bg-black/40">
                <div className="text-[10px] text-zinc-400">切り返し</div>
                <div className="font-mono font-black text-sm">
                  {liveStats?.gearSwitchCount ?? 0}回
                </div>
              </div>
              <div className="p-2 rounded bg-black/40">
                <div className="text-[10px] text-zinc-400">ダメージ増</div>
                <div className="font-mono font-black text-sm">
                  +{((liveStats?.damageDelta ?? 0) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleFinishAndSubmit}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-1.5"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>試験終了＆自動提出</span>
              </button>
              <button
                type="button"
                onClick={handleAbortExam}
                className="px-4 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-bold"
              >
                中止
              </button>
            </div>
          </div>
        )}

        {step === "uploading" && (
          <div className="p-4 rounded-xl bg-blue-950/50 border border-blue-500/40 space-y-2.5">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-400 animate-bounce" />
                録画・テレメトリーデータをアップロード中...
              </span>
              <span className="font-mono">
                {uploadProgress ? `${uploadProgress.percent.toFixed(1)}%` : "準備中..."}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-black/50 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${uploadProgress?.percent ?? 10}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-300">
              アプリを閉じずにお待ちください（8MBチャンク分割送信中）。
            </p>
          </div>
        )}

        {step === "error" && pendingUploadArgs && (
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-2">
            <span>ローカルに録画が保持されています。通信回復後に再送信できます。</span>
            <button
              type="button"
              onClick={() => executeUpload(pendingUploadArgs)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-black shrink-0"
            >
              再送信する
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 space-y-1">
            <div className="font-black text-emerald-300 flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>提出完了！Google Drive 保存 ＆ AI一次チェックを開始しました</span>
            </div>
            <p className="text-[11px] text-emerald-100/90">
              AI一次チェック完了後、指導員が最終審査を行いポータル・Discordでお知らせします。
            </p>
          </div>
        )}

        {step === "ready" && (
          <>
            {/* Pre-flight Check Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2.5 rounded-lg border ${
                  portalStatus?.isWrittenPassed
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}
              >
                <div className="text-[10px] text-zinc-400">学科研修 / 回数制限</div>
                <div className="font-bold mt-0.5 flex items-center gap-1">
                  {portalStatus?.eligible ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span>
                    {portalStatus
                      ? `本日 ${portalStatus.todayAttempts}/${portalStatus.dailyLimit} ・ 残り ${portalStatus.remainingAttempts}/${portalStatus.totalLimit}`
                      : "確認中..."}
                  </span>
                </div>
                {portalStatus?.ineligibleReason && (
                  <div className="text-[10px] text-red-300 mt-0.5">
                    {portalStatus.ineligibleReason}
                  </div>
                )}
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  envReport?.modsClean
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}
              >
                <div className="text-[10px] text-zinc-400">MOD無効化検査</div>
                <div className="font-bold mt-0.5 flex items-center gap-1">
                  {envReport?.modsClean ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span>
                    {!envReport
                      ? "検査中..."
                      : !envReport.gameLogFound
                      ? "game.log.txt 未検出"
                      : envReport.modsClean
                      ? "MOD 0件 (正常)"
                      : `MOD ${envReport.activeModsCount}件検出`}
                  </span>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  prereqOk
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-amber-500/10 border-amber-500/30"
                }`}
              >
                <div className="text-[10px] text-zinc-400">前提「運転の基本 1〜4」</div>
                <div className="font-bold mt-0.5 flex items-center gap-1">
                  {prereqOk ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>
                    {prereqOk
                      ? "完了確認済"
                      : `未確認 (.sii ${envReport?.completedScenarios.length ?? 0}件 / Steam ${portalStatus?.steamAcademy1CompletedCount ?? 0}件)`}
                  </span>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  isGameConnected
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-amber-500/10 border-amber-500/30"
                }`}
              >
                <div className="text-[10px] text-zinc-400">ETS2 テレメトリー接続</div>
                <div className="font-bold mt-0.5">
                  {isGameConnected ? "✅ 接続中 (記録可能)" : "⚠️ ゲーム未起動/待機中"}
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-zinc-300 leading-relaxed">
              <strong className="text-white">受験ルール：</strong>
              課題は <strong>「トラック運転の基本 - 5. 最終試験」</strong> です。
              <strong>運転中はインテリア／リーンアウト視点のみ</strong>、完全静止時（0 km/h）のみ全視点を使用できます。
              開始時の画面共有ダイアログで <strong>「画面全体」＋「システム音声を共有」</strong> を選択してください。
            </div>

            <button
              type="button"
              disabled={!canStart}
              onClick={handleStartExam}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff1155] to-[#ff3377] hover:opacity-95 disabled:opacity-40 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              <Video className="w-4 h-4" />
              <span>画面共有を選択して技能試験を開始する</span>
            </button>
          </>
        )}

        {/* Recent Submissions */}
        {portalStatus && portalStatus.submissions.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-bold text-zinc-400">直近の提出履歴</div>
            {portalStatus.submissions.slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-mono font-bold mr-2">{s.examCode}</span>
                  <span className="text-zinc-400">
                    {s.attemptNumber}回目 ・ 切返{s.gearSwitchCount}回
                  </span>
                  {s.instructorComment && (
                    <div className="text-[10px] text-zinc-300 mt-0.5 line-clamp-1">
                      指導員: {s.instructorComment}
                    </div>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-bold text-[10px] shrink-0 ${
                    s.status === "passed"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : s.status === "failed"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {s.statusLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
