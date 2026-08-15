mod agents;
mod avatar_projects;
mod config;
#[cfg(feature = "desktop")]
mod herdr;
mod pet;
#[path = "herdr/protocol.rs"]
mod protocol;
#[cfg(feature = "desktop")]
mod runtime;

#[cfg(feature = "desktop")]
use std::{
    ffi::OsString,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

#[cfg(feature = "desktop")]
use agents::AgentInfo;
#[cfg(feature = "desktop")]
use agents::AggregateState;
#[cfg(feature = "desktop")]
use avatar_projects::{
    AvatarInstallation, AvatarProjectFileInspection, AvatarProjectInspection, AvatarProjectSource,
};
#[cfg(feature = "desktop")]
use config::{AppConfig, OverlayPosition};
#[cfg(feature = "desktop")]
use runtime::{ConnectionStatus, RuntimeState};
#[cfg(feature = "desktop")]
use serde::Serialize;
#[cfg(feature = "desktop")]
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, SubmenuBuilder},
    tray::TrayIconBuilder,
};
#[cfg(feature = "desktop")]
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
#[cfg(feature = "desktop")]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg(feature = "desktop")]
struct RuntimeSelfTestState {
    report_path: Option<PathBuf>,
    completed: AtomicBool,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSelfTestReport {
    schema_version: u8,
    success: bool,
    runtime: &'static str,
    platform: &'static str,
    animation: Option<String>,
    available_animation_count: u32,
    svg_elements: u32,
    window: Option<RuntimeSelfTestWindow>,
    capabilities: RuntimeSelfTestCapabilities,
    error: Option<String>,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSelfTestCapabilities {
    display_backend: &'static str,
    global_shortcut_available: bool,
    absolute_position_available: bool,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSelfTestWindow {
    label: &'static str,
    visible: bool,
    decorated: bool,
    always_on_top_requested: bool,
    always_on_top_observed: Option<bool>,
    logical_width: f64,
    logical_height: f64,
    scale_factor: f64,
}

#[cfg(feature = "desktop")]
fn runtime_self_test_window_passes(window: &RuntimeSelfTestWindow) -> bool {
    window.visible
        && !window.decorated
        && window.always_on_top_requested
        && window.always_on_top_observed.unwrap_or(true)
        && window.scale_factor.is_finite()
        && window.scale_factor > 0.0
        && (window.logical_width - 320.0).abs() <= 2.0
        && (window.logical_height - 320.0).abs() <= 2.0
}

#[cfg(all(feature = "desktop", target_os = "linux"))]
fn linux_display_capabilities(has_x11: bool, has_wayland: bool) -> (&'static str, bool, bool) {
    if has_x11 {
        ("x11-compatible", true, true)
    } else if has_wayland {
        ("wayland", false, false)
    } else {
        ("headless", false, false)
    }
}

#[cfg(feature = "desktop")]
fn runtime_self_test_capabilities() -> RuntimeSelfTestCapabilities {
    #[cfg(target_os = "linux")]
    let (display_backend, global_shortcut_available, absolute_position_available) =
        linux_display_capabilities(
            std::env::var_os("DISPLAY").is_some(),
            std::env::var_os("WAYLAND_DISPLAY").is_some(),
        );
    #[cfg(not(target_os = "linux"))]
    let (display_backend, global_shortcut_available, absolute_position_available) =
        ("native", true, true);
    RuntimeSelfTestCapabilities {
        display_backend,
        global_shortcut_available,
        absolute_position_available,
    }
}

#[cfg(feature = "desktop")]
fn runtime_self_test_capabilities_pass(capabilities: &RuntimeSelfTestCapabilities) -> bool {
    match capabilities.display_backend {
        "x11-compatible" | "native" => {
            capabilities.global_shortcut_available && capabilities.absolute_position_available
        }
        "wayland" => {
            !capabilities.global_shortcut_available && !capabilities.absolute_position_available
        }
        _ => false,
    }
}

#[cfg(feature = "desktop")]
async fn inspect_runtime_self_test_window(
    app: &AppHandle,
) -> Result<RuntimeSelfTestWindow, String> {
    let overlay = app
        .get_webview_window("pet-overlay")
        .ok_or("pet overlay window not found")?;
    // Tao's Linux getter is not reliable for this WebviewWindow, so X11 state is
    // verified by the Linux visual fixture. Other desktop backends also verify
    // the getter after exercising the native setter.
    overlay
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let scale_factor = overlay.scale_factor().map_err(|error| error.to_string())?;
    let size = overlay.inner_size().map_err(|error| error.to_string())?;
    Ok(RuntimeSelfTestWindow {
        label: "pet-overlay",
        visible: overlay.is_visible().map_err(|error| error.to_string())?,
        decorated: overlay.is_decorated().map_err(|error| error.to_string())?,
        always_on_top_requested: true,
        always_on_top_observed: if cfg!(target_os = "linux") {
            None
        } else {
            Some(
                overlay
                    .is_always_on_top()
                    .map_err(|error| error.to_string())?,
            )
        },
        logical_width: f64::from(size.width) / scale_factor,
        logical_height: f64::from(size.height) / scale_factor,
        scale_factor,
    })
}

#[cfg(feature = "desktop")]
fn parse_runtime_self_test_report_path<I>(arguments: I) -> Result<Option<PathBuf>, String>
where
    I: IntoIterator<Item = OsString>,
{
    let mut arguments = arguments.into_iter();
    while let Some(argument) = arguments.next() {
        if argument == "--runtime-self-test" {
            let path = arguments
                .next()
                .ok_or("--runtime-self-test requires a report path")?;
            if path.is_empty() {
                return Err("--runtime-self-test report path cannot be empty".into());
            }
            return Ok(Some(PathBuf::from(path)));
        }
    }
    Ok(None)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn complete_runtime_self_test(
    app: AppHandle,
    state: State<'_, RuntimeSelfTestState>,
    success: bool,
    animation: Option<String>,
    available_animation_count: u32,
    svg_elements: u32,
    error: Option<String>,
) -> Result<(), String> {
    let Some(report_path) = state.report_path.as_ref() else {
        return Ok(());
    };
    if state.completed.load(Ordering::SeqCst) {
        return Ok(());
    }
    let (window, window_error) = match inspect_runtime_self_test_window(&app).await {
        Ok(window) => (Some(window), None),
        Err(error) => (None, Some(error)),
    };
    let window_passes = window.as_ref().is_some_and(runtime_self_test_window_passes);
    let capabilities = runtime_self_test_capabilities();
    let capabilities_pass = runtime_self_test_capabilities_pass(&capabilities);
    let error = error
        .or(window_error)
        .or_else(|| (!window_passes).then(|| "pet overlay window checks failed".into()))
        .or_else(|| (!capabilities_pass).then(|| "display capability checks failed".into()));
    let success = success
        && svg_elements > 0
        && available_animation_count > 0
        && window_passes
        && capabilities_pass
        && error.is_none();
    let report = RuntimeSelfTestReport {
        schema_version: 2,
        success,
        runtime: "official-avatar-lab-browser",
        platform: std::env::consts::OS,
        animation,
        available_animation_count,
        svg_elements,
        window,
        capabilities,
        error,
    };
    if let Some(parent) = report_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|cause| cause.to_string())?;
    }
    let encoded = serde_json::to_vec_pretty(&report).map_err(|cause| cause.to_string())?;
    std::fs::write(report_path, encoded).map_err(|cause| cause.to_string())?;
    if state.completed.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    tracing::info!(success, path = %report_path.display(), "official runtime self-test completed");
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        app.exit(if success { 0 } else { 1 });
    });
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_app_config(state: State<'_, Arc<RuntimeState>>) -> Result<AppConfig, String> {
    Ok(state.config.read().await.clone())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_default_app_config() -> AppConfig {
    AppConfig::default()
}

#[cfg(feature = "desktop")]
async fn persist_config_change(
    app: &AppHandle,
    state: &RuntimeState,
    change: impl FnOnce(&mut AppConfig),
) -> Result<AppConfig, String> {
    let _update = state.config_update.lock().await;
    let mut config = state.config.read().await.clone();
    change(&mut config);
    let config = config.normalized();
    config::save(app, &config)?;
    *state.config.write().await = config.clone();
    Ok(config)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn update_app_config(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    config: AppConfig,
) -> Result<AppConfig, String> {
    let _update = state.config_update.lock().await;
    let config = config.normalized();
    let previous = state.config.read().await.clone();
    let reconnect_needed = previous.herdr != config.herdr;
    let autostart_changed = previous.desktop.auto_start != config.desktop.auto_start;
    let shortcut_changed = previous.desktop.toggle_shortcut != config.desktop.toggle_shortcut;
    if shortcut_changed {
        replace_global_shortcut(
            &app,
            &previous.desktop.toggle_shortcut,
            &config.desktop.toggle_shortcut,
        )?;
    }

    let rollback_shortcut = || {
        if shortcut_changed {
            let _ = replace_global_shortcut(
                &app,
                &config.desktop.toggle_shortcut,
                &previous.desktop.toggle_shortcut,
            );
        }
    };
    let overlay = app.get_webview_window("pet-overlay");
    if let Some(overlay) = &overlay {
        if let Err(error) = overlay.set_always_on_top(config.overlay.always_on_top) {
            rollback_shortcut();
            return Err(error.to_string());
        }
        if let Err(error) = overlay.set_ignore_cursor_events(config.overlay.click_through) {
            let _ = overlay.set_always_on_top(previous.overlay.always_on_top);
            rollback_shortcut();
            return Err(error.to_string());
        }
    }
    if autostart_changed && let Err(error) = set_autostart(&app, config.desktop.auto_start) {
        if let Some(overlay) = &overlay {
            let _ = overlay.set_always_on_top(previous.overlay.always_on_top);
            let _ = overlay.set_ignore_cursor_events(previous.overlay.click_through);
        }
        rollback_shortcut();
        return Err(error);
    }
    if let Err(error) = config::save(&app, &config) {
        if autostart_changed {
            let _ = set_autostart(&app, previous.desktop.auto_start);
        }
        if let Some(overlay) = &overlay {
            let _ = overlay.set_always_on_top(previous.overlay.always_on_top);
            let _ = overlay.set_ignore_cursor_events(previous.overlay.click_through);
        }
        rollback_shortcut();
        return Err(error);
    }
    *state.config.write().await = config.clone();
    let _ = app.emit("config://changed", &config);
    refresh_tray_menu(&app, &config);
    if reconnect_needed {
        state.reconnect.notify_one();
    }
    Ok(config)
}

#[cfg(feature = "desktop")]
fn register_global_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    if !global_shortcut_supported() {
        return Ok(());
    }
    app.global_shortcut()
        .register(shortcut)
        .map_err(|error| format!("无法注册全局快捷键 {shortcut}: {error}"))
}

#[cfg(feature = "desktop")]
fn replace_global_shortcut(app: &AppHandle, previous: &str, next: &str) -> Result<(), String> {
    if !global_shortcut_supported() || previous == next {
        return Ok(());
    }
    register_global_shortcut(app, next)?;
    if let Err(error) = app.global_shortcut().unregister(previous) {
        let _ = app.global_shortcut().unregister(next);
        return Err(format!("无法替换全局快捷键 {previous}: {error}"));
    }
    Ok(())
}

#[cfg(feature = "desktop")]
fn set_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
fn toggle_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("pet-overlay") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg(feature = "desktop")]
#[derive(Debug, Clone, PartialEq)]
struct MonitorGeometry {
    id: Option<String>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
}

#[cfg(feature = "desktop")]
impl From<&tauri::Monitor> for MonitorGeometry {
    fn from(monitor: &tauri::Monitor) -> Self {
        Self {
            id: monitor.name().cloned(),
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            scale: monitor.scale_factor(),
        }
    }
}

#[cfg(feature = "desktop")]
fn position_is_visible(
    size: tauri::PhysicalSize<u32>,
    monitors: &[tauri::Monitor],
    position: OverlayPosition,
) -> bool {
    let monitors = monitors
        .iter()
        .map(MonitorGeometry::from)
        .collect::<Vec<_>>();
    position_is_visible_in(size.width, size.height, &monitors, &position)
}

#[cfg(feature = "desktop")]
fn position_is_visible_in(
    width: u32,
    height: u32,
    monitors: &[MonitorGeometry],
    position: &OverlayPosition,
) -> bool {
    monitors.iter().any(|monitor| {
        let overlap_x = (position.x + width as i32).min(monitor.x + monitor.width as i32)
            - position.x.max(monitor.x);
        let overlap_y = (position.y + height as i32).min(monitor.y + monitor.height as i32)
            - position.y.max(monitor.y);
        overlap_x >= 64 && overlap_y >= 64
    })
}

#[cfg(feature = "desktop")]
fn resolve_saved_position(
    saved: &OverlayPosition,
    monitors: &[tauri::Monitor],
) -> Option<OverlayPosition> {
    let monitors = monitors
        .iter()
        .map(MonitorGeometry::from)
        .collect::<Vec<_>>();
    resolve_saved_position_in(saved, &monitors)
}

#[cfg(feature = "desktop")]
fn resolve_saved_position_in(
    saved: &OverlayPosition,
    monitors: &[MonitorGeometry],
) -> Option<OverlayPosition> {
    let Some(monitor_id) = saved.monitor_id.as_deref() else {
        return Some(saved.clone());
    };
    let monitor = monitors
        .iter()
        .find(|monitor| monitor.id.as_deref() == Some(monitor_id))?;
    Some(OverlayPosition {
        x: monitor.x + (f64::from(saved.x) * monitor.scale).round() as i32,
        y: monitor.y + (f64::from(saved.y) * monitor.scale).round() as i32,
        monitor_id: saved.monitor_id.clone(),
        scale_factor: Some(monitor.scale),
    })
}

#[cfg(feature = "desktop")]
fn stored_position(physical: OverlayPosition, monitor: Option<&tauri::Monitor>) -> OverlayPosition {
    let monitor = monitor.map(MonitorGeometry::from);
    stored_position_in(physical, monitor.as_ref())
}

#[cfg(feature = "desktop")]
fn stored_position_in(
    physical: OverlayPosition,
    monitor: Option<&MonitorGeometry>,
) -> OverlayPosition {
    let Some(monitor) = monitor else {
        return physical;
    };
    OverlayPosition {
        x: (f64::from(physical.x - monitor.x) / monitor.scale).round() as i32,
        y: (f64::from(physical.y - monitor.y) / monitor.scale).round() as i32,
        monitor_id: monitor.id.clone(),
        scale_factor: Some(monitor.scale),
    }
}

#[cfg(feature = "desktop")]
fn snapped_position(
    size: tauri::PhysicalSize<u32>,
    monitor: Option<&tauri::Monitor>,
    position: OverlayPosition,
) -> OverlayPosition {
    let monitor = monitor.map(MonitorGeometry::from);
    snapped_position_in(size.width, size.height, monitor.as_ref(), position)
}

#[cfg(feature = "desktop")]
fn snapped_position_in(
    width: u32,
    height: u32,
    monitor: Option<&MonitorGeometry>,
    position: OverlayPosition,
) -> OverlayPosition {
    let Some(monitor) = monitor else {
        return position;
    };
    let threshold = (16.0 * monitor.scale).round() as i32;
    let right = monitor.x + monitor.width as i32 - width as i32;
    let bottom = monitor.y + monitor.height as i32 - height as i32;
    let x = if (position.x - monitor.x).abs() <= threshold {
        monitor.x
    } else if (position.x - right).abs() <= threshold {
        right
    } else {
        position.x
    };
    let y = if (position.y - monitor.y).abs() <= threshold {
        monitor.y
    } else if (position.y - bottom).abs() <= threshold {
        bottom
    } else {
        position.y
    };
    OverlayPosition {
        x,
        y,
        monitor_id: None,
        scale_factor: None,
    }
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_connection_status(
    state: State<'_, Arc<RuntimeState>>,
) -> Result<ConnectionStatus, String> {
    Ok(state.connection.read().await.clone())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn list_agents(state: State<'_, Arc<RuntimeState>>) -> Result<Vec<AgentInfo>, String> {
    Ok(state.agents().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_aggregate_state(
    state: State<'_, Arc<RuntimeState>>,
) -> Result<AggregateState, String> {
    Ok(state.aggregate().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn reconnect_herdr(state: State<'_, Arc<RuntimeState>>) -> Result<(), String> {
    state.reconnect.notify_one();
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn report_avatar_runtime_error(
    state: State<'_, Arc<RuntimeState>>,
    error: Option<String>,
) -> Result<(), String> {
    state.report_avatar_runtime_error(error).await;
    Ok(())
}

#[cfg(feature = "desktop")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticReport {
    generated_at_ms: u64,
    app_version: String,
    platform: &'static str,
    global_shortcut_available: bool,
    absolute_position_available: bool,
    connection: DiagnosticConnection,
    runtime: DiagnosticRuntime,
    preferences: DiagnosticPreferences,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticConnection {
    state: runtime::ConnectionState,
    version: Option<String>,
    protocol: Option<u32>,
    agent_count: usize,
    has_error: bool,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRuntime {
    started_at_ms: u64,
    reconnect_count: u64,
    last_event_kind: Option<String>,
    last_event_at_ms: Option<u64>,
    avatar_runtime_has_error: bool,
}

#[cfg(feature = "desktop")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticPreferences {
    observation_mode: config::ObservationMode,
    wsl_mode: bool,
    custom_avatar: bool,
    fps: u32,
    animation_speed: f64,
    paused: bool,
}

#[cfg(feature = "desktop")]
async fn diagnostic_report(app: &AppHandle, state: &RuntimeState) -> DiagnosticReport {
    let connection = state.connection.read().await.clone();
    let config = state.config.read().await.clone();
    let runtime = state.metrics.read().await.clone();
    let generated_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    DiagnosticReport {
        generated_at_ms,
        app_version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        global_shortcut_available: global_shortcut_supported(),
        absolute_position_available: absolute_position_supported(),
        connection: DiagnosticConnection {
            state: connection.state,
            version: connection.version,
            protocol: connection.protocol,
            agent_count: connection.agent_count,
            has_error: connection.last_error.is_some(),
        },
        runtime: DiagnosticRuntime {
            started_at_ms: runtime.started_at_ms,
            reconnect_count: runtime.reconnect_count,
            last_event_kind: runtime.last_event_kind,
            last_event_at_ms: runtime.last_event_at_ms,
            avatar_runtime_has_error: runtime.avatar_runtime_error.is_some(),
        },
        preferences: DiagnosticPreferences {
            observation_mode: config.herdr.observation.mode,
            wsl_mode: config.herdr.wsl.enabled,
            custom_avatar: config.avatar.installation_id.is_some(),
            fps: config.overlay.fps,
            animation_speed: config.avatar.animation_speed,
            paused: config.desktop.paused,
        },
    }
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_diagnostics(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<DiagnosticReport, String> {
    Ok(diagnostic_report(&app, &state).await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn export_diagnostics(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    let report = diagnostic_report(&app, &state).await;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("diagnostics");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!(
        "herdr-pet-diagnostics-{}.json",
        report.generated_at_ms
    ));
    let mut temporary =
        tempfile::NamedTempFile::new_in(&directory).map_err(|error| error.to_string())?;
    serde_json::to_writer_pretty(&mut temporary, &report).map_err(|error| error.to_string())?;
    use std::io::Write as _;
    temporary.flush().map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(&path)
        .map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    show_settings(&app)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn reset_overlay_position(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<(), String> {
    if !absolute_position_supported() {
        return Err("absolute window positioning is unavailable in this display session".into());
    }
    let overlay = app
        .get_webview_window("pet-overlay")
        .ok_or("pet overlay window not found")?;
    overlay.center().map_err(|error| error.to_string())?;
    let position = overlay
        .outer_position()
        .map_err(|error| error.to_string())?;
    let config = {
        let mut config = state.config.write().await;
        config.overlay.position = Some(OverlayPosition {
            x: position.x,
            y: position.y,
            monitor_id: None,
            scale_factor: None,
        });
        config.clone()
    };
    config::save(&app, &config)?;
    let _ = app.emit("config://changed", &config);
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn inspect_avatar_project(source: String) -> Result<AvatarProjectInspection, String> {
    avatar_projects::inspect(&source)
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn inspect_avatar_project_file(path: PathBuf) -> Result<AvatarProjectFileInspection, String> {
    avatar_projects::inspect_file(&path)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn install_avatar_project(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    source: String,
    avatar_id: String,
) -> Result<AvatarInstallation, String> {
    let _update = state.config_update.lock().await;
    let installation = avatar_projects::install(&app, &source, &avatar_id)?;
    let config = {
        let mut config = state.config.read().await.clone();
        config.avatar.installation_id = Some(installation.id.clone());
        config.avatar.avatar_id = Some(avatar_id);
        config.normalized()
    };
    config::save(&app, &config)?;
    *state.config.write().await = config.clone();
    let _ = app.emit("config://changed", &config);
    let _ = app.emit("avatar://changed", &installation);
    refresh_tray_menu(&app, &config);
    Ok(installation)
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn list_avatar_installations(app: AppHandle) -> Result<Vec<AvatarInstallation>, String> {
    avatar_projects::list(&app)
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn get_avatar_project(
    app: AppHandle,
    installation_id: String,
) -> Result<AvatarProjectSource, String> {
    avatar_projects::get(&app, &installation_id)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_active_avatar_project(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<Option<AvatarProjectSource>, String> {
    let installation_id = state.config.read().await.avatar.installation_id.clone();
    installation_id
        .map(|installation_id| avatar_projects::get(&app, &installation_id))
        .transpose()
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn select_avatar(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    installation_id: Option<String>,
    avatar_id: Option<String>,
) -> Result<AppConfig, String> {
    let _update = state.config_update.lock().await;
    let previous_installation = match (&installation_id, &avatar_id) {
        (Some(installation_id), Some(avatar_id)) => {
            let previous = avatar_projects::get(&app, installation_id)?.installation;
            avatar_projects::select(&app, installation_id, avatar_id)?;
            Some(previous)
        }
        (None, None) => None,
        _ => return Err("installationId and avatarId must both be set or both be null".into()),
    };
    let config = {
        let mut config = state.config.read().await.clone();
        config.avatar.installation_id = installation_id;
        config.avatar.avatar_id = avatar_id;
        config.normalized()
    };
    if let Err(error) = config::save(&app, &config) {
        if let Some(previous) = previous_installation {
            let _ = avatar_projects::select(&app, &previous.id, &previous.selected_avatar_id);
        }
        return Err(error);
    }
    *state.config.write().await = config.clone();
    let _ = app.emit("config://changed", &config);
    let _ = app.emit("avatar://changed", ());
    refresh_tray_menu(&app, &config);
    Ok(config)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn remove_avatar_installation(
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    installation_id: String,
) -> Result<(), String> {
    if state.config.read().await.avatar.installation_id.as_deref() == Some(&installation_id) {
        return Err("cannot remove the active avatar installation".into());
    }
    avatar_projects::remove(&app, &installation_id)?;
    let _ = app.emit("avatar://changed", ());
    let config = state.config.read().await.clone();
    refresh_tray_menu(&app, &config);
    Ok(())
}

#[cfg(feature = "desktop")]
fn show_settings(app: &AppHandle) -> Result<(), String> {
    let settings = if let Some(settings) = app.get_webview_window("settings") {
        settings
    } else {
        WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
            .title("Herdr Pet 设置")
            .inner_size(780.0, 760.0)
            .min_inner_size(520.0, 560.0)
            .center()
            .build()
            .map_err(|error| error.to_string())?
    };
    settings.show().map_err(|error| error.to_string())?;
    settings.set_focus().map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
fn tray_icon() -> Image<'static> {
    let mut rgba = vec![0_u8; 16 * 16 * 4];
    for y in 0..16 {
        for x in 0..16 {
            let offset = (y * 16 + x) * 4;
            let inside = (x as i32 - 8).pow(2) + (y as i32 - 8).pow(2) <= 49;
            if inside {
                rgba[offset..offset + 4].copy_from_slice(&[104, 145, 101, 255]);
            }
        }
    }
    Image::new_owned(rgba, 16, 16)
}

#[cfg(feature = "desktop")]
fn global_shortcut_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        // The underlying Linux hotkey backend uses X11. XWayland is enough,
        // but a pure Wayland session must degrade without blocking startup.
        linux_display_capabilities(
            std::env::var_os("DISPLAY").is_some(),
            std::env::var_os("WAYLAND_DISPLAY").is_some(),
        )
        .1
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

#[cfg(feature = "desktop")]
fn absolute_position_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        // Native Wayland intentionally does not expose global window coordinates.
        // X11 and XWayland sessions can still use Tauri's positioning APIs.
        linux_display_capabilities(
            std::env::var_os("DISPLAY").is_some(),
            std::env::var_os("WAYLAND_DISPLAY").is_some(),
        )
        .2
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

#[cfg(feature = "desktop")]
fn tray_menu(app: &AppHandle, config: &AppConfig) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示/隐藏宠物", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "打开设置", true, None::<&str>)?;
    let click_through = CheckMenuItem::with_id(
        app,
        "click-through",
        "鼠标穿透",
        true,
        config.overlay.click_through,
        None::<&str>,
    )?;
    let paused = CheckMenuItem::with_id(
        app,
        "paused",
        "暂停动画",
        true,
        config.desktop.paused,
        None::<&str>,
    )?;
    let muted = CheckMenuItem::with_id(
        app,
        "muted",
        "静音",
        true,
        !config.audio.enabled,
        None::<&str>,
    )?;
    let reconnect = MenuItem::with_id(app, "reconnect", "重新连接 Herdr", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let mut avatar_menu =
        SubmenuBuilder::new(app, "切换角色").text("avatar:built-in", "Strobi（内置）");
    if let Ok(installations) = avatar_projects::list(app) {
        for installation in installations {
            let avatar_name = installation
                .summary
                .avatars
                .iter()
                .find(|avatar| avatar.id == installation.selected_avatar_id)
                .map(|avatar| avatar.name.as_str())
                .unwrap_or("Avatar");
            avatar_menu = avatar_menu.text(
                format!("avatar:{}", installation.id),
                format!("{} · {avatar_name}", installation.summary.display_name),
            );
        }
    }
    let avatar_menu = avatar_menu.build()?;
    Menu::with_items(
        app,
        &[
            &show,
            &settings,
            &avatar_menu,
            &click_through,
            &paused,
            &muted,
            &reconnect,
            &quit,
        ],
    )
}

#[cfg(feature = "desktop")]
fn refresh_tray_menu(app: &AppHandle, config: &AppConfig) {
    if let Some(tray) = app.tray_by_id("main")
        && let Ok(menu) = tray_menu(app, config)
    {
        let _ = tray.set_menu(Some(menu));
    }
}

#[cfg(feature = "desktop")]
fn setup_tray(app: &tauri::App, config: &AppConfig) -> tauri::Result<()> {
    let menu = tray_menu(app.handle(), config)?;
    TrayIconBuilder::with_id("main")
        .icon(tray_icon())
        .tooltip("Herdr Pet")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                toggle_overlay(app);
            }
            "paused" => {
                let app = app.clone();
                let state = app.state::<Arc<RuntimeState>>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    match persist_config_change(&app, &state, |config| {
                        config.desktop.paused = !config.desktop.paused;
                    })
                    .await
                    {
                        Ok(config) => {
                            let _ = app.emit("config://changed", &config);
                            refresh_tray_menu(&app, &config);
                        }
                        Err(error) => {
                            tracing::warn!(%error, "failed to persist animation pause setting");
                        }
                    }
                });
            }
            "muted" => {
                let app = app.clone();
                let state = app.state::<Arc<RuntimeState>>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    match persist_config_change(&app, &state, |config| {
                        config.audio.enabled = !config.audio.enabled;
                    })
                    .await
                    {
                        Ok(config) => {
                            let _ = app.emit("config://changed", &config);
                            refresh_tray_menu(&app, &config);
                        }
                        Err(error) => {
                            tracing::warn!(%error, "failed to persist mute setting");
                        }
                    }
                });
            }
            "settings" => {
                let _ = show_settings(app);
            }
            "click-through" => {
                if let Some(window) = app.get_webview_window("pet-overlay") {
                    let app = app.clone();
                    let state = app.state::<Arc<RuntimeState>>().inner().clone();
                    tauri::async_runtime::spawn(async move {
                        let _update = state.config_update.lock().await;
                        let previous = state.config.read().await.clone();
                        let mut config = previous.clone();
                        config.overlay.click_through = !config.overlay.click_through;
                        if let Err(error) =
                            window.set_ignore_cursor_events(config.overlay.click_through)
                        {
                            tracing::warn!(%error, "failed to apply click-through setting");
                            return;
                        }
                        if let Err(error) = config::save(&app, &config) {
                            let _ = window.set_ignore_cursor_events(previous.overlay.click_through);
                            tracing::warn!(%error, "failed to persist click-through setting");
                            return;
                        }
                        *state.config.write().await = config.clone();
                        let _ = app.emit("config://changed", &config);
                        refresh_tray_menu(&app, &config);
                    });
                }
            }
            "reconnect" => {
                app.state::<Arc<RuntimeState>>().reconnect.notify_one();
            }
            "quit" => app.exit(0),
            id if id.starts_with("avatar:") => {
                let installation_id = id.trim_start_matches("avatar:").to_string();
                let app = app.clone();
                let state = app.state::<Arc<RuntimeState>>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    let _update = state.config_update.lock().await;
                    let selection = if installation_id == "built-in" {
                        Ok((None, None, None))
                    } else {
                        avatar_projects::list(&app).and_then(|installations| {
                            let installation = installations
                                .into_iter()
                                .find(|candidate| candidate.id == installation_id)
                                .ok_or("avatar installation was not found")?;
                            let previous_avatar_id = installation.selected_avatar_id.clone();
                            avatar_projects::select(
                                &app,
                                &installation.id,
                                &installation.selected_avatar_id,
                            )?;
                            Ok((
                                Some(installation.id),
                                Some(installation.selected_avatar_id),
                                Some(previous_avatar_id),
                            ))
                        })
                    };
                    match selection {
                        Ok((installation_id, avatar_id, previous_avatar_id)) => {
                            let mut config = state.config.read().await.clone();
                            config.avatar.installation_id = installation_id.clone();
                            config.avatar.avatar_id = avatar_id;
                            if let Err(error) = config::save(&app, &config) {
                                if let (Some(id), Some(previous_avatar_id)) =
                                    (installation_id, previous_avatar_id)
                                {
                                    let _ = avatar_projects::select(&app, &id, &previous_avatar_id);
                                }
                                tracing::warn!(%error, "failed to save tray avatar selection");
                                return;
                            }
                            *state.config.write().await = config.clone();
                            let _ = app.emit("config://changed", &config);
                            let _ = app.emit("avatar://changed", ());
                            refresh_tray_menu(&app, &config);
                        }
                        Err(error) => tracing::warn!(%error, "failed to switch tray avatar"),
                    }
                });
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_self_test_report = parse_runtime_self_test_report_path(std::env::args_os())
        .unwrap_or_else(|error| {
            eprintln!("{error}");
            std::process::exit(2);
        });
    let log_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn,herdr_pet_lib=info"));
    tracing_subscriber::fmt()
        .with_env_filter(log_filter)
        .with_target(true)
        .compact()
        .init();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());
    let builder = if global_shortcut_supported() {
        builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_overlay(app);
                    }
                })
                .build(),
        )
    } else {
        tracing::warn!("global shortcut unavailable in this display session");
        builder
    };
    builder
        .setup(move |app| {
            let mut config = config::load(app.handle());
            if let Err(error) = register_global_shortcut(app.handle(), &config.desktop.toggle_shortcut)
            {
                tracing::warn!(%error, "configured global shortcut is unavailable; using the default");
                let configured_shortcut = config.desktop.toggle_shortcut.clone();
                config.desktop.toggle_shortcut = "CmdOrCtrl+Shift+H".into();
                if let Err(default_error) =
                    register_global_shortcut(app.handle(), &config.desktop.toggle_shortcut)
                {
                    tracing::warn!(%default_error, "default global shortcut is unavailable");
                    config.desktop.toggle_shortcut = configured_shortcut;
                } else if let Err(save_error) = config::save(app.handle(), &config) {
                    tracing::warn!(%save_error, "failed to persist the shortcut fallback");
                }
            }
            let state = RuntimeState::new(config.clone());
            app.manage(state.clone());
            app.manage(RuntimeSelfTestState {
                report_path: runtime_self_test_report.clone(),
                completed: AtomicBool::new(false),
            });
            setup_tray(app, &config)?;
            if std::env::args_os().any(|argument| argument == "--settings") {
                show_settings(app.handle())?;
            }
            if let Err(error) = set_autostart(app.handle(), config.desktop.auto_start) {
                tracing::warn!(%error, "failed to synchronize autostart setting");
            }
            if let Some(overlay) = app.get_webview_window("pet-overlay") {
                let _ = overlay.set_always_on_top(config.overlay.always_on_top);
                let _ = overlay.set_ignore_cursor_events(config.overlay.click_through);
                if absolute_position_supported()
                    && let Some(position) = config.overlay.position
                {
                    let monitors = overlay.available_monitors().unwrap_or_default();
                    let resolved = resolve_saved_position(&position, &monitors);
                    let visible = overlay.outer_size().ok().is_some_and(|size| {
                        resolved.as_ref().is_some_and(|position| {
                            position_is_visible(size, &monitors, position.clone())
                        })
                    });
                    if visible && let Some(position) = resolved {
                        let _ = overlay
                            .set_position(tauri::PhysicalPosition::new(position.x, position.y));
                    } else {
                        let _ = overlay.center();
                    }
                }
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move { herdr::run(handle, state).await });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "settings"
                && let WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                let _ = window.hide();
            }
            if window.label() == "pet-overlay"
                && absolute_position_supported()
                && let WindowEvent::Moved(position) = event
            {
                let app = window.app_handle().clone();
                let state = app.state::<Arc<RuntimeState>>().inner().clone();
                let original = OverlayPosition {
                    x: position.x,
                    y: position.y,
                    monitor_id: None,
                    scale_factor: None,
                };
                let monitor = window.current_monitor().ok().flatten();
                let physical = window
                    .outer_size()
                    .ok()
                    .zip(monitor.clone())
                    .map(|(size, monitor)| snapped_position(size, Some(&monitor), original.clone()))
                    .unwrap_or_else(|| original.clone());
                let snap_after_drag = (physical != original).then_some((physical.x, physical.y));
                let position = stored_position(physical, monitor.as_ref());
                let overlay = window.clone();
                let task_state = state.clone();
                let mut pending = state.position_save.lock().unwrap();
                if let Some(task) = pending.take() {
                    task.abort();
                }
                *pending = Some(tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    match persist_config_change(&app, &task_state, |config| {
                        config.overlay.position = Some(position);
                    })
                    .await
                    {
                        Ok(config) => {
                            let _ = app.emit("config://changed", &config);
                            if let Some((x, y)) = snap_after_drag {
                                let _ = overlay.set_position(tauri::PhysicalPosition::new(x, y));
                            }
                        }
                        Err(error) => {
                            tracing::warn!(%error, "failed to persist overlay position");
                        }
                    }
                }));
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_config,
            get_default_app_config,
            update_app_config,
            get_connection_status,
            list_agents,
            get_aggregate_state,
            reconnect_herdr,
            report_avatar_runtime_error,
            complete_runtime_self_test,
            open_settings,
            reset_overlay_position,
            inspect_avatar_project,
            inspect_avatar_project_file,
            install_avatar_project,
            list_avatar_installations,
            get_avatar_project,
            get_active_avatar_project,
            select_avatar,
            remove_avatar_installation,
            get_diagnostics,
            export_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Herdr Pet");
}

#[cfg(all(test, feature = "desktop"))]
mod runtime_self_test_tests {
    use super::{
        RuntimeSelfTestWindow, parse_runtime_self_test_report_path, runtime_self_test_window_passes,
    };
    use std::{ffi::OsString, path::PathBuf};

    #[cfg(target_os = "linux")]
    use super::linux_display_capabilities;

    #[test]
    fn parses_runtime_self_test_report_path() {
        let parsed = parse_runtime_self_test_report_path([
            OsString::from("herdr-pet"),
            OsString::from("--runtime-self-test"),
            OsString::from("reports/runtime.json"),
        ])
        .unwrap();
        assert_eq!(parsed, Some(PathBuf::from("reports/runtime.json")));
    }

    #[test]
    fn rejects_runtime_self_test_without_report_path() {
        let error = parse_runtime_self_test_report_path([
            OsString::from("herdr-pet"),
            OsString::from("--runtime-self-test"),
        ])
        .unwrap_err();
        assert!(error.contains("requires a report path"));
    }

    fn expected_window() -> RuntimeSelfTestWindow {
        RuntimeSelfTestWindow {
            label: "pet-overlay",
            visible: true,
            decorated: false,
            always_on_top_requested: true,
            always_on_top_observed: Some(true),
            logical_width: 320.0,
            logical_height: 320.0,
            scale_factor: 2.0,
        }
    }

    #[test]
    fn accepts_the_expected_overlay_window_contract() {
        assert!(runtime_self_test_window_passes(&expected_window()));
    }

    #[test]
    fn rejects_visible_window_contract_regressions() {
        let mut window = expected_window();
        window.decorated = true;
        assert!(!runtime_self_test_window_passes(&window));

        window.decorated = false;
        window.logical_width = 325.0;
        assert!(!runtime_self_test_window_passes(&window));

        window.logical_width = 320.0;
        window.always_on_top_observed = Some(false);
        assert!(!runtime_self_test_window_passes(&window));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn distinguishes_x11_wayland_and_headless_capabilities() {
        assert_eq!(
            linux_display_capabilities(true, true),
            ("x11-compatible", true, true)
        );
        assert_eq!(
            linux_display_capabilities(false, true),
            ("wayland", false, false)
        );
        assert_eq!(
            linux_display_capabilities(false, false),
            ("headless", false, false)
        );
    }
}

#[cfg(all(test, feature = "desktop"))]
mod window_geometry_tests {
    use super::{
        MonitorGeometry, position_is_visible_in, resolve_saved_position_in, snapped_position_in,
        stored_position_in,
    };
    use crate::config::OverlayPosition;

    fn monitor() -> MonitorGeometry {
        MonitorGeometry {
            id: Some("secondary".into()),
            x: 1_920,
            y: -200,
            width: 2_560,
            height: 1_440,
            scale: 2.0,
        }
    }

    #[test]
    fn logical_position_round_trips_across_a_scaled_monitor() {
        let saved = OverlayPosition {
            x: 100,
            y: 75,
            monitor_id: Some("secondary".into()),
            scale_factor: Some(1.5),
        };
        let resolved = resolve_saved_position_in(&saved, &[monitor()]).unwrap();
        assert_eq!((resolved.x, resolved.y), (2_120, -50));
        assert_eq!(resolved.scale_factor, Some(2.0));
        assert_eq!(
            stored_position_in(resolved, Some(&monitor())),
            saved_with_current_scale()
        );
    }

    fn saved_with_current_scale() -> OverlayPosition {
        OverlayPosition {
            x: 100,
            y: 75,
            monitor_id: Some("secondary".into()),
            scale_factor: Some(2.0),
        }
    }

    #[test]
    fn missing_saved_monitor_requests_a_center_fallback() {
        let saved = OverlayPosition {
            x: 10,
            y: 20,
            monitor_id: Some("unplugged".into()),
            scale_factor: Some(1.0),
        };
        assert!(resolve_saved_position_in(&saved, &[monitor()]).is_none());
    }

    #[test]
    fn visibility_requires_at_least_a_64_pixel_grab_area() {
        let visible = OverlayPosition {
            x: 4_416,
            y: 0,
            monitor_id: None,
            scale_factor: None,
        };
        let hidden = OverlayPosition {
            x: 4_417,
            ..visible.clone()
        };
        assert!(position_is_visible_in(320, 320, &[monitor()], &visible));
        assert!(!position_is_visible_in(320, 320, &[monitor()], &hidden));
    }

    #[test]
    fn snapping_uses_the_monitor_scale_at_each_edge() {
        let near_right_bottom = OverlayPosition {
            x: 4_145,
            y: 930,
            monitor_id: None,
            scale_factor: None,
        };
        let snapped = snapped_position_in(320, 320, Some(&monitor()), near_right_bottom);
        assert_eq!((snapped.x, snapped.y), (4_160, 920));

        let untouched = OverlayPosition {
            x: 2_100,
            y: 100,
            monitor_id: None,
            scale_factor: None,
        };
        assert_eq!(
            snapped_position_in(320, 320, Some(&monitor()), untouched.clone()),
            untouched
        );
    }
}

#[cfg(all(test, feature = "desktop"))]
mod diagnostic_privacy_tests {
    use std::collections::BTreeSet;

    use super::{DiagnosticConnection, DiagnosticPreferences, DiagnosticReport, DiagnosticRuntime};
    use crate::{config::ObservationMode, runtime::ConnectionState};

    fn keys(value: &serde_json::Value) -> BTreeSet<&str> {
        value
            .as_object()
            .expect("diagnostic section should be an object")
            .keys()
            .map(String::as_str)
            .collect()
    }

    #[test]
    fn diagnostic_export_has_an_explicit_redacted_schema() {
        let report = DiagnosticReport {
            generated_at_ms: 1,
            app_version: "test".into(),
            platform: "linux",
            global_shortcut_available: true,
            absolute_position_available: true,
            connection: DiagnosticConnection {
                state: ConnectionState::Connected,
                version: Some("1.2.3".into()),
                protocol: Some(1),
                agent_count: 2,
                has_error: true,
            },
            runtime: DiagnosticRuntime {
                started_at_ms: 1,
                reconnect_count: 2,
                last_event_kind: Some("turn_completed".into()),
                last_event_at_ms: Some(3),
                avatar_runtime_has_error: true,
            },
            preferences: DiagnosticPreferences {
                observation_mode: ObservationMode::All,
                wsl_mode: true,
                custom_avatar: true,
                fps: 60,
                animation_speed: 1.0,
                paused: false,
            },
        };
        let value = serde_json::to_value(report).unwrap();

        assert_eq!(
            keys(&value),
            BTreeSet::from([
                "absolutePositionAvailable",
                "appVersion",
                "connection",
                "generatedAtMs",
                "globalShortcutAvailable",
                "platform",
                "preferences",
                "runtime",
            ])
        );
        assert_eq!(
            keys(&value["connection"]),
            BTreeSet::from(["agentCount", "hasError", "protocol", "state", "version"])
        );
        assert_eq!(
            keys(&value["runtime"]),
            BTreeSet::from([
                "avatarRuntimeHasError",
                "lastEventAtMs",
                "lastEventKind",
                "reconnectCount",
                "startedAtMs",
            ])
        );
        assert_eq!(
            keys(&value["preferences"]),
            BTreeSet::from([
                "animationSpeed",
                "customAvatar",
                "fps",
                "observationMode",
                "paused",
                "wslMode",
            ])
        );
        let encoded = serde_json::to_string(&value).unwrap();
        for forbidden in [
            "socketPath",
            "lastError",
            "paneId",
            "paneText",
            "workspaceId",
            "projectSource",
            "avatarRuntimeError",
        ] {
            assert!(
                !encoded.contains(forbidden),
                "leaked forbidden field {forbidden}"
            );
        }
    }
}
