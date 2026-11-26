use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server};

use crate::telemetry::{TelemetryData, WorkState, WorkType};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompanionInfo {
    pub running: bool,
    pub port: u16,
    pub url: Option<String>,
    pub lan_ip: Option<String>,
}

pub struct CompanionServerManager {
    pub running: Arc<AtomicBool>,
    pub telemetry: Arc<Mutex<TelemetryData>>,
    pub work_state: Arc<Mutex<WorkState>>,
}

impl CompanionServerManager {
    pub fn new(
        telemetry: Arc<Mutex<TelemetryData>>,
        work_state: Arc<Mutex<WorkState>>,
    ) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            telemetry,
            work_state,
        }
    }
}

pub fn detect_lan_ip() -> Option<String> {
    let socket = match UdpSocket::bind("0.0.0.0:0") { Ok(s) => s, Err(e) => { eprintln!("Failed to bind UdpSocket: {}", e); drop(s); return None; } }; if let Err(e) = socket.connect("8.8.8.8:80") { eprintln!("Failed to connect UdpSocket: {}", e); let _ = socket; return None; }
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip().to_string();
    if ip == "0.0.0.0" || ip == "127.0.0.1" {
        None
    } else {
        Some(ip)
    }
}

const COMPANION_HTML: &str = r#"<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>DTS-G1D3 LAN コンパニオン</title>
<style>
  body { margin:0; font-family: system-ui, sans-serif; background:#09090b; color:#f4f4f5; }
  .wrap { max-width:520px; margin:0 auto; padding:16px; }
  .card { background:#18181f; border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; margin-bottom:12px; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .big { font-size:36px; font-weight:900; font-family:monospace; color:#38bdf8; }
  .badge { padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; background:#27272a; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  button { padding:14px; border:none; border-radius:12px; font-weight:800; font-size:14px; color:#fff; background:#27272a; cursor:pointer; }
  button.primary { background:#0284c7; }
  button.sos { background:#dc2626; width:100%; margin-top:8px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="row">
      <div style="font-weight:800;color:#ff1155;">DTS-G1D3 COMPANION</div>
      <div id="statusBadge" class="badge">--</div>
    </div>
    <div class="row" style="margin-top:10px;">
      <div><span id="speed" class="big">0</span> <span style="color:#a1a1aa">km/h</span></div>
      <div style="text-align:right;font-family:monospace;">
        <div>Gランク: <strong id="grank">-</strong> (<span id="gscore">100</span>)</div>
        <div>430残: <strong id="remain430">04:00</strong></div>
      </div>
    </div>
  </div>
  <div class="card">
    <div style="font-size:12px;color:#a1a1aa;margin-bottom:8px;">作業ステータス遠隔切替</div>
    <div class="grid">
      <button class="primary" onclick="setWork('driving')">運転</button>
      <button onclick="setWork('rest')">休憩</button>
      <button onclick="setWork('loading')">荷積</button>
      <button onclick="setWork('unloading')">荷卸</button>
    </div>
    <button class="sos" onclick="toggleSos()">緊急 SOS トグル</button>
  </div>
</div>
<script>
async function refresh() {
  try {
    const r = await fetch('/api/state');
    const d = await r.json();
    document.getElementById('speed').textContent = Math.round(d.speed || 0);
    document.getElementById('grank').textContent = d.gRank || '-';
    document.getElementById('gscore').textContent = (d.gScore || 0).toFixed(1);
    document.getElementById('statusBadge').textContent = d.workLabel || '待機';
    const rem = Math.max(0, 14400 - (d.continuousDrivingSec || 0));
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    document.getElementById('remain430').textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  } catch {}
}
async function setWork(wt) {
  await fetch('/api/work', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ workType: wt }) });
  refresh();
}
async function toggleSos() {
  await fetch('/api/sos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
  refresh();
}
refresh();
setInterval(refresh, 500);
</script>
</body>
</html>"#;

pub fn start_companion_loop(
    app: AppHandle,
    running: Arc<AtomicBool>,
    telemetry: Arc<Mutex<TelemetryData>>,
    work_state: Arc<Mutex<WorkState>>,
) -> Result<(), String> {
    let mut running_lock = running.lock().unwrap();
    if *running_lock {
        return Ok(());
    }
    *running_lock = true;
    drop(running_lock);

    let server = Server::http("0.0.0.0:3002").map_err(|e| {
        running.store(false, Ordering::SeqCst);
        format!("Failed to bind companion port 3002: {}", e)
    })?;

    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            match server.recv_timeout(Duration::from_millis(250)) {
                Ok(Some(mut req)) => {
                    let url = req.url().to_string();
                    let method = req.method().clone();

                    if method == Method::Get && (url == "/" || url.starts_with("/?")) {
                        let resp = Response::from_string(COMPANION_HTML).with_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                                .unwrap(),
                        );
                        let _ = req.respond(resp);
                    } else if method == Method::Get && url.starts_with("/api/state") {
                        let speed = telemetry.lock().unwrap().speed.abs();
                        let ws = work_state.lock().unwrap().clone();
                        let json = serde_json::json!({
                            "speed": speed,
                            "workType": ws.work_type.as_str(),
                            "workLabel": ws.work_status_label,
                            "gScore": ws.g_score,
                            "gRank": ws.g_rank,
                            "continuousDrivingSec": ws.continuous_driving_seconds,
                            "is430Warning": ws.is_430_warning,
                            "is430Violation": ws.is_430_violation,
                            "isSos": ws.is_sos,
                            "gLong": ws.live_g_long,
                            "gLat": ws.live_g_lat,
                        });
                        let resp = Response::from_string(json.to_string()).with_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .unwrap(),
                        );
                        let _ = req.respond(resp);
                    } else if method == Method::Post && url.starts_with("/api/work") {
                        let mut body = String::new();
                        let read_result = req.as_reader().read_to_string(&mut body); if let Err(e) = read_result { eprintln!("Failed to read request body: {:?}", e); let resp = Response::from_string("Failed to read request body").with_status_code(400).with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()); let _ = req.respond(resp); continue; } else if let Err(e) = serde_json::from_str::<serde_json::Value>(&body) { eprintln!("Failed to parse JSON: {}", e); let resp = Response::from_string(format!("Failed to parse JSON: {}", e)).with_status_code(400).with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()); let _ = req.respond(resp); continue; }
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(wt_str) = v.get("workType").and_then(|x| x.as_str()) {
                                let wt = WorkType::from_str_lossy(wt_str);
                                let _ = app.emit("companion_work_command", wt.as_str());
                            }
                        }
                        let resp = Response::from_string("{\"ok\":true}").with_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .unwrap(),
                        );
                        let _ = req.respond(resp);
                    } else if method == Method::Post && url.starts_with("/api/sos") {
                        let _ = app.emit("companion_sos_toggle", true);
                        let resp = Response::from_string("{\"ok\":true}").with_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .unwrap(),
                        );
                        let _ = req.respond(resp);
                    } else {
                        let _ = req.respond(Response::from_string("Not Found").with_status_code(404).with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()));
                    }
                }
                Ok(None) => {}
                Err(e) => { eprintln!("Error receiving request: {}", e); running.store(false, Ordering::SeqCst); return Err(format!("Error receiving request: {}", e)); }
            }
        }
        running.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[tauri::command]
pub fn get_companion_info(mgr: tauri::State<CompanionServerManager>) -> CompanionInfo {
    let running = mgr.running.load(Ordering::Relaxed);
    let lan_ip = detect_lan_ip();
    let url = lan_ip
        .as_ref()
        .map(|ip| format!("http://{}:3002", ip));
    CompanionInfo {
        running,
        port: 3002,
        url,
        lan_ip,
    }
}

#[tauri::command]
pub fn set_lan_companion_enabled(
    app: AppHandle,
    mgr: tauri::State<CompanionServerManager>,
    enabled: bool,
) -> Result<CompanionInfo, String> {
    if enabled {
        start_companion_loop(
            app,
            Arc::clone(&mgr.running),
            Arc::clone(&mgr.telemetry),
            Arc::clone(&mgr.work_state),
        )?;
    } else {
        mgr.running.store(false, Ordering::SeqCst);
    }
    Ok(get_companion_info(mgr))
}
