use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::{AppHandle, State};

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameAudioCaptureInfo {
    pub active: bool,
    pub pid: u32,
    pub process_name: String,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameAudioPcmChunk {
    pub sample_rate: u32,
    pub channels: u16,
    pub pcm16_base64: String,
}

pub struct GameAudioManager {
    pub running: Arc<AtomicBool>,
    pub target_pid: Arc<Mutex<Option<u32>>>,
    pub target_process_name: Arc<Mutex<Option<String>>>,
}

impl Default for GameAudioManager {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            target_pid: Arc::new(Mutex::new(None)),
            target_process_name: Arc::new(Mutex::new(None)),
        }
    }
}

/// ETS2 (eurotrucks2.exe) または ATS (amtrucks.exe) のプロセスを検索する
pub fn find_ets2_process() -> Option<(u32, String)> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut ats_fallback: Option<(u32, String)> = None;
    for (pid, proc_info) in sys.processes() {
        let name = proc_info.name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        if lower == "eurotrucks2.exe" || lower == "eurotrucks2" {
            return Some((pid.as_u32(), name));
        }
        if ats_fallback.is_none() && (lower == "amtrucks.exe" || lower == "amtrucks") {
            ats_fallback = Some((pid.as_u32(), name));
        }
    }
    ats_fallback
}

#[cfg(target_os = "windows")]
mod win_impl {
    use super::{GameAudioManager, GameAudioPcmChunk};
    use base64::{engine::general_purpose::STANDARD as b64, Engine as _};
    use std::collections::VecDeque;
    use std::sync::atomic::Ordering;
    use std::sync::{mpsc, Arc};
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};
    use wasapi::{initialize_mta, AudioClient, Direction, SampleType, StreamMode, WaveFormat};

    pub fn spawn_process_loopback(
        app: AppHandle,
        mgr: &GameAudioManager,
        pid: u32,
        process_name: String,
    ) -> Result<(), String> {
        // Stop any existing capture thread and wait briefly
        mgr.running.store(false, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(60));

        let running = Arc::clone(&mgr.running);
        running.store(true, Ordering::SeqCst);

        if let Ok(mut g) = mgr.target_pid.lock() {
            *g = Some(pid);
        }
        if let Ok(mut g) = mgr.target_process_name.lock() {
            *g = Some(process_name);
        }

        let (init_tx, init_rx) = mpsc::channel::<Result<(), String>>();
        let running_thread = Arc::clone(&running);

        std::thread::spawn(move || {
            let _ = initialize_mta();

            let desired_format = WaveFormat::new(16, 16, &SampleType::Int, 48000, 2, None);
            let mut audio_client = match AudioClient::new_application_loopback_client(pid, true) {
                Ok(c) => c,
                Err(e) => {
                    running_thread.store(false, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!(
                        "ETS2プロセス音声の初期化に失敗しました (Windows 10/11 Build 20348以降が必要): {:?}",
                        e
                    )));
                    return;
                }
            };

            let mode = StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: 200_000,
            };
            if let Err(e) = audio_client.initialize_client(&desired_format, &Direction::Capture, &mode) {
                running_thread.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!(
                    "WASAPI 音声クライアント初期化失敗: {:?}",
                    e
                )));
                return;
            }

            let event_handle = match audio_client.set_get_eventhandle() {
                Ok(h) => h,
                Err(e) => {
                    running_thread.store(false, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!("WASAPI イベント取得失敗: {:?}", e)));
                    return;
                }
            };

            let capture_client = match audio_client.get_audiocaptureclient() {
                Ok(c) => c,
                Err(e) => {
                    running_thread.store(false, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!("WASAPI キャプチャクライアント取得失敗: {:?}", e)));
                    return;
                }
            };

            if let Err(e) = audio_client.start_stream() {
                running_thread.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!("WASAPI ストリーム開始失敗: {:?}", e)));
                return;
            }

            let _ = init_tx.send(Ok(()));

            let block_align = desired_format.get_blockalign() as usize; // 4 bytes (2ch * 16-bit)
            let chunk_bytes: usize = 7680; // 40ms @ 48kHz stereo 16-bit
            let mut queue: VecDeque<u8> = VecDeque::with_capacity(chunk_bytes * 2);

            while running_thread.load(Ordering::SeqCst) {
                let _ = event_handle.wait_for_event(100);
                if !running_thread.load(Ordering::SeqCst) {
                    break;
                }

                loop {
                    match capture_client.get_next_packet_size() {
                        Ok(Some(frames)) if frames > 0 => {
                            let mut tmp = vec![0u8; (frames as usize) * block_align];
                            match capture_client.read_from_device(&mut tmp) {
                                Ok((read_frames, _info)) => {
                                    let valid_bytes = (read_frames as usize) * block_align;
                                    if valid_bytes > 0 {
                                        queue.extend(&tmp[..valid_bytes]);
                                    } else {
                                        break;
                                    }
                                }
                                Err(_) => break,
                            }
                        }
                        _ => break,
                    }
                }

                while queue.len() >= chunk_bytes {
                    let mut out = Vec::with_capacity(chunk_bytes);
                    for _ in 0..chunk_bytes {
                        if let Some(b) = queue.pop_front() {
                            out.push(b);
                        }
                    }
                    let encoded = b64.encode(&out);
                    let _ = app.emit(
                        "academy_game_audio_pcm",
                        GameAudioPcmChunk {
                            sample_rate: 48000,
                            channels: 2,
                            pcm16_base64: encoded,
                        },
                    );
                }
            }

            let _ = audio_client.stop_stream();
        });

        match init_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(err_msg)) => Err(err_msg),
            Err(_) => {
                mgr.running.store(false, Ordering::SeqCst);
                Err("ゲーム音声キャプチャの初期化がタイムアウトしました。".to_string())
            }
        }
    }
}

#[tauri::command]
pub fn start_game_audio_capture(
    app: AppHandle,
    mgr: State<'_, GameAudioManager>,
) -> Result<GameAudioCaptureInfo, String> {
    let Some((pid, process_name)) = find_ets2_process() else {
        return Err(
            "ETS2 (eurotrucks2.exe) が起動していません。ゲームを起動してから技能試験を開始してください。"
                .to_string(),
        );
    };

    #[cfg(target_os = "windows")]
    {
        win_impl::spawn_process_loopback(app, &mgr, pid, process_name.clone())?;
        Ok(GameAudioCaptureInfo {
            active: true,
            pid,
            process_name,
            sample_rate: 48000,
            channels: 2,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, mgr, pid, process_name);
        Err("ゲーム音声限定キャプチャ (WASAPI Application Loopback) は Windows 版デジタコでのみ利用できます。".to_string())
    }
}

#[tauri::command]
pub fn stop_game_audio_capture(mgr: State<'_, GameAudioManager>) -> Result<(), String> {
    mgr.running.store(false, Ordering::SeqCst);
    if let Ok(mut g) = mgr.target_pid.lock() {
        *g = None;
    }
    if let Ok(mut g) = mgr.target_process_name.lock() {
        *g = None;
    }
    Ok(())
}
