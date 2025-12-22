/**
 * 同步冲突检测和解决
 */

import type { RecordMetadata } from './useSyncMetadata'

export type ConflictResolution = 'local_newer' | 'remote_newer' | 'same' | 'need_manual'

export type SyncMode = 'auto' | 'manual'

export interface ConflictDecision {
  uuid: string
  /** 'keep_local' | 'keep_remote' */
  action: 'keep_local' | 'keep_remote'
}

export function useSyncConflict() {
  /**
   * 检测单条记录的冲突类型
   * @param local 本地元数据
   * @param remote 远程元数据
   * @param mode 同步模式
   */
  function detectConflict(
    local: RecordMetadata,
    remote: RecordMetadata,
    mode: SyncMode,
  ): ConflictResolution {
    // 时间相同 → 无冲突
    if (local.updated_at === remote.updated_at) {
      return 'same'
    }

    // 对比更新时间
    const localTime = new Date(local.updated_at).getTime()
    const remoteTime = new Date(remote.updated_at).getTime()

    // 时间相同 → 需要手动选择
    if (localTime === remoteTime) {
      return 'need_manual'
    }

    // 自动模式：按时间决定
    if (mode === 'auto') {
      return localTime > remoteTime ? 'local_newer' : 'remote_newer'
    }

    // 手动模式：所有不同的都需要手动选择
    return 'need_manual'
  }

  /**
   * 批量检测冲突
   */
  function detectConflicts(
    conflicts: Array<{ local: RecordMetadata, remote: RecordMetadata }>,
    mode: SyncMode,
  ): {
    needManual: Array<{ local: RecordMetadata, remote: RecordMetadata }>
    autoResolved: Array<{ uuid: string, action: 'keep_local' | 'keep_remote' }>
  } {
    const needManual: Array<{ local: RecordMetadata, remote: RecordMetadata }> = []
    const autoResolved: Array<{ uuid: string, action: 'keep_local' | 'keep_remote' }> = []

    for (const conflict of conflicts) {
      const resolution = detectConflict(conflict.local, conflict.remote, mode)

      if (resolution === 'need_manual') {
        needManual.push(conflict)
      }
      else if (resolution === 'local_newer') {
        autoResolved.push({ uuid: conflict.local.uuid, action: 'keep_local' })
      }
      else if (resolution === 'remote_newer') {
        autoResolved.push({ uuid: conflict.remote.uuid, action: 'keep_remote' })
      }
      // 'same' 不需要处理
    }

    return { needManual, autoResolved }
  }

  /**
   * 批量应用决策（保留本地或保留远程）
   */
  function applyBatchDecision(
    conflicts: Array<{ local: RecordMetadata, remote: RecordMetadata }>,
    decision: 'keep_local' | 'keep_remote',
  ): ConflictDecision[] {
    return conflicts.map(conflict => ({
      uuid: conflict.local.uuid,
      action: decision,
    }))
  }

  return {
    detectConflict,
    detectConflicts,
    applyBatchDecision,
  }
}
