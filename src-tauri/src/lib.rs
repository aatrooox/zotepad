use log;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store;
use tauri_plugin_http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
          ],
        )
        .build()
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
    .setup(|_app| {
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
