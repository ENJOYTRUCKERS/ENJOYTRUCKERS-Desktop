use base64::{engine::general_purpose::STANDARD as b64, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

use crate::telemetry::{now_unix_ms, PORTAL_BASE_URL};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DashcamUploadResult {
    pub screenshot_id: String,
    pub url: String,
}

#[cfg(target_os = "windows")]
fn capture_primary_screen_png(out_path: &PathBuf) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let escaped = out_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Windows.Forms; \
         Add-Type -AssemblyName System.Drawing; \
         $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \
         $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height); \
         $g = [System.Drawing.Graphics]::FromImage($bmp); \
         $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); \
         $bmp.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png); \
         $g.Dispose(); $bmp.Dispose();",
        escaped
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to invoke PowerShell dashcam capture: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        log::error!("PowerShell dashcam capture error: {}", err);
        return Err(format!("Dashcam screenshot capture failed: {}", err));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn capture_primary_screen_png(_out_path: &PathBuf) -> Result<(), String> {
    Err("Dashcam capture is only available on Windows".to_string())
}

#[tauri::command]
pub fn capture_dashcam_screenshot(
    app: tauri::AppHandle,
    token: String,
    reason: Option<String>,
    event_id: Option<String>,
) -> Result<DashcamUploadResult, String> {
    if token.trim().is_empty() {
        return Err("Telemetry token required".to_string());
    }

    let tmp_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = fs::create_dir_all(&tmp_dir);
    let tmp_path = tmp_dir.join(format!("dashcam_{}.png", now_unix_ms()));

    capture_primary_screen_png(&tmp_path)?;
    let png_bytes = fs::read(&tmp_path).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&tmp_path).map_err(|e| log::error!("Failed to remove temporary file: {}", e));

    let encoded = b64.encode(&png_bytes);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/desktop/dashcam", PORTAL_BASE_URL);
    let body = serde_json::json!({
        "token": token,
        "imageBase64": encoded,
        "mimeType": "image/png",
        "reason": reason,
        "eventId": event_id,
    });

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() { return Err(format!("Dashcam upload failed with status: {}", res.status())); }
    }

    let val: serde_json::Value = res.json().map_err(|e| format!("Failed to parse JSON response: {} - Response body: {}", e.to_string()))?;
    let screenshot_id = val
        .get("screenshotId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let rel_url = val
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(DashcamUploadResult {
        screenshot_id,
        url: rel_url,
    })
}
