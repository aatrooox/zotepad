/**
 * 同步元数据操作
 * 负责拉取、对比本地和远程元数据
 */

import type { SyncableTable } from '~/config/sync-tables'
import { useTauriSQL } from '~/composables/useTauriSQL'

export interface RecordMetadata {
  uuid: string
  version: number
  updated_at: string
  deleted_at: string | null
}

export interface SyncDiff {
  /** 仅本地有的记录 */
  localOnly: RecordMetadata[]
  /** 仅远程有的记录 */
  remoteOnly: RecordMetadata[]
  /** 冲突的记录（两端都有且不同） */
  conflicts: Array<{
    local: RecordMetadata
    remote: RecordMetadata
  }>
  /** 完全相同的记录（可跳过） */
  identical: RecordMetadata[]
}

export function useSyncMetadata() {
  const { select } = useTauriSQL()

  /**
   * 获取本地表的元数据
   */
  async function getLocalMetadata(table: SyncableTable): Promise<RecordMetadata[]> {
    const rows = await select<RecordMetadata[]>(
      `SELECT uuid, version, updated_at, deleted_at 
       FROM ${table.name} 
       WHERE deleted_at IS NULL AND uuid IS NOT NULL AND uuid != ''
       ORDER BY updated_at DESC`,
      [],
    )
    return rows
  }

  /**
   * 获取远程表的元数据
   */
  async function getRemoteMetadata(
    baseUrl: string,
    table: string,
    headers: Record<string, string>,
  ): Promise<RecordMetadata[]> {
    const url = `${baseUrl}/metadata?table=${table}`
    const res = await fetch(url, { headers })

    if (!res.ok)
      throw new Error(`获取远程元数据失败: ${res.status}`)

    const body = await res.json()
    return body.data as RecordMetadata[]
  }

  /**
   * 对比本地和远程元数据，找出差异
   */
  function compareMetadata(
    local: RecordMetadata[],
    remote: RecordMetadata[],
  ): SyncDiff {
    const diff: SyncDiff = {
      localOnly: [],
      remoteOnly: [],
      conflicts: [],
      identical: [],
    }

    const localMap = new Map(local.map(item => [item.uuid, item]))
    const remoteMap = new Map(remote.map(item => [item.uuid, item]))

    // 检查本地记录
    for (const localItem of local) {
      const remoteItem = remoteMap.get(localItem.uuid)

      if (!remoteItem) {
        // 仅本地有
        diff.localOnly.push(localItem)
      }
      else {
        // 两端都有，检查是否相同（基于 updated_at）
        if (localItem.updated_at === remoteItem.updated_at) {
          diff.identical.push(localItem)
        }
        else {
          // 存在差异，标记为冲突
          diff.conflicts.push({ local: localItem, remote: remoteItem })
        }
      }
    }

    // 检查远程独有的记录
    for (const remoteItem of remote) {
      if (!localMap.has(remoteItem.uuid)) {
        diff.remoteOnly.push(remoteItem)
      }
    }

    return diff
  }

  return {
    getLocalMetadata,
    getRemoteMetadata,
    compareMetadata,
  }
}
