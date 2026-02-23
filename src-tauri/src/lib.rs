use log;
use tauri_plugin_http;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store;
use std::io::Cursor;
use image::{ImageFormat, ImageEncoder, AnimationDecoder};
use image::codecs::jpeg::JpegEncoder;
use chrono;
use image::codecs::png::PngEncoder;
use image::codecs::webp::WebPEncoder;
use image::codecs::gif::{GifDecoder, GifEncoder};

// 图片压缩命令
#[tauri::command]
async fn compress_image(buffer: Vec<u8>, quality: u8, target_format: Option<String>) -> Result<Vec<u8>, String> {
    // 1. 猜测原始格式
    let detected_format = image::guess_format(&buffer).map_err(|e| e.to_string())?;

    // 2. 决定输出格式
    let format_to_use = if let Some(fmt_str) = target_format {
        match fmt_str.to_lowercase().as_str() {
            "png" => ImageFormat::Png,
            "jpeg" | "jpg" => ImageFormat::Jpeg,
            "webp" => ImageFormat::WebP,
            "gif" => ImageFormat::Gif,
            _ => detected_format,
        }
    } else {
        detected_format
    };

    // 3. 准备输出
    let mut output_buffer = Vec::new();
    // let mut cursor = Cursor::new(&mut output_buffer); // 移除顶层 cursor，避免借用冲突

    // 4. 特殊处理：GIF 转 GIF (尝试保留动画)
    if detected_format == ImageFormat::Gif && format_to_use == ImageFormat::Gif {
        // 尝试解码为动画
        let decoder = GifDecoder::new(Cursor::new(&buffer)).map_err(|e| e.to_string())?;
        let frames = decoder.into_frames().collect_frames().map_err(|e| e.to_string())?;
        
        {
            let mut cursor = Cursor::new(&mut output_buffer);
            let mut encoder = GifEncoder::new(&mut cursor);
            encoder.set_repeat(image::codecs::gif::Repeat::Infinite).map_err(|e| e.to_string())?;
            encoder.encode_frames(frames.into_iter()).map_err(|e| e.to_string())?;
        } // cursor 作用域结束，释放 output_buffer 借用
        
        return Ok(output_buffer);
    }

    // 5. 常规静态图片处理
    let img = image::load_from_memory(&buffer).map_err(|e| e.to_string())?;
    let (width, height) = (img.width(), img.height());

    {
        let mut cursor = Cursor::new(&mut output_buffer);
        match format_to_use {
            ImageFormat::Jpeg => {
                let rgb = img.to_rgb8();
                let encoder = JpegEncoder::new_with_quality(&mut cursor, quality);
                encoder.write_image(rgb.as_raw(), width, height, image::ColorType::Rgb8.into()).map_err(|e| e.to_string())?;
            },
            ImageFormat::Png => {
                let rgba = img.to_rgba8();
                // image 0.25 PngEncoder configuration might vary, using default for compatibility
                let encoder = PngEncoder::new(&mut cursor);
                encoder.write_image(rgba.as_raw(), width, height, image::ColorType::Rgba8.into()).map_err(|e| e.to_string())?;
            },
            ImageFormat::WebP => {
                let rgba = img.to_rgba8();
                // image 0.25 WebPEncoder only supports lossless via new_lossless
                let encoder = WebPEncoder::new_lossless(&mut cursor);
                encoder.write_image(rgba.as_raw(), width, height, image::ColorType::Rgba8.into()).map_err(|e| e.to_string())?;
            },
            ImageFormat::Gif => {
                // 静态 GIF
                let rgba = img.to_rgba8();
                let mut encoder = GifEncoder::new(&mut cursor);
                encoder.encode_frame(image::Frame::new(rgba)).map_err(|e| e.to_string())?;
            },
            _ => {
                img.write_to(&mut cursor, format_to_use).map_err(|e| e.to_string())?;
            }
        }
    } // cursor 作用域结束，释放 output_buffer 借用

    Ok(output_buffer)
}

// ============ Preview / Export (Local-first publishing helper) ============

#[derive(Deserialize, Serialize, Clone, Debug)]
struct PreviewOpenPayload {
    path: String,
}

