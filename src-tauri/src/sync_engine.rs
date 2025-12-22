/// 多表同步引擎模块
/// 提供泛型的表同步逻辑，避免硬编码表名

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use chrono::Utc;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum SyncOp {
    Upsert,
    Delete,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncChange {
    pub table: String,
    pub op: SyncOp,
    pub data: serde_json::Value,
    pub version: i64,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// 表配置定义
pub struct TableConfig {
    pub name: &'static str,
    pub primary_key: &'static str,
    pub fields: &'static [&'static str],
    pub json_fields: &'static [&'static str],
}

/// 所有可同步的表配置（与前端 sync-tables.ts 对应）
pub const SYNC_TABLES: &[TableConfig] = &[
    TableConfig {
        name: "notes",
        primary_key: "uuid",
        fields: &["uuid", "title", "content", "tags", "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &["tags"],
    },
    TableConfig {
        name: "moments",
        primary_key: "uuid",
        fields: &["uuid", "content", "images", "tags", "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &["images", "tags"],
    },
    TableConfig {
        name: "assets",
        primary_key: "uuid",
        fields: &["uuid", "url", "path", "filename", "size", "mime_type", "storage_type", "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &[],
    },
    TableConfig {
        name: "workflows",
        primary_key: "uuid",
        fields: &["uuid", "name", "description", "steps", "schema_id", "type", "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &["steps"],
    },
    TableConfig {
        name: "workflow_schemas",
        primary_key: "uuid",
        fields: &["uuid", "name", "description", "fields", "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &["fields"],
    },
];

/// 获取表配置
pub fn get_table_config(table_name: &str) -> Option<&'static TableConfig> {
    SYNC_TABLES.iter().find(|t| t.name == table_name)
}

/// 获取当前时间的 ISO 8601 字符串
pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// 获取指定表的最大版本号
pub fn max_version_for_table(conn: &Connection, table_name: &str) -> i64 {
    let query = format!("SELECT MAX(version) FROM {} WHERE version > 0", table_name);
    if let Ok(mut stmt) = conn.prepare(&query) {
        if let Ok(mut rows) = stmt.query([]) {
            if let Ok(Some(row)) = rows.next() {
                if let Ok(Some(v)) = row.get::<_, Option<i64>>(0) {
                    return v;
                }
            }
        }
    }
    0
}

/// 获取所有表的全局最大版本号
pub fn max_version_all_tables(conn: &Connection) -> i64 {
    let mut max = 0i64;
    for table in SYNC_TABLES {
        let v = max_version_for_table(conn, table.name);
        if v > max {
            max = v;
        }
    }
    max
}

/// 升级表中 version <= 0 的记录（迁移的旧数据 + 本地未同步数据）
fn upgrade_zero_versions(conn: &Connection, table_name: &str, config: &TableConfig) -> rusqlite::Result<()> {
    // 获取当前最大版本号
    let max_version = max_version_all_tables(conn);
    
    // 查询所有 version <= 0 且未删除的记录
    // 对于 workflows 表，排除系统流
    let where_clause = if table_name == "workflows" {
        "version <= 0 AND deleted_at IS NULL AND (type IS NULL OR type = 'user' OR type NOT LIKE 'system:%')"
    } else {
        "version <= 0 AND deleted_at IS NULL"
    };
    
    let query = format!(
        "SELECT {} FROM {} WHERE {} ORDER BY created_at ASC",
        config.primary_key, table_name, where_clause
    );
    
    let mut stmt = conn.prepare(&query)?;
    let mut rows = stmt.query([])?;
    
    let mut ids_to_upgrade: Vec<String> = Vec::new();
    while let Some(row) = rows.next()? {
        ids_to_upgrade.push(row.get(0)?);
    }
    drop(rows);
    drop(stmt);
    
    if ids_to_upgrade.is_empty() {
        return Ok(());
    }
    
    log::info!("[SyncEngine] 升级 {} 表中 {} 条 version<=0 的记录", table_name, ids_to_upgrade.len());
    
    // 批量更新版本号
    let mut current_version = max_version;
    for id in ids_to_upgrade {
        current_version += 1;
        let update_sql = format!(
            "UPDATE {} SET version = ?1, updated_at = ?2 WHERE {} = ?3",
            table_name, config.primary_key
        );
        conn.execute(&update_sql, params![current_version, now_iso(), id])?;
    }
    
    Ok(())
}

/// 加载指定表的变更记录
pub fn load_table_changes(
    conn: &Connection,
    table_name: &str,
    since_version: i64,
    limit: usize,
) -> rusqlite::Result<Vec<SyncChange>> {
    let config = match get_table_config(table_name) {
        Some(c) => c,
        None => return Ok(Vec::new()), // 不支持的表
    };

    // 在查询前，先升级所有 version <= 0 的数据（迁移的旧数据 + 本地未同步数据）
    upgrade_zero_versions(conn, table_name, config)?;

    // 动态构建查询
    let fields_str = config.fields.join(", ");
    let query = format!(
        "SELECT {} FROM {} WHERE version > ?1 ORDER BY version ASC LIMIT ?2",
        fields_str, table_name
    );

    let mut stmt = conn.prepare(&query)?;
    let mut rows = stmt.query(params![since_version as i64, limit as i64])?;
    let mut changes = Vec::new();

    while let Some(row) = rows.next()? {
        // 通过字段名获取核心字段
        let version_idx = config.fields.iter().position(|&f| f == "version").unwrap();
        let updated_at_idx = config.fields.iter().position(|&f| f == "updated_at").unwrap();
        let deleted_at_idx = config.fields.iter().position(|&f| f == "deleted_at").unwrap();
        
        let version: i64 = row.get(version_idx)?;
        let updated_at: String = row.get(updated_at_idx).unwrap_or_else(|_| now_iso());
        let deleted_at: Option<String> = row.get(deleted_at_idx).ok().flatten();

        let op = if deleted_at.is_some() {
            SyncOp::Delete
        } else {
            SyncOp::Upsert
        };

        // 构建 data JSON
        let mut data_map = serde_json::Map::new();
        for (i, field_name) in config.fields.iter().enumerate() {
            // 跳过 created_at（由数据库自动管理）
            if *field_name == "created_at" {
                continue;
            }
            
            let value: serde_json::Value = if *field_name == "version" {
                serde_json::json!(version)
            } else if *field_name == "updated_at" {
                serde_json::json!(updated_at)
            } else if *field_name == "deleted_at" {
                serde_json::json!(deleted_at)
            } else {
                // 尝试获取字符串值
                match row.get::<_, Option<String>>(i) {
                    Ok(Some(s)) => serde_json::json!(s),
                    Ok(None) => {
                        // 可能是数字类型
                        match row.get::<_, Option<i64>>(i) {
                            Ok(Some(n)) => serde_json::json!(n),
                            Ok(None) => serde_json::Value::Null,
                            Err(_) => serde_json::Value::Null,
                        }
                    }
                    Err(_) => {
                        // 尝试作为数字
                        match row.get::<_, Option<i64>>(i) {
                            Ok(Some(n)) => serde_json::json!(n),
                            Ok(None) => serde_json::Value::Null,
                            Err(_) => serde_json::Value::Null,
                        }
                    }
                }
            };
            
            data_map.insert(field_name.to_string(), value);
        }

        // 检查 uuid 是否有效
        if let Some(uuid_val) = data_map.get("uuid") {
            if uuid_val.is_null() {
                log::warn!("[SyncEngine] Skip record with null uuid in table {}", table_name);
                continue;
            }
            if let Some(s) = uuid_val.as_str() {
                if s.trim().is_empty() {
                    log::warn!("[SyncEngine] Skip record with empty uuid in table {}", table_name);
                    continue;
                }
            }
        } else {
             // 如果没有 uuid 字段（不应该发生，因为 config.fields 包含它），也跳过
             log::warn!("[SyncEngine] Skip record missing uuid field in table {}", table_name);
             continue;
        }

        changes.push(SyncChange {
            table: table_name.to_string(),
            op,
            data: serde_json::Value::Object(data_map),
            version,
            updated_at,
            deleted_at,
        });
    }

    Ok(changes)
}

/// 应用变更到指定表
pub fn apply_table_change(
    conn: &Connection,
    table_name: &str,
    change: &SyncChange,
    new_version: i64,
) -> rusqlite::Result<bool> {
    let config = match get_table_config(table_name) {
        Some(c) => c,
        None => return Ok(false), // 不支持的表
    };

    // 提取主键值
    let pk_value = change
        .data
        .get(config.primary_key)
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if pk_value.is_empty() {
        log::warn!("Skip applying change for {} with empty primary key", table_name);
        return Ok(false);
    }

    // 检查本地是否已有更新的记录（基于 updated_at）
    let check_query = format!(
        "SELECT updated_at FROM {} WHERE {} = ?1",
        table_name, config.primary_key
    );
    let mut stmt = conn.prepare(&check_query)?;
    let existing: Option<String> = stmt.query_row(params![pk_value], |row| row.get(0)).optional()?;
    
    if let Some(local_updated_at) = existing {
        // 如果本地时间 >= 远程时间，跳过
        // 注意：这里假设时间格式一致（ISO 8601），可以直接字符串比较
        if local_updated_at >= change.updated_at {
            log::debug!(
                "Skip applying change for {} {}: local updated_at {} >= remote updated_at {}",
                table_name,
                pk_value,
                local_updated_at,
                change.updated_at
            );
            return Ok(false); // 跳过旧版本
        }
    }

    // 使用客户端提供的 updated_at，如果没有则使用当前时间
    let updated_at = change.updated_at.clone();

    match change.op {
        SyncOp::Delete => {
            // 使用客户端提供的 deleted_at，如果没有则使用当前时间
            let deleted_at = change.deleted_at.clone().unwrap_or_else(|| now_iso());
            
            // 动态构建 DELETE 的 UPSERT 语句
            let fields_except_created = config
                .fields
                .iter()
                .filter(|f| **f != "created_at")
                .copied()
                .collect::<Vec<_>>();
            
            let placeholders = fields_except_created
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 1))
                .collect::<Vec<_>>()
                .join(", ");
            
            let update_set = fields_except_created
                .iter()
                .map(|f| format!("{} = excluded.{}", f, f))
                .collect::<Vec<_>>()
                .join(", ");

            let insert_query = format!(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
                table_name,
                fields_except_created.join(", "),
                placeholders,
                config.primary_key,
                update_set
            );

            // 构建参数（所有字段都设为默认值，除了 pk、version、deleted_at、updated_at）
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            for field in &fields_except_created {
                if *field == config.primary_key {
                    params_vec.push(Box::new(pk_value));
                } else if *field == "version" {
                    params_vec.push(Box::new(new_version));
                } else if *field == "deleted_at" {
                    params_vec.push(Box::new(deleted_at.clone()));
                } else if *field == "updated_at" {
                    params_vec.push(Box::new(updated_at.clone()));
                } else if config.json_fields.contains(field) {
                    params_vec.push(Box::new("[]".to_string()));
                } else {
                    params_vec.push(Box::new("".to_string()));
                }
            }

            let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
            conn.execute(&insert_query, params_refs.as_slice())?;
        }
        SyncOp::Upsert => {
            // 动态构建 UPSERT 语句
            let fields_except_created = config
                .fields
                .iter()
                .filter(|f| **f != "created_at")
                .copied()
                .collect::<Vec<_>>();
            
            let placeholders = fields_except_created
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 1))
                .collect::<Vec<_>>()
                .join(", ");
            
            let update_set = fields_except_created
                .iter()
                .filter(|f| **f != config.primary_key) // 主键不更新
                .map(|f| format!("{} = excluded.{}", f, f))
                .collect::<Vec<_>>()
                .join(", ");

            let insert_query = format!(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
                table_name,
                fields_except_created.join(", "),
                placeholders,
                config.primary_key,
                update_set
            );

            // 构建参数
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            for field in &fields_except_created {
                if *field == config.primary_key {
                    params_vec.push(Box::new(pk_value));
                } else if *field == "version" {
                    params_vec.push(Box::new(new_version));
                } else if *field == "updated_at" {
                    params_vec.push(Box::new(updated_at.clone()));
                } else if *field == "deleted_at" {
                    params_vec.push(Box::new(None::<String>));
                } else {
                    // 从 change.data 中提取值
                    let value = change.data.get(*field);
                    if let Some(v) = value {
                        if let Some(s) = v.as_str() {
                            params_vec.push(Box::new(s.to_string()));
                        } else if let Some(n) = v.as_i64() {
                            params_vec.push(Box::new(n));
                        } else if v.is_null() {
                            params_vec.push(Box::new(None::<String>));
                        } else {
                            // JSON 对象或数组，转为字符串
                            params_vec.push(Box::new(v.to_string()));
                        }
                    } else {
                        // 字段不存在，使用默认值
                        // uuid 字段必须存在且非空
                        if *field == "uuid" {
                            return Err(rusqlite::Error::InvalidQuery);
                        }
                        
                        if config.json_fields.contains(field) {
                            params_vec.push(Box::new("[]".to_string()));
                        } else {
                            params_vec.push(Box::new("".to_string()));
                        }
                    }
                }
            }

            let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
            conn.execute(&insert_query, params_refs.as_slice())?;
        }
    }

    Ok(true)
}

