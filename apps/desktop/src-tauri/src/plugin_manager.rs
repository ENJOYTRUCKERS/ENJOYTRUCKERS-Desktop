use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::recorder::count_pending_queue_files;
use crate::telemetry::{read_app_config, PORTAL_BASE_URL};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedDlc {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct DlcDetectionResult {
    pub ets2: Vec<DetectedDlc>,
    pub ats: Vec<DetectedDlc>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameDiagnosticEntry {
    pub game: String,
    pub path: String,
    pub dll_exists: bool,
    pub ini_exists: bool,
    pub ini_token_ok: bool,
    pub ini_port_ok: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemDiagnosticsReport {
    pub token_configured: bool,
    pub portal_reachable: bool,
    pub pending_queue_count: usize,
    pub local_telemetry_port: u16,
    pub companion_port: u16,
    pub games: Vec<GameDiagnosticEntry>,
}

#[allow(dead_code)]
fn get_registry_value(key: &str, value_name: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("reg")
            .args(["query", key, "/v", value_name])
            .creation_flags(0x08000000)
            .output()
            .ok()?;

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains(value_name) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        return Some(parts[2..].join(" "));
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (key, value_name);
    }
    None
}

#[allow(dead_code)]
pub fn get_game_install_dir_from_registry(app_id: &str) -> Option<PathBuf> {
    let keys = [
        format!(r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App {}", app_id),
        format!(r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Steam App {}", app_id),
        format!(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Steam App {}", app_id),
    ];

    for key in &keys {
        if let Some(path_str) = get_registry_value(key, "InstallLocation") {
            let path = PathBuf::from(path_str.trim());
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[allow(dead_code)]
fn get_steam_path_from_registry() -> Option<PathBuf> {
    let keys = [
        (r"HKCU\Software\Valve\Steam", "SteamPath"),
        (r"HKLM\SOFTWARE\Valve\Steam", "InstallPath"),
        (r"HKLM\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
    ];

    for (key, val) in &keys {
        if let Some(path_str) = get_registry_value(key, val) {
            let path = PathBuf::from(path_str.trim().replace('/', r"\"));
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

pub fn get_documents_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let base = PathBuf::from(userprofile);
        dirs.push(base.join("Documents"));
        dirs.push(base.join("OneDrive").join("Documents"));
        dirs.push(base.join("OneDrive").join("ドキュメント"));
    }
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Documents"));
    }
    dirs
}

pub fn find_game_dir_from_log(game_dir_name: &str) -> Option<PathBuf> {
    for doc_dir in get_documents_dirs() {
        let log_file = doc_dir.join(game_dir_name).join("game.log.txt");
        if let Ok(content) = fs::read_to_string(&log_file) {
            for line in content.lines() {
                if line.contains("Command line:") {
                    if let Some(start) = line.find('"') {
                        if let Some(end) = line[start + 1..].find('"') {
                            let exe_path = PathBuf::from(&line[start + 1..start + 1 + end]);
                            if let Some(game_root) = exe_path
                                .parent()
                                .and_then(|b| b.parent())
                                .and_then(|p| p.parent())
                            {
                                if game_root.exists() {
                                    return Some(game_root.to_path_buf());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

pub fn collect_steamapps_dirs() -> Vec<PathBuf> {
    let mut candidate_steam_dirs = vec![
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ];

    if let Some(steam_reg_path) = get_steam_path_from_registry() {
        candidate_steam_dirs.push(steam_reg_path);
    }

    for drive_letter in b'C'..=b'Z' {
        let dl = drive_letter as char;
        candidate_steam_dirs.push(PathBuf::from(format!(r"{}:\SteamLibrary", dl)));
        candidate_steam_dirs.push(PathBuf::from(format!(r"{}:\Steam", dl)));
        candidate_steam_dirs.push(PathBuf::from(format!(r"{}:\Games\SteamLibrary", dl)));
        candidate_steam_dirs.push(PathBuf::from(format!(r"{}:\Games\Steam", dl)));
    }

    let mut extra_dirs = Vec::new();
    for base in &candidate_steam_dirs {
        for vdf_sub in &[
            PathBuf::from("steamapps").join("libraryfolders.vdf"),
            PathBuf::from("libraryfolders.vdf"),
        ] {
            let vdf_path = base.join(vdf_sub);
            if let Ok(content) = fs::read_to_string(&vdf_path) {
                for line in content.lines() {
                    if line.contains("\"path\"") {
                        let parts: Vec<&str> = line.split('"').collect();
                        if parts.len() >= 4 {
                            let path_str = parts[3].replace(r"\\", r"\");
                            extra_dirs.push(PathBuf::from(path_str));
                        }
                    }
                }
            }
        }
    }
    candidate_steam_dirs.extend(extra_dirs);

    let mut seen = std::collections::HashSet::new();
    let mut steamapps_dirs = Vec::new();
    for steam_dir in candidate_steam_dirs {
        let steamapps = if steam_dir.join("steamapps").exists() {
            steam_dir.join("steamapps")
        } else {
            steam_dir
        };
        if steamapps.exists() {
            let key = steamapps.to_string_lossy().to_lowercase();
            if seen.insert(key) {
                steamapps_dirs.push(steamapps);
            }
        }
    }
    steamapps_dirs
}

pub fn find_installed_game_dirs() -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    let mut game_dirs = Vec::new();

    let mut push_if_game_dir = |dir: PathBuf| {
        if dir.join("bin").join("win_x64").exists() {
            let key = dir.to_string_lossy().to_lowercase();
            if seen.insert(key) {
                game_dirs.push(dir);
            }
        }
    };

    for (folder_name, app_id) in [
        ("Euro Truck Simulator 2", "227300"),
        ("American Truck Simulator", "270880"),
    ] {
        if let Some(dir) = find_game_dir_from_log(folder_name) {
            push_if_game_dir(dir);
        }
        if let Some(dir) = get_game_install_dir_from_registry(app_id) {
            push_if_game_dir(dir);
        }
    }

    for steamapps in collect_steamapps_dirs() {
        for folder_name in ["Euro Truck Simulator 2", "American Truck Simulator"] {
            let candidate = steamapps.join("common").join(folder_name);
            if candidate.exists() {
                push_if_game_dir(candidate);
            }
        }
    }

    game_dirs
}

fn get_ets2_dlc_name(app_id: &str) -> Option<&'static str> {
    match app_id {
        "227310" => Some("Going East!"),
        "304212" => Some("Scandinavia"),
        "304214" => Some("High Power Cargo Pack"),
        "388470" => Some("Cabin Accessories"),
        "388477" => Some("Schwarzmüller Trailer Pack"),
        "531130" => Some("Vive la France !"),
        "531131" => Some("Heavy Cargo Pack"),
        "558244" => Some("Italia"),
        "558245" => Some("Special Transport"),
        "925580" => Some("Beyond the Baltic Sea"),
        "933610" => Some("Krone Trailer Pack"),
        "1056760" => Some("Road to the Black Sea"),
        "1209460" => Some("Iberia"),
        "2004210" => Some("West Balkans"),
        "2604420" => Some("Greece"),
        "2780810" => Some("Nordic Horizons"),
        "3796990" => Some("Iceland"),
        "3809270" => Some("Coaches"),
        "3851260" => Some("Isle of Ireland"),
        "4400930" => Some("Soul of Anatolia"),
        _ => None,
    }
}

fn get_ats_dlc_name(app_id: &str) -> Option<&'static str> {
    match app_id {
        "463740" => Some("Arizona"),
        "620610" => Some("Heavy Cargo Pack"),
        "684630" => Some("New Mexico"),
        "800370" => Some("Oregon"),
        "962750" => Some("Special Transport"),
        "1015160" => Some("Washington"),
        "1104880" => Some("Utah"),
        "1209470" => Some("Idaho"),
        "1209471" => Some("Colorado"),
        "1415692" => Some("Wyoming"),
        "1465750" => Some("Texas"),
        "1811080" => Some("Montana"),
        "2209650" => Some("Oklahoma"),
        "2298430" => Some("Kansas"),
        "2543810" => Some("Nebraska"),
        "2585150" => Some("Arkansas"),
        "2730870" => Some("Missouri"),
        "3012580" => Some("Louisiana"),
        "3025440" => Some("Iowa"),
        "3486960" => Some("Illinois"),
        "3749870" => Some("South Dakota"),
        "4057480" => Some("British Columbia"),
        "4400790" => Some("North Dakota"),
        "4400800" => Some("Indiana"),
        _ => None,
    }
}

fn parse_acf_installed_dlcs(acf_content: &str) -> Vec<String> {
    let mut installed_app_ids = std::collections::HashSet::new();
    let mut disabled_app_ids = std::collections::HashSet::new();

    for line in acf_content.lines() {
        let trimmed = line.trim();
        if trimmed.contains("\"dlcappid\"") {
            let parts: Vec<&str> = trimmed.split('"').filter(|s| !s.trim().is_empty()).collect();
            if parts.len() >= 2 && parts[0] == "dlcappid" {
                let id = parts[1].trim();
                if id.chars().all(|c| c.is_ascii_digit()) && !id.is_empty() {
                    installed_app_ids.insert(id.to_string());
                }
            }
        }
        if trimmed.contains("\"DisabledDLC\"") {
            let parts: Vec<&str> = trimmed.split('"').filter(|s| !s.trim().is_empty()).collect();
            if parts.len() >= 2 && parts[0] == "DisabledDLC" {
                for id in parts[1].split(',') {
                    let clean = id.trim();
                    if !clean.is_empty() {
                        disabled_app_ids.insert(clean.to_string());
                    }
                }
            }
        }
    }

    installed_app_ids
        .into_iter()
        .filter(|id| !disabled_app_ids.contains(id))
        .collect()
}

#[tauri::command]
pub fn detect_installed_dlcs() -> DlcDetectionResult {
    let mut result = DlcDetectionResult::default();
    let mut ets2_ids = std::collections::HashSet::new();
    let mut ats_ids = std::collections::HashSet::new();

    for steamapps in collect_steamapps_dirs() {
        if let Ok(acf) = fs::read_to_string(steamapps.join("appmanifest_227300.acf")) {
            for id in parse_acf_installed_dlcs(&acf) {
                if ets2_ids.insert(id.clone()) {
                    let name = get_ets2_dlc_name(&id).unwrap_or(&id).to_string();
                    result.ets2.push(DetectedDlc { id: Some(id), name });
                }
            }
        }
        if let Ok(acf) = fs::read_to_string(steamapps.join("appmanifest_270880.acf")) {
            for id in parse_acf_installed_dlcs(&acf) {
                if ats_ids.insert(id.clone()) {
                    let name = get_ats_dlc_name(&id).unwrap_or(&id).to_string();
                    result.ats.push(DetectedDlc { id: Some(id), name });
                }
            }
        }
    }

    result
}

pub fn write_plugin_ini(plugin_dir: &Path, token: &str) {
    let ini_path = plugin_dir.join("enjoy_telemetry.ini");
    let new_content = format!(
        "[Settings]\nToken={}\nServerIP=127.0.0.1\nServerPort=3001\n",
        token
    );
    let _ = fs::write(ini_path, new_content);
}

pub fn update_plugin_token(token: &str) {
    if token.trim().is_empty() {
        return;
    }
    for game_dir in find_installed_game_dirs() {
        let plugin_dir = game_dir.join("bin").join("win_x64").join("plugins");
        if !plugin_dir.exists() {
            let _ = fs::create_dir_all(&plugin_dir);
        }
        if plugin_dir.exists() {
            write_plugin_ini(&plugin_dir, token);
        }
    }
}

pub fn fix_plugin_config(token: &str) {
    let dll_url = format!("{}/downloads/enjoy_telemetry.dll", PORTAL_BASE_URL);
    let dll_bytes = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .ok()
        .and_then(|client| client.get(&dll_url).send().ok())
        .and_then(|res| {
            if res.status().is_success() {
                res.bytes().ok()
            } else {
                None
            }
        });

    for game_dir in find_installed_game_dirs() {
        let plugin_dir = game_dir.join("bin").join("win_x64").join("plugins");
        if !plugin_dir.exists() {
            let _ = fs::create_dir_all(&plugin_dir);
        }
        if plugin_dir.exists() {
            if let Some(bytes) = &dll_bytes {
                let dll_path = plugin_dir.join("enjoy_telemetry.dll");
                let new_hash = Sha256::digest(bytes.as_ref());
                let should_write = match fs::read(&dll_path) {
                    Ok(existing) => Sha256::digest(&existing).as_slice() != new_hash.as_slice(),
                    Err(_) => true,
                };
                if should_write {
                    let _ = fs::write(&dll_path, bytes);
                }
            }

            let ini_path = plugin_dir.join("enjoy_telemetry.ini");
            let mut current_token = token.to_string();
            if current_token.trim().is_empty() {
                current_token = "UnknownToken".to_string();
                if let Ok(content) = fs::read_to_string(&ini_path) {
                    for line in content.lines() {
                        if let Some(raw_tok) = line.strip_prefix("Token=") {
                            let trimmed = raw_tok.trim();
                            if !trimmed.is_empty() {
                                current_token = trimmed.to_string();
                            }
                        }
                    }
                }
            }
            write_plugin_ini(&plugin_dir, &current_token);
        }
    }
}

#[tauri::command]
pub fn run_system_diagnostics(app: tauri::AppHandle) -> SystemDiagnosticsReport {
    let cfg = read_app_config(&app);
    let token_configured = !cfg.telemetry_token.trim().is_empty();
    let pending_queue_count = count_pending_queue_files(&app);

    let time_url = format!("{}/api/desktop/time", PORTAL_BASE_URL);
    let portal_reachable = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()
        .and_then(|c| c.get(&time_url).send().ok())
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let mut games = Vec::new();
    for game_dir in find_installed_game_dirs() {
        let plugin_dir = game_dir.join("bin").join("win_x64").join("plugins");
        let dll_path = plugin_dir.join("enjoy_telemetry.dll");
        let ini_path = plugin_dir.join("enjoy_telemetry.ini");

        let mut ini_token_ok = false;
        let mut ini_port_ok = false;
        if let Ok(ini_text) = fs::read_to_string(&ini_path) {
            ini_port_ok = ini_text.contains("ServerPort=3001");
            for line in ini_text.lines() {
                if let Some(tok) = line.strip_prefix("Token=") {
                    let t = tok.trim();
                    ini_token_ok = !t.is_empty() && t != "UnknownToken";
                }
            }
        }

        let dir_str = game_dir.to_string_lossy().to_string();
        let game_label = if dir_str.contains("American Truck Simulator") {
            "ATS".to_string()
        } else {
            "ETS2".to_string()
        };

        games.push(GameDiagnosticEntry {
            game: game_label,
            path: dir_str,
            dll_exists: dll_path.exists(),
            ini_exists: ini_path.exists(),
            ini_token_ok,
            ini_port_ok,
        });
    }

    SystemDiagnosticsReport {
        token_configured,
        portal_reachable,
        pending_queue_count,
        local_telemetry_port: 3001,
        companion_port: 3002,
        games,
    }
}

#[tauri::command]
pub fn repair_plugin_installation(app: tauri::AppHandle) -> SystemDiagnosticsReport {
    let cfg = read_app_config(&app);
    fix_plugin_config(&cfg.telemetry_token);
    run_system_diagnostics(app)
}
