use aes::Aes256;
use base64::{engine::general_purpose::STANDARD as b64, Engine as _};
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use flate2::read::ZlibDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::plugin_manager::{collect_steamapps_dirs, get_documents_dirs};
use crate::telemetry::TelemetryData;
use crate::AppState;

type Aes256CbcDec = cbc::Decryptor<Aes256>;

const SCS_SAVE_AES_KEY: &[u8; 32] = &[
    0x2a, 0x5f, 0xcb, 0x17, 0x9d, 0xd2, 0x2f, 0xb6,
    0x02, 0x45, 0xb3, 0xd8, 0x36, 0x9e, 0xd0, 0xb2,
    0xc4, 0x73, 0x71, 0x56, 0x3f, 0xbd, 0x1f, 0x3c,
    0x9e, 0xde, 0x6b, 0x11, 0x82, 0x5a, 0x5d, 0x0a,
];

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioStateSummary {
    pub scenario_id: String,
    pub state: Option<i64>,
    pub stars: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AcademyEnvironmentReport {
    pub mods_clean: bool,
    pub active_mods_count: usize,
    pub active_mods: Vec<String>,
    pub game_log_found: bool,
    pub game_log_path: Option<String>,
    pub sii_found: bool,
    pub sii_path: Option<String>,
    pub sii_hash: Option<String>,
    pub sii_mtime: Option<u64>,
    pub sii_format: String,
    pub completed_scenarios: Vec<String>,
    pub scenario_states: Vec<ScenarioStateSummary>,
    pub prereq_books_verified_local: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MovingInterval {
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AcademyLiveStats {
    pub active: bool,
    pub exam_id: String,
    pub elapsed_sec: u64,
    pub sample_count: usize,
    pub moving_seconds: u64,
    pub stationary_seconds: u64,
    pub is_moving_now: bool,
    pub max_speed_kmh: f64,
    pub gear_switch_count: u32,
    pub reverse_seconds: u64,
    pub max_forward_g: f64,
    pub max_brake_g: f64,
    pub max_lateral_g: f64,
    pub impact_count: u32,
    pub start_truck_damage: f64,
    pub current_truck_damage: f64,
    pub damage_delta: f64,
    pub blinker_usage_count: u32,
    pub hazard_usage_count: u32,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AcademyExamTelemetryResult {
    pub stats: AcademyLiveStats,
    pub moving_intervals: Vec<MovingInterval>,
    pub trace_gzip_base64: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AcademyVideoFinalizeResult {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AcademyUploadProgress {
    pub exam_id: String,
    pub phase: String,
    pub chunk_index: usize,
    pub total_chunks: usize,
    pub uploaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

pub struct AcademyExamRecorder {
    pub active: bool,
    pub exam_id: String,
    started_instant: Option<Instant>,
    last_sample_instant: Option<Instant>,
    trace_rows: Vec<Vec<serde_json::Value>>,
    moving_intervals: Vec<MovingInterval>,
    current_moving_start: Option<f64>,
    moving_ticks: u64,
    stationary_ticks: u64,
    reverse_ticks: u64,
    max_speed_kmh: f64,
    gear_switch_count: u32,
    last_gear_dir: i8, // -1 reverse, 0 neutral, 1 forward
    max_forward_g: f64,
    max_brake_g: f64,
    max_lateral_g: f64,
    impact_count: u32,
    last_impact_sec: f64,
    start_truck_damage: f64,
    current_truck_damage: f64,
    damage_initialized: bool,
    blinker_usage_count: u32,
    hazard_usage_count: u32,
    prev_blinker_active: bool,
    prev_hazard_active: bool,
    is_moving_now: bool,
}

impl Default for AcademyExamRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl AcademyExamRecorder {
    pub fn new() -> Self {
        Self {
            active: false,
            exam_id: String::new(),
            started_instant: None,
            last_sample_instant: None,
            trace_rows: Vec::new(),
            moving_intervals: Vec::new(),
            current_moving_start: None,
            moving_ticks: 0,
            stationary_ticks: 0,
            reverse_ticks: 0,
            max_speed_kmh: 0.0,
            gear_switch_count: 0,
            last_gear_dir: 0,
            max_forward_g: 0.0,
            max_brake_g: 0.0,
            max_lateral_g: 0.0,
            impact_count: 0,
            last_impact_sec: -10.0,
            start_truck_damage: 0.0,
            current_truck_damage: 0.0,
            damage_initialized: false,
            blinker_usage_count: 0,
            hazard_usage_count: 0,
            prev_blinker_active: false,
            prev_hazard_active: false,
            is_moving_now: false,
        }
    }

    pub fn start(&mut self, exam_id: String, tel: &TelemetryData) {
        *self = Self::new();
        self.active = true;
        self.exam_id = exam_id;
        self.started_instant = Some(Instant::now());
        let initial_dmg = max_truck_damage(tel);
        self.start_truck_damage = initial_dmg;
        self.current_truck_damage = initial_dmg;
        self.damage_initialized = true;
    }

    pub fn on_telemetry_sample(&mut self, tel: &TelemetryData) {
        if !self.active {
            return;
        }
        let now = Instant::now();
        if let Some(prev) = self.last_sample_instant {
            if now.duration_since(prev) < Duration::from_millis(480) {
                return;
            }
        }
        self.last_sample_instant = Some(now);

        let t_sec = self
            .started_instant
            .map(|s| now.duration_since(s).as_secs_f64())
            .unwrap_or(0.0);
        let t_round = (t_sec * 100.0).round() / 100.0;

        let spd_abs = tel.speed.abs();
        let moving = spd_abs > 0.5 && !tel.paused;
        self.is_moving_now = moving;

        if moving {
            self.moving_ticks += 1;
            if self.current_moving_start.is_none() {
                self.current_moving_start = Some(t_round);
            }
        } else {
            self.stationary_ticks += 1;
            if let Some(start_s) = self.current_moving_start.take() {
                if t_round > start_s {
                    self.moving_intervals.push(MovingInterval {
                        start_sec: start_s,
                        end_sec: t_round,
                    });
                }
            }
        }

        if spd_abs > self.max_speed_kmh {
            self.max_speed_kmh = spd_abs;
        }

        let gear_dir: i8 = if tel.gear < 0 {
            -1
        } else if tel.gear > 0 {
            1
        } else {
            0
        };
        if gear_dir != 0 {
            if self.last_gear_dir != 0 && self.last_gear_dir != gear_dir {
                self.gear_switch_count += 1;
            }
            self.last_gear_dir = gear_dir;
        }
        if moving && tel.gear < 0 {
            self.reverse_ticks += 1;
        }

        if tel.g_longitudinal > self.max_forward_g {
            self.max_forward_g = tel.g_longitudinal;
        }
        if -tel.g_longitudinal > self.max_brake_g {
            self.max_brake_g = -tel.g_longitudinal;
        }
        if tel.g_lateral.abs() > self.max_lateral_g {
            self.max_lateral_g = tel.g_lateral.abs();
        }

        let dmg = max_truck_damage(tel);
        if !self.damage_initialized {
            self.start_truck_damage = dmg;
            self.damage_initialized = true;
        }
        let dmg_step = dmg - self.current_truck_damage;
        self.current_truck_damage = dmg;

        let composite_g = (tel.g_lateral.powi(2) + tel.g_longitudinal.powi(2)).sqrt();
        if (composite_g > 1.8 || dmg_step >= 0.005) && (t_sec - self.last_impact_sec >= 2.0) {
            self.impact_count += 1;
            self.last_impact_sec = t_sec;
        }

        let blinker_active = tel.lblinker || tel.rblinker;
        if blinker_active && !self.prev_blinker_active {
            self.blinker_usage_count += 1;
        }
        self.prev_blinker_active = blinker_active;

        if tel.hazard && !self.prev_hazard_active {
            self.hazard_usage_count += 1;
        }
        self.prev_hazard_active = tel.hazard;

        let row = vec![
            serde_json::json!(t_round),
            serde_json::json!((tel.x * 100.0).round() / 100.0),
            serde_json::json!((tel.z * 100.0).round() / 100.0),
            serde_json::json!((tel.heading * 1000.0).round() / 1000.0),
            if tel.trailer_connected {
                serde_json::json!((tel.trailer_x * 100.0).round() / 100.0)
            } else {
                serde_json::Value::Null
            },
            if tel.trailer_connected {
                serde_json::json!((tel.trailer_z * 100.0).round() / 100.0)
            } else {
                serde_json::Value::Null
            },
            if tel.trailer_connected {
                serde_json::json!((tel.trailer_heading * 1000.0).round() / 1000.0)
            } else {
                serde_json::Value::Null
            },
            serde_json::json!((tel.speed * 10.0).round() / 10.0),
            serde_json::json!(tel.gear),
            serde_json::json!((tel.effective_steering * 1000.0).round() / 1000.0),
            serde_json::json!((tel.effective_throttle * 1000.0).round() / 1000.0),
            serde_json::json!((tel.brake * 1000.0).round() / 1000.0),
            serde_json::json!((tel.g_lateral * 1000.0).round() / 1000.0),
            serde_json::json!((tel.g_longitudinal * 1000.0).round() / 1000.0),
            serde_json::json!((dmg * 10000.0).round() / 10000.0),
            serde_json::json!(if tel.lblinker { 1 } else { 0 }),
            serde_json::json!(if tel.rblinker { 1 } else { 0 }),
            serde_json::json!(if tel.hazard { 1 } else { 0 }),
            serde_json::json!(if tel.parking_brake { 1 } else { 0 }),
        ];

        if self.trace_rows.len() < 15000 {
            self.trace_rows.push(row);
        }
    }

    pub fn live_stats(&self) -> AcademyLiveStats {
        let elapsed_sec = self
            .started_instant
            .map(|s| s.elapsed().as_secs())
            .unwrap_or(0);
        AcademyLiveStats {
            active: self.active,
            exam_id: self.exam_id.clone(),
            elapsed_sec,
            sample_count: self.trace_rows.len(),
            moving_seconds: self.moving_ticks / 2,
            stationary_seconds: self.stationary_ticks / 2,
            is_moving_now: self.is_moving_now,
            max_speed_kmh: (self.max_speed_kmh * 10.0).round() / 10.0,
            gear_switch_count: self.gear_switch_count,
            reverse_seconds: self.reverse_ticks / 2,
            max_forward_g: (self.max_forward_g * 100.0).round() / 100.0,
            max_brake_g: (self.max_brake_g * 100.0).round() / 100.0,
            max_lateral_g: (self.max_lateral_g * 100.0).round() / 100.0,
            impact_count: self.impact_count,
            start_truck_damage: self.start_truck_damage,
            current_truck_damage: self.current_truck_damage,
            damage_delta: (self.current_truck_damage - self.start_truck_damage).max(0.0),
            blinker_usage_count: self.blinker_usage_count,
            hazard_usage_count: self.hazard_usage_count,
        }
    }

    pub fn stop_and_finalize(&mut self) -> AcademyExamTelemetryResult {
        if let Some(start_s) = self.current_moving_start.take() {
            let end_s = self
                .started_instant
                .map(|s| (s.elapsed().as_secs_f64() * 100.0).round() / 100.0)
                .unwrap_or(start_s);
            if end_s > start_s {
                self.moving_intervals.push(MovingInterval {
                    start_sec: start_s,
                    end_sec: end_s,
                });
            }
        }
        let stats = self.live_stats();
        let intervals = self.moving_intervals.clone();

        let payload = serde_json::json!({
            "version": 1,
            "columns": [
                "t", "x", "z", "hdg", "tx", "tz", "thdg",
                "spd", "gear", "steer", "thr", "brk",
                "glat", "glong", "dmg", "lblk", "rblk", "haz", "pbrk"
            ],
            "rows": self.trace_rows,
        });

        let trace_gzip_base64 = match serde_json::to_vec(&payload) {
            Ok(raw_bytes) => {
                let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
                if encoder.write_all(&raw_bytes).is_ok() {
                    if let Ok(gz) = encoder.finish() {
                        b64.encode(gz)
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            }
            Err(_) => String::new(),
        };

        self.active = false;
        AcademyExamTelemetryResult {
            stats,
            moving_intervals: intervals,
            trace_gzip_base64,
        }
    }
}

fn max_truck_damage(tel: &TelemetryData) -> f64 {
    let mut m = tel.wear_engine;
    for v in [
        tel.wear_transmission,
        tel.wear_cabin,
        tel.wear_chassis,
        tel.wear_wheels,
        tel.cargo_damage,
    ] {
        if v > m {
            m = v;
        }
    }
    for tr in &tel.trailers {
        if tr.connected {
            for v in [tr.wear_body, tr.wear_chassis, tr.wear_wheels, tr.cargo_damage] {
                if v > m {
                    m = v;
                }
            }
        }
    }
    m
}

fn decode_scsc_or_plain(raw: &[u8]) -> (String, Vec<u8>) {
    if raw.len() > 56 && &raw[0..4] == b"ScsC" {
        let iv = &raw[36..52];
        let mut buf = raw[56..].to_vec();
        if let Ok(decryptor) = Aes256CbcDec::new_from_slices(SCS_SAVE_AES_KEY, iv) {
            if let Ok(decrypted) = decryptor.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                let mut decoder = ZlibDecoder::new(decrypted);
                let mut out = Vec::new();
                if decoder.read_to_end(&mut out).is_ok() {
                    let fmt = if out.starts_with(b"BSII") {
                        "bsii".to_string()
                    } else {
                        "text".to_string()
                    };
                    return (fmt, out);
                }
            }
        }
        return ("error".to_string(), Vec::new());
    }

    if raw.starts_with(b"BSII") {
        return ("bsii".to_string(), raw.to_vec());
    }
    ("plain".to_string(), raw.to_vec())
}

fn parse_sii_academy_states(fmt: &str, bytes: &[u8]) -> Vec<ScenarioStateSummary> {
    let mut results = Vec::new();
    if bytes.is_empty() {
        return results;
    }

    if fmt == "text" || fmt == "plain" {
        let text = String::from_utf8_lossy(bytes);
        let mut cur_id: Option<String> = None;
        let mut cur_state: Option<i64> = None;
        let mut cur_stars: Option<i64> = None;

        for raw_line in text.lines() {
            let line = raw_line.trim();
            if line.starts_with("academy_scenario_state") {
                cur_id = None;
                cur_state = None;
                cur_stars = None;
            } else if line.starts_with("scenario_id:") {
                if let Some(val) = line.split(':').nth(1) {
                    cur_id = Some(val.trim().trim_matches('"').to_string());
                }
            } else if line.starts_with("state:") {
                if let Some(val) = line.split(':').nth(1) {
                    cur_state = val.trim().parse::<i64>().ok();
                }
            } else if line.starts_with("stars:") {
                if let Some(val) = line.split(':').nth(1) {
                    cur_stars = val.trim().parse::<i64>().ok();
                }
            } else if line == "}" {
                if let Some(id) = cur_id.take() {
                    results.push(ScenarioStateSummary {
                        scenario_id: id,
                        state: cur_state.take(),
                        stars: cur_stars.take(),
                    });
                }
            }
        }
    } else if fmt == "bsii" {
        // Fallback ASCII token scan inside BSII binary container
        let mut seen = HashSet::new();
        let mut current = String::new();
        for &b in bytes {
            if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' {
                current.push(b as char);
            } else {
                if current.len() >= 5 && current.len() <= 64 {
                    if (current.contains("basic")
                        || current.contains("camera")
                        || current.contains("revers")
                        || current.contains("park")
                        || current.contains("trailer")
                        || current.contains("turn")
                        || current.contains("slalom")
                        || current.contains("academy"))
                        && seen.insert(current.clone())
                    {
                        results.push(ScenarioStateSummary {
                            scenario_id: current.clone(),
                            state: None,
                            stars: None,
                        });
                    }
                }
                current.clear();
            }
        }
    }

    results
}

fn find_latest_academy_sii() -> Option<(PathBuf, u64)> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    for doc_dir in get_documents_dirs() {
        let profiles_dir = doc_dir.join("Euro Truck Simulator 2").join("profiles");
        if let Ok(entries) = fs::read_dir(&profiles_dir) {
            for entry in entries.flatten() {
                let p = entry.path().join("academy").join("academy_book_states.sii");
                if p.is_file() {
                    candidates.push(p);
                }
            }
        }
    }

    for steamapps in collect_steamapps_dirs() {
        if let Some(steam_root) = steamapps.parent() {
            let userdata = steam_root.join("userdata");
            if let Ok(users) = fs::read_dir(&userdata) {
                for u in users.flatten() {
                    let profiles = u.path().join("227300").join("remote").join("profiles");
                    if let Ok(entries) = fs::read_dir(&profiles) {
                        for entry in entries.flatten() {
                            let p = entry.path().join("academy").join("academy_book_states.sii");
                            if p.is_file() {
                                candidates.push(p);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut best: Option<(PathBuf, u64)> = None;
    for path in candidates {
        if let Ok(meta) = fs::metadata(&path) {
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            match &best {
                Some((_, best_mtime)) if mtime <= *best_mtime => {}
                _ => best = Some((path, mtime)),
            }
        }
    }
    best
}

fn inspect_ets2_game_log_mods() -> (bool, Option<String>, Vec<String>) {
    for doc_dir in get_documents_dirs() {
        let log_path = doc_dir.join("Euro Truck Simulator 2").join("game.log.txt");
        if let Ok(content) = fs::read_to_string(&log_path) {
            let mut active_mods: Vec<String> = Vec::new();
            let mut seen = HashSet::new();

            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.contains("[mods] Active local mod ")
                    || trimmed.contains("[mods] Active workshop mod ")
                    || trimmed.contains("[mods] Active mod ")
                {
                    if let Some(idx) = trimmed.find(" mod ") {
                        let rest = trimmed[idx + 5..].trim();
                        let name = rest.split(" (").next().unwrap_or(rest).trim().to_string();
                        if !name.is_empty() && seen.insert(name.clone()) {
                            active_mods.push(name);
                        }
                    }
                }
            }

            return (
                true,
                Some(log_path.to_string_lossy().to_string()),
                active_mods,
            );
        }
    }
    (false, None, Vec::new())
}

#[tauri::command]
pub fn inspect_academy_environment() -> AcademyEnvironmentReport {
    let (game_log_found, game_log_path, active_mods) = inspect_ets2_game_log_mods();
    let active_mods_count = active_mods.len();
    let mods_clean = game_log_found && active_mods_count == 0;

    let mut sii_found = false;
    let mut sii_path: Option<String> = None;
    let mut sii_hash: Option<String> = None;
    let mut sii_mtime: Option<u64> = None;
    let mut sii_format = "none".to_string();
    let mut scenario_states: Vec<ScenarioStateSummary> = Vec::new();
    let mut completed_scenarios: Vec<String> = Vec::new();

    if let Some((path, mtime)) = find_latest_academy_sii() {
        sii_found = true;
        sii_path = Some(path.to_string_lossy().to_string());
        sii_mtime = Some(mtime);
        if let Ok(raw) = fs::read(&path) {
            let mut hasher = Sha256::new();
            hasher.update(&raw);
            let digest = hasher.finalize();
            let hex: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
            sii_hash = Some(hex);

            let (fmt, decoded) = decode_scsc_or_plain(&raw);
            sii_format = fmt.clone();
            scenario_states = parse_sii_academy_states(&fmt, &decoded);
            completed_scenarios = scenario_states
                .iter()
                .filter(|s| s.state.unwrap_or(2) >= 2)
                .map(|s| s.scenario_id.clone())
                .collect();
        }
    }

    let prereq_books_verified_local = completed_scenarios.len() >= 8;

    AcademyEnvironmentReport {
        mods_clean,
        active_mods_count,
        active_mods,
        game_log_found,
        game_log_path,
        sii_found,
        sii_path,
        sii_hash,
        sii_mtime,
        sii_format,
        completed_scenarios,
        scenario_states,
        prereq_books_verified_local,
    }
}

#[tauri::command]
pub fn start_academy_exam_telemetry(exam_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let tel = state
        .telemetry
        .lock()
        .map(|t| t.clone())
        .unwrap_or_default();
    let mut rec = state.academy_recorder.lock().map_err(|e| e.to_string())?;
    rec.start(exam_id, &tel);
    Ok(())
}

#[tauri::command]
pub fn stop_academy_exam_telemetry(
    state: State<'_, AppState>,
) -> Result<AcademyExamTelemetryResult, String> {
    let mut rec = state.academy_recorder.lock().map_err(|e| e.to_string())?;
    Ok(rec.stop_and_finalize())
}

#[tauri::command]
pub fn get_academy_exam_live_stats(state: State<'_, AppState>) -> AcademyLiveStats {
    state
        .academy_recorder
        .lock()
        .map(|r| r.live_stats())
        .unwrap_or_default()
}

fn academy_video_temp_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("academy_exam_videos")
}

fn sanitize_exam_id_str(exam_id: &str) -> Result<String, String> {
    let clean = exam_id.trim();
    if clean.is_empty()
        || clean.len() > 64
        || !clean
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid exam ID".to_string());
    }
    Ok(clean.to_string())
}

fn find_local_video_file(app: &AppHandle, exam_id: &str) -> Option<PathBuf> {
    let dir = academy_video_temp_dir(app);
    for ext in ["webm", "mp4"] {
        let p = dir.join(format!("{}.{}", exam_id, ext));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

#[tauri::command]
pub fn academy_video_begin(app: AppHandle, exam_id: String, ext: String) -> Result<String, String> {
    let safe_id = sanitize_exam_id_str(&exam_id)?;
    let safe_ext = if ext.eq_ignore_ascii_case("mp4") {
        "mp4"
    } else {
        "webm"
    };
    let dir = academy_video_temp_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.{}", safe_id, safe_ext));
    File::create(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn academy_video_append_chunk(
    app: AppHandle,
    exam_id: String,
    bytes: Vec<u8>,
) -> Result<u64, String> {
    let safe_id = sanitize_exam_id_str(&exam_id)?;
    let path = find_local_video_file(&app, &safe_id)
        .unwrap_or_else(|| academy_video_temp_dir(&app).join(format!("{}.webm", safe_id)));
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

#[tauri::command]
pub fn academy_video_finalize(
    app: AppHandle,
    exam_id: String,
) -> Result<AcademyVideoFinalizeResult, String> {
    let safe_id = sanitize_exam_id_str(&exam_id)?;
    let path = find_local_video_file(&app, &safe_id)
        .ok_or_else(|| "録画ファイルが見つかりませんでした。".to_string())?;
    let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(AcademyVideoFinalizeResult {
        path: path.to_string_lossy().to_string(),
        size_bytes,
    })
}

#[tauri::command]
pub fn academy_cleanup_local_video(app: AppHandle, exam_id: String) -> Result<(), String> {
    let safe_id = sanitize_exam_id_str(&exam_id)?;
    if let Some(p) = find_local_video_file(&app, &safe_id) {
        let _ = fs::remove_file(p);
    }
    Ok(())
}

#[tauri::command]
pub async fn academy_upload_submission(
    app: AppHandle,
    portal_url: String,
    token: String,
    exam_id: String,
    file_name: String,
    mime_type: String,
    complete_payload_json: String,
) -> Result<serde_json::Value, String> {
    let safe_id = sanitize_exam_id_str(&exam_id)?;
    let base_url = portal_url.trim().trim_end_matches('/').to_string();
    let video_path = find_local_video_file(&app, &safe_id)
        .ok_or_else(|| "アップロード対象の録画ファイルが見つかりません。".to_string())?;

    let total_bytes = fs::metadata(&video_path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())?;
    if total_bytes == 0 {
        return Err("録画ファイルが空 (0 bytes) です。".to_string());
    }

    let app_clone = app.clone();
    tokio_less_upload(
        app_clone,
        base_url,
        token,
        safe_id,
        video_path,
        total_bytes,
        file_name,
        mime_type,
        complete_payload_json,
    )
    .await
}

async fn tokio_less_upload(
    app: AppHandle,
    base_url: String,
    token: String,
    exam_id: String,
    video_path: PathBuf,
    total_bytes: u64,
    file_name: String,
    mime_type: String,
    complete_payload_json: String,
) -> Result<serde_json::Value, String> {
    let result = std::thread::spawn(move || -> Result<serde_json::Value, String> {
        const CHUNK_SIZE: usize = 8 * 1024 * 1024; // 8 MiB
        let total_chunks = ((total_bytes as usize) + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;

        let mut file = File::open(&video_path).map_err(|e| e.to_string())?;
        let mut uploaded_bytes: u64 = 0;
        let mut buf = vec![0u8; CHUNK_SIZE];

        for chunk_index in 0..total_chunks {
            let offset = (chunk_index as u64) * (CHUNK_SIZE as u64);
            file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
            let remaining = (total_bytes - offset) as usize;
            let to_read = remaining.min(CHUNK_SIZE);
            file.read_exact(&mut buf[..to_read])
                .map_err(|e| e.to_string())?;
            let chunk_data = buf[..to_read].to_vec();

            let chunk_url = format!("{}/api/desktop/academy-exam/{}/upload-chunk", base_url, exam_id);
            let mut last_err = String::new();
            let mut ok = false;

            for attempt in 0..3 {
                let res = client
                    .post(&chunk_url)
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/octet-stream")
                    .header("X-Chunk-Index", chunk_index.to_string())
                    .header("X-Total-Chunks", total_chunks.to_string())
                    .header("X-Total-Size", total_bytes.to_string())
                    .header("X-Mime-Type", &mime_type)
                    .header("X-File-Name", &file_name)
                    .body(chunk_data.clone())
                    .send();

                match res {
                    Ok(r) if r.status().is_success() => {
                        ok = true;
                        break;
                    }
                    Ok(r) => {
                        let st = r.status();
                        let txt = r.text().unwrap_or_default();
                        last_err = format!("HTTP {}: {}", st, txt);
                    }
                    Err(e) => {
                        last_err = e.to_string();
                    }
                }
                std::thread::sleep(Duration::from_millis(800 * (attempt + 1) as u64));
            }

            if !ok {
                return Err(format!(
                    "チャンク {}/{} の送信に失敗しました: {}",
                    chunk_index + 1,
                    total_chunks,
                    last_err
                ));
            }

            uploaded_bytes += to_read as u64;
            let percent = ((uploaded_bytes as f64) / (total_bytes as f64)) * 100.0;
            let _ = app.emit(
                "academy_upload_progress",
                AcademyUploadProgress {
                    exam_id: exam_id.clone(),
                    phase: "uploading_video".to_string(),
                    chunk_index: chunk_index + 1,
                    total_chunks,
                    uploaded_bytes,
                    total_bytes,
                    percent: (percent * 10.0).round() / 10.0,
                },
            );
        }

        let _ = app.emit(
            "academy_upload_progress",
            AcademyUploadProgress {
                exam_id: exam_id.clone(),
                phase: "finalizing".to_string(),
                chunk_index: total_chunks,
                total_chunks,
                uploaded_bytes: total_bytes,
                total_bytes,
                percent: 100.0,
            },
        );

        let complete_url = format!("{}/api/desktop/academy-exam/{}/complete", base_url, exam_id);
        let payload_val: serde_json::Value =
            serde_json::from_str(&complete_payload_json).map_err(|e| e.to_string())?;

        let comp_res = client
            .post(&complete_url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&payload_val)
            .send()
            .map_err(|e| e.to_string())?;

        let status = comp_res.status();
        let text = comp_res.text().unwrap_or_default();
        if !status.is_success() {
            return Err(format!("試験完了送信に失敗しました (HTTP {}): {}", status, text));
        }

        let parsed: serde_json::Value = serde_json::from_str(&text)
            .unwrap_or_else(|_| serde_json::json!({ "success": true }));

        let _ = fs::remove_file(&video_path);
        Ok(parsed)
    })
    .join()
    .map_err(|_| "Upload worker thread panicked".to_string())??;

    Ok(result)
}

#[allow(dead_code)]
fn _now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
