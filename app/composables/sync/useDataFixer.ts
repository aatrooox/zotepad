/**
 * 数据修复工具
 * 用于修复数据库中的数据问题
 */

import { generateUUID } from '~/utils/uuid'
import { useTauriSQL } from '../useTauriSQL'

export function useDataFixer() {
  const { execute, select } = useTauriSQL()

  /**
   * 为所有缺失 UUID 的记录补充 UUID
   */
  const fixMissingUUIDs = async () => {
    console.log('[DataFixer] 开始检查和修复缺失的 UUID...')
    const tables = ['notes', 'moments', 'assets', 'workflows', 'workflow_schemas']
    let totalFixed = 0

    for (const table of tables) {
      try {
        // 查找缺失 UUID 的记录（NULL 或空字符串）
        const missingRows = await select<Array<{ id: number }>>(
          `SELECT id FROM ${table} WHERE uuid IS NULL OR uuid = ''`,
        )

        if (missingRows.length > 0) {
          console.log(`[DataFixer] 发现 ${table} 表中有 ${missingRows.length} 条记录缺少 UUID，正在修复...`)

          // 为每条记录生成并更新 UUID
          for (const row of missingRows) {
            const uuid = generateUUID()
            await execute(
              `UPDATE ${table} SET uuid = ? WHERE id = ?`,
              [uuid, row.id],
            )
            totalFixed++
          }

          console.log(`[DataFixer] ${table} 表的 UUID 修复完成`)
        }
      }
      catch (err) {
        console.error(`[DataFixer] 修复 ${table} 表的 UUID 失败:`, err)
      }
    }

    if (totalFixed > 0) {
      console.log(`[DataFixer] UUID 修复完成，共修复 ${totalFixed} 条记录`)
    }
    else {
      console.log('[DataFixer] 未发现需要修复的记录')
    }
  }

  return {
    fixMissingUUIDs,
  }
}