/// 获取指定表的所有记录元数据（用于智能合并）
pub fn load_table_metadata(
    conn: &Connection,
    table_name: &str,
) -> rusqlite::Result<Vec<serde_json::Value>> {
    let _config = match get_table_config(table_name) {
        Some(c) => c,
        None => return Ok(Vec::new()),
    };

    // 查询元数据字段：uuid, version, updated_at, deleted_at
    let query = format!(
        "SELECT uuid, version, updated_at, deleted_at FROM {} WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        table_name
    );

    let mut stmt = conn.prepare(&query)?;
    let mut rows = stmt.query([])?;
    let mut metadata_list = Vec::new();

    while let Some(row) = rows.next()? {
        let uuid: Option<String> = row.get(0).ok().flatten();
        let version: i64 = row.get(1)?;
        let updated_at: String = row.get(2).unwrap_or_else(|_| now_iso());
        let deleted_at: Option<String> = row.get(3).ok().flatten();

        // 跳过没有 uuid 的记录（旧数据）
        if let Some(uuid_value) = uuid {
            let metadata = serde_json::json!({
                "uuid": uuid_value,
                "version": version,
                "updated_at": updated_at,
                "deleted_at": deleted_at,
            });

            metadata_list.push(metadata);
        }
    }

    Ok(metadata_list)
}
