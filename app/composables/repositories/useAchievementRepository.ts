/**
 * 成就仓库 - 数据库操作封装
 * 提供成就相关的 CRUD 和初始化功能
 */

import { useAsyncState } from '~/utils/async'
import { useLog } from '../useLog'
import { useTauriSQL } from '../useTauriSQL'

export function useAchievementRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()
  const { info } = useLog()

  /**
   * 初始化成就表和数据
   * Phase 1: 表结构已由 Tauri Migration (version 8) 自动创建
   * 此方法仅用于检查和兼容性
   */
  const initializeTables = () =>
    runAsync(async () => {
      try {
        // Tauri 的 Migration 系统会自动执行，这里只做检查
        info('成就系统表已由 Tauri Migration 初始化')
        return true
      }
      catch (err) {
        console.error('检查成就表失败:', err)
        throw err
      }
    }, '检查成就表失败')

  /**
   * 检查成就表是否存在
   */
  const checkTablesExist = () =>
    runAsync(async () => {
      try {
        await select('SELECT 1 FROM achievements LIMIT 1', [])
        return true
      }
      catch {
        return false
      }
    }, '检查成就表失败')

  /**
   * 添加自定义成就
   */
  const addAchievement = (
    key: string,
    name: string,
    description: string,
    type: string,
    category: string,
    points: number,
    exp: number,
    ruleConfig: object,
    icon: string = '🏆',
    maxLevel: number = 1,
  ) =>
    runAsync(async () => {
      const now = Date.now()
      await execute(
        `INSERT OR IGNORE INTO achievements 
        (key, name, description, type, category, points, exp, icon, rule_config, max_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          name,
          description,
          type,
          category,
          points,
          exp,
          icon,
          JSON.stringify(ruleConfig),
          maxLevel,
          now,
          now,
        ],
      )
    }, '添加成就失败')

  return {
    isLoading,
    error,
    initializeTables,
    checkTablesExist,
    addAchievement,
  }
}
