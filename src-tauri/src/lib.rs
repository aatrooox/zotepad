use log;
use tauri_plugin_http;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store;

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
    path.push("app_v2.db");
    let conn = Connection::open(&path).map_err(|e| {
        log::error!("open_db failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // 确保同步字段存在（兼容性修复）
    ensure_sync_columns(&conn).map_err(|e| {
        log::error!("ensure_sync_columns failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // 升级旧数据的版本号（确保可以被同步）
    upgrade_old_versions(&conn).map_err(|e| {
        log::error!("upgrade_old_versions failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(conn)
}

// 确保所有同步表都有必需的列
#[cfg(not(mobile))]
fn ensure_sync_columns(conn: &Connection) -> rusqlite::Result<()> {
    let tables = vec!["moments", "assets", "workflows"];
    
    for table in tables {
        // 检查 version 列是否存在
        let has_version: bool = conn
            .prepare(&format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = 'version'", table))?
            .query_row([], |row| row.get::<_, i64>(0))
            .map(|count| count > 0)?;
        
        if !has_version {
            log::info!("Adding version column to {} table", table);
            conn.execute(&format!("ALTER TABLE {} ADD COLUMN version INTEGER DEFAULT 0", table), [])?;
            conn.execute(&format!("CREATE INDEX IF NOT EXISTS idx_{}_version ON {}(version)", table, table), [])?;
        }

        // 检查 deleted_at 列是否存在
        let has_deleted_at: bool = conn
            .prepare(&format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = 'deleted_at'", table))?
            .query_row([], |row| row.get::<_, i64>(0))
            .map(|count| count > 0)?;
        
        if !has_deleted_at {
            log::info!("Adding deleted_at column to {} table", table);
            conn.execute(&format!("ALTER TABLE {} ADD COLUMN deleted_at DATETIME", table), [])?;
        }

        // assets 表还需要 updated_at（使用 NULL 作为默认值，避免 CURRENT_TIMESTAMP 问题）
        if table == "assets" {
            let has_updated_at: bool = conn
                .prepare(&format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = 'updated_at'", table))?
                .query_row([], |row| row.get::<_, i64>(0))
                .map(|count| count > 0)?;
            
            if !has_updated_at {
                log::info!("Adding updated_at column to {} table", table);
                // 使用 NULL 作为默认值
                conn.execute(&format!("ALTER TABLE {} ADD COLUMN updated_at DATETIME", table), [])?;
                // 为现有记录填充当前时间（使用 datetime('now') SQLite 函数）
                conn.execute(&format!("UPDATE {} SET updated_at = datetime('now') WHERE updated_at IS NULL", table), [])?;
            }
        }
    }

    log::info!("Database sync columns verified");
    Ok(())
}

// 升级旧数据的版本号（version <= 0 或异常大的时间戳版本）
#[cfg(not(mobile))]
fn upgrade_old_versions(conn: &Connection) -> rusqlite::Result<()> {
    let tables = vec!["notes", "moments", "assets", "workflows"];
    
    // 定义异常版本号阈值：超过 1000000 认为是旧的时间戳版本
    const ABNORMAL_VERSION_THRESHOLD: i64 = 1000000;
    
    // 先重置所有异常大的时间戳版本号为 0（需要重新分配）
    for table in &tables {
        let reset_count = conn.execute(
            &format!("UPDATE {} SET version = 0 WHERE version > ? AND deleted_at IS NULL", table),
            [ABNORMAL_VERSION_THRESHOLD],
        )?;
        
        if reset_count > 0 {
            log::info!("Reset {} abnormal timestamp versions in {} table (> {})", 
                reset_count, table, ABNORMAL_VERSION_THRESHOLD);
        }
    }
    
    // 查询所有表中的最大合法版本号，作为起始版本
    let mut max_version: i64 = 0;
    for table in &tables {
        let table_max: Option<i64> = conn.query_row(
            &format!("SELECT MAX(version) FROM {} WHERE version > 0 AND version <= ?", table),
            [ABNORMAL_VERSION_THRESHOLD],
            |row| row.get(0)
        ).ok().flatten();
        
        if let Some(v) = table_max {
            max_version = max_version.max(v);
        }
    }
    
    log::info!("Current max valid version across all tables: {}", max_version);
    
    for table in tables {
        // 检查是否有 version <= 0 的记录（包括刚重置的）
        let count: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM {} WHERE version <= 0 AND deleted_at IS NULL", table),
            [],
            |row| row.get(0)
        )?;
        
        if count > 0 {
            log::info!("Upgrading {} records in {} table with version <= 0", count, table);
            
            // 查询所有需要升级的记录ID
            let mut stmt = conn.prepare(&format!(
                "SELECT id FROM {} WHERE version <= 0 AND deleted_at IS NULL ORDER BY id",
                table
            ))?;
            
            let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            
            // 批量更新版本号，从 max_version + 1 开始递增
            for (index, id) in ids.iter().enumerate() {
                let new_version = max_version + (index as i64) + 1;
                conn.execute(
                    &format!("UPDATE {} SET version = ?, updated_at = datetime('now') WHERE id = ?", table),
                    [&new_version, id],
                )?;
            }
            
            log::info!("Upgraded {} records in {} table (version range: {} - {})", 
                count, table, max_version + 1, max_version + count);
            
            // 更新 max_version 以便后续表使用
            max_version += count;
        }
    }
    
    log::info!("Old version upgrade completed, final max version: {}", max_version);
    Ok(())
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
                    "sqlite:app_v2.db",
                    vec![
                        // 单一迁移版本 1：初始化最小必需表（users、settings）
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
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "create_notes_table",
                            sql: "\
                CREATE TABLE IF NOT EXISTS notes (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT,
                  content TEXT,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "add_tags_to_notes",
                            sql: "ALTER TABLE notes ADD COLUMN tags TEXT DEFAULT '[]';",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "create_workflows_table",
                            sql: "\
                CREATE TABLE IF NOT EXISTS workflows (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  steps TEXT NOT NULL DEFAULT '[]',
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 5,
                            description: "add_schema_to_workflows",
                            sql: "ALTER TABLE workflows ADD COLUMN schema TEXT DEFAULT '[]';",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 6,
                            description: "create_workflow_schemas_table",
                            sql: "\
                CREATE TABLE IF NOT EXISTS workflow_schemas (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  fields TEXT NOT NULL DEFAULT '[]',
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE workflows ADD COLUMN schema_id INTEGER;
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 7,
                            description: "create_workflow_envs_table",
                            sql: "\
                CREATE TABLE IF NOT EXISTS workflow_envs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  key TEXT NOT NULL UNIQUE,
                  value TEXT NOT NULL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 8,
                            description: "create_moments_table",
                            sql: "\
                CREATE TABLE IF NOT EXISTS moments (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  content TEXT,
                  images TEXT DEFAULT '[]',
                  tags TEXT DEFAULT '[]',
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 9,
                            description: "add_category_to_settings_and_create_assets",
                            sql: "\
                ALTER TABLE settings ADD COLUMN category TEXT DEFAULT 'general';
                CREATE TABLE IF NOT EXISTS assets (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  url TEXT NOT NULL,
                  path TEXT NOT NULL,
                  filename TEXT NOT NULL,
                  size INTEGER,
                  mime_type TEXT,
                  storage_type TEXT DEFAULT 'cos',
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
              ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 10,
                            description: "add_type_to_workflows",
                            sql: "ALTER TABLE workflows ADD COLUMN type TEXT DEFAULT 'user';",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 11,
                            description: "add_deleted_at_columns",
                            sql: "\
                ALTER TABLE users ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE settings ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE notes ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE workflows ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE workflow_schemas ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE workflow_envs ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE moments ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE assets ADD COLUMN deleted_at DATETIME;\n\
            ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 12,
                            description: "add_version_columns_for_sync",
                            sql: "\
                ALTER TABLE notes ADD COLUMN version INTEGER DEFAULT 0;\n\
                CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(version);\n\
            ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 13,
                            description: "add_sync_fields_to_moments_assets_workflows",
                            sql: "\
                ALTER TABLE moments ADD COLUMN version INTEGER DEFAULT 0;\n\
                ALTER TABLE moments ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE assets ADD COLUMN version INTEGER DEFAULT 0;\n\
                ALTER TABLE assets ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;\n\
                ALTER TABLE assets ADD COLUMN deleted_at DATETIME;\n\
                ALTER TABLE workflows ADD COLUMN version INTEGER DEFAULT 0;\n\
                ALTER TABLE workflows ADD COLUMN deleted_at DATETIME;\n\
                CREATE INDEX IF NOT EXISTS idx_moments_version ON moments(version);\n\
                CREATE INDEX IF NOT EXISTS idx_assets_version ON assets(version);\n\
                CREATE INDEX IF NOT EXISTS idx_workflows_version ON workflows(version);\n\
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
