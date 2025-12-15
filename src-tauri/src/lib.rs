use log;
use tauri_plugin_http;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store;
use std::io::Cursor;
use image::ImageFormat;

// 图片压缩命令
#[tauri::command]
async fn compress_image(buffer: Vec<u8>, _quality: u8, target_format: Option<String>) -> Result<Vec<u8>, String> {
    // 1. 猜测原始格式
    let detected_format = image::guess_format(&buffer).map_err(|e| e.to_string())?;

    // 2. 加载图片
    let img = image::load_from_memory(&buffer).map_err(|e| e.to_string())?;

    // 3. 决定输出格式
    let format_to_use = if let Some(fmt_str) = target_format {
        match fmt_str.to_lowercase().as_str() {
            "png" => ImageFormat::Png,
            "jpeg" | "jpg" => ImageFormat::Jpeg,
            "webp" => ImageFormat::WebP,
            _ => detected_format,
        }
    } else {
        detected_format
    };

    // 4. 编码输出
    let mut output_buffer = Vec::new();
    let mut cursor = Cursor::new(&mut output_buffer);

    img.write_to(&mut cursor, format_to_use)
        .map_err(|e| e.to_string())?;

    Ok(output_buffer)
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
    path.push("app_v4.db");
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
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let state = state.lock().await;
    
    let event_name = payload.get("event").and_then(|v| v.as_str()).unwrap_or("custom-event");
    let event_data = payload.get("data").cloned().unwrap_or(serde_json::json!({}));
    
    if let Err(e) = state.app_handle.emit(event_name, &event_data) {
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
    let server_version_before = sync_engine::max_version_all_tables(&conn);
    let client_version = body.client_version.unwrap_or(0);
    
    // 冲突检测：客户端版本落后于服务器
    if client_version < server_version_before {
        let resp = PushResponse {
            applied: 0,
            server_version: server_version_before,
            conflict: true,
        };
        return Ok(Json(ApiResponse { 
            success: true, 
            data: Some(resp), 
            message: Some("conflict: please pull first".to_string()) 
        }));
    }

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
        .route("/state", get(sync_state))
        .route("/pull", get(sync_pull))
        .route("/push", post(sync_push))
        // .route("/api/notification", post(send_notification))
        // .route("/api/emit", post(emit_event))
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
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:app_v4.db",
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
                  title TEXT,
                  content TEXT,
                  tags TEXT DEFAULT '[]',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(version);
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "create_workflows_table_with_sync_fields",
                            sql: "\
                CREATE TABLE IF NOT EXISTS workflow_schemas (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  fields TEXT DEFAULT '[]',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_workflow_schemas_version ON workflow_schemas(version);

                CREATE TABLE IF NOT EXISTS workflow_envs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  key TEXT NOT NULL UNIQUE,
                  value TEXT NOT NULL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS workflows (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "create_moments_table_with_sync_fields",
                            sql: "\
                CREATE TABLE IF NOT EXISTS moments (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  content TEXT,
                  images TEXT DEFAULT '[]',
                  tags TEXT DEFAULT '[]',
                  version INTEGER DEFAULT 0,
                  deleted_at DATETIME,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_moments_version ON moments(version);
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 5,
                            description: "create_assets_with_sync_fields",
                            sql: "
                                CREATE TABLE IF NOT EXISTS assets (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