/// Emit an event to the frontend to open a markdown file in Preview page.
/// This is mainly used for automation (OpenClaw / scripts) via the built-in HTTP server.
#[cfg(not(mobile))]
#[tauri::command]
fn preview_open_file(app_handle: AppHandle, path: String) -> Result<(), String> {
    log::info!("[preview_open_file] requested path={}", path);

    // Best-effort: focus window
    if let Some(win) = app_handle.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        log::warn!("[preview_open_file] main webview window not found");
    }

    // Prefer emitting from window (more deterministic for JS listeners)
    if let Some(win) = app_handle.get_webview_window("main") {
        win.emit("preview:open", PreviewOpenPayload { path: path.clone() })
            .map_err(|e| {
                log::error!("[preview_open_file] win.emit preview:open failed: {}", e);
                e.to_string()
            })?;
        log::info!("[preview_open_file] win.emit preview:open ok");
    } else {
        app_handle
            .emit("preview:open", PreviewOpenPayload { path: path.clone() })
            .map_err(|e| {
                log::error!("[preview_open_file] app.emit preview:open failed: {}", e);
                e.to_string()
            })?;
        log::info!("[preview_open_file] app.emit preview:open ok");
    }
    Ok(())
}

/// Export WeChat-ready HTML fragment into a deterministic workspace folder.
/// Returns the written file path.
#[tauri::command]
fn export_wechat_html(app_handle: tauri::AppHandle, slug: String, html: String, source_path: Option<String>) -> Result<String, String> {
    // Allow override for portability
    let base_dir = std::env::var("ZOTEPAD_EXPORT_DIR")
        .unwrap_or_else(|_| "/Users/aatrox/.openclaw/workspace/zotepad-exports/html".to_string());

    log::info!(
        "[export_wechat_html] start slug='{}' source_path={:?} base_dir='{}' html_len={}",
        slug,
        source_path,
        base_dir,
        html.len()
    );

    let safe_slug = slug
        .trim()
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-");

    if safe_slug.is_empty() {
        log::error!("[export_wechat_html] empty slug (raw='{}')", slug);
        return Err("empty slug".to_string());
    }

    let dir = std::path::Path::new(&base_dir);
    std::fs::create_dir_all(dir).map_err(|e| {
        log::error!("[export_wechat_html] create_dir_all failed: {}", e);
        format!("create_dir_all failed: {e}")
    })?;

    let out_path = dir.join(format!("{}.html", safe_slug));
    std::fs::write(&out_path, html).map_err(|e| {
        log::error!("[export_wechat_html] write failed path={:?} err={}", out_path, e);
        format!("write failed: {e}")
    })?;

    log::info!("[export_wechat_html] wrote html to {:?}", out_path);

    // Best-effort index.json update
    // Format: { "slug": { "htmlPath": "...", "sourcePath": "...", "updatedAt": "..." }, ... }
    let index_path = dir.join("index.json");
    let now = chrono::Utc::now().to_rfc3339();

    let mut index_obj: serde_json::Map<String, serde_json::Value> = match std::fs::read_to_string(&index_path) {
        Ok(s) => serde_json::from_str::<serde_json::Value>(&s)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default(),
        Err(_) => serde_json::Map::new(),
    };

    let mut item = serde_json::Map::new();
    item.insert(
        "htmlPath".to_string(),
        serde_json::Value::String(out_path.to_string_lossy().to_string()),
    );
    let source_path_for_event = source_path.clone();
    if let Some(p) = source_path {
        item.insert("sourcePath".to_string(), serde_json::Value::String(p));
    }
    item.insert("updatedAt".to_string(), serde_json::Value::String(now));

    index_obj.insert(safe_slug.clone(), serde_json::Value::Object(item));

    if let Ok(s) = serde_json::to_string_pretty(&serde_json::Value::Object(index_obj)) {
        if let Err(e) = std::fs::write(&index_path, s) {
            log::warn!("[export_wechat_html] write index.json failed path={:?} err={}", index_path, e);
        } else {
            log::info!("[export_wechat_html] updated index.json at {:?}", index_path);
        }
    } else {
        log::warn!("[export_wechat_html] failed to serialize index.json");
    }

    let out_str = out_path.to_string_lossy().to_string();
    // Emit best-effort event for automation / debug
    match app_handle.emit(
        "preview:exported",
        serde_json::json!({
            "slug": safe_slug,
            "htmlPath": out_str,
            "sourcePath": source_path_for_event,
            "updatedAt": chrono::Utc::now().to_rfc3339(),
        }),
    ) {
        Ok(_) => log::info!("[export_wechat_html] emitted preview:exported"),
        Err(e) => log::warn!("[export_wechat_html] emit preview:exported failed: {}", e),
    }

    Ok(out_str)
}

// 同步引擎模块
#[cfg(not(mobile))]
mod sync_engine;

// HTTP Server 只在桌面端编译
#[cfg(not(mobile))]
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
#[cfg(not(mobile))]
use std::sync::{atomic::{AtomicI64, Ordering}, Arc};
#[cfg(not(mobile))]
use rusqlite::Connection;
#[cfg(not(mobile))]
use tauri::{AppHandle, Emitter, Manager};
#[cfg(not(mobile))]
use tokio::sync::Mutex;
#[cfg(not(mobile))]
use tower_http::cors::CorsLayer;
#[cfg(not(mobile))]
use crate::sync_engine::SyncChange;

