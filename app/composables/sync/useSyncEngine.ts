/**
 * 泛型同步引擎
 * 提供多表同步的通用逻辑，支持智能合并
 */

import type { ConflictDecision, SyncMode } from './useSyncConflict'
import type { RecordMetadata } from './useSyncMetadata'
import type { SyncableTable } from '~/config/sync-tables'
import { useSyncConflict } from '~/composables/sync/useSyncConflict'
import { useSyncMetadata } from '~/composables/sync/useSyncMetadata'
import { useTauriSQL } from '~/composables/useTauriSQL'

export interface SyncChange {
  table: string
  op: 'upsert' | 'delete'
  data: Record<string, any>
  version: number
  updated_at: string
  deleted_at: string | null
}

export interface SyncResult {
  pulled: number
  pushed: number
  conflicts?: Array<{ local: RecordMetadata, remote: RecordMetadata }>
}

export interface PullResult {
  lastServerVersion: number
  pulled: number
  maxPulledVersion: number
}

export interface PushResult {
  server_version: number
  applied: number
  conflict: boolean
}

/**
 * 泛型同步引擎
 */
export function useSyncEngine() {
  const { select: syncSelect, execute: syncExecute } = useTauriSQL()
  const { getLocalMetadata, getRemoteMetadata, compareMetadata } = useSyncMetadata()
  const { detectConflicts } = useSyncConflict()

  /**
   * 智能同步单个表（基于元数据）
   * @param table 表配置
   * @param baseUrl 服务器地址
   * @param headers 请求头
   * @param mode 同步模式（auto | manual）
   * @param onConflict 冲突回调（手动模式时需要用户决策）
   */
  async function syncTableSmart(
    table: SyncableTable,
    baseUrl: string,
    headers: Record<string, string>,
    mode: SyncMode,
    onConflict?: (conflicts: Array<{ local: RecordMetadata, remote: RecordMetadata }>) => Promise<ConflictDecision[]>,
  ): Promise<SyncResult> {
    console.log(`[SyncEngine] 开始智能同步: ${table.name}, mode=${mode}`)

    // 1. 获取元数据
    const [localMetadata, remoteMetadata] = await Promise.all([
      getLocalMetadata(table),
      getRemoteMetadata(baseUrl, table.name, headers),
    ])

    console.log(`[SyncEngine] ${table.name} 元数据:`, {
      local: localMetadata.length,
      remote: remoteMetadata.length,
    })

    // 2. 对比差异
    const diff = compareMetadata(localMetadata, remoteMetadata)

    console.log(`[SyncEngine] ${table.name} 差异:`, {
      localOnly: diff.localOnly.length,
      remoteOnly: diff.remoteOnly.length,
      conflicts: diff.conflicts.length,
      identical: diff.identical.length,
    })

    // 3. 处理冲突
    const { needManual, autoResolved } = detectConflicts(diff.conflicts, mode)

    let userDecisions: ConflictDecision[] = []
    if (needManual.length > 0) {
      if (mode === 'manual' && onConflict) {
        // 手动模式：等待用户决策
        userDecisions = await onConflict(needManual)
      }
      else {
        // 自动模式但存在无法自动解决的冲突（时间相同）
        // 这种情况下仍需进入手动合并
        console.warn(`[SyncEngine] ${table.name} 存在 ${needManual.length} 条需要手动解决的冲突`)
        if (onConflict) {
          userDecisions = await onConflict(needManual)
        }
        else {
          // 无回调则默认保留本地
          userDecisions = needManual.map(c => ({ uuid: c.local.uuid, action: 'keep_local' as const }))
        }
      }
    }

    const allDecisions = [...autoResolved, ...userDecisions]

    // 4. 执行同步操作
    let pulled = 0
    let pushed = 0

    // 推送：本地独有 + 决定保留本地的冲突
    const toPushIds = [
      ...diff.localOnly.map(m => m.uuid),
      ...allDecisions.filter(d => d.action === 'keep_local').map(d => d.uuid),
    ]

    if (toPushIds.length > 0) {
      const pushResult = await pushRecordsByIds(table, toPushIds, baseUrl, headers)
      pushed = pushResult.applied
    }

    // 拉取：远程独有 + 决定保留远程的冲突
    const toPullIds = [
      ...diff.remoteOnly.map(m => m.uuid),
      ...allDecisions.filter(d => d.action === 'keep_remote').map(d => d.uuid),
    ]

    if (toPullIds.length > 0) {
      const pullResult = await pullRecordsByIds(table, toPullIds, baseUrl, headers)
      pulled = pullResult.pulled
    }

    console.log(`[SyncEngine] ${table.name} 同步完成:`, { pulled, pushed })

    return {
      pulled,
      pushed,
      conflicts: needManual.length > 0 ? needManual : undefined,
    }
  }

  /**
   * 按 UUID 推送指定记录
   */
  async function pushRecordsByIds(
    table: SyncableTable,
    uuids: string[],
    baseUrl: string,
    headers: Record<string, string>,
  ): Promise<PushResult> {
    if (uuids.length === 0) {
      return { server_version: 0, applied: 0, conflict: false }
    }

    // 查询完整数据（根据 uuid）
    const fieldList = table.fields.join(', ')
    const placeholders = uuids.map(() => '?').join(', ')
    const rows = await syncSelect<any[]>(
      `SELECT ${fieldList} FROM ${table.name} WHERE uuid IN (${placeholders})`,
      uuids,
    )

    const changes: SyncChange[] = rows
      .filter((row) => {
        // 必须有 uuid 才能同步（过滤 null、undefined、空字符串）
        if (!row.uuid || row.uuid.trim() === '') {
          console.warn(`[SyncEngine] 跳过没有 UUID 的记录: ${table.name} id=${row.id}, uuid='${row.uuid}'`)
          return false
        }
        return true
      })
      .map((row) => {
        const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
        const deletedAt = row.deleted_at ? new Date(row.deleted_at).toISOString() : null

        const data: Record<string, any> = {}
        table.fields.forEach((field) => {
          // 跳过这些由系统管理的字段（会在 SyncChange 的其他字段中传递）
          if (field === 'updated_at' || field === 'deleted_at' || field === 'version') {
            return
          }
          // 包含所有其他字段，包括 uuid 和 id
          data[field] = row[field] ?? (table.jsonFields?.includes(field) ? '[]' : '')
        })

        return {
          table: table.name,
          op: deletedAt ? 'delete' : 'upsert',
          data: {
            ...data,
            updated_at: updatedAt,
            deleted_at: deletedAt,
          },
          version: row.version || 0,
          updated_at: updatedAt,
          deleted_at: deletedAt,
        }
      })

    // 发送推送请求
    const res = await fetch(`${baseUrl}/push`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: table.name, changes, client_version: 0 }),
    })

    if (!res.ok)
      throw new Error(`推送失败: ${res.status}`)

    const body = await res.json()
    return body.data as PushResult
  }

  /**
   * 按 UUID 拉取指定记录
   */
  async function pullRecordsByIds(
    table: SyncableTable,
    uuids: string[],
    baseUrl: string,
    headers: Record<string, string>,
  ): Promise<{ pulled: number }> {
    if (uuids.length === 0) {
      return { pulled: 0 }
    }

    // 批量拉取（分批，每批 50 条）
    const batchSize = 50
    let totalPulled = 0

    for (let i = 0; i < uuids.length; i += batchSize) {
      const batchUuids = uuids.slice(i, i + batchSize)

      // 拉取该批次的数据
      const url = `${baseUrl}/pull?table=${table.name}&since_version=0&limit=1000`
      const res = await fetch(url, { headers })

      if (!res.ok)
        throw new Error(`拉取失败: ${res.status}`)

      const body = await res.json()
      const payload = body.data as { changes: any[] }

      // 过滤出目标 UUID 的记录
      const targetChanges = payload.changes.filter(change =>
        batchUuids.includes(change.data.uuid),
      )

      // 应用变更
      const applied = await applyRemoteChanges(table, targetChanges)
      totalPulled += applied
    }

    return { pulled: totalPulled }
  }

  /**
   * 强制推送单条记录（用于单篇文章同步）
   */
  async function forcePushRecord(
    table: SyncableTable,
    recordUuid: string,
    baseUrl: string,
    headers: Record<string, string>,
  ): Promise<void> {
    console.log(`[SyncEngine] 强制推送: ${table.name} uuid=${recordUuid}`)

    // 强制更新本地版本号为负数（表示待推送）
    await syncExecute(
      `UPDATE ${table.name} SET version = ?, updated_at = ? WHERE uuid = ?`,
      [-Date.now(), new Date().toISOString(), recordUuid],
    )

    // 推送
    await pushRecordsByIds(table, [recordUuid], baseUrl, headers)

    console.log(`[SyncEngine] 强制推送完成`)
  }

  // ===== 保留旧方法以兼容现有代码 =====

  /**
   * 从本地数据库收集指定表的变更
   * @deprecated 使用 syncTableSmart 替代
   */
  async function collectLocalChanges(table: SyncableTable, sinceVersion: number): Promise<SyncChange[]> {
    // 使用 2100000000 作为上限，可以兼容时间戳版本号（当前约1733900000），同时防止真正的异常值
    const MAX_REASONABLE_VERSION = 2100000000

    // 构建字段列表
    const fieldList = table.fields.join(', ')

    // 调试：检查表结构
    try {
      const schema = await syncSelect<any[]>(`PRAGMA table_info(${table.name})`, [])
      const columnNames = schema.map((col: any) => col.name)
      console.log(`[Sync] 表 ${table.name} 的实际列:`, columnNames)

      const missingColumns = table.fields.filter(f => !columnNames.includes(f))
      if (missingColumns.length > 0) {
        console.error(`[Sync] 表 ${table.name} 缺少列:`, missingColumns)
        throw new Error(`表 ${table.name} 缺少必需的列: ${missingColumns.join(', ')}`)
      }
    }
    catch (e) {
      console.error(`[Sync] 检查表 ${table.name} 结构失败:`, e)
      throw e
    }

    // 查询本地变更（负数版本号 + version = 0 的旧数据 或 大于 sinceVersion 的正数版本号）
    // 对于 workflows 表,排除系统流 (type 以 'system:' 开头)
    const whereConditions = [
      `(version <= 0 AND deleted_at IS NULL) OR (version > ? AND version < ?)`,
    ]

    if (table.name === 'workflows') {
      whereConditions.push(`(type IS NULL OR type = 'user' OR NOT type LIKE 'system:%')`)
    }

    const rows = await syncSelect<any[]>(
      `SELECT ${fieldList} FROM ${table.name} 
       WHERE ${whereConditions.join(' AND ')}`,
      [sinceVersion, MAX_REASONABLE_VERSION],
    )

    return rows.map((row) => {
      const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
      const deletedAt = row.deleted_at ? new Date(row.deleted_at).toISOString() : null

      // 序列化 JSON 字段
      const data: Record<string, any> = {}
      table.fields.forEach((field) => {
        if (field === 'updated_at' || field === 'deleted_at' || field === 'version') {
          return // 这些字段单独处理
        }
        data[field] = row[field] ?? (table.jsonFields?.includes(field) ? '[]' : '')
      })

      return {
        table: table.name,
        op: deletedAt ? 'delete' : 'upsert',
        data: {
          ...data,
          updated_at: updatedAt,
          deleted_at: deletedAt,
        },
        version: row.version || 0,
        updated_at: updatedAt,
        deleted_at: deletedAt,
      }
    })
  }

  /**
   * 应用远程变更到本地数据库
   * @param table 表配置
   * @param changes 变更列表
   * @returns 实际应用的变更数量（排除内容相同的）
   */
  async function applyRemoteChanges(table: SyncableTable, changes: any[]): Promise<number> {
    let applied = 0

    for (const change of changes) {
      if (change.table !== table.name)
        continue

      // 对于 workflows 表,过滤掉系统流
      if (table.name === 'workflows' && change.data?.type && change.data.type.startsWith('system:')) {
        console.log(`[Sync] 跳过系统流: ${change.data.name || change.data.id} (${change.data.type})`)
        continue
      }

      const pkValue = change.data?.[table.primaryKey]
      const incomingVersion = change.version || 0
      const updatedAt = change.updated_at || new Date().toISOString()
      const deletedAt = change.deleted_at || null

      // 检查本地是否已有更新的版本
      const existing = await syncSelect<any[]>(
        `SELECT updated_at, ${table.fields.filter(f => f !== 'version' && f !== 'created_at').join(', ')} 
         FROM ${table.name} WHERE ${table.primaryKey} = ?`,
        [pkValue],
      )

      let isContentSame = false
      if (existing.length > 0) {
        const local = existing[0]
        const localUpdatedAt = local.updated_at || ''
        const remoteUpdatedAt = change.updated_at || ''

        // 本地时间 >= 远程时间，跳过
        if (localUpdatedAt >= remoteUpdatedAt) {
          console.log(`[SyncEngine] 跳过较旧的远程变更: ${table.name} ${pkValue}, local=${localUpdatedAt}, remote=${remoteUpdatedAt}`)
          continue
        }

        // 检查内容是否一致（排除版本号和时间戳）
        isContentSame = table.fields
          .filter(f => !['version', 'updated_at', 'created_at'].includes(f))
          .every((field) => {
            const localVal = local[field]
            const remoteVal = change.data[field]
            return localVal === remoteVal || (localVal == null && remoteVal == null)
          })
      }

      // 构建 UPSERT SQL
      const dataFields = table.fields.filter(f => f !== 'created_at') // created_at 由数据库自动管理
      const placeholders = dataFields.map(() => '?').join(', ')
      const updateSet = dataFields.map(f => `${f} = excluded.${f}`).join(', ')

      const values = dataFields.map((field) => {
        if (field === 'version')
          return incomingVersion
        if (field === 'updated_at')
          return updatedAt
        if (field === 'deleted_at')
          return deletedAt
        return change.data[field] ?? null
      })

      await syncExecute(
        `INSERT INTO ${table.name} (${dataFields.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updateSet}`,
        values,
      )

      if (!isContentSame) {
        applied++
        console.log(`[SyncEngine] 应用远程变更: ${table.name} ${pkValue}, version=${incomingVersion}`)
      }
      else {
        console.log(`[SyncEngine] 确认远程版本(内容无变化): ${table.name} ${pkValue}, version=${incomingVersion}`)
      }
    }

    return applied
  }

  /**
   * 从服务器拉取指定表的变更
   * @param table 表配置
   * @param baseUrl 服务器地址
   * @param headers 请求头
   * @param sinceVersion 上次同步的版本号
   * @returns 拉取结果
   */
  async function pullTableChanges(
    table: SyncableTable,
    baseUrl: string,
    headers: Record<string, string>,
    sinceVersion: number,
  ): Promise<PullResult> {
    let cursor = sinceVersion
    let lastServerVersion = 0
    let pulled = 0
    let maxPulledVersion = 0

    console.log(`[SyncEngine] 开始拉取 ${table.name}:`, { sinceVersion, baseUrl })

    while (true) {
      const url = `${baseUrl}/pull?table=${table.name}&since_version=${cursor}&limit=200`
      const res = await fetch(url, { headers })

      if (!res.ok)
        throw new Error(`拉取 ${table.name} 失败: ${res.status}`)

      const body = await res.json()
      const payload = body.data as { changes: any[], next_version?: number | null, server_version: number }

      if (payload.server_version)
        lastServerVersion = payload.server_version

      if (payload.changes?.length) {
        const applied = await applyRemoteChanges(table, payload.changes)
        pulled += applied

        // 追踪实际应用的变更的最大 version
        for (const change of payload.changes) {
          if (change.version) {
            maxPulledVersion = Math.max(maxPulledVersion, change.version)
          }
        }
      }

      if (!payload.next_version)
        break
      cursor = payload.next_version
    }

    console.log(`[SyncEngine] ${table.name} 拉取完成:`, { lastServerVersion, pulled, maxPulledVersion })

    return { lastServerVersion, pulled, maxPulledVersion }
  }

  /**
   * 推送指定表的本地变更到服务器
   * @param table 表配置
   * @param baseUrl 服务器地址
   * @param headers 请求头
   * @param sinceVersion 上次同步的版本号
   * @returns 推送结果
   */
  async function pushTableChanges(
    table: SyncableTable,
    baseUrl: string,
    headers: Record<string, string>,
    sinceVersion: number,
  ): Promise<PushResult> {
    const changes = await collectLocalChanges(table, sinceVersion)

    console.log(`[SyncEngine] 推送 ${table.name}:`, { sinceVersion, changes: changes.length })

    if (!changes.length) {
      return { server_version: sinceVersion, applied: 0, conflict: false }
    }

    const res = await fetch(`${baseUrl}/push`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: table.name, changes, client_version: sinceVersion }),
    })

    if (!res.ok)
      throw new Error(`推送 ${table.name} 失败: ${res.status}`)

    const body = await res.json()
    console.log(`[SyncEngine] ${table.name} 推送响应:`, body.data)

    return body.data as PushResult
  }

  /**
   * 升级桌面端本地编辑的版本号（负数 -> 正数）
   * 同时处理迁移前的旧数据（version = 0）
   * @param table 表配置
   * @param startVersion 起始版本号
   * @returns 升级的记录数和最终版本号
   */
  async function upgradeLocalVersions(
    table: SyncableTable,
    startVersion: number,
  ): Promise<{ upgraded: number, finalVersion: number }> {
    // 调试：检查表结构
    try {
      const schema = await syncSelect<any[]>(`PRAGMA table_info(${table.name})`, [])
      const columnNames = schema.map((col: any) => col.name)
      console.log(`[SyncEngine] upgradeLocalVersions 检查表 ${table.name} 的列:`, columnNames)

      if (!columnNames.includes('version')) {
        console.error(`[SyncEngine] 表 ${table.name} 缺少 version 列，跳过升级`)
        return { upgraded: 0, finalVersion: startVersion }
      }
    }
    catch (e) {
      console.error(`[SyncEngine] 检查表 ${table.name} 结构失败:`, e)
      throw e
    }

    // 查询需要升级的记录：负数版本号（新编辑）+ version = 0（迁移前旧数据）
    // 对于 workflows 表,排除系统流
    const whereConditions = ['version <= 0 AND deleted_at IS NULL']
    if (table.name === 'workflows') {
      whereConditions.push(`(type IS NULL OR type = 'user' OR NOT type LIKE 'system:%')`)
    }

    const localChanges = await syncSelect<any[]>(
      `SELECT ${table.primaryKey}, version FROM ${table.name} WHERE ${whereConditions.join(' AND ')}`,
      [],
    )

    if (localChanges.length === 0) {
      return { upgraded: 0, finalVersion: startVersion }
    }

    console.log(`[SyncEngine] ${table.name} 发现 ${localChanges.length} 条待同步数据（包含旧数据）`)

    let currentVersion = startVersion
    for (const change of localChanges) {
      currentVersion += 1
      await syncExecute(
        `UPDATE ${table.name} SET version = ?, updated_at = ? WHERE ${table.primaryKey} = ?`,
        [currentVersion, new Date().toISOString(), change[table.primaryKey]],
      )
      console.log(`[SyncEngine] 桌面端: ${table.name} ${change[table.primaryKey]} 版本号 ${change.version} → ${currentVersion}`)
    }

    return { upgraded: localChanges.length, finalVersion: currentVersion }
  }

  /**
   * 重置指定表中所有已同步记录的版本号为 0
   * 用于处理服务器版本回滚的情况
   * @param table 表配置
   */
  async function resetSyncedVersions(table: SyncableTable): Promise<void> {
    console.log(`[SyncEngine] 重置表 ${table.name} 的已同步版本号...`)
    try {
      // 仅重置 version > 0 的记录（已同步记录）
      // version <= 0 的记录是本地未同步修改，必须保留原样以便后续推送
      await syncExecute(
        `UPDATE ${table.name} SET version = 0 WHERE version > 0`,
        [],
      )
      console.log(`[SyncEngine] 表 ${table.name} 版本号重置完成`)
    }
    catch (e) {
      console.error(`[SyncEngine] 重置表 ${table.name} 版本号失败:`, e)
      throw e
    }
  }

  return {
    // 新方法（推荐使用）
    syncTableSmart,
    forcePushRecord,
    // 旧方法（兼容）
    collectLocalChanges,
    applyRemoteChanges,
    pullTableChanges,
    pushTableChanges,
    upgradeLocalVersions,
    resetSyncedVersions,
  }
}
