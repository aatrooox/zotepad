use log;
use tauri_plugin_http;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store;

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
use std::sync::{atomic::{AtomicU64, Ordering}, Arc};
#[cfg(not(mobile))]
use rusqlite::{params, Connection, OptionalExtension};
#[cfg(not(mobile))]
use chrono::{DateTime, Utc};
#[cfg(not(mobile))]
use tauri::{AppHandle, Emitter, Manager};
#[cfg(not(mobile))]
use tokio::sync::Mutex;
#[cfg(not(mobile))]
use tower_http::cors::CorsLayer;

// HTTP Server 状态，持有 Tauri AppHandle
#[cfg(not(mobile))]
struct HttpServerState {
    app_handle: AppHandle,
    seq: AtomicU64,
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
    seq: u64,
    version: String,
    paired: bool,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
enum SyncOp {
    Upsert,
    Delete,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct SyncChange {
    table: String,
    op: SyncOp,
    data: serde_json::Value,
    seq: u64,
    updated_at: String,
    deleted_at: Option<String>,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PullResponse {
    changes: Vec<SyncChange>,
    next_since: Option<u64>,
    server_seq: u64,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PullQuery {
    since: Option<u64>,
    limit: Option<usize>,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PushRequest {
    changes: Vec<SyncChange>,
    client_last_seq: Option<u64>,
}

#[cfg(not(mobile))]
#[derive(Serialize, Deserialize, Debug, Clone)]
struct PushResponse {
    applied: usize,
    server_seq: u64,
    conflict: bool,
}

// ============ Sync Helpers ============

#[cfg(not(mobile))]
fn parse_ms(ts: &str) -> u64 {
    DateTime::parse_from_rfc3339(ts)
        .map(|dt| dt.timestamp_millis() as u64)
        .unwrap_or(0)
}

#[cfg(not(mobile))]
fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

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
    Connection::open(path).map_err(|e| {
        log::error!("open_db failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })
}

#[cfg(not(mobile))]
fn max_updated_ms(conn: &Connection) -> u64 {
    let mut stmt = conn
        .prepare("SELECT MAX(strftime('%s', updated_at)) * 1000 AS max_ms FROM notes")
        .ok();
    if let Some(ref mut s) = stmt {
        if let Ok(mut rows) = s.query([]) {
            if let Ok(Some(row)) = rows.next() {
                let val: Option<i64> = row.get(0).unwrap_or(None);
                if let Some(ms) = val {
                    return ms as u64;
                }
            }
        }
    }
    0
}

#[cfg(not(mobile))]
fn load_note_changes(conn: &Connection, since_ms: u64, limit: usize) -> rusqlite::Result<Vec<SyncChange>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, tags, created_at, updated_at, deleted_at
         FROM notes
         WHERE (strftime('%s', updated_at) * 1000) > ?1
            OR (deleted_at IS NOT NULL AND (strftime('%s', deleted_at) * 1000) > ?1)
         ORDER BY updated_at ASC
         LIMIT ?2",
    )?;

    let mut rows = stmt.query(params![since_ms as i64, limit as i64])?;
    let mut changes = Vec::new();

    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let content: Option<String> = row.get(2)?;
        let tags: Option<String> = row.get(3)?;
        let _created_at: Option<String> = row.get(4)?;
        let updated_at: String = row.get(5).unwrap_or_else(|_| now_iso());
        let deleted_at: Option<String> = row.get(6).ok().flatten();

        let op = if deleted_at.is_some() { SyncOp::Delete } else { SyncOp::Upsert };
        let seq = deleted_at
            .as_ref()
            .map(|v| parse_ms(v))
            .unwrap_or_else(|| parse_ms(&updated_at));

        let data = serde_json::json!({
            "id": id,
            "title": title.unwrap_or_default(),
            "content": content.unwrap_or_default(),
            "tags": tags.unwrap_or_else(|| "[]".to_string()),
            "updated_at": updated_at,
            "deleted_at": deleted_at,
        });

        changes.push(SyncChange {
            table: "notes".to_string(),
            op,
            data,
            seq,
            updated_at,
            deleted_at,
        });
    }

    Ok(changes)
}

#[cfg(not(mobile))]
fn apply_note_change(conn: &Connection, change: &SyncChange) -> rusqlite::Result<bool> {
    // returns true if applied
    let id = change.data.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
    let incoming_updated_ms = parse_ms(&change.updated_at);

    let mut stmt = conn.prepare("SELECT updated_at FROM notes WHERE id = ?1")?;
    let existing: Option<String> = stmt.query_row(params![id], |row| row.get(0)).optional()?;
    if let Some(existing_ts) = existing {
        if parse_ms(&existing_ts) > incoming_updated_ms {
            return Ok(false);
        }
    }

    match change.op {
        SyncOp::Delete => {
            let deleted_at = change.deleted_at.clone().unwrap_or_else(now_iso);
            conn.execute(
                "INSERT INTO notes (id, title, content, tags, deleted_at, updated_at) VALUES (?1, '', '', '[]', ?2, ?2)
                 ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at",
                params![id, deleted_at],
            )?;
        }
        SyncOp::Upsert => {
            let title = change.data.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let content = change.data.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let tags = change.data.get("tags").and_then(|v| v.as_str()).unwrap_or("[]");
            let updated_at = change.updated_at.clone();
            conn.execute(
                "INSERT INTO notes (id, title, content, tags, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL)
                 ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, tags = excluded.tags, updated_at = excluded.updated_at, deleted_at = NULL",
                params![id, title, content, tags, updated_at],
            )?;
        }
    }

    Ok(true)
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

// /state: 返回当前 seq 与配对状态
#[cfg(not(mobile))]
async fn sync_state(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<SyncStateData>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    drop(state_guard);

    // 读取 DB 最新时间戳同步到 seq
    let db_seq = match open_db(&app_handle) {
        Ok(conn) => max_updated_ms(&conn),
        Err(e) => return Err(e),
    };

    let seq = {
        let guard = state.lock().await;
        // 若数据库时间更大，则更新全局 seq
        if db_seq > guard.seq.load(Ordering::Relaxed) {
            guard.seq.store(db_seq, Ordering::Relaxed);
        }
        guard.seq.load(Ordering::Relaxed)
    };

    let data = SyncStateData {
        seq,
        version: env!("CARGO_PKG_VERSION").to_string(),
        paired: true,
    };

    Ok(Json(ApiResponse {
        success: true,
        data: Some(data),
        message: None,
    }))
}

// /pull: 目前返回空增量占位，后续接 DB
#[cfg(not(mobile))]
async fn sync_pull(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<PullQuery>,
) -> Result<Json<ApiResponse<PullResponse>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    let current_seq = state_guard.seq.load(Ordering::Relaxed);
    drop(state_guard);

    let since = query.since.unwrap_or(0);
    let limit = query.limit.unwrap_or(500).min(1000);

    let conn = open_db(&app_handle)?;
    let changes = load_note_changes(&conn, since, limit).map_err(|e| {
        log::error!("sync_pull load_note_changes error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let server_seq = max_updated_ms(&conn).max(current_seq);
    {
        let guard = state.lock().await;
        guard.seq.store(server_seq, Ordering::Relaxed);
    }

    let next_since = changes.last().map(|c| c.seq);
    // 若变化少于 limit，则不需要 next_since
    let next_since = if changes.len() >= limit { next_since } else { None };

    let resp = PullResponse {
        changes,
        next_since,
        server_seq,
    };

    Ok(Json(ApiResponse {
        success: true,
        data: Some(resp),
        message: None,
    }))
}

// /push: 接受增量，当前仅推进 seq，占位
#[cfg(not(mobile))]
async fn sync_push(
    State(state): State<Arc<Mutex<HttpServerState>>>,
    headers: axum::http::HeaderMap,
    Json(body): Json<PushRequest>,
) -> Result<Json<ApiResponse<PushResponse>>, StatusCode> {
    let state_guard = state.lock().await;
    check_auth(&headers, &state_guard.token)?;
    let app_handle = state_guard.app_handle.clone();
    let server_seq_before = state_guard.seq.load(Ordering::Relaxed);
    drop(state_guard);

    let client_last_seq = body.client_last_seq.unwrap_or(0);
    if client_last_seq < server_seq_before {
        let resp = PushResponse {
            applied: 0,
            server_seq: server_seq_before,
            conflict: true,
        };
        return Ok(Json(ApiResponse { success: true, data: Some(resp), message: Some("conflict: please pull first".to_string()) }));
    }

    let conn = open_db(&app_handle)?;
    let mut applied = 0usize;
    let mut max_seen_seq = server_seq_before;

    for change in body.changes.iter() {
        if change.table != "notes" {
            continue; // 暂仅支持 notes
        }
        match apply_note_change(&conn, change) {
            Ok(applied_one) => {
                if applied_one {
                    applied += 1;
                    max_seen_seq = max_seen_seq.max(change.seq);
                }
            }
            Err(e) => {
                log::error!("apply_note_change error: {}", e);
            }
        }
    }

    // 同步 seq 为 DB 最新或处理到的最大 seq
    let db_seq = max_updated_ms(&conn).max(max_seen_seq);
    {
        let guard = state.lock().await;
        guard.seq.store(db_seq, Ordering::Relaxed);
    }

    let resp = PushResponse {
        applied,
        server_seq: db_seq,
        conflict: false,
    };

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
        seq: AtomicU64::new(0),
        token,
    }));

    // 初始化 seq 为 DB 最新更新时间戳
    {
        let guard = state.lock().await;
        let app_handle = guard.app_handle.clone();
        drop(guard);
        if let Ok(conn) = open_db(&app_handle) {
            let latest = max_updated_ms(&conn);
            let guard = state.lock().await;
            guard.seq.store(latest, Ordering::Relaxed);
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