// HTTP Server 状态，持有 Tauri AppHandle
#[cfg(not(mobile))]
struct HttpServerState {
    app_handle: AppHandle,
    version_counter: AtomicI64,  // 全局版本号计数器
    token: String,
}

// API 响应结构
#[cfg(not(mobile))]
#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

// ============ Sync 数据结构 ============

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct SyncStateData {
    version: i64,  // 服务器当前最大版本号
    server_version: String,  // 服务器软件版本
    paired: bool,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PullResponse {
    changes: Vec<SyncChange>,
    next_version: Option<i64>,  // 分页时的下一个版本号
    server_version: i64,  // 服务器当前最大版本号
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PullQuery {
    table: Option<String>,  // 新增：指定要拉取的表
    since_version: Option<i64>,  // 客户端上次同步的版本号
    limit: Option<usize>,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PushRequest {
    table: Option<String>,  // 新增：指定要推送的表
    changes: Vec<SyncChange>,
    client_version: Option<i64>,  // 客户端当前的版本号
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PushResponse {
    applied: usize,
    server_version: i64,  // 服务器最新版本号
    conflict: bool,
}

// ============ Sync Helpers ============

#[cfg(not(mobile))]
fn open_db(app_handle: &AppHandle) -> Result<Connection, StatusCode> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            log::error!("resolve app_data_dir failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    path.push("app_v5.db");
    let conn = Connection::open(&path).map_err(|e| {
        log::error!("open_db failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(conn)
}

// 示例：接收的请求体
#[cfg(not(mobile))]
#[derive(Deserialize, Serialize, Clone)]
struct SendNotificationRequest {
    title: String,
    body: String,
}

// 健康检查响应结构
#[cfg(not(mobile))]
#[derive(Serialize)]
struct HealthCheckData {
    message: String,
    timestamp: u64,
    server_ip: String,
}

// 健康检查端点
#[cfg(not(mobile))]
async fn health_check() -> Json<ApiResponse<HealthCheckData>> {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    
    let server_ip = get_local_ip_internal();
    
    Json(ApiResponse {
        success: true,
        data: Some(HealthCheckData {
            message: "ZotePad HTTP Server is running".to_string(),
            timestamp,
            server_ip,
        }),
        message: None,
    })
}

// 示例：发送通知的端点
#[cfg(not(mobile))]
async fn send_notification(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    Json(payload): Json<SendNotificationRequest>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let state = state.lock().await;
    
    // 通过 Tauri 发送系统通知
    if let Err(e) = state.app_handle.emit("notification", &payload) {
        return Ok(Json(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("Failed to emit event: {}", e)),
        }));
    }
    
    Ok(Json(ApiResponse {
        success: true,
        data: None,
        message: Some("Notification sent".to_string()),
    }))
}

// 示例：向前端发送事件
#[cfg(not(mobile))]
async fn emit_event(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let state_guard = state.lock().await;

    if let Err(_e) = check_auth(&headers, &state_guard.token) {
        log::warn!("[http/emit_event] unauthorized");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);
     
    let event_name = payload.get("event").and_then(|v| v.as_str()).unwrap_or("custom-event");
    let event_data = payload.get("data").cloned().unwrap_or(serde_json::json!({}));

    let event_data_str = serde_json::to_string(&event_data).unwrap_or_else(|_| "<unserializable-json>".to_string());
    let event_data_trunc: String = event_data_str.chars().take(800).collect();
    let event_data_suffix = if event_data_str.chars().count() > 800 { "…(truncated)" } else { "" };
    let has_main_window = app_handle.get_webview_window("main").is_some();
    log::info!(
        "[http/emit_event] emitting event='{}' has_main_window={} data={}{}",
        event_name,
        has_main_window,
        event_data_trunc,
        event_data_suffix
    );
    
    if let Err(e) = app_handle.emit(event_name, &event_data) {
        return Ok(Json(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("Failed to emit event: {}", e)),
        }));
    }
    
    Ok(Json(ApiResponse {
        success: true,
        data: None,
        message: Some(format!("Event '{}' emitted", event_name)),
    }))
}

// ============ Preview automation via HTTP (desktop only) ============

#[cfg(not(mobile))]
#[derive(Deserialize, Serialize, Clone, Debug)]
struct PreviewOpenRequest {
    path: String,
}

/// POST /preview/open  { path }
/// Emits event `preview:open` to the frontend.
#[cfg(not(mobile))]
async fn preview_open(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Json(body): Json<PreviewOpenRequest>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let path_raw = body.path.clone();
    log::info!("[http/preview_open] request path='{}'", path_raw);

    let state_guard = state.lock().await;
    if let Err(_e) = check_auth(&headers, &state_guard.token) {
        log::warn!("[http/preview_open] unauthorized");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);

    let path = path_raw.trim().to_string();
    if path.is_empty() {
        log::warn!("[http/preview_open] empty path");
        return Ok(Json(ApiResponse {
            success: false,
            data: None,
            message: Some("Missing field: path".to_string()),
        }));
    }

    // Basic sanity checks (best-effort)
    if !path.ends_with(".md") && !path.ends_with(".markdown") {
        log::warn!("[http/preview_open] invalid file type path='{}'", path);
        return Ok(Json(ApiResponse {
            success: false,
            data: None,
            message: Some("Invalid file type: only .md/.markdown supported".to_string()),
        }));
    }

    if !std::path::Path::new(&path).exists() {
        log::warn!("[http/preview_open] file not found path='{}'", path);
        return Ok(Json(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("File not found: {}", path)),
        }));
    }

    // Best-effort: focus window
    if let Some(win) = app_handle.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        log::warn!("[http/preview_open] main webview window not found");
    }

    // Prefer emitting from the main window (more deterministic for JS listeners)
    if let Some(win) = app_handle.get_webview_window("main") {
        log::info!("[http/preview_open] main window label='{}'", win.label());
        if let Err(e) = win.emit("preview:open", PreviewOpenPayload { path: path.clone() }) {
            log::error!("[http/preview_open] win.emit preview:open failed: {}", e);
            return Ok(Json(ApiResponse {
                success: false,
                data: None,
                message: Some(format!("Failed to emit event: {}", e)),
            }));
        }
        log::info!("[http/preview_open] win.emit preview:open ok path='{}'", path);
    } else {
        log::warn!("[http/preview_open] main webview window not found; fallback to app.emit");
        if let Err(e) = app_handle.emit("preview:open", PreviewOpenPayload { path: path.clone() }) {
            log::error!("[http/preview_open] app.emit preview:open failed: {}", e);
            return Ok(Json(ApiResponse {
                success: false,
                data: None,
                message: Some(format!("Failed to emit event: {}", e)),
            }));
        }
        log::info!("[http/preview_open] app.emit preview:open ok path='{}'", path);
    }

    Ok(Json(ApiResponse {
        success: true,
        data: None,
        message: Some("ok".to_string()),
    }))
}

