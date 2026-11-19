use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OverlayState {
    pub enabled: bool,
    pub click_through: bool,
    pub always_on_top: bool,
    pub opacity: f64,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            enabled: false,
            click_through: false,
            always_on_top: false,
            opacity: 0.92,
        }
    }
}

pub struct OverlayManager {
    pub state: Arc<Mutex<OverlayState>>,
}

impl Default for OverlayManager {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(OverlayState::default())),
        }
    }
}

pub fn apply_overlay_to_window(app: &AppHandle, next: &OverlayState) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    if next.enabled {
        window
            .set_decorations(false)
            .map_err(|e| format!("Failed to set decorations: {}", e))?;
        let _ = window.set_shadow(false);
        window
            .set_always_on_top(next.always_on_top)
            .map_err(|e| format!("Failed to set always_on_top: {}", e))?;
        window
            .set_ignore_cursor_events(next.click_through)
            .map_err(|e| format!("Failed to set ignore_cursor_events: {}", e))?;
    } else {
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| format!("Failed to reset cursor events: {}", e))?;
        window
            .set_always_on_top(false)
            .map_err(|e| format!("Failed to reset always_on_top: {}", e))?;
        window
            .set_decorations(true)
            .map_err(|e| format!("Failed to restore decorations: {}", e))?;
        let _ = window.set_shadow(true);
    }

    let _ = app.emit("overlay_state_changed", next);
    Ok(())
}

#[tauri::command]
pub fn get_overlay_state(mgr: tauri::State<OverlayManager>) -> OverlayState {
    mgr.state.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_overlay_mode(
    app: AppHandle,
    mgr: tauri::State<OverlayManager>,
    enabled: bool,
    click_through: bool,
    always_on_top: bool,
    opacity: f64,
) -> Result<OverlayState, String> {
    let next = OverlayState {
        enabled,
        click_through: if enabled { click_through } else { false },
        always_on_top: if enabled { always_on_top } else { false },
        opacity: opacity.clamp(0.25, 1.0),
    };
    {
        let mut guard = mgr.state.lock().unwrap();
        *guard = next.clone();
    }
    apply_overlay_to_window(&app, &next)?;
    Ok(next)
}

#[tauri::command]
pub fn toggle_overlay_click_through(
    app: AppHandle,
    mgr: tauri::State<OverlayManager>,
) -> Result<OverlayState, String> {
    let next = {
        let mut guard = mgr.state.lock().unwrap();
        if !guard.enabled {
            guard.enabled = true;
            guard.always_on_top = true;
            guard.click_through = true;
        } else {
            guard.click_through = !guard.click_through;
        }
        guard.clone()
    };
    apply_overlay_to_window(&app, &next)?;
    Ok(next)
}

pub fn spawn_alt_d_hotkey_listener(app: AppHandle, state_arc: Arc<Mutex<OverlayState>>) {
    #[cfg(target_os = "windows")]
    {
        #[link(name = "user32")]
        extern "system" {
            fn GetAsyncKeyState(vKey: i32) -> i16;
        }

        const VK_MENU: i32 = 0x12;
        const VK_D: i32 = 0x44;

        std::thread::spawn(move || {
            let mut was_combo_down = false;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(40));
                let alt_down = unsafe { (GetAsyncKeyState(VK_MENU) as u16 & 0x8000) != 0 };
                let d_down = unsafe { (GetAsyncKeyState(VK_D) as u16 & 0x8000) != 0 };
                let combo_down = alt_down && d_down;

                if combo_down && !was_combo_down {
                    let next_opt = {
                        let mut guard = state_arc.lock().unwrap();
                        if guard.enabled {
                            guard.click_through = !guard.click_through;
                            Some(guard.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(next) = next_opt {
                        let _ = apply_overlay_to_window(&app, &next);
                    }
                }
                was_combo_down = combo_down;
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, state_arc);
    }
}
