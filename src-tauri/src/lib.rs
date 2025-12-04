use log;
use tauri_plugin_http;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store;

// HTTP Server 只在桌面端编译
#[cfg(not(mobile))]
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
#[cfg(not(mobile))]
use std::sync::Arc;
#[cfg(not(mobile))]
use tauri::{AppHandle, Emitter};
#[cfg(not(mobile))]
use tokio::sync::Mutex;
#[cfg(not(mobile))]
use tower_http::cors::CorsLayer;

// HTTP Server 状态，持有 Tauri AppHandle
#[cfg(not(mobile))]
struct HttpServerState {
    app_handle: AppHandle,
}

// API 响应结构
#[cfg(not(mobile))]
#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
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

// 启动 HTTP 服务器 (仅桌面端)
#[cfg(not(mobile))]
async fn start_http_server(app_handle: AppHandle, port: u16) {
    use axum::http::{header, HeaderValue, Method};
    
    let state = Arc::new(Mutex::new(HttpServerState { app_handle }));

    // 配置 CORS - 使用 permissive() 完全开放
    let cors = CorsLayer::permissive();

    // 构建路由
    let app = Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
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