// ============ Sync 路由 ============

#[cfg(not(mobile))]
fn check_auth(headers: &axum::http::HeaderMap, token: &str) -> Result<(), StatusCode> {
    const AUTH_HEADER: &str = "authorization";
    if let Some(value) = headers.get(AUTH_HEADER) {
        if let Ok(v) = value.to_str() {
            // 允许带 Bearer 前缀或裸 token
            let trimmed = v.trim();
            if trimmed == token || trimmed.strip_prefix("Bearer ") == Some(token) {
                return Ok(());
            }
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}

// /state: 返回当前版本号与配对状态
#[cfg(not(mobile))]
async fn sync_state(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<SyncStateData>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);

    // 读取所有表的最大版本号
    let db_version = match open_db(&app_handle) {
        Ok(conn) => sync_engine::max_version_all_tables(&conn),
        Err(e) => return Err(e),
    };

    let version = {
        let guard = state.lock().await;
        // 若数据库版本更大，则更新全局 version_counter
        if db_version > guard.version_counter.load(Ordering::Relaxed) {
            guard.version_counter.store(db_version, Ordering::Relaxed);
        }
        guard.version_counter.load(Ordering::Relaxed)
    };

    let data = SyncStateData {
        version,
        server_version: env!("CARGO_PKG_VERSION").to_string(),
        paired: true,
    };

    Ok(Json(ApiResponse {
        success: true,
        data: Some(data),
        message: None,
    }))
}

// /pull: 按版本号拉取增量变更
#[cfg(not(mobile))]
async fn sync_pull(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<PullQuery>,
) -> Result<Json<ApiResponse<PullResponse>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);

    let since_version = query.since_version.unwrap_or(0);
    let limit = query.limit.unwrap_or(500).min(1000);
    let table_name = query.table.as_deref().unwrap_or("notes"); // 默认 notes

    let conn = open_db(&app_handle)?;
    
    // 使用泛型引擎加载表变更
    let changes = sync_engine::load_table_changes(&conn, table_name, since_version, limit)
        .map_err(|e| {
            log::error!("sync_pull load_table_changes error for {}: {}", table_name, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 获取当前数据库最大版本号（所有表）
    let server_version = sync_engine::max_version_all_tables(&conn);
    {
        let guard = state.lock().await;
        guard.version_counter.store(server_version, Ordering::Relaxed);
    }

    // 若变化达到 limit，则需要分页，next_version 为最后一条的 version + 1
    let next_version = if changes.len() >= limit {
        changes.last().map(|c| c.version + 1)
    } else {
        None
    };

    let resp = PullResponse {
        changes,
        next_version,
        server_version,
    };

    Ok(Json(ApiResponse {
        success: true,
        data: Some(resp),
        message: None,
    }))
}

// /metadata: 获取指定表的元数据列表（用于智能合并）
#[cfg(not(mobile))]
async fn sync_metadata(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);

    let table_name = query.get("table").map(|s| s.as_str()).unwrap_or("notes");

    let conn = open_db(&app_handle)?;
    
    let metadata = sync_engine::load_table_metadata(&conn, table_name)
        .map_err(|e| {
            log::error!("sync_metadata error for {}: {}", table_name, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(ApiResponse {
        success: true,
        data: Some(metadata),
        message: None,
    }))
}

// /push: 接受增量，分配新版本号并应用
#[cfg(not(mobile))]
async fn sync_push(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Json(body): Json<PushRequest>,
) -> Result<Json<ApiResponse<PushResponse>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);

    let conn = open_db(&app_handle)?;
    
    // 获取当前服务器版本号（所有表）
    let _server_version_before = sync_engine::max_version_all_tables(&conn);
    let _client_version = body.client_version.unwrap_or(0);
    
    // 移除全局版本检查，改用记录级冲突检测
    // 因为客户端可能只同步了部分表，或者 client_version 传递不准确
    // 我们信任客户端的 push 决策（客户端已完成 diff 和冲突解决）

    let mut applied = 0usize;
    let table_name = body.table.as_deref(); // 可选的表名过滤

    for change in body.changes.iter() {
        // 如果请求中指定了表名，只处理该表；否则根据 change.table 判断
        let target_table = if let Some(t) = table_name {
            if change.table != t {
                continue; // 跳过非目标表
            }
            t
        } else {
            &change.table
        };

        // 检查表是否支持
        if sync_engine::get_table_config(target_table).is_none() {
            log::warn!("Unsupported table: {}", target_table);
            continue;
        }
        
        // 为每个变更分配新的版本号（原子递增）
        let new_version = {
            let guard = state.lock().await;
            guard.version_counter.fetch_add(1, Ordering::Relaxed) + 1
        };
        
        // 使用泛型引擎应用变更
        match sync_engine::apply_table_change(&conn, target_table, change, new_version) {
            Ok(applied_one) => {
                if applied_one {
                    applied += 1;
                }
            }
            Err(e) => {
                log::error!("apply_table_change error for {}: {}", target_table, e);
            }
        }
    }

    // 获取应用后的最新版本号
    let server_version = sync_engine::max_version_all_tables(&conn);
    {
        let guard = state.lock().await;
        guard.version_counter.store(server_version, Ordering::Relaxed);
    }

    let resp = PushResponse {
        applied,
        server_version,
        conflict: false,
    };

    // 如果有变更应用成功，通知前端显示"接收"状态
    if applied > 0 {
        let guard = state.lock().await;
        let _ = guard.app_handle.emit("sync:incoming", applied);
    }

    Ok(Json(ApiResponse {
        success: true,
        data: Some(resp),
        message: None,
    }))
}

// 启动 HTTP 服务器 (仅桌面端)
#[cfg(not(mobile))]
async fn start_http_server(app_handle: AppHandle, port: u16) {
    // 简易令牌（后续可改为持久化/用户配置）
    let token = std::env::var("ZOTEPAD_SYNC_TOKEN").unwrap_or_else(|_| "zotepad-dev-token".to_string());

    let state = Arc::new(Mutex::new(HttpServerState {
        app_handle,
        version_counter: AtomicI64::new(0),
        token,
    }));

    // 初始化 version_counter 为 DB 最新版本号
    {
        let guard = state.lock().await;
        let app_handle = guard.app_handle.clone();
        drop(guard);
        if let Ok(conn) = open_db(&app_handle) {
            let latest_version = sync_engine::max_version_all_tables(&conn);
            let guard = state.lock().await;
            guard.version_counter.store(latest_version, Ordering::Relaxed);
        }
    }

    // 配置 CORS - 使用 permissive() 完全开放
    let cors = CorsLayer::permissive();

    // 构建路由
    let app = Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .route("/emit", post(emit_event))
        .route("/preview/open", post(preview_open))
        .route("/state", get(sync_state))
        .route("/metadata", get(sync_metadata))
        .route("/pull", get(sync_pull))
        .route("/push", post(sync_push))
        // .route("/api/notification", post(send_notification))
        .layer(cors)
        .with_state(state);

    // 监听 0.0.0.0 以允许局域网访问
    let addr = format!("0.0.0.0:{}", port);
    let local_ip = get_local_ip_internal();
    log::info!("Starting HTTP server on http://{}:{}", local_ip, port);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// 获取本机局域网 IP（内部函数）
#[cfg(not(mobile))]
fn get_local_ip_internal() -> String {
    use std::net::UdpSocket;
    
    // 方法1: 尝试通过连接外部地址获取本地 IP
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                // 过滤掉代理软件的虚拟网卡 IP (198.18.x.x 是 Clash 等代理常用的)
                if !ip.starts_with("198.18.") && !ip.starts_with("169.254.") {
                    return ip;
                }
            }
        }
    }
    
    // 方法2: 遍历所有网络接口，查找局域网 IP
    #[cfg(target_os = "windows")]
    {
        // 在 Windows 上尝试用 hostname 命令获取
        if let Ok(output) = std::process::Command::new("hostname").output() {
            if let Ok(hostname) = String::from_utf8(output.stdout) {
                let hostname = hostname.trim();
                // 尝试通过 DNS 解析本机名
                if let Ok(addrs) = std::net::ToSocketAddrs::to_socket_addrs(&format!("{}:0", hostname)) {
                    for addr in addrs {
                        let ip = addr.ip().to_string();
                        if ip.starts_with("192.168.") || ip.starts_with("10.") || ip.starts_with("172.") {
                            return ip;
                        }
                    }
                }
            }
        }
    }
    
    // 方法3: 绑定到常见局域网网段测试
    for prefix in &["192.168.", "10.", "172.16.", "172.17.", "172.18."] {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            // 尝试连接到该网段的网关（假设 .1）
            let test_addr = format!("{}1.1:80", prefix);
            if socket.connect(&test_addr).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    let ip = addr.ip().to_string();
                    if ip.starts_with(prefix) {
                        return ip;
                    }
                }
            }
        }
    }
    
    "127.0.0.1".to_string()
}

