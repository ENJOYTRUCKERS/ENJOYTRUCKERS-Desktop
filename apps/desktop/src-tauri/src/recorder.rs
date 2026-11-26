use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

use crate::telemetry::{
    now_unix_secs, unix_secs_to_iso8601, RoadType, TelemetryData, WorkType, PORTAL_BASE_URL,
};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogEntry {
    pub seq: u32,
    pub work_type: String,
    pub is_loaded: bool,
    pub road_type: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_sec: u64,
    pub start_x: Option<f64>,
    pub start_y: Option<f64>,
    pub end_x: Option<f64>,
    pub end_y: Option<f64>,
    pub location_name: Option<String>,
    pub distance_km: f64,
    pub cargo_code: Option<String>,
    pub cargo_name: Option<String>,
    pub weight_tons: Option<f64>,
    pub fuel_liters: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TachographEventEntry {
    pub timestamp: String,
    pub game_time: Option<i64>,
    pub event_type: String,
    pub severity: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub speed_kmh: Option<f64>,
    pub speed_limit_kmh: Option<f64>,
    pub g_force: Option<f64>,
    pub fine_offence: Option<String>,
    pub fine_amount: Option<f64>,
    pub details: Option<serde_json::Value>,
}

pub struct ActiveWorkTracker {
    pub seq: u32,
    pub work_type: WorkType,
    pub is_loaded: bool,
    pub road_type: RoadType,
    pub started_at_unix: u64,
    pub start_odo: f64,
    pub start_x: f64,
    pub start_z: f64,
    pub location_name: String,
    pub cargo_code: String,
    pub cargo_name: String,
    pub weight_tons: f64,
}

pub struct SessionRecorder {
    pub session_id: String,
    pub active: bool,
    pub started_at_unix: u64,
    pub game: String,
    pub server: String,
    pub truck_brand: String,
    pub truck_model: String,
    pub license_plate: String,
    pub source_city: String,
    pub destination_city: String,
    pub cargo_name: String,
    pub cargo_mass: f64,
    pub start_odometer: f64,
    pub start_fuel: f64,
    pub is_smart_auto_mode: bool,
    pub trace_rows: Vec<Vec<serde_json::Value>>,
    pub work_logs: Vec<WorkLogEntry>,
    pub events: Vec<TachographEventEntry>,
    pub current_work: Option<ActiveWorkTracker>,
    last_trace_x: f64,
    last_trace_z: f64,
    last_trace_t: u64,
}

impl Default for SessionRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionRecorder {
    pub fn new() -> Self {
        Self {
            session_id: String::new(),
            active: false,
            started_at_unix: 0,
            game: "ets2".to_string(),
            server: String::new(),
            truck_brand: String::new(),
            truck_model: String::new(),
            license_plate: String::new(),
            source_city: String::new(),
            destination_city: String::new(),
            cargo_name: String::new(),
            cargo_mass: 0.0,
            start_odometer: 0.0,
            start_fuel: 0.0,
            is_smart_auto_mode: true,
            trace_rows: Vec::new(),
            work_logs: Vec::new(),
            events: Vec::new(),
            current_work: None,
            last_trace_x: 0.0,
            last_trace_z: 0.0,
            last_trace_t: 0,
        }
    }

    pub fn begin_session(
        &mut self,
        app: &tauri::AppHandle,
        tel: &TelemetryData,
        work_type: WorkType,
        road_type: RoadType,
        is_loaded: bool,
        is_smart_auto_mode: bool,
    ) -> String {
        let mut rng = rand::thread_rng();
        let now = now_unix_secs();
        let rand_suffix = rand::random::<u64>();
        let sid = format!("tacho_{}_{}", now, rand_suffix);

        self.session_id = sid.clone();
        self.active = true;
        self.started_at_unix = now;
        self.game = if tel.game.trim().is_empty() {
            "ets2".to_string()
        } else {
            tel.game.trim().to_lowercase()
        };
        self.truck_brand = tel.truck_brand.clone();
        self.truck_model = tel.truck_name.clone();
        self.license_plate = tel.license_plate.clone();
        self.source_city = tel.source_city.clone();
        self.destination_city = tel.destination_city.clone();
        self.cargo_name = tel.cargo_name.clone();
        self.cargo_mass = tel.cargo_mass;
        self.start_odometer = tel.odometer;
        self.start_fuel = tel.fuel;
        self.is_smart_auto_mode = is_smart_auto_mode;
        self.trace_rows.clear();
        self.work_logs.clear();
        self.events.clear();
        self.last_trace_t = 0;

        self.current_work = Some(ActiveWorkTracker {
            seq: 1,
            work_type,
            is_loaded,
            road_type,
            started_at_unix: now,
            start_odo: tel.odometer,
            start_x: tel.x,
            start_z: tel.z,
            location_name: tel.source_city.clone(),
            cargo_code: tel.cargo_id.clone(),
            cargo_name: tel.cargo_name.clone(),
            weight_tons: tel.cargo_mass / 1000.0,
        });

        self.append_wal_line(
            app,
            &serde_json::json!({
                "kind": "session_start",
                "sessionId": sid,
                "startedAt": unix_secs_to_iso8601(now),
                "game": self.game,
            }),
        );

        sid
    }

    pub fn update_metadata_from_telemetry(&mut self, tel: &TelemetryData) {
        if !self.active {
            return;
        }
        if !tel.game.trim().is_empty() {
            self.game = tel.game.trim().to_lowercase();
        }
        if !tel.truck_brand.is_empty() {
            self.truck_brand = tel.truck_brand.clone();
        }
        if !tel.truck_name.is_empty() {
            self.truck_model = tel.truck_name.clone();
        }
        if !tel.license_plate.is_empty() {
            self.license_plate = tel.license_plate.clone();
        }
        if !tel.source_city.is_empty() && self.source_city.is_empty() {
            self.source_city = tel.source_city.clone();
        }
        if !tel.destination_city.is_empty() {
            self.destination_city = tel.destination_city.clone();
        }
        if !tel.cargo_name.is_empty() {
            self.cargo_name = tel.cargo_name.clone();
            self.cargo_mass = tel.cargo_mass;
        }
    }

    pub fn switch_work_log(
        &mut self,
        app: &tauri::AppHandle,
        tel: &TelemetryData,
        next_type: WorkType,
        is_loaded: bool,
        road_type: RoadType,
    ) {
        if !self.active {
            return;
        }
        let now = now_unix_secs();
        let next_seq = if let Some(prev) = self.current_work.take() {
            let duration_sec = now.saturating_sub(prev.started_at_unix);
            let dist = (tel.odometer - prev.start_odo).max(0.0);
            let entry = WorkLogEntry {
                seq: prev.seq,
                work_type: prev.work_type.as_str().to_string(),
                is_loaded: prev.is_loaded,
                road_type: prev.road_type.as_str().to_string(),
                started_at: unix_secs_to_iso8601(prev.started_at_unix),
                ended_at: Some(unix_secs_to_iso8601(now)),
                duration_sec,
                start_x: Some(prev.start_x),
                start_y: Some(prev.start_z),
                end_x: Some(tel.x),
                end_y: Some(tel.z),
                location_name: if prev.location_name.is_empty() {
                    None
                } else {
                    Some(prev.location_name)
                },
                distance_km: (dist * 100.0).round() / 100.0,
                cargo_code: if prev.cargo_code.is_empty() {
                    None
                } else {
                    Some(prev.cargo_code)
                },
                cargo_name: if prev.cargo_name.is_empty() {
                    None
                } else {
                    Some(prev.cargo_name)
                },
                weight_tons: if prev.weight_tons > 0.0 {
                    Some((prev.weight_tons * 10.0).round() / 10.0)
                } else {
                    None
                },
                fuel_liters: None,
            };
            self.work_logs.push(entry.clone());
            self.append_wal_line(app, &serde_json::json!({ "kind": "work_log", "entry": entry }));
            prev.seq + 1
        } else {
            (self.work_logs.len() as u32) + 1
        };

        self.current_work = Some(ActiveWorkTracker {
            seq: next_seq,
            work_type: next_type,
            is_loaded,
            road_type,
            started_at_unix: now,
            start_odo: tel.odometer,
            start_x: tel.x,
            start_z: tel.z,
            location_name: if !tel.destination_city.is_empty() && !is_loaded {
                tel.destination_city.clone()
            } else {
                tel.source_city.clone()
            },
            cargo_code: tel.cargo_id.clone(),
            cargo_name: tel.cargo_name.clone(),
            weight_tons: tel.cargo_mass / 1000.0,
        });
    }

    pub fn push_event(&mut self, app: &tauri::AppHandle, event: TachographEventEntry) {
        if !self.active {
            return;
        }
        if true {
            self.events.push(event.clone());
            match self.append_wal_line(app, &serde_json::json!({ "kind": "event", "event": event })) {
            Ok(_) => {},
            Err(e) => {
                eprintln!("Failed to append event to WAL: {}", e);
            }
        }
            Ok(_) => {},
            Err(e) => {
                eprintln!("Failed to append event to WAL: {}", e);
            }
        }
        }
    }

    /// Adaptive 1Hz sampling: records every 1s when moving, or every 30s when parked/stationary.
    pub fn maybe_record_trace_sample(
        &mut self,
        tel: &TelemetryData,
        work_type: &WorkType,
        g_lat: f64,
        g_vert: f64,
        g_long: f64,
    ) {
        if !self.active || tel.paused {
            return;
        }
        let now = now_unix_secs();
        let moved_sq =
            (tel.x - self.last_trace_x).powi(2) + (tel.z - self.last_trace_z).powi(2);
        let is_stationary = tel.speed.abs() < 0.8 && moved_sq < 1.0;

        if is_stationary && self.last_trace_t > 0 && now.saturating_sub(self.last_trace_t) < 30 && moved_sq <= 100.0 {
            return;
        }
        if !self.trace_rows.is_empty() && now < self.last_trace_t {
            return;
        }

        self.last_trace_x = tel.x;
        self.last_trace_z = tel.z;
        self.last_trace_t = now;

        let t_rel = now.saturating_sub(self.started_at_unix);
        let st_code = match work_type {
            WorkType::Driving => 1,
            WorkType::Loading => 2,
            WorkType::Unloading => 3,
            WorkType::Rest | WorkType::Break => 4,
            WorkType::Ferry | WorkType::Train => 5,
            WorkType::Refuel => 6,
            _ => 0,
        };

        let r2 = |v: f64| (v * 100.0).round() / 100.0;
        let r3 = |v: f64| (v * 1000.0).round() / 1000.0;

        self.trace_rows.push(vec![
            serde_json::json!(t_rel),
            serde_json::json!(r2(tel.x)),
            serde_json::json!(r2(tel.z)),
            serde_json::json!(r2(tel.y)),
            serde_json::json!((tel.speed.abs() * 10.0).round() / 10.0),
            if tel.speed_limit > 0.0 {
                serde_json::json!(tel.speed_limit.round())
            } else {
                serde_json::Value::Null
            },
            serde_json::json!(tel.engine_rpm.round()),
            serde_json::json!(tel.gear),
            serde_json::json!(r3(g_lat)),
            serde_json::json!(r3(g_vert)),
            serde_json::json!(r3(g_long)),
            serde_json::json!(r2(tel.fuel)),
            serde_json::json!(st_code),
        ]);
    }

    pub fn finalize_payload(
        &mut self,
        app: &tauri::AppHandle,
        token: &str,
        tel: &TelemetryData,
        analyzer_summary: serde_json::Value,
    ) -> Result<PathBuf, String> {
        // Close trailing work log row
        if let Some(last_work) = self.current_work.take() {
            let now = now_unix_secs();
            let dist = (tel.odometer - last_work.start_odo).max(0.0);
            self.work_logs.push(WorkLogEntry {
                seq: last_work.seq,
                work_type: last_work.work_type.as_str().to_string(),
                is_loaded: last_work.is_loaded,
                road_type: last_work.road_type.as_str().to_string(),
                started_at: unix_secs_to_iso8601(last_work.started_at_unix),
                ended_at: Some(unix_secs_to_iso8601(now)),
                duration_sec: now.saturating_sub(last_work.started_at_unix),
                start_x: Some(last_work.start_x),
                start_y: Some(last_work.start_z),
                end_x: Some(tel.x),
                end_y: Some(tel.z),
                location_name: if last_work.location_name.is_empty() {
                    None
                } else {
                    Some(last_work.location_name)
                },
                distance_km: (dist * 100.0).round() / 100.0,
                cargo_code: if last_work.cargo_code.is_empty() {
                    None
                } else {
                    Some(last_work.cargo_code)
                },
                cargo_name: if last_work.cargo_name.is_empty() {
                    None
                } else {
                    Some(last_work.cargo_name)
                },
                weight_tons: if last_work.weight_tons > 0.0 {
                    Some((last_work.weight_tons * 10.0).round() / 10.0)
                } else {
                    None
                },
                fuel_liters: None,
            });
        }

        let ended_at_unix = now_unix_secs();
        let driven_km = (tel.odometer - self.start_odometer).max(0.0);
        let fuel_used_l = (self.start_fuel - tel.fuel).max(0.0);
        let avg_l_100 = if driven_km > 1.0 && fuel_used_l > 0.0 {
            (fuel_used_l / driven_km) * 100.0
        } else {
            0.0
        };

        let mut payload = analyzer_summary;
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("token".to_string(), serde_json::json!(token));
            obj.insert("game".to_string(), serde_json::json!(self.game));
            obj.insert(
                "truckBrand".to_string(),
                serde_json::json!(self.truck_brand),
            );
            obj.insert(
                "truckModel".to_string(),
                serde_json::json!(self.truck_model),
            );
            obj.insert(
                "licensePlate".to_string(),
                serde_json::json!(self.license_plate),
            );
            obj.insert("sourceCity".to_string(), serde_json::json!(self.source_city));
            obj.insert(
                "destinationCity".to_string(),
                serde_json::json!(self.destination_city),
            );
            obj.insert("cargoName".to_string(), serde_json::json!(self.cargo_name));
            obj.insert("cargoMass".to_string(), serde_json::json!(self.cargo_mass));
            obj.insert(
                "startOdometer".to_string(),
                serde_json::json!(self.start_odometer),
            );
            obj.insert("endOdometer".to_string(), serde_json::json!(tel.odometer));
            obj.insert(
                "distanceDriven".to_string(),
                serde_json::json!((driven_km * 100.0).round() / 100.0),
            );
            obj.insert("fuelUsedL".to_string(), serde_json::json!((fuel_used_l * 100.0).round() / 100.0));
            obj.insert("avgFuelL100km".to_string(), serde_json::json!((avg_l_100 * 100.0).round() / 100.0));
            obj.insert(
                "startedAt".to_string(),
                serde_json::json!(unix_secs_to_iso8601(self.started_at_unix)),
            );
            obj.insert(
                "endedAt".to_string(),
                serde_json::json!(unix_secs_to_iso8601(ended_at_unix)),
            );
            obj.insert(
                "isSmartAutoMode".to_string(),
                serde_json::json!(self.is_smart_auto_mode),
            );
            obj.insert("workLogs".to_string(), serde_json::json!(self.work_logs));
            obj.insert("events".to_string(), serde_json::json!(self.events));
            obj.insert(
                "trace".to_string(),
                serde_json::json!({
                    "version": 1,
                    "columns": ["t","x","z","alt","spd","lim","rpm","gear","gx","gy","gz","fuel","st"],
                    "rows": self.trace_rows,
                }),
            );
        }

        let queue_dir = get_queue_dir(app);
        let file_name = if self.session_id.is_empty() {
            format!("tacho_{}.json.gz", ended_at_unix)
        } else {
            format!("{}.json.gz", self.session_id)
        };
        let final_path = queue_dir.join(&file_name);
        let tmp_path = queue_dir.join(format!("{}.tmp", file_name));

        let raw_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
        {
            let f = fs::File::create(&tmp_path).map_err(|e| { log::error!("Failed to create file: {}", e); e })?;
            let mut encoder = GzEncoder::new(f, Compression::default());
            encoder.write_all(&raw_bytes).map_err(|e| { log::error!("Failed to write to file: {}", e); e })?;
            encoder.finish().map_err(|e| { log::error!("Failed to finish file encoding: {}", e); e })?;
        }
        fs::rename(&tmp_path, &final_path).map_err(|e| { log::error!("Failed to rename file: {}", e); e })?;

        // Reset session & WAL
        self.clear_wal(app);
        self.append_wal_line(app, &serde_json::json!({ "kind": "session_end", "sessionId": self.session_id, "endedAt": unix_secs_to_iso8601(now_unix_secs()) }));
        self.active = false;
        self.session_id.clear();
        self.trace_rows.clear();
        self.work_logs.clear();
        self.events.clear();

        Ok(final_path)
    }

    fn append_wal_line(&self, app: &tauri::AppHandle, val: &serde_json::Value) -> Result<(), String> {
        let wal_dir = get_wal_dir(app);
        let wal_path = wal_dir.join("active_session.jsonl");
        let wal_path = wal_dir.join("active_session.jsonl");
        if let Ok(line) = serde_json::to_string(val) {
            if let Err(e) = writeln!(file, "{}", line) {
                log::error!("Failed to write to WAL file: {}", e);
                return Err(e.to_string());
            }
        } else {
            log::error!("Failed to serialize WAL line: {}", val);
            return Err("Failed to serialize WAL line".to_string());
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(wal_path).map_err(|e| { log::error!("Failed to open WAL file: {}", e); e })? {
            let _ = writeln!(file, "{}", line).map_err(|e| { log::error!("Failed to write to WAL file: {}", e); })?
        }
            if let Err(e) = writeln!(file, "{}", line) {
                log::error!("Failed to write to WAL file: {}", e);
            }
        } else {
            log::error!("Failed to serialize WAL line: {}", val);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(wal_path).map_err(|e| { log::error!("Failed to open WAL file: {}", e); e })? {
            let _ = writeln!(file, "{}", line).map_err(|e| { log::error!("Failed to write to WAL file: {}", e); })?
        }
            if let Err(e) = writeln!(file, "{}", line) {
                log::error!("Failed to write to WAL file: {}", e);
            }
        } else {
            log::error!("Failed to serialize WAL line: {}", val);
        }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(wal_path).map_err(|e| { log::error!("Failed to open WAL file: {}", e); e })? {
                let _ = writeln!(file, "{}", line).map_err(|e| { log::error!("Failed to write to WAL file: {}", e); })?
            }
        }
    }

    fn clear_wal(&self, app: &tauri::AppHandle) {
        let wal_path = get_wal_dir(app).join("active_session.jsonl");
        if wal_path.exists() {
            let _ = fs::remove_file(wal_path);
        }
    }

    pub fn recover_wal_on_startup(&mut self, app: &tauri::AppHandle) {
        let wal_path = get_wal_dir(app).join("active_session.jsonl");
        let Ok(content) = fs::read_to_string(&wal_path) else {
            return;
        };
        let mut recovered_sid = String::new();
        let mut recovered_game = "ets2".to_string();
        let mut recovered_logs = Vec::new();
        let mut recovered_events = Vec::new();

        for line in content.lines() {
            let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };
            match val.get("kind").and_then(|v| v.as_str()).unwrap_or("") {
                "session_start" => {
                    if let Some(sid) = val.get("sessionId").and_then(|v| v.as_str()) {
                        recovered_sid = sid.to_string();
                    }
                    if let Some(g) = val.get("game").and_then(|v| v.as_str()) {
                        recovered_game = g.to_string();
                    }
                }
                "work_log" => {
                    if let Some(entry_val) = val.get("entry") {
                        if let Ok(entry) = serde_json::from_value::<WorkLogEntry>(entry_val.clone())
                        {
                            recovered_logs.push(entry);
                        }
                    }
                }
                "event" => {
                    if let Some(ev_val) = val.get("event") {
                        if let Ok(ev) =
                            serde_json::from_value::<TachographEventEntry>(ev_val.clone())
                        {
                            recovered_events.push(ev);
                        }
                    }
                }
                _ => {}
            }
        }

        if !recovered_sid.is_empty() {
            self.session_id = recovered_sid;
            self.active = true;
            self.started_at_unix = now_unix_secs().saturating_sub(60);
            self.game = recovered_game;
            self.work_logs = recovered_logs;
            self.events = recovered_events;
        }
    }
}

