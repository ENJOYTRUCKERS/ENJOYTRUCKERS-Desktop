pub mod city_extractor;
pub mod companion_server;
pub mod dashcam;
pub mod overlay;
pub mod plugin_manager;
pub mod recorder;
pub mod safety_analyzer;
pub mod telemetry;

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};

use plugin_manager::{fix_plugin_config, update_plugin_token};
use recorder::{SessionRecorder, TachographEventEntry};
use safety_analyzer::{DetectedGEvent, SafetyAnalyzer};
use telemetry::{
    now_unix_secs, read_app_config, unix_secs_to_iso8601, write_app_config, AppConfig, RoadType,
    TelemetryData, WorkState, WorkStatus, WorkType, PORTAL_BASE_URL,
};

pub struct AppState {
    pub telemetry: Arc<Mutex<TelemetryData>>,
    pub work_state: Arc<Mutex<WorkState>>,
    pub safety: Arc<Mutex<SafetyAnalyzer>>,
    pub recorder: Arc<Mutex<SessionRecorder>>,
    pub last_tick: Mutex<Instant>,
    pub prev_paused: Mutex<bool>,
    pub prev_sim_time: Mutex<f64>,
    pub last_gameplay_seq: Mutex<u64>,
    pub last_smart_proposal_unix: Mutex<u64>,
}