// Tauri 命令：获取本机局域网 IP
#[cfg(not(mobile))]
#[tauri::command]
fn get_local_ip() -> String {
    get_local_ip_internal()
}

// Tauri 命令：获取 HTTP 服务器端口
#[cfg(not(mobile))]
#[tauri::command]
fn get_http_server_port() -> u16 {
    54577
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(not(mobile))]
    let builder = builder.plugin(tauri_plugin_opener::init());

    builder.plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:app_v5.db",
                    vec![
                        // Migration 1: Init minimal tables (users, settings)
                        Migration {
                            version: 1,
                            description: "init_minimal_tables",
                            sql: "\
                CREATE TABLE IF NOT EXISTS users (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  email TEXT NOT NULL UNIQUE,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS settings (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL,
                  category TEXT DEFAULT 'general',
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "create_notes_table_with_sync_fields",
                            sql: "\
                CREATE TABLE IF NOT EXISTS notes (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  uuid TEXT UNIQUE NOT NULL,
                  title TEXT,
                  content TEXT,
                  tags TEXT DEFAULT '[]',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(version);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_uuid ON notes(uuid);
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "create_workflows_table_with_sync_fields",
                            sql: "\
                CREATE TABLE IF NOT EXISTS workflow_schemas (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  uuid TEXT UNIQUE NOT NULL,
                  name TEXT NOT NULL,
                  description TEXT,
                  fields TEXT DEFAULT '[]',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_workflow_schemas_version ON workflow_schemas(version);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_schemas_uuid ON workflow_schemas(uuid);

                CREATE TABLE IF NOT EXISTS workflow_envs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  key TEXT NOT NULL UNIQUE,
                  value TEXT NOT NULL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS workflows (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  uuid TEXT UNIQUE NOT NULL,
                  name TEXT NOT NULL,
                  description TEXT,
                  steps TEXT NOT NULL DEFAULT '[]',
                  schema_id INTEGER,
                  type TEXT DEFAULT 'user',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_workflows_version ON workflows(version);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_uuid ON workflows(uuid);
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "create_moments_table_with_sync_fields",
                            sql: "\
                CREATE TABLE IF NOT EXISTS moments (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  uuid TEXT UNIQUE NOT NULL,
                  content TEXT,
                  images TEXT DEFAULT '[]',
                  tags TEXT DEFAULT '[]',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_moments_version ON moments(version);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_moments_uuid ON moments(uuid);
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 5,
                            description: "create_assets_with_sync_fields",
                            sql: "
                                CREATE TABLE IF NOT EXISTS assets (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    uuid TEXT UNIQUE NOT NULL,
                                    url TEXT NOT NULL,
                                    path TEXT NOT NULL,
                                    filename TEXT NOT NULL,
                                    size INTEGER,
                                    mime_type TEXT,
                                    storage_type TEXT DEFAULT 'cos',
                                    version INTEGER DEFAULT 0,
                                    deleted_at DATETIME,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                );
                                CREATE INDEX IF NOT EXISTS idx_assets_version ON assets(version);
                                CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_uuid ON assets(uuid);
                            ",
                            kind: MigrationKind::Up,
                        },
                        // Migration 6: Achievement system tables
                        Migration {
                            version: 6,
                            description: "create_achievement_system_tables",
                            sql: "\
                                CREATE TABLE IF NOT EXISTS achievements (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    key TEXT NOT NULL UNIQUE,
                                    name TEXT NOT NULL,
                                    description TEXT,
                                    type TEXT NOT NULL,
                                    category TEXT NOT NULL,
                                    points INTEGER DEFAULT 0,
                                    exp INTEGER DEFAULT 0,
                                    icon TEXT,
                                    rule_config TEXT,
                                    max_level INTEGER DEFAULT 1,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                );
                                CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(type);
                                CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category);

                                CREATE TABLE IF NOT EXISTS user_achievements (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    user_id INTEGER NOT NULL,
                                    achievement_key TEXT NOT NULL,
                                    level INTEGER DEFAULT 1,
                                    progress INTEGER DEFAULT 0,
                                    total_points INTEGER DEFAULT 0,
                                    total_exp INTEGER DEFAULT 0,
                                    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    device_id TEXT,
                                    synced_at DATETIME,
                                    UNIQUE(user_id, achievement_key)
                                );
                                CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
                                CREATE INDEX IF NOT EXISTS idx_user_achievements_synced ON user_achievements(synced_at);

                                CREATE TABLE IF NOT EXISTS user_stats (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    user_id INTEGER NOT NULL,
                                    stat_key TEXT NOT NULL,
                                    stat_value TEXT NOT NULL,
                                    stat_type TEXT DEFAULT 'counter',
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    device_id TEXT,
                                    synced_at DATETIME,
                                    UNIQUE(user_id, stat_key)
                                );
                                CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id);
                                CREATE INDEX IF NOT EXISTS idx_user_stats_key ON user_stats(stat_key);
                                CREATE INDEX IF NOT EXISTS idx_user_stats_synced ON user_stats(synced_at);

                                CREATE TABLE IF NOT EXISTS user_points_log (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    user_id INTEGER NOT NULL,
                                    operation_id TEXT NOT NULL UNIQUE,
                                    source_type TEXT NOT NULL,
                                    source_id TEXT NOT NULL,
                                    achievement_key TEXT,
                                    points INTEGER NOT NULL,
                                    exp INTEGER NOT NULL,
                                    reason TEXT,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    device_id TEXT,
                                    synced_at DATETIME
                                );
                                CREATE INDEX IF NOT EXISTS idx_points_log_user ON user_points_log(user_id);
                                CREATE INDEX IF NOT EXISTS idx_points_log_operation ON user_points_log(operation_id);
                                CREATE INDEX IF NOT EXISTS idx_points_log_synced ON user_points_log(synced_at);
                                CREATE INDEX IF NOT EXISTS idx_points_log_created ON user_points_log(created_at);

                                CREATE TABLE IF NOT EXISTS user_achievement_profile (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    user_id INTEGER NOT NULL UNIQUE,
                                    total_points INTEGER DEFAULT 0,
                                    total_exp INTEGER DEFAULT 0,
                                    current_level INTEGER DEFAULT 1,
                                    title TEXT,
                                    achievements_count INTEGER DEFAULT 0,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                );
                                CREATE INDEX IF NOT EXISTS idx_profile_user ON user_achievement_profile(user_id);

                                INSERT OR IGNORE INTO achievements (key, name, description, type, category, points, exp, icon, rule_config, max_level) VALUES
                                ('writing_first_note', '初出茅庐', '创建第一篇笔记', 'milestone', 'writing', 10, 5, '📝', '{\"metric\":\"content.notes_total\",\"target\":1}', 1),
                                ('writing_10_notes', '勤奋笔者', '创建10篇笔记', 'milestone', 'writing', 50, 20, '✍️', '{\"metric\":\"content.notes_total\",\"target\":10}', 1),
                                ('writing_50_notes', '笔记达人', '创建50篇笔记', 'milestone', 'writing', 200, 100, '📚', '{\"metric\":\"content.notes_total\",\"target\":50}', 1),
                                ('writing_words', '文字工匠', '累计书写字数（可升级）', 'progressive', 'writing', 10, 5, '✨', '{\"metric\":\"content.words_total\",\"baseTarget\":1000,\"rate\":2}', 999),
                                ('social_first_moment', '分享时刻', '发布第一条动态', 'milestone', 'social', 10, 5, '💬', '{\"metric\":\"content.moments_total\",\"target\":1}', 1),
                                ('social_10_moments', '活跃用户', '发布10条动态', 'milestone', 'social', 50, 20, '🎉', '{\"metric\":\"content.moments_total\",\"target\":10}', 1),
                                ('asset_first_image', '摄影起步', '上传第一张图片', 'milestone', 'asset', 10, 5, '📷', '{\"metric\":\"asset.images_total\",\"target\":1}', 1),
                                ('asset_collector', '素材收藏家', '累计上传素材（可升级）', 'progressive', 'asset', 10, 5, '🗂️', '{\"metric\":\"asset.total\",\"baseTarget\":10,\"rate\":2}', 999);
                            ",
                            kind: MigrationKind::Up,
                        },
                        // Migration 7: Asset tags and grouping system
                        Migration {
                            version: 7,
                            description: "create_asset_tags_tables",
                            sql: "\
                                CREATE TABLE IF NOT EXISTS asset_tags (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    uuid TEXT UNIQUE NOT NULL,
                                    name TEXT NOT NULL,
                                    parent_id INTEGER DEFAULT NULL,
                                    type TEXT DEFAULT 'tag', -- 'tag' or 'folder'
                                    description TEXT,
                                    icon TEXT,
                                    color TEXT,
                                    sort_order INTEGER DEFAULT 0,
                                    version INTEGER DEFAULT 0,
                                    deleted_at DATETIME,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                );
                                CREATE INDEX IF NOT EXISTS idx_asset_tags_version ON asset_tags(version);
                                CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_tags_uuid ON asset_tags(uuid);
                                CREATE INDEX IF NOT EXISTS idx_asset_tags_parent ON asset_tags(parent_id);

                                CREATE TABLE IF NOT EXISTS asset_tag_relations (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    uuid TEXT UNIQUE NOT NULL,
                                    asset_id INTEGER NOT NULL,
                                    tag_id INTEGER NOT NULL,
                                    version INTEGER DEFAULT 0,
                                    deleted_at DATETIME,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    UNIQUE(asset_id, tag_id)
                                );
                                CREATE INDEX IF NOT EXISTS idx_asset_tag_relations_version ON asset_tag_relations(version);
                                CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_tag_relations_uuid ON asset_tag_relations(uuid);
                                CREATE INDEX IF NOT EXISTS idx_asset_tag_relations_asset ON asset_tag_relations(asset_id);
                                CREATE INDEX IF NOT EXISTS idx_asset_tag_relations_tag ON asset_tag_relations(tag_id);
                            ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 8,
                            description: "Add UUID fields to asset_tag_relations for cross-device sync",
                            sql: "
                                -- 添加 UUID 字段用于跨设备同步
                                ALTER TABLE asset_tag_relations ADD COLUMN asset_uuid TEXT;
                                ALTER TABLE asset_tag_relations ADD COLUMN tag_uuid TEXT;
                                
                                -- 为 UUID 字段创建索引
                                CREATE INDEX IF NOT EXISTS idx_asset_tag_relations_asset_uuid ON asset_tag_relations(asset_uuid);
                                CREATE INDEX IF NOT EXISTS idx_asset_tag_relations_tag_uuid ON asset_tag_relations(tag_uuid);
                                
                                -- 为现有数据填充 UUID（从 assets 和 asset_tags 表关联获取）
                                UPDATE asset_tag_relations 
                                SET asset_uuid = (
                                    SELECT uuid FROM assets WHERE assets.id = asset_tag_relations.asset_id
                                ),
                                tag_uuid = (
                                    SELECT uuid FROM asset_tags WHERE asset_tags.id = asset_tag_relations.tag_id
                                )
                                WHERE asset_uuid IS NULL OR tag_uuid IS NULL;
                            ",
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            #[cfg(not(mobile))]
            get_local_ip,
            #[cfg(not(mobile))]
            get_http_server_port,
            #[cfg(not(mobile))]
            preview_open_file,
            export_wechat_html,
            compress_image
        ])
        .setup(|app| {
            // HTTP 服务器只在桌面端启动
            #[cfg(not(mobile))]
            {
                let app_handle = app.handle().clone();
                let port = 54577; // HTTP 服务器端口
                
                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(start_http_server(app_handle, port));
                });
                
                log::info!("HTTP server will start on port {}", port);
            }
            
            #[cfg(mobile)]
            {
                let _ = app; // 避免未使用警告
                log::info!("HTTP server is disabled on mobile platforms");
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
