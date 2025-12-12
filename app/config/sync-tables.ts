/**
 * 同步表配置
 * 定义了所有需要同步的数据表的元信息
 */

export interface SyncableTable {
  /** 表名 */
  name: string
  /** 主键字段名 */
  primaryKey: string
  /** 所有需要同步的字段 */
  fields: string[]
  /** 需要 JSON 序列化/反序列化的字段 */
  jsonFields?: string[]
  /** 是否启用版本号管理 */
  hasVersion: boolean
  /** 是否支持软删除 */
  hasSoftDelete: boolean
  /** 是否需要 updated_at 字段 */
  hasUpdatedAt: boolean
}

/**
 * 所有可同步的表配置
 * 排除了 Settings（敏感信息）和 WorkflowSchemas（模板定义）
 */
export const SYNC_TABLES: Record<string, SyncableTable> = {
  notes: {
    name: 'notes',
    primaryKey: 'id',
    fields: ['id', 'title', 'content', 'tags', 'created_at', 'updated_at', 'deleted_at', 'version'],
    jsonFields: ['tags'],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
  },
  moments: {
    name: 'moments',
    primaryKey: 'id',
    fields: ['id', 'content', 'images', 'tags', 'created_at', 'updated_at', 'deleted_at', 'version'],
    jsonFields: ['images', 'tags'],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
  },
  assets: {
    name: 'assets',
    primaryKey: 'id',
    fields: ['id', 'url', 'path', 'filename', 'size', 'mime_type', 'storage_type', 'created_at', 'updated_at', 'deleted_at', 'version'],
    jsonFields: [],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
  },
  workflows: {
    name: 'workflows',
    primaryKey: 'id',
    fields: ['id', 'name', 'description', 'steps', 'schema', 'type', 'created_at', 'updated_at', 'deleted_at', 'version'],
    jsonFields: ['steps', 'schema'],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
  },
}

/**
 * 获取所有可同步的表名列表
 */
export function getSyncTableNames(): string[] {
  return Object.keys(SYNC_TABLES)
}

/**
 * 检查表是否可同步
 */
export function isSyncable(tableName: string): boolean {
  return tableName in SYNC_TABLES
}

/**
 * 获取表配置
 */
export function getTableConfig(tableName: string): SyncableTable | null {
  return SYNC_TABLES[tableName] || null
}