#[derive(serde::Serialize, Clone)]
pub struct SmartWorkProposal {
    pub suggested_work_type: String,
    pub reason: String,
    pub auto_applied: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct SessionUploadSummary {
    pub session_id: String,
    pub flushed: usize,
    pub remaining: usize,
}

fn work_type_to_status(wt: &WorkType) -> WorkStatus {
    match wt {
        WorkType::Idle => WorkStatus::Idle,
        WorkType::Rest | WorkType::Break | WorkType::Ferry | WorkType::Train => WorkStatus::Resting,
        _ => WorkStatus::Working,
    }
}

fn sync_work_state_from_safety(ws: &mut WorkState, safety: &SafetyAnalyzer, current_odometer: f64) {
    let dist_km = if ws.start_odometer > 0.0 && current_odometer >= ws.start_odometer {
        ((current_odometer - ws.start_odometer) * 100.0).round() / 100.0
    } else {
        ws.distance_driven_km
    };
    ws.distance_driven_km = dist_km;
    ws.continuous_driving_seconds = safety.continuous_driving_sec;
    ws.total_driving_seconds = safety.total_driving_sec;
    ws.current_break_seconds = safety.current_non_driving_streak_sec;
    ws.total_break_seconds = safety.total_valid_break_sec;
    ws.break_bank_seconds = safety.break_bank_sec;
    ws.max_continuous_driving_sec = safety.max_continuous_driving_sec;
    ws.is_430_warning = safety.is_430_warning;
    ws.is_430_violation = safety.is_430_violation;
    ws.violation_430_count = if safety.is_430_violation { 1 } else { 0 };
    ws.live_g_lat = safety.smoothed_g_lat;
    ws.live_g_vert = safety.smoothed_g_vert;
    ws.live_g_long = safety.smoothed_g_long;
    ws.max_forward_g = safety.max_forward_g;
    ws.max_brake_g = safety.max_brake_g;
    ws.max_lateral_g = safety.max_lateral_g;
    ws.max_vertical_g = safety.max_vertical_g;
    ws.harsh_accel_count = safety.harsh_accel_count;
    ws.harsh_brake_count = safety.harsh_brake_count;
    ws.harsh_corner_count = safety.harsh_corner_count;
    ws.high_jerk_count = safety.high_jerk_count;
    ws.impact_count = safety.impact_count;
    ws.g_score = safety.g_score(dist_km);
    ws.g_rank = safety.g_rank(dist_km).to_string();
}

fn apply_work_transition(
    app: &AppHandle,
    state: &AppState,
    new_work_type: WorkType,
) -> Result<WorkState, String> {
    let tel_snapshot = state
        .telemetry
        .lock()
        .map(|t| t.clone())
        .unwrap_or_default();
    let cfg = read_app_config(app);
    let new_status = work_type_to_status(&new_work_type);
    let mut session_to_flush: Option<String> = None;

    {
        let mut ws = state.work_state.lock().map_err(|e| e.to_string())?;
        let mut safety = state.safety.lock().map_err(|e| e.to_string())?;
        let mut rec = state.recorder.lock().map_err(|e| e.to_string())?;

        if new_status == WorkStatus::Idle {
            if rec.active {
                let prev_sid = rec.session_id.clone();
                let dist_km = (tel_snapshot.odometer - ws.start_odometer).max(0.0);
                let summary_json = safety.to_summary_json(dist_km);
                if rec
                    .finalize_payload(app, &cfg.telemetry_token, &tel_snapshot, summary_json)
                    .is_ok()
                {
                    session_to_flush = Some(prev_sid);
                }
            }
            safety.reset();
            let keep_smart = ws.is_smart_auto_mode;
            let keep_road = ws.road_type.clone();
            *ws = WorkState::default();
            ws.is_smart_auto_mode = keep_smart;
            ws.road_type = keep_road;
            ws.pending_queue_count = recorder::count_pending_queue_files(app);
        } else {
            if !rec.active {
                ws.start_odometer = tel_snapshot.odometer;
                ws.max_speed = 0.0;
                ws.work_seconds = 0;
                ws.rest_seconds = 0;
                let sid = rec.begin_session(
                    app,
                    &tel_snapshot,
                    new_work_type.clone(),
                    ws.road_type.clone(),
                    ws.is_loaded,
                    ws.is_smart_auto_mode,
                );
                ws.active_session_id = sid;
            } else if ws.work_type != new_work_type {
                rec.switch_work_log(
                    app,
                    &tel_snapshot,
                    new_work_type.clone(),
                    ws.is_loaded,
                    ws.road_type.clone(),
                );
            }
            ws.status = new_status;
            ws.work_status_label = new_work_type.ja_label().to_string();
            ws.work_type = new_work_type;
            sync_work_state_from_safety(&mut ws, &safety, tel_snapshot.odometer);
            ws.pending_queue_count = recorder::count_pending_queue_files(app);
        }
    }

    if let Ok(mut last_tick) = state.last_tick.lock() {
        *last_tick = Instant::now();
    }

    let snapshot = state
        .work_state
        .lock()
        .map(|w| w.clone())
        .map_err(|e| e.to_string())?;

    let _ = app.emit("work_state_update", &snapshot);

    if let Some(sid) = session_to_flush {
        let app_clone = app.clone();
        thread::spawn(move || {
            let (flushed, remaining) = recorder::flush_pending_uploads(&app_clone);
            let st = app_clone.state::<AppState>();
            if let Ok(mut ws) = st.work_state.lock() {
                ws.pending_queue_count = remaining;
                let snap = ws.clone();
                drop(ws);
                let _ = app_clone.emit("work_state_update", &snap);
            }
            let _ = app_clone.emit(
                "tachograph_session_uploaded",
                SessionUploadSummary {
                    session_id: sid,
                    flushed,
                    remaining,
                },
            );
        });
    }

    Ok(snapshot)
}

#[tauri::command]
fn get_telemetry(state: State<'_, AppState>) -> TelemetryData {
    state
        .telemetry
        .lock()
        .map(|d| d.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn get_work_state(state: State<'_, AppState>) -> WorkState {
    state
        .work_state
        .lock()
        .map(|w| w.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn set_work_status(
    status: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let new_type = match status.trim().to_ascii_uppercase().as_str() {
        "WORKING" => WorkType::Driving,
        "RESTING" => WorkType::Rest,
        "IDLE" => WorkType::Idle,
        other => WorkType::from_str_lossy(other),
    };
    apply_work_transition(&app, &state, new_type)?;
    Ok(())
}

#[tauri::command]
fn set_detailed_work_type(
    work_type: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkState, String> {
    let parsed = WorkType::from_str_lossy(&work_type);
    apply_work_transition(&app, &state, parsed)
}

#[tauri::command]
fn set_road_type(
    road_type: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkState, String> {
    let parsed = RoadType::from_str_lossy(&road_type);
    let tel_snapshot = state
        .telemetry
        .lock()
        .map(|t| t.clone())
        .unwrap_or_default();

    let snapshot = {
        let mut ws = state.work_state.lock().map_err(|e| e.to_string())?;
        if ws.road_type != parsed {
            ws.road_type = parsed;
            if let Ok(mut rec) = state.recorder.lock() {
                if rec.active {
                    rec.switch_work_log(
                        &app,
                        &tel_snapshot,
                        ws.work_type.clone(),
                        ws.is_loaded,
                        ws.road_type.clone(),
                    );
                }
            }
        }
        ws.clone()
    };

    let _ = app.emit("work_state_update", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn set_loaded_state(
    is_loaded: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkState, String> {
    let tel_snapshot = state
        .telemetry
        .lock()
        .map(|t| t.clone())
        .unwrap_or_default();

    let snapshot = {
        let mut ws = state.work_state.lock().map_err(|e| e.to_string())?;
        if ws.is_loaded != is_loaded {
            ws.is_loaded = is_loaded;
            if let Ok(mut rec) = state.recorder.lock() {
                if rec.active {
                    rec.switch_work_log(
                        &app,
                        &tel_snapshot,
                        ws.work_type.clone(),
                        ws.is_loaded,
                        ws.road_type.clone(),
                    );
                }
            }
        }
        ws.clone()
    };

    let _ = app.emit("work_state_update", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn set_smart_auto_mode(
    enabled: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkState, String> {
    let mut cfg = read_app_config(&app);
    cfg.smart_auto_mode = enabled;
    write_app_config(&app, &cfg)?;

    let snapshot = {
        let mut ws = state.work_state.lock().map_err(|e| e.to_string())?;
        ws.is_smart_auto_mode = enabled;
        ws.clone()
    };
    let _ = app.emit("work_state_update", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn trigger_sos(
    active: bool,
    reason: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkState, String> {
    let tel_snapshot = state
        .telemetry
        .lock()
        .map(|t| t.clone())
        .unwrap_or_default();
    let reason_text = reason.unwrap_or_else(|| {
        if active {
            "DTS-G1D3 緊急SOS発信".to_string()
        } else {
            String::new()
        }
    });

    let snapshot = {
        let mut ws = state.work_state.lock().map_err(|e| e.to_string())?;
        ws.is_sos = active;
        ws.sos_message = reason_text.clone();
        ws.clone()
    };
    let _ = app.emit("work_state_update", &snapshot);

    let cfg = read_app_config(&app);
    let token = cfg.telemetry_token.trim().to_string();
    if !token.is_empty() {
        thread::spawn(move || {
            if let Ok(client) = reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(8))
                .build()
            {
                let payload = serde_json::json!({
                    "active": active,
                    "reason": reason_text,
                    "x": tel_snapshot.x,
                    "y": tel_snapshot.y,
                    "z": tel_snapshot.z,
                    "speed": tel_snapshot.speed.abs(),
                    "truckName": format!("{} {}", tel_snapshot.truck_brand, tel_snapshot.truck_name).trim(),
                });
                let _ = client
                    .post(format!("{}/api/desktop/sos", PORTAL_BASE_URL))
                    .header("Authorization", format!("Bearer {}", token))
                    .json(&payload)
                    .send();
            }
        });
    }

    Ok(snapshot)
}

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    read_app_config(&app)
}

#[tauri::command]
fn set_config(token: String, app: AppHandle) -> Result<(), String> {
    let mut config = read_app_config(&app);
    config.telemetry_token = token.clone();
    write_app_config(&app, &config)?;

    thread::spawn(move || {
        update_plugin_token(&token);
    });

    Ok(())
}

#[tauri::command]
fn save_app_preferences(
    preferences: AppConfig,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AppConfig, String> {
    let existing = read_app_config(&app);
    let mut merged = preferences;
    if merged.telemetry_token.trim().is_empty() && !existing.telemetry_token.trim().is_empty() {
        merged.telemetry_token = existing.telemetry_token;
    }
    write_app_config(&app, &merged)?;

    if let Ok(mut ws) = state.work_state.lock() {
        ws.is_smart_auto_mode = merged.smart_auto_mode;
        let snapshot = ws.clone();
        drop(ws);
        let _ = app.emit("work_state_update", &snapshot);
    }

    Ok(merged)
}

#[tauri::command]
fn flush_offline_queue(app: AppHandle, state: State<'_, AppState>) -> Result<usize, String> {
    let (_flushed, remaining) = recorder::flush_pending_uploads(&app);
    if let Ok(mut ws) = state.work_state.lock() {
        ws.pending_queue_count = remaining;
        let snapshot = ws.clone();
        drop(ws);
        let _ = app.emit("work_state_update", &snapshot);
    }
    Ok(remaining)
}

#[tauri::command]
fn send_scs_input_command(command: String) -> Result<String, String> {
    let normalized = command.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "hazard_warning" | "beacon" | "parking_brake" | "engine_toggle" | "horn" => {
            Ok(format!("input_dispatched:{}", normalized))
        }
        _ => Err(format!("未対応の入力コマンドです: {}", command)),
    }
}

fn g_event_to_recorder_entry(ev: &DetectedGEvent, data: &TelemetryData) -> TachographEventEntry {
    TachographEventEntry {
        timestamp: unix_secs_to_iso8601(now_unix_secs()),
        game_time: Some(data.game_time),
        event_type: ev.kind.as_event_type().to_string(),
        severity: ev.kind.severity().to_string(),
        x: Some(ev.x),
        y: Some(ev.y),
        speed_kmh: Some(ev.speed_kmh),
        speed_limit_kmh: if ev.speed_limit_kmh > 0.0 {
            Some(ev.speed_limit_kmh)
        } else {
            None
        },
        g_force: Some(ev.g_force),
        fine_offence: None,
        fine_amount: None,
        details: Some(serde_json::json!({
            "g_long": data.g_longitudinal,
            "g_lat": data.g_lateral,
            "g_vert": data.g_vertical,
            "g_jerk": data.g_jerk,
            "cargo": data.cargo_name,
        })),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let telemetry_data = Arc::new(Mutex::new(TelemetryData::default()));
    let work_state_data = Arc::new(Mutex::new(WorkState::default()));
    let safety_analyzer = Arc::new(Mutex::new(SafetyAnalyzer::new()));
    let session_recorder = Arc::new(Mutex::new(SessionRecorder::new()));

    let server_telemetry = Arc::clone(&telemetry_data);
    let server_work_state = Arc::clone(&work_state_data);
    let server_safety = Arc::clone(&safety_analyzer);
    let server_recorder = Arc::clone(&session_recorder);

    let ticker_telemetry = Arc::clone(&telemetry_data);
    let ticker_work_state = Arc::clone(&work_state_data);
    let ticker_safety = Arc::clone(&safety_analyzer);
    let ticker_recorder = Arc::clone(&session_recorder);

    let companion_manager = companion_server::CompanionServerManager::new(
        Arc::clone(&telemetry_data),
        Arc::clone(&work_state_data),
    );
    let overlay_manager = overlay::OverlayManager::default();
    let hotkey_overlay_state = Arc::clone(&overlay_manager.state);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app.emit("window_shown", ());
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(AppState {
            telemetry: telemetry_data,
            work_state: work_state_data,
            safety: safety_analyzer,
            recorder: session_recorder,
            last_tick: Mutex::new(Instant::now()),
            prev_paused: Mutex::new(false),
            prev_sim_time: Mutex::new(0.0),
            last_gameplay_seq: Mutex::new(0),
            last_smart_proposal_unix: Mutex::new(0),
        })
        .manage(overlay_manager)
        .manage(companion_manager)
        .setup(move |app| {
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            let show_i = MenuItem::with_id(app, "show", "デジタコを表示", true, None::<&str>)?;
            let overlay_i = MenuItem::with_id(
                app,
                "toggle_overlay",
                "オーバーレイ透過切替 (Alt+D)",
                true,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &overlay_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("window_shown", ());
                        }
                    }
                    "toggle_overlay" => {
                        let ov_state = app.state::<overlay::OverlayManager>();
                        let next = {
                            let mut guard = ov_state.state.lock().unwrap();
                            if !guard.enabled {
                                guard.enabled = true;
                                guard.always_on_top = true;
                                guard.click_through = true;
                            } else {
                                guard.click_through = !guard.click_through;
                            }
                            guard.clone()
                        };
                        let _ = overlay::apply_overlay_to_window(app, &next);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("window_shown", ());
                        }
                    }
                })
                .build(app)?;

            let init_cfg = read_app_config(&app.handle());
            let init_token = init_cfg.telemetry_token.clone();

            {
                let app_state = app.state::<AppState>();
                if let Ok(mut rec) = app_state.recorder.lock() {
                    rec.recover_wal_on_startup(&app.handle());
                }
                if let Ok(mut ws) = app_state.work_state.lock() {
                    ws.is_smart_auto_mode = init_cfg.smart_auto_mode;
                    ws.pending_queue_count = recorder::count_pending_queue_files(&app.handle());
                    if let Ok(rec) = app_state.recorder.lock() {
                        ws.active_session_id = rec.session_id.clone();
                        if rec.active {
                            ws.status = WorkStatus::Working;
                            ws.work_type = WorkType::Driving;
                            ws.work_status_label = WorkType::Driving.ja_label().to_string();
                        }
                    };
                };
            }

            if init_cfg.lan_companion_enabled {
                let comp = app.state::<companion_server::CompanionServerManager>();
                let _ = companion_server::start_companion_loop(
                    app.handle().clone(),
                    Arc::clone(&comp.running),
                    Arc::clone(&comp.telemetry),
                    Arc::clone(&comp.work_state),
                );
            }

            overlay::spawn_alt_d_hotkey_listener(app.handle().clone(), hotkey_overlay_state);

            let startup_handle = app.handle().clone();
            thread::spawn(move || {
                fix_plugin_config(&init_token);
                let (_flushed, remaining) = recorder::flush_pending_uploads(&startup_handle);
                let state = startup_handle.state::<AppState>();
                if let Ok(mut ws) = state.work_state.lock() {
                    ws.pending_queue_count = remaining;
                };
            });

            // 1Hz Tick Engine (430 rule, continuous drive, adaptive trace, periodic queue flush)
            let ticker_handle = app.handle().clone();
            thread::spawn(move || {
                let mut flush_tick_counter: u64 = 0;
                loop {
                    thread::sleep(Duration::from_secs(1));
                    flush_tick_counter = flush_tick_counter.wrapping_add(1);

                    let state = ticker_handle.state::<AppState>();
                    let elapsed = {
                        let mut last_tick = match state.last_tick.lock() {
                            Ok(g) => g,
                            Err(_) => continue,
                        };
                        let now = Instant::now();
                        let secs = now.duration_since(*last_tick).as_secs();
                        if secs >= 1 {
                            *last_tick += Duration::from_secs(secs);
                            secs
                        } else {
                            0
                        }
                    };

                    if elapsed == 0 {
                        continue;
                    }

                    let tel_snapshot = ticker_telemetry
                        .lock()
                        .map(|t| t.clone())
                        .unwrap_or_default();

                    let mut new_430_violation: Option<TachographEventEntry> = None;
                    let mut ws_emit_snapshot: Option<WorkState> = None;

                    {
                        let mut ws = match ticker_work_state.lock() {
                            Ok(g) => g,
                            Err(_) => continue,
                        };

                        if ws.status != WorkStatus::Idle {
                            match ws.status {
                                WorkStatus::Working => ws.work_seconds += elapsed,
                                WorkStatus::Resting => ws.rest_seconds += elapsed,
                                WorkStatus::Idle => {}
                            }

                            let mut g_lat = tel_snapshot.g_lateral;
                            let mut g_vert = tel_snapshot.g_vertical;
                            let mut g_long = tel_snapshot.g_longitudinal;

                            if let Ok(mut safety) = ticker_safety.lock() {
                                let was_violation = safety.is_430_violation;
                                let is_working = ws.status != WorkStatus::Idle;
                                let is_driving_work = ws.work_type == WorkType::Driving;
                                safety.on_1hz_tick(
                                    is_working,
                                    tel_snapshot.paused,
                                    is_driving_work,
                                    tel_snapshot.speed,
                                    tel_snapshot.speed_limit,
                                    tel_snapshot.engine_rpm,
                                    tel_snapshot.rpm_limit,
                                    tel_snapshot.engine_enabled,
                                    tel_snapshot.wheel_offroad,
                                    elapsed,
                                );
                                g_lat = safety.smoothed_g_lat;
                                g_vert = safety.smoothed_g_vert;
                                g_long = safety.smoothed_g_long;
                                sync_work_state_from_safety(&mut ws, &safety, tel_snapshot.odometer);

                                if safety.is_430_violation && !was_violation {
                                    new_430_violation = Some(TachographEventEntry {
                                        timestamp: unix_secs_to_iso8601(now_unix_secs()),
                                        game_time: Some(tel_snapshot.game_time),
                                        event_type: "violation_430".to_string(),
                                        severity: "critical".to_string(),
                                        x: Some(tel_snapshot.x),
                                        y: Some(tel_snapshot.z),
                                        speed_kmh: Some(tel_snapshot.speed.abs()),
                                        speed_limit_kmh: if tel_snapshot.speed_limit > 0.0 {
                                            Some(tel_snapshot.speed_limit)
                                        } else {
                                            None
                                        },
                                        g_force: None,
                                        fine_offence: None,
                                        fine_amount: None,
                                        details: Some(serde_json::json!({
                                            "continuous_driving_sec": safety.continuous_driving_sec,
                                            "break_bank_sec": safety.break_bank_sec,
                                        })),
                                    });
                                }
                            }

                            if let Ok(mut rec) = ticker_recorder.lock() {
                                if rec.active {
                                    rec.update_metadata_from_telemetry(&tel_snapshot);
                                    rec.maybe_record_trace_sample(
                                        &tel_snapshot,
                                        &ws.work_type,
                                        g_lat,
                                        g_vert,
                                        g_long,
                                    );
                                    if let Some(ref ev) = new_430_violation {
                                        rec.push_event(&ticker_handle, ev.clone());
                                    }
                                }
                            }

                            ws_emit_snapshot = Some(ws.clone());
                        }
                    }

                    if let Some(ref ev) = new_430_violation {
                        let _ = ticker_handle.emit("tachograph_430_violation", ev);
                    }
                    if let Some(snapshot) = ws_emit_snapshot {
                        let _ = ticker_handle.emit("work_state_update", snapshot);
                    }

                    if flush_tick_counter % 60 == 0 {
                        let pending = recorder::count_pending_queue_files(&ticker_handle);
                        if pending > 0 {
                            let (_flushed, remaining) =
                                recorder::flush_pending_uploads(&ticker_handle);
                            if let Ok(mut ws) = ticker_work_state.lock() {
                                ws.pending_queue_count = remaining;
                            }
                        }
                    }
                }
            });

            // 127.0.0.1:3001 HTTP Receiver (OAuth callback + 20Hz C++ Plugin Telemetry)
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let server = match tiny_http::Server::http("127.0.0.1:3001") {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!(
                            "Failed to bind local telemetry listener on 127.0.0.1:3001: {}",
                            e
                        );
                        return;
                    }
                };

                for mut request in server.incoming_requests() {
                    let url = request.url().to_string();

                    if url.starts_with("/auth/callback") {
                        let mut found_token: Option<String> = None;
                        if let Some(query) = url.split('?').nth(1) {
                            for pair in query.split('&') {
                                let mut kv = pair.split('=');
                                if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
                                    if k == "token" && !v.is_empty() {
                                        found_token = Some(v.to_string());
                                    }
                                }
                            }
                        }

                        if let Some(token) = found_token {
                            let mut cfg = read_app_config(&app_handle);
                            cfg.telemetry_token = token.clone();
                            let _ = write_app_config(&app_handle, &cfg);

                            let token_clone = token.clone();
                            thread::spawn(move || {
                                update_plugin_token(&token_clone);
                            });

                            let _ = app_handle.emit("auth_success", token);

                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }

                            let html = "<html><head><meta charset='utf-8'><title>認証完了</title></head><body style='background:#09090b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'><div style='text-align:center;'><h2 style='color:#10b981;'>ENJOYTRUCKERS デジタコ連携が完了しました</h2><p style='color:#a1a1aa;'>このタブを閉じてアプリにお戻りください。</p><script>setTimeout(()=>window.close(), 1500);</script></div></body></html>";
                            let header = tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap();
                            let response =
                                tiny_http::Response::from_string(html).with_header(header);
                            let _ = request.respond(response);
                            continue;
                        }
                    }

                    let mut content = String::new();
                    if request.as_reader().read_to_string(&mut content).is_ok() {
                        if let Ok(mut parsed) = serde_json::from_str::<TelemetryData>(&content) {
                            let now_secs = now_unix_secs();
                            parsed.timestamp = now_secs;

                            let state = app_handle.state::<AppState>();

                            let (jump_or_pause, new_gameplay_events) = {
                                let mut prev_paused = state
                                    .prev_paused
                                    .lock()
                                    .map(|g| *g)
                                    .unwrap_or(false);
                                let mut prev_sim = state
                                    .prev_sim_time
                                    .lock()
                                    .map(|g| *g)
                                    .unwrap_or(0.0);
                                let mut last_seq = state
                                    .last_gameplay_seq
                                    .lock()
                                    .map(|g| *g)
                                    .unwrap_or(0);

                                let sim_jump = prev_sim > 0.0
                                    && (parsed.simulation_time - prev_sim).abs() > 3.5;
                                let pause_transition = parsed.paused != prev_paused;
                                let has_ferry_or_load_ev = parsed.events.iter().any(|ev| {
                                    ev.seq > last_seq
                                        && (ev.id.contains("ferry")
                                            || ev.id.contains("train")
                                            || ev.id.contains("job"))
                                });

                                let mut fresh_events = Vec::new();
                                for ev in &parsed.events {
                                    if ev.seq > last_seq {
                                        fresh_events.push(ev.clone());
                                        if ev.seq > last_seq {
                                            last_seq = ev.seq;
                                        }
                                    }
                                }

                                prev_paused = parsed.paused;
                                prev_sim = parsed.simulation_time;

                                if let Ok(mut g) = state.prev_paused.lock() {
                                    *g = prev_paused;
                                }
                                if let Ok(mut g) = state.prev_sim_time.lock() {
                                    *g = prev_sim;
                                }
                                if let Ok(mut g) = state.last_gameplay_seq.lock() {
                                    *g = last_seq;
                                }

                                (
                                    sim_jump || pause_transition || has_ferry_or_load_ev,
                                    fresh_events,
                                )
                            };

                            if let Ok(mut lock) = server_telemetry.lock() {
                                *lock = parsed.clone();
                            }

                            let mut detected_g_events: Vec<DetectedGEvent> = Vec::new();
                            let mut recorder_g_entries: Vec<TachographEventEntry> = Vec::new();
                            let mut ws_updated: Option<WorkState> = None;
                            let mut smart_proposal: Option<SmartWorkProposal> = None;

                            {
                                let mut ws = match server_work_state.lock() {
                                    Ok(g) => g,
                                    Err(_) => continue,
                                };

                                if parsed.cargo_loaded && !ws.is_loaded {
                                    ws.is_loaded = true;
                                }

                                if ws.status != WorkStatus::Idle {
                                    if ws.start_odometer == 0.0 && parsed.odometer > 0.0 {
                                        ws.start_odometer = parsed.odometer;
                                    }
                                    if parsed.speed > ws.max_speed {
                                        ws.max_speed = parsed.speed;
                                    }

                                    if let Ok(mut safety) = server_safety.lock() {
                                        if jump_or_pause {
                                            safety.notify_teleported_or_paused(
                                                parsed.simulation_time,
                                            );
                                        }
                                        let gevs = safety.on_20hz_sample(
                                            parsed.simulation_time,
                                            parsed.paused,
                                            parsed.speed,
                                            parsed.speed_limit,
                                            parsed.x,
                                            parsed.z,
                                            parsed.g_lateral,
                                            parsed.g_vertical,
                                            parsed.g_longitudinal,
                                        );
                                        for gev in gevs {
                                            recorder_g_entries
                                                .push(g_event_to_recorder_entry(&gev, &parsed));
                                            detected_g_events.push(gev);
                                        }
                                        sync_work_state_from_safety(
                                            &mut ws,
                                            &safety,
                                            parsed.odometer,
                                        );
                                    }

                                    if !recorder_g_entries.is_empty() {
                                        if let Ok(mut rec) = server_recorder.lock() {
                                            if rec.active {
                                                for entry in &recorder_g_entries {
                                                    rec.push_event(&app_handle, entry.clone());
                                                }
                                            }
                                        }
                                    }
                                    ws_updated = Some(ws.clone());
                                }

                                for gev in &new_gameplay_events {
                                    if gev.id.contains("ferry") {
                                        smart_proposal = Some(SmartWorkProposal {
                                            suggested_work_type: "ferry".to_string(),
                                            reason: "フェリー乗船を検知しました".to_string(),
                                            auto_applied: ws.is_smart_auto_mode,
                                        });
                                    } else if gev.id.contains("train") {
                                        smart_proposal = Some(SmartWorkProposal {
                                            suggested_work_type: "train".to_string(),
                                            reason: "ユーロトンネル・鉄道乗車を検知しました"
                                                .to_string(),
                                            auto_applied: ws.is_smart_auto_mode,
                                        });
                                    } else if gev.id.contains("job.delivered") {
                                        smart_proposal = Some(SmartWorkProposal {
                                            suggested_work_type: "unloading".to_string(),
                                            reason: "配送完了（荷卸）を検知しました".to_string(),
                                            auto_applied: ws.is_smart_auto_mode,
                                        });
                                    }
                                }
                            }

                            if let Some(ref prop) = smart_proposal {
                                let should_emit = {
                                    if let Ok(mut last_p) = state.last_smart_proposal_unix.lock() {
                                        if now_secs.saturating_sub(*last_p) >= 10 {
                                            *last_p = now_secs;
                                            true
                                        } else {
                                            false
                                        }
                                    } else {
                                        false
                                    }
                                };
                                if should_emit {
                                    if prop.auto_applied {
                                        let wt =
                                            WorkType::from_str_lossy(&prop.suggested_work_type);
                                        let _ = apply_work_transition(&app_handle, &state, wt);
                                    }
                                    let _ = app_handle.emit("smart_work_proposal", prop);
                                }
                            }

                            let _ = app_handle.emit("telemetry_update", &parsed);
                            for gev in &detected_g_events {
                                let _ = app_handle.emit("tachograph_g_event", gev);
                            }
                            if let Some(ref ws_snap) = ws_updated {
                                let _ = app_handle.emit("work_state_update", ws_snap);
                            }
                        }
                    }

                    let response = tiny_http::Response::from_string("OK");
                    let _ = request.respond(response);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.app_handle().emit("reset_view", ());
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_telemetry,
            get_work_state,
            set_work_status,
            set_detailed_work_type,
            set_road_type,
            set_loaded_state,
            set_smart_auto_mode,
            trigger_sos,
            get_config,
            set_config,
            save_app_preferences,
            flush_offline_queue,
            send_scs_input_command,
            plugin_manager::detect_installed_dlcs,
            plugin_manager::run_system_diagnostics,
            plugin_manager::repair_plugin_installation,
            overlay::get_overlay_state,
            overlay::set_overlay_mode,
            overlay::toggle_overlay_click_through,
            city_extractor::sync_official_cities,
            companion_server::get_companion_info,
            companion_server::set_lan_companion_enabled,
            dashcam::capture_dashcam_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
