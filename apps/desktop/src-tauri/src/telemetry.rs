use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as b64, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub const PORTAL_BASE_URL: &str = "https://portal.truckers.jp";

fn default_true() -> bool {
    true
}

fn default_driving_pattern() -> String {
    "A".to_string()
}

fn default_overlay_opacity() -> f64 {
    0.92
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct TrailerData {
    pub index: usize,
    pub connected: bool,
    pub x: f64,
    pub y: f64,
    pub altitude: f64,
    pub heading: f64,
    pub pitch: f64,
    pub roll: f64,
    pub cargo_damage: f64,
    pub wear_body: f64,
    pub wear_chassis: f64,
    pub wear_wheels: f64,
    #[serde(rename = "bodyType")]
    pub body_type: String,
    #[serde(rename = "chainType")]
    pub chain_type: String,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct GameplayEventData {
    pub seq: u64,
    pub id: String,
    pub sim_time: f64,
    pub attributes: serde_json::Value,
}

#[derive(Default, Clone, Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct TelemetryData {
    pub sdk_version: u32,
    pub token: String,
    pub game: String,

    pub paused: bool,
    pub simulation_time: f64,
    pub paused_simulation_time: f64,
    pub local_scale: f64,
    pub game_time: i64,
    pub multiplayer_time_offset: i64,
    pub rest_stop: i64,
    pub mandatory_break: i64,

    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub heading: f64,
    pub pitch: f64,
    pub roll: f64,

    // 3-axis G & acceleration from SDK 1.16
    pub accel_x: f64,
    pub accel_y: f64,
    pub accel_z: f64,
    pub g_lateral: f64,
    pub g_vertical: f64,
    pub g_longitudinal: f64,
    pub g_jerk: f64,

    pub speed: f64,
    pub engine_rpm: f64,
    pub rpm_limit: f64,
    pub engine_gear: i32,
    pub gear: i32,
    pub cruise_control: f64,

    pub input_steering: f64,
    pub input_throttle: f64,
    pub input_brake: f64,
    pub input_clutch: f64,
    pub effective_steering: f64,
    pub effective_throttle: f64,
    pub brake: f64,
    pub effective_clutch: f64,

    pub parking_brake: bool,
    pub motor_brake: bool,
    pub retarder: f64,
    pub retarder_steps: i32,
    pub brake_air_pressure: f64,
    pub brake_air_warning: bool,
    pub brake_air_emergency: bool,
    pub brake_temperature: f64,

    pub odometer: f64,
    pub fuel: f64,
    pub fuel_capacity: f64,
    pub fuel_warning: bool,
    pub fuel_avg_consumption: f64,
    pub fuel_range: f64,
    pub adblue: f64,
    pub adblue_warning: bool,

    pub oil_pressure_warning: bool,
    pub water_temp_warning: bool,
    pub battery_voltage_warning: bool,
    pub electric_enabled: bool,
    pub engine_enabled: bool,

    pub lblinker: bool,
    pub rblinker: bool,
    pub hazard: bool,
    pub parking_light: bool,
    pub low_beam: bool,
    pub high_beam: bool,
    pub aux_front: bool,
    pub aux_roof: bool,
    pub beacon: bool,
    pub brake_light: bool,
    pub reverse_light: bool,
    pub wipers: bool,
    pub differential_lock: bool,
    pub lift_axle: bool,
    pub trailer_lift_axle: bool,
    pub wheel_offroad: bool,

    pub wear_engine: f64,
    pub wear_transmission: f64,
    pub wear_cabin: f64,
    pub wear_chassis: f64,
    pub wear_wheels: f64,

    pub nav_distance: f64,
    pub nav_time: f64,
    pub speed_limit: f64,
    pub cargo_damage: f64,

    pub trailer_connected: bool,
    pub trailer_x: f64,
    pub trailer_y: f64,
    pub trailer_z: f64,
    pub trailer_heading: f64,
    pub trailer_pitch: f64,
    pub trailer_roll: f64,
    pub trailer_body_type: String,
    pub trailer_chain_type: String,
    pub trailers: Vec<TrailerData>,

    pub truck_brand_id: String,
    pub truck_brand: String,
    pub truck_id: String,
    pub truck_name: String,
    pub license_plate: String,
    pub license_plate_country: String,

    pub cargo_id: String,
    pub cargo_name: String,
    pub cargo_mass: f64,
    pub source_city_id: String,
    pub source_city: String,
    pub destination_city_id: String,
    pub destination_city: String,
    pub source_company_id: String,
    pub source_company: String,
    pub destination_company_id: String,
    pub destination_company: String,
    pub planned_distance_km: u32,
    pub job_income: i64,
    pub delivery_time: i64,
    pub cargo_loaded: bool,
    pub job_market: String,
    pub is_special_job: bool,

    pub events: Vec<GameplayEventData>,
    pub timestamp: u64,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
pub enum WorkStatus {
    Idle,
    Working,
    Resting,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum WorkType {
    Driving,
    Loading,
    Unloading,
    Rest,
    Break,
    Ferry,
    Train,
    Refuel,
    Wait,
    Idle,
}

impl WorkType {
    pub fn as_str(&self) -> &'static str {
        match self {
            WorkType::Driving => "driving",
            WorkType::Loading => "loading",
            WorkType::Unloading => "unloading",
            WorkType::Rest => "rest",
            WorkType::Break => "break",
            WorkType::Ferry => "ferry",
            WorkType::Train => "train",
            WorkType::Refuel => "refuel",
            WorkType::Wait => "wait",
            WorkType::Idle => "idle",
        }
    }

    pub fn from_str_lossy(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "driving" | "drive" => WorkType::Driving,
            "loading" | "load" => WorkType::Loading,
            "unloading" | "unload" => WorkType::Unloading,
            "rest" | "resting" => WorkType::Rest,
            "break" | "sleep" => WorkType::Break,
            "ferry" => WorkType::Ferry,
            "train" => WorkType::Train,
            "refuel" | "fuel" => WorkType::Refuel,
            "wait" | "waiting" => WorkType::Wait,
            _ => WorkType::Idle,
        }
    }

    pub fn ja_label(&self) -> &'static str {
        match self {
            WorkType::Driving => "走行中",
            WorkType::Loading => "荷積中",
            WorkType::Unloading => "荷卸中",
            WorkType::Rest => "休憩中",
            WorkType::Break => "休息中",
            WorkType::Ferry => "フェリー",
            WorkType::Train => "鉄道移動",
            WorkType::Refuel => "給油中",
            WorkType::Wait => "待機中",
            WorkType::Idle => "業務終了",
        }
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum RoadType {
    City,
    Local,
    Highway,
    Private,
}

impl RoadType {
    pub fn as_str(&self) -> &'static str {
        match self {
            RoadType::City => "city",
            RoadType::Local => "local",
            RoadType::Highway => "highway",
            RoadType::Private => "private",
        }
    }

    pub fn from_str_lossy(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "city" => RoadType::City,
            "highway" => RoadType::Highway,
            "private" => RoadType::Private,
            _ => RoadType::Local,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WorkState {
    pub status: WorkStatus,
    pub work_type: WorkType,
    pub road_type: RoadType,
    pub is_loaded: bool,
    pub is_smart_auto_mode: bool,
    pub work_seconds: u64,
    pub rest_seconds: u64,
    pub continuous_driving_seconds: u64,
    pub total_driving_seconds: u64,
    pub current_break_seconds: u64,
    pub total_break_seconds: u64,
    pub break_bank_seconds: u64,
    pub max_continuous_driving_sec: u64,
    pub start_odometer: f64,
    pub max_speed: f64,
    pub is_430_warning: bool,
    pub is_430_violation: bool,
    pub violation_430_count: u32,
    // Live G & safety snapshot
    pub live_g_long: f64,
    pub live_g_lat: f64,
    pub live_g_vert: f64,
    pub max_forward_g: f64,
    pub max_brake_g: f64,
    pub max_lateral_g: f64,
    pub max_vertical_g: f64,
    pub g_score: f64,
    pub g_rank: String,
    pub harsh_accel_count: u32,
    pub harsh_brake_count: u32,
    pub harsh_corner_count: u32,
    pub high_jerk_count: u32,
    pub impact_count: u32,
    pub is_sos: bool,
    pub sos_message: String,
    pub active_session_id: String,
    pub distance_driven_km: f64,
    pub work_status_label: String,
    pub pending_queue_count: usize,
}

impl Default for WorkState {
    fn default() -> Self {
        Self {
            status: WorkStatus::Idle,
            work_type: WorkType::Idle,
            road_type: RoadType::Local,
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
            start_odometer: 0.0,
            max_speed: 0.0,
            is_430_warning: false,
            is_430_violation: false,
            violation_430_count: 0,
            live_g_long: 0.0,
            live_g_lat: 0.0,
            live_g_vert: 0.0,
            max_forward_g: 0.0,
            max_brake_g: 0.0,
            max_lateral_g: 0.0,
            max_vertical_g: 0.0,
            g_score: 100.0,
            g_rank: "S".to_string(),
            harsh_accel_count: 0,
            harsh_brake_count: 0,
            harsh_corner_count: 0,
            high_jerk_count: 0,
            impact_count: 0,
            is_sos: false,
            sos_message: String::new(),
            active_session_id: String::new(),
            distance_driven_km: 0.0,
            work_status_label: "業務終了".to_string(),
            pending_queue_count: 0,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct AppConfig {
    pub telemetry_token: String,
    #[serde(default = "default_true")]
    pub smart_auto_mode: bool,
    #[serde(default = "default_driving_pattern")]
    pub driving_view_pattern: String,
    #[serde(default = "default_overlay_opacity")]
    pub overlay_opacity: f64,
    #[serde(default = "default_true")]
    pub voice_enabled: bool,
    #[serde(default)]
    pub lan_companion_enabled: bool,
    #[serde(default)]
    pub feature_flags: HashMap<String, bool>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            telemetry_token: String::new(),
            smart_auto_mode: true,
            driving_view_pattern: "A".to_string(),
            overlay_opacity: 0.92,
            voice_enabled: true,
            lan_companion_enabled: false,
            feature_flags: HashMap::new(),
        }
    }
}

pub fn get_config_path(app: &tauri::AppHandle) -> PathBuf {
    let mut path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let _ = fs::create_dir_all(&path);
    path.push("config.enc");
    path
}

fn get_crypto_key() -> Key<Aes256Gcm> {
    let hw_id = machine_uid::get().unwrap_or_else(|_| "UNKNOWN_MACHINE".to_string());
    let mut hasher = Sha256::new();
    hasher.update(b"ENJOYTRUCKERS_SECURE_SALT_991823");
    hasher.update(hw_id.as_bytes());
    let result = hasher.finalize();
    *Key::<Aes256Gcm>::from_slice(&result)
}

pub fn encrypt_data(plaintext: &str) -> Result<String, String> {
    let key = get_crypto_key();
    let cipher = Aes256Gcm::new(&key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut payload = nonce.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(b64.encode(payload))
}

pub fn decrypt_data(encoded: &str) -> Result<String, String> {
    let payload = b64.decode(encoded).map_err(|e| e.to_string())?;
    if payload.len() < 12 {
        return Err("Payload too short".into());
    }
    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let key = get_crypto_key();
    let cipher = Aes256Gcm::new(&key);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

pub fn read_app_config(app: &tauri::AppHandle) -> AppConfig {
    let path = get_config_path(app);
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(decrypted) = decrypt_data(&content) {
            return serde_json::from_str(&decrypted).unwrap_or_default();
        }
    }
    AppConfig::default()
}

pub fn write_app_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app);
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    let encrypted = encrypt_data(&json)?;
    fs::write(path, encrypted).map_err(|e| e.to_string())
}

pub fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Converts UNIX epoch seconds to an ISO 8601 UTC string using Howard Hinnant's civil-from-days formula.
pub fn unix_secs_to_iso8601(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, m, d, hour, minute, second
    )
}
