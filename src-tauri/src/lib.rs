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
use tower_http::cors::{Any, CorsLayer};

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

// 健康检查端点
#[cfg(not(mobile))]
async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse {
        success: true,
        data: Some("ZotePad HTTP Server is running".to_string()),
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
    let state = Arc::new(Mutex::new(HttpServerState { app_handle }));

    // 配置 CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 构建路由
    let app = Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
        // .route("/api/notification", post(send_notification))
        // .route("/api/emit", post(emit_event))
        .layer(cors)
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    log::info!("Starting HTTP server on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
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