pub fn get_wal_dir(app: &tauri::AppHandle) -> PathBuf {
    let mut path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    path.push("tachograph_wal");
    let _ = fs::create_dir_all(&path);
    path
}

pub fn get_queue_dir(app: &tauri::AppHandle) -> PathBuf {
    let mut path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    path.push("tachograph_queue");
    let _ = fs::create_dir_all(&path);
    path
}

pub fn count_pending_queue_files(app: &tauri::AppHandle) -> usize {
    let dir = get_queue_dir(app);
    fs::read_dir(dir)
        .ok()
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| {
                    e.path()
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.ends_with(".json.gz"))
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn upload_single_queue_file(path: &Path) -> bool {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut decoder = GzDecoder::new(file);
    let mut json_str = String::new();
    if decoder.read_to_string(&mut json_str).is_err() {
        return false;
    }

    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    let url = format!("{}/api/telemetry/tachograph", PORTAL_BASE_URL);
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(json_str)
        .send()
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub fn flush_pending_uploads(app: &tauri::AppHandle) -> (usize, usize) {
    let dir = get_queue_dir(app);
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return (0, 0),
    };
    let mut sent = 0;
    let mut remaining = 0;
    for entry in entries.filter_map(Result::ok) {
        let p = entry.path();
        let is_gz = p
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with(".json.gz"))
            .unwrap_or(false);
        if !is_gz {
            continue;
        }
        if upload_single_queue_file(&p) {
            let _ = fs::remove_file(&p);
            sent += 1;
        } else {
            remaining += 1;
        }
    }
    (sent, remaining)
}
